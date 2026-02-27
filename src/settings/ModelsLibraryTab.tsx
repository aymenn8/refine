import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Types
type ModelStatus = "not_downloaded" | "downloading" | "downloaded" | "error";
type Provider = "openai" | "anthropic" | "ollama";

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

interface ProviderDef {
  id: Provider;
  name: string;
  requiresApiKey: boolean;
  requiresUrl: boolean;
  defaultUrl?: string;
  modelPlaceholder: string;
}

// Map model/provider IDs to logo files in /logos/
const LOGO_MAP: Record<string, string> = {
  openai: "/logos/openai.svg",
  anthropic: "/logos/anthropic.svg",
  ollama: "/logos/ollama.svg",
  qwen: "/logos/qwen.svg",
  gemma: "/logos/gemma.svg",
};

const getLogoForModel = (modelId: string): string | null => {
  if (LOGO_MAP[modelId]) return LOGO_MAP[modelId];
  for (const [key, path] of Object.entries(LOGO_MAP)) {
    if (modelId.toLowerCase().includes(key)) return path;
  }
  return null;
};

const ModelLogo = ({ id, size = 20 }: { id: string; size?: number }) => {
  const logo = getLogoForModel(id);
  if (!logo) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    );
  }
  return (
    <img
      src={logo}
      alt=""
      width={size}
      height={size}
      className="brightness-0 invert opacity-70"
    />
  );
};

const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    requiresUrl: false,
    modelPlaceholder: "e.g. gpt-4o, gpt-4o-mini, o4-mini",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    requiresApiKey: true,
    requiresUrl: false,
    modelPlaceholder:
      "e.g. claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001",
  },
  {
    id: "ollama",
    name: "Ollama",
    requiresApiKey: false,
    requiresUrl: true,
    defaultUrl: "http://localhost:11434",
    modelPlaceholder: "e.g. llama3, mistral, phi3, gemma2",
  },
];

