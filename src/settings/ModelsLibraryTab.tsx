import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Types
type ModelStatus = "not_downloaded" | "downloading" | "downloaded" | "error";
type Provider = "openai" | "anthropic" | "gemini" | "grok" | "mistral";

interface ModelInfo {
  id: string;
  name: string;
  version: string;
  size_bytes: number;
  description: string;
  quantization: string;
  url: string;
  filename: string;
  sha256: string;
  recommended: boolean;
}

interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_mbps: number;
}

interface ModelState {
  info: ModelInfo;
  status: ModelStatus;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadSpeed: number;
  errorMessage: string;
}

interface ProviderModel {
  id: string;
  name: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  icon: string;
  models: ProviderModel[];
  requires_api_key: boolean;
}

interface ApiCredential {
  id: string;
  provider: Provider;
  model_id: string;
  display_name: string;
  created_at: number;
}

interface ActiveModelConfig {
  type: "local" | "cloud";
  model_id?: string;
  credential_id?: string;
}

function ModelsLibraryTab() {
  // Local models state
  const [localModels, setLocalModels] = useState<ModelState[]>([]);
  const [activeConfig, setActiveConfig] = useState<ActiveModelConfig | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  // Cloud providers state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [ollamaModels, setOllamaModels] = useState<ProviderModel[]>([]);

  // Form state
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>("");

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load local models
        const availableModels = await invoke<ModelInfo[]>(
          "get_available_models_list"
        );
        const modelsWithStatus = await Promise.all(
          availableModels.map(async (info) => {
            try {
              const [status, fileSize] = await invoke<[string, number]>(
                "check_model_status",
                { modelId: info.id }
              );
              return {
                info,
                status: status as ModelStatus,
                downloadProgress: status === "downloaded" ? 100 : 0,
                downloadedBytes: status === "downloaded" ? fileSize : 0,
                totalBytes: info.size_bytes,
                downloadSpeed: 0,
                errorMessage: "",
              };
            } catch {
              return {
                info,
                status: "not_downloaded" as ModelStatus,
                downloadProgress: 0,
                downloadedBytes: 0,
                totalBytes: info.size_bytes,
                downloadSpeed: 0,
                errorMessage: "",
              };
            }
          })
        );
        setLocalModels(modelsWithStatus);

        // Load active model config
        const config = await invoke<ActiveModelConfig | null>(
          "get_active_model_config"
        );
        setActiveConfig(config);

        // Load providers
        const providerList = await invoke<ProviderInfo[]>(
          "get_provider_models"
        );
        setProviders(providerList);

        // Load saved credentials
        const savedCredentials = await invoke<ApiCredential[]>(
          "get_api_credentials"
        );
        setCredentials(savedCredentials);

        // Try to load Ollama models
        try {
          const ollama = await invoke<ProviderModel[]>("get_ollama_models");
          setOllamaModels(ollama);
        } catch {
          // Ollama not running
        }

        setLoading(false);
      } catch (error) {
        console.error("Failed to load data:", error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Listen to download progress
  useEffect(() => {
    const unlistenPromises = localModels.map((model) =>
      listen<DownloadProgress>(
        `model-download-progress-${model.info.id}`,
        (event) => {
          const progress = event.payload;
          setLocalModels((prev) =>
            prev.map((m) =>
              m.info.id === model.info.id
                ? {
                    ...m,
                    downloadProgress: progress.percentage,
                    downloadedBytes: progress.downloaded_bytes,
                    totalBytes: progress.total_bytes,
                    downloadSpeed: progress.speed_mbps,
                    status:
                      progress.percentage >= 100 ? "downloaded" : "downloading",
                  }
                : m
            )
          );
        }
      )
    );

    return () => {
      unlistenPromises.forEach((promise) =>
        promise.then((unlisten) => unlisten())
      );
    };
  }, [localModels.length]);

  // Local model handlers
  const handleDownload = async (modelId: string) => {
    setLocalModels((prev) =>
      prev.map((m) =>
        m.info.id === modelId
          ? {
              ...m,
              status: "downloading",
              downloadProgress: 0,
              errorMessage: "",
            }
          : m
      )
    );
    try {
      await invoke("download_model", { modelId });
    } catch (error) {
      setLocalModels((prev) =>
        prev.map((m) =>
          m.info.id === modelId
            ? {
                ...m,
                status: "error",
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              }
            : m
        )
      );
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      await invoke("delete_model", { modelId });
      setLocalModels((prev) =>
        prev.map((m) =>
          m.info.id === modelId
            ? {
                ...m,
                status: "not_downloaded",
                downloadProgress: 0,
                downloadedBytes: 0,
              }
            : m
        )
      );
    } catch (error) {
      console.error("Failed to delete model:", error);
    }
  };

  const handleSetActiveLocal = async (modelId: string) => {
    try {
      await invoke("set_active_model", { modelId });
      setActiveConfig({ type: "local", model_id: modelId });
    } catch (error) {
      console.error("Failed to set active model:", error);
    }
  };

  const handleSetActiveCloud = async (credentialId: string) => {
    try {
      await invoke("set_active_cloud_model", { credentialId });
      setActiveConfig({ type: "cloud", credential_id: credentialId });
    } catch (error) {
      console.error("Failed to set active cloud model:", error);
    }
  };

  // Cloud credential handlers
  const handleSaveCredential = async () => {
    if (!selectedProvider || !selectedModel) return;

    const provider = providers.find((p) => p.id === selectedProvider);
    if (provider?.requires_api_key && !apiKey) return;

    setSaving(true);
    setSaveError("");

    try {
      // Test the API key first
      if (provider?.requires_api_key && apiKey) {
        await invoke("test_api_key", {
          provider: selectedProvider,
          apiKey: apiKey,
        });
      }

      // If test passed, save the credential
      const credential = await invoke<ApiCredential>("save_api_credential", {
        provider: selectedProvider,
        modelId: selectedModel,
        displayName: displayName || "",
        apiKey: apiKey || "",
      });
      setCredentials((prev) => [...prev, credential]);
      // Reset form
      setSelectedProvider("");
      setSelectedModel("");
      setDisplayName("");
      setApiKey("");
    } catch (error) {
      console.error("Failed to save credential:", error);
      setSaveError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCredential = async (credentialId: string) => {
    try {
      await invoke("delete_api_credential", { credentialId });
      setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      // If this was the active model, clear active config
      if (
        activeConfig?.type === "cloud" &&
        activeConfig.credential_id === credentialId
      ) {
        setActiveConfig(null);
      }
    } catch (error) {
      console.error("Failed to delete credential:", error);
    }
  };

  const getProviderModels = (): ProviderModel[] => {
    if (selectedProvider === "ollama") {
      return ollamaModels;
    }
    const provider = providers.find((p) => p.id === selectedProvider);
    return provider?.models || [];
  };

  const getProviderName = (providerId: string): string => {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.name || providerId;
  };

  const getModelName = (providerId: string, modelId: string): string => {
    if (providerId === "ollama") {
      return modelId;
    }
    const provider = providers.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    return model?.name || modelId;
  };

  const isLocalActive = (modelId: string): boolean => {
    return activeConfig?.type === "local" && activeConfig.model_id === modelId;
  };

  const isCloudActive = (credentialId: string): boolean => {
    return (
      activeConfig?.type === "cloud" &&
      activeConfig.credential_id === credentialId
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-white/60">
          <svg
            className="w-5 h-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-sm">Loading models...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:px-8 h-full overflow-y-auto">
      <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-6">
        Models Library
      </h1>

      {/* LOCAL MODELS SECTION */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          Local Models
        </h2>
        <div className="space-y-2">
          {localModels.map((model) => (
            <div
              key={model.info.id}
              className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl"
            >
              <div className="flex items-center gap-3">
                {/* Radio button */}
                {model.status === "downloaded" && (
                  <button
                    onClick={() => handleSetActiveLocal(model.info.id)}
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: isLocalActive(model.info.id)
                        ? "var(--accent)"
                        : "rgba(255, 255, 255, 0.3)",
                      backgroundColor: isLocalActive(model.info.id)
                        ? "var(--accent)"
                        : "transparent",
                    }}
                  >
                    {isLocalActive(model.info.id) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                )}
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    model.status === "downloaded"
                      ? "bg-green-400/20"
                      : "bg-white/10"
                  }`}
                >
                  {model.status === "downloaded" ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  )}
                </div>
                {/* Info */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-white">
                      {model.info.name}
                    </span>
                    {model.info.recommended && (
                      <span className="w-1.5 h-1.5 rounded-full bg-(--accent)" />
                    )}
                    {isLocalActive(model.info.id) && (
                      <span className="px-2 py-0.5 bg-(--accent)/20 text-(--accent) text-[10px] font-semibold rounded">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {formatBytes(model.info.size_bytes)} ·{" "}
                    {model.info.quantization}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {model.status === "not_downloaded" && (
                  <button
                    onClick={() => handleDownload(model.info.id)}
                    className="px-3 py-1.5 bg-(--accent) hover:bg-(--accent-hover) rounded-lg text-white text-xs font-medium cursor-pointer transition-colors border-none"
                  >
                    Download
                  </button>
                )}
                {model.status === "downloading" && (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>{model.downloadProgress.toFixed(0)}%</span>
                  </div>
                )}
                {model.status === "downloaded" && (
                  <button
                    onClick={() => handleDelete(model.info.id)}
                    className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 cursor-pointer transition-colors border border-white/10"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
                {model.status === "error" && (
                  <button
                    onClick={() => handleDownload(model.info.id)}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-xs font-medium cursor-pointer transition-colors border border-red-500/30"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CLOUD PROVIDERS SECTION */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">
          Bring your own keys
        </h2>
        <p className="text-xs text-white/40 mb-4">
          Configure a model that uses your own API keys to connect directly to
          frontier models.
        </p>

        {/* Add Provider Form */}
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Provider dropdown */}
            <div>
              <label className="block text-xs text-white/50 mb-1.5">
                Provider
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setSelectedModel("");
                  setSaveError("");
                }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                <option value="">Select provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Model dropdown */}
            <div>
              <label className="block text-xs text-white/50 mb-1.5">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  setSaveError("");
                }}
                disabled={!selectedProvider}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                <option value="">Select model...</option>
                {getProviderModels().map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Name and API Key */}
          {selectedProvider && selectedModel && (
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg mb-3">
              <div className="mb-3">
                <label className="block text-xs text-white/50 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30"
                />
              </div>
              {providers.find((p) => p.id === selectedProvider)
                ?.requires_api_key && (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setSaveError("");
                    }}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {saveError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{saveError}</p>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSaveCredential}
            disabled={
              !selectedProvider ||
              !selectedModel ||
              (providers.find((p) => p.id === selectedProvider)
                ?.requires_api_key &&
                !apiKey) ||
              saving
            }
            className="w-full px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 border-none rounded-lg text-white text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Testing API key..." : "Save"}
          </button>
        </div>

        {/* Saved Configurations */}
        {credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  {/* Radio button */}
                  <button
                    onClick={() => handleSetActiveCloud(cred.id)}
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: isCloudActive(cred.id)
                        ? "var(--accent)"
                        : "rgba(255, 255, 255, 0.3)",
                      backgroundColor: isCloudActive(cred.id)
                        ? "var(--accent)"
                        : "transparent",
                    }}
                  >
                    {isCloudActive(cred.id) && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                  {/* Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-medium text-white">
                        {cred.display_name ||
                          getModelName(cred.provider, cred.model_id)}
                      </span>
                      {isCloudActive(cred.id) && (
                        <span className="px-2 py-0.5 bg-(--accent)/20 text-(--accent) text-[10px] font-semibold rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {getProviderName(cred.provider)}
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDeleteCredential(cred.id)}
                  className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 cursor-pointer transition-colors border border-white/10"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ModelsLibraryTab;
