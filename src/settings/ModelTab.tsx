import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type ModelStatus = "not_downloaded" | "downloading" | "downloaded" | "error";

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

function ModelTab() {
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelState | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Charger les modèles disponibles
  useEffect(() => {
    const loadModels = async () => {
      try {
        const availableModels = await invoke<ModelInfo[]>(
          "get_available_models_list"
        );

        const modelsWithStatus = await Promise.all(
          availableModels.map(async (info) => {
            try {
              const [status, fileSize] = await invoke<[string, number]>(
                "check_model_status",
                {
                  modelId: info.id,
                }
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
            } catch (error) {
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

        setModels(modelsWithStatus);

        // Charger le modèle actif
        const activeId = await invoke<string | null>("get_active_model");
        setActiveModelId(activeId);

        // Sélectionner le premier modèle recommandé par défaut
        const recommended = modelsWithStatus.find((m) => m.info.recommended);
        setSelectedModel(recommended || modelsWithStatus[0]);
        setLoading(false);
      } catch (error) {
        console.error("Failed to load models:", error);
        setLoading(false);
      }
    };

    loadModels();
  }, []);

  // Écouter les événements de progression
  useEffect(() => {
    const unlistenPromises = models.map((model) =>
      listen<DownloadProgress>(
        `model-download-progress-${model.info.id}`,
        (event) => {
          const progress = event.payload;
          setModels((prev) =>
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

          // Mettre à jour le modèle sélectionné si c'est celui en cours de téléchargement
          setSelectedModel((prev) => {
            if (prev && prev.info.id === model.info.id) {
              return {
                ...prev,
                downloadProgress: progress.percentage,
                downloadedBytes: progress.downloaded_bytes,
                totalBytes: progress.total_bytes,
                downloadSpeed: progress.speed_mbps,
                status:
                  progress.percentage >= 100 ? "downloaded" : "downloading",
              };
            }
            return prev;
          });
        }
      )
    );

    return () => {
      unlistenPromises.forEach((promise) => {
        promise.then((unlisten) => unlisten());
      });
    };
  }, [models.length]);

  const handleDownload = async (modelId: string) => {
    setModels((prev) =>
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
      setModels((prev) =>
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
      setModels((prev) =>
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

  const handleCancel = async (modelId: string) => {
    try {
      await invoke("cancel_download");
      setModels((prev) =>
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
      console.error("Failed to cancel download:", error);
    }
  };

  const handleSetActive = async (modelId: string) => {
    try {
      await invoke("set_active_model", { modelId });
      setActiveModelId(modelId);
    } catch (error) {
      console.error("Failed to set active model:", error);
    }
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
          <span className="text-sm">Chargement des modèles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar - Liste des modèles */}
      <div className="w-[320px] border-r border-white/10 flex flex-col">
        {/* Header avec bouton API */}
        <div className="p-4 border-b border-white/10">
          <button
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm font-medium cursor-pointer transition-all duration-200"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            Ajouter votre clé API
          </button>

          {showApiKeyInput && (
            <div className="mt-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-[#F0B67F] transition-colors placeholder:text-white/40"
              />
              <button
                onClick={() => {
                  // TODO: Sauvegarder la clé API
                  setShowApiKeyInput(false);
                }}
                className="w-full mt-2 px-4 py-2 bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white text-sm font-semibold cursor-pointer transition-all duration-200"
              >
                Enregistrer
              </button>
            </div>
          )}
        </div>

        {/* Liste des modèles */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wide px-3 py-2">
            Modèles locaux
          </div>
          {models.map((model) => (
            <button
              key={model.info.id}
              onClick={() => setSelectedModel(model)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left cursor-pointer transition-all duration-150 mb-1 border-none ${
                selectedModel?.info.id === model.info.id
                  ? "bg-white/15 text-white"
                  : "bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Radio button pour le modèle actif */}
                {model.status === "downloaded" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetActive(model.info.id);
                    }}
                    className=" w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor:
                        activeModelId === model.info.id
                          ? "#F0B67F"
                          : "rgba(255, 255, 255, 0.3)",
                      backgroundColor:
                        activeModelId === model.info.id
                          ? "#F0B67F"
                          : "transparent",
                    }}
                  >
                    {activeModelId === model.info.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    )}
                  </button>
                )}

                {/* Icône du modèle */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center  ${
                    model.status === "downloaded"
                      ? "bg-green-400/20"
                      : "bg-white/10"
                  }`}
                >
                  {model.status === "downloaded" ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4ade80"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  )}
                </div>

                {/* Nom et taille */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {model.info.name}
                    </span>
                    {model.info.recommended && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F0B67F]"></span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {formatBytes(model.info.size_bytes)}
                    {activeModelId === model.info.id && (
                      <span className="text-[#F0B67F] ml-1.5">• Actif</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bouton/Statut download */}
              <div className=" ml-2">
                {model.status === "not_downloaded" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(model.info.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-[#F0B67F] hover:bg-[#F5C88A] border-none cursor-pointer transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                )}

                {model.status === "downloading" && (
                  <div className="relative w-7 h-7">
                    <svg
                      className="w-7 h-7 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#F0B67F"
                      strokeWidth="2.5"
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-[#F0B67F]">
                        {Math.round(model.downloadProgress)}
                      </span>
                    </div>
                  </div>
                )}

                {model.status === "downloaded" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(model.info.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 hover:bg-red-500/20 border-none cursor-pointer transition-colors group"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="group-hover:stroke-red-400 transition-colors"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}

                {model.status === "error" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(model.info.id);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-red-500/20 hover:bg-red-500/30 border-none cursor-pointer transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#f87171"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Panneau de droite - Détails du modèle */}
      <div className="flex-1 flex flex-col">
        {selectedModel ? (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-3xl font-semibold text-white">
                    {selectedModel.info.name}
                  </h1>
                  {selectedModel.info.recommended && (
                    <span className="px-3 py-1 bg-[#F0B67F]/20 text-[#F0B67F] text-xs font-semibold rounded-full">
                      RECOMMANDÉ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-white/50">
                  <span className="flex items-center gap-1.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    {selectedModel.info.version}
                  </span>
                  <span>·</span>
                  <span>{formatBytes(selectedModel.info.size_bytes)}</span>
                  <span>·</span>
                  <span>{selectedModel.info.quantization}</span>
                </div>
              </div>

              {/* Description */}
              <div className="mb-8">
                <p className="text-white/80 text-base leading-relaxed">
                  {selectedModel.info.description}
                </p>
              </div>

              {/* Statut et actions */}
              {selectedModel.status === "not_downloaded" && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#F0B67F"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-white mb-2">
                        Modèle non téléchargé
                      </h3>
                      <p className="text-sm text-white/60 mb-4">
                        Téléchargez ce modèle pour l'utiliser en local. Le
                        téléchargement peut prendre plusieurs minutes.
                      </p>
                      <button
                        onClick={() => handleDownload(selectedModel.info.id)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white text-sm font-semibold cursor-pointer transition-all duration-200"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Télécharger le modèle
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedModel.status === "downloading" && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-white">
                        Téléchargement en cours...
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {selectedModel.downloadProgress.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full from-[#F0B67F] to-[#0066CC] transition-all duration-300"
                        style={{ width: `${selectedModel.downloadProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>
                        {formatBytes(selectedModel.downloadedBytes)} /{" "}
                        {formatBytes(selectedModel.totalBytes)}
                      </span>
                      {selectedModel.downloadSpeed > 0 && (
                        <span>
                          {selectedModel.downloadSpeed.toFixed(1)} MB/s
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancel(selectedModel.info.id)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 border-none rounded-lg text-white text-sm font-medium cursor-pointer transition-all duration-200"
                  >
                    Annuler le téléchargement
                  </button>
                </div>
              )}

              {selectedModel.status === "downloaded" && (
                <div className="bg-green-400/10 border border-green-400/20 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-green-400 mb-2">
                        {activeModelId === selectedModel.info.id
                          ? "Modèle actif"
                          : "Modèle prêt à l'emploi"}
                      </h3>
                      <p className="text-sm text-white/60 mb-4">
                        {activeModelId === selectedModel.info.id
                          ? "Ce modèle est actuellement utilisé pour les corrections et traductions. Il fonctionne entièrement en local sans connexion internet."
                          : "Ce modèle est installé et prêt à être utilisé. Activez-le pour l'utiliser dans vos corrections et traductions."}
                      </p>
                      <div className="flex gap-2">
                        {activeModelId !== selectedModel.info.id && (
                          <button
                            onClick={() =>
                              handleSetActive(selectedModel.info.id)
                            }
                            className="flex items-center gap-2 px-4 py-2 bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white text-sm font-semibold cursor-pointer transition-all duration-200"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Utiliser ce modèle
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(selectedModel.info.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium cursor-pointer transition-all duration-200"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Supprimer le modèle
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedModel.status === "error" &&
                selectedModel.errorMessage && (
                  <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className=" mt-1">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#f87171"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-red-400 mb-2">
                          Erreur de téléchargement
                        </h3>
                        <p className="text-sm text-white/60 mb-4">
                          {selectedModel.errorMessage}
                        </p>
                        <button
                          onClick={() => handleDownload(selectedModel.info.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white text-sm font-semibold cursor-pointer transition-all duration-200"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Réessayer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {/* Info Apple Silicon */}
              <div className="mt-6 bg-[#F0B67F]/10 border border-[#F0B67F]/20 rounded-xl p-5">
                <div className="flex gap-3">
                  <div className="">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="text-[#F0B67F]"
                    >
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#F0B67F] mb-1">
                      Optimisé pour Apple Silicon
                    </h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Ce modèle utilise Metal pour l'accélération GPU sur les
                      puces M1/M2/M3, garantissant des performances optimales.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/40">
            <p className="text-sm">
              Sélectionnez un modèle pour voir les détails
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelTab;