function ModelsLibraryTab() {
  // Local models state
  const [localModels, setLocalModels] = useState<ModelState[]>([]);
  const [activeConfig, setActiveConfig] = useState<ActiveModelConfig | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  // Cloud credentials state
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);

  // Add form state
  const [formProvider, setFormProvider] = useState<Provider | "">("");
  const [formModel, setFormModel] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const currentProvider = PROVIDERS.find((p) => p.id === formProvider);

  // Build the list of all available models for the default selector
  const allModels = useMemo(() => {
    const items: {
      key: string;
      label: string;
      logoId: string;
      sub: string;
      setActive: () => void;
    }[] = [];
    for (const m of localModels) {
      if (m.status === "downloaded") {
        items.push({
          key: `local:${m.info.id}`,
          label: m.info.name,
          logoId: m.info.id,
          sub: `Local · ${m.info.quantization}`,
          setActive: () => handleSetActiveLocal(m.info.id),
        });
      }
    }
    for (const c of credentials) {
      items.push({
        key: `cloud:${c.id}`,
        label: c.display_name || c.model_id,
        logoId: c.provider,
        sub:
          c.provider === "ollama"
            ? "Ollama"
            : c.provider === "anthropic"
              ? `Anthropic · ${c.model_id}`
              : `OpenAI · ${c.model_id}`,
        setActive: () => handleSetActiveCloud(c.id),
      });
    }
    return items;
  }, [localModels, credentials]);

  const activeKey =
    activeConfig?.type === "local"
      ? `local:${activeConfig.model_id}`
      : activeConfig?.type === "cloud"
        ? `cloud:${activeConfig.credential_id}`
        : "";

  const activeLabel = allModels.find((m) => m.key === activeKey);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const resetForm = () => {
    setFormProvider("");
    setFormModel("");
    setFormApiKey("");
    setFormUrl("");
    setFormName("");
    setSaveError("");
  };

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      try {
        const availableModels = await invoke<ModelInfo[]>(
          "get_available_models_list",
        );
        const modelsWithStatus = await Promise.all(
          availableModels.map(async (info) => {
            try {
              const [status, fileSize] = await invoke<[string, number]>(
                "check_model_status",
                { modelId: info.id },
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
          }),
        );
        setLocalModels(modelsWithStatus);
        const config = await invoke<ActiveModelConfig | null>(
          "get_active_model_config",
        );
        setActiveConfig(config);
        const savedCredentials = await invoke<ApiCredential[]>(
          "get_api_credentials",
        );
        setCredentials(savedCredentials);
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
                  }
                : m,
            ),
          );
        },
      ),
    );
    return () => {
      unlistenPromises.forEach((p) => p.then((u) => u()));
    };
  }, [localModels.length]);

  // Handlers
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
          : m,
      ),
    );
    try {
      await invoke("download_model", { modelId });
      setLocalModels((prev) =>
        prev.map((m) =>
          m.info.id === modelId
            ? { ...m, status: "downloaded", downloadProgress: 100 }
            : m,
        ),
      );
    } catch (error) {
      setLocalModels((prev) =>
        prev.map((m) =>
          m.info.id === modelId
            ? {
                ...m,
                status: "error",
                downloadProgress: 0,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              }
            : m,
        ),
      );
    }
  };

  const handleDeleteLocal = async (modelId: string) => {
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
            : m,
        ),
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

  const handleAddModel = async () => {
    if (!formProvider || !formModel) return;
    if (currentProvider?.requiresApiKey && !formApiKey) return;
    setSaving(true);
    setSaveError("");
    try {
      if (currentProvider?.requiresApiKey) {
        await invoke("test_api_key", {
          provider: formProvider,
          apiKey: formApiKey,
        });
      }
      const keyOrUrl = currentProvider?.requiresUrl
        ? formUrl || currentProvider.defaultUrl || ""
        : formApiKey;
      const credential = await invoke<ApiCredential>("save_api_credential", {
        provider: formProvider,
        modelId: formModel.trim(),
        displayName: formName.trim() || "",
        apiKey: keyOrUrl,
      });
      setCredentials((prev) => [...prev, credential]);
      resetForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCredential = async (credentialId: string) => {
    try {
      await invoke("delete_api_credential", { credentialId });
      setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      if (
        activeConfig?.type === "cloud" &&
        activeConfig.credential_id === credentialId
      )
        setActiveConfig(null);
    } catch (error) {
      console.error("Failed to delete credential:", error);
    }
  };

  const handleDefaultChange = (key: string) => {
    const model = allModels.find((m) => m.key === key);
    model?.setActive();
  };

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 12px center",
  };

  const canSave =
    formProvider &&
    formModel.trim() &&
    (!currentProvider?.requiresApiKey || formApiKey);

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
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-1">
          Models Library
        </h1>
        <p className="text-[13px] text-white/40 m-0">
          Download local models or connect API providers. The default model is
          used for all text processing unless overridden by a mode.
        </p>
      </div>

      {/* DEFAULT MODEL SELECTOR */}
      <section className="mb-8">
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeLabel && (
                <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                  <ModelLogo id={activeLabel.logoId} size={18} />
                </div>
              )}
              <div>
                <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-0.5">
                  Default Model
                </div>
                <div className="text-[15px] font-medium text-white">
                  {activeLabel ? (
                    activeLabel.label
                  ) : (
                    <span className="text-white/40">No model selected</span>
                  )}
                </div>
              </div>
            </div>
            <select
              value={activeKey}
              onChange={(e) => handleDefaultChange(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none min-w-[140px]"
              style={selectStyle}
            >
              <option value="">Select...</option>
              {allModels.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* LOCAL MODELS */}
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
                <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                  <ModelLogo id={model.info.id} size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-white">
                      {model.info.name}
                    </span>
                    {model.info.recommended && (
                      <span className="px-1.5 py-0.5 bg-(--accent)/15 text-(--accent) text-[10px] font-medium rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {formatBytes(model.info.size_bytes)} ·{" "}
                    {model.info.quantization}
                    {model.info.description && (
                      <span className="text-white/30">
                        {" "}
                        · {model.info.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>

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
                    onClick={() => handleDeleteLocal(model.info.id)}
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

      {/* API MODELS */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          API Models
        </h2>

        {/* Saved credentials list */}
        {credentials.length > 0 && (
          <div className="space-y-2 mb-4">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="group flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 shrink-0">
                    <ModelLogo id={cred.provider} size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {cred.display_name || cred.model_id}
                      </span>
                    </div>
                    {cred.display_name &&
                      cred.display_name !== cred.model_id && (
                        <div className="text-xs text-white/35 mt-0.5">
                          {cred.model_id}
                        </div>
                      )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCredential(cred.id)}
                  className="p-1.5 bg-transparent hover:bg-red-500/20 rounded-lg text-white/0 group-hover:text-white/40 hover:text-red-400! cursor-pointer transition-all border-none"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add model form */}
        <div className="p-4 bg-white/5 border border-dashed border-white/15 rounded-xl">
          {/* Row 1: Provider + Model */}
          <div className="grid grid-cols-[140px_1fr] gap-3 mb-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">
                Provider
              </label>
              <select
                value={formProvider}
                onChange={(e) => {
                  const id = e.target.value as Provider | "";
                  setFormProvider(id);
                  setFormModel("");
                  setFormApiKey("");
                  setSaveError("");
                  const prov = PROVIDERS.find((p) => p.id === id);
                  setFormUrl(prov?.defaultUrl || "");
                }}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none"
                style={selectStyle}
              >
                <option value="">Select...</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs text-white/50 mb-1.5">
                Model ID
                <span className="relative group/tip">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-white/30 cursor-help"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-[#1a1a1a] border border-white/15 rounded-lg text-[11px] text-white/70 whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-10">
                    Use the exact model ID from the provider (e.g. gpt-4o, not
                    "GPT 4o")
                  </span>
                </span>
              </label>
              <input
                type="text"
                value={formModel}
                onChange={(e) => {
                  setFormModel(e.target.value);
                  setSaveError("");
                }}
                disabled={!formProvider}
                placeholder={
                  currentProvider?.modelPlaceholder || "Select a provider first"
                }
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Row 2: Conditional fields */}
          {formProvider && (
            <div className="grid grid-cols-[1fr_1fr] gap-3 mb-3">
              {currentProvider?.requiresApiKey && (
                <div
                  className={currentProvider.requiresUrl ? "" : "col-span-2"}
                >
                  <label className="block text-xs text-white/50 mb-1.5">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={formApiKey}
                    onChange={(e) => {
                      setFormApiKey(e.target.value);
                      setSaveError("");
                    }}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30 font-mono"
                  />
                </div>
              )}
              {currentProvider?.requiresUrl && (
                <div
                  className={currentProvider.requiresApiKey ? "" : "col-span-2"}
                >
                  <label className="block text-xs text-white/50 mb-1.5">
                    Server URL
                  </label>
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => {
                      setFormUrl(e.target.value);
                      setSaveError("");
                    }}
                    placeholder={currentProvider.defaultUrl}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 3: Optional name */}
          {formProvider && formModel && (
            <div className="mb-3">
              <label className="block text-xs text-white/50 mb-1.5">
                Display Name <span className="text-white/30">(optional)</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={formModel}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-(--accent) transition-colors placeholder:text-white/30"
              />
            </div>
          )}

          {saveError && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{saveError}</p>
            </div>
          )}

          <button
            onClick={handleAddModel}
            disabled={!canSave || saving}
            className="w-full px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 border-none rounded-lg text-white text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? currentProvider?.requiresApiKey
                ? "Testing API key..."
                : "Saving..."
              : "Add Model"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ModelsLibraryTab;
