import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Provider = "openai" | "anthropic" | "gemini" | "grok" | "mistral" | "ollama";

interface ActiveModelConfig {
  type: "local" | "cloud";
  model_id?: string;
  credential_id?: string;
}

interface ProcessingMode {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  user_prompt_template: string;
  is_default: boolean;
  is_pinned?: boolean;
  model_override?: ActiveModelConfig | null;
}

interface LocalModelInfo {
  id: string;
  name: string;
}

interface ApiCredential {
  id: string;
  provider: Provider;
  model_id: string;
  display_name: string;
}

interface ModelOption {
  id: string;
  label: string;
  config: ActiveModelConfig | null;
}

const MAX_PINNED_MODES = 3;

function ModesTab() {
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<ProcessingMode | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; mode: ProcessingMode | null }>({
    open: false,
    mode: null,
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [defaultModelName, setDefaultModelName] = useState<string>("");

  const loadModes = async () => {
    try {
      const result = await invoke<ProcessingMode[]>("get_modes");
      setModes(result);
    } catch (error) {
      console.error("Failed to load modes:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadModelOptions = async () => {
    try {
      const options: ModelOption[] = [];

      // Load local models
      const localModels = await invoke<LocalModelInfo[]>("get_available_models_list");
      for (const model of localModels) {
        const [status] = await invoke<[string, number]>("check_model_status", { modelId: model.id });
        if (status === "downloaded") {
          options.push({
            id: `local:${model.id}`,
            label: `${model.name} (Local)`,
            config: { type: "local", model_id: model.id },
          });
        }
      }

      // Load cloud credentials
      const credentials = await invoke<ApiCredential[]>("get_api_credentials");
      for (const cred of credentials) {
        options.push({
          id: `cloud:${cred.id}`,
          label: cred.display_name || `${cred.model_id} (${cred.provider})`,
          config: { type: "cloud", credential_id: cred.id },
        });
      }

      setModelOptions(options);

      // Load default model name
      const activeConfig = await invoke<ActiveModelConfig | null>("get_active_model_config");
      if (activeConfig) {
        if (activeConfig.type === "local" && activeConfig.model_id) {
          const model = localModels.find((m) => m.id === activeConfig.model_id);
          setDefaultModelName(model?.name || activeConfig.model_id);
        } else if (activeConfig.type === "cloud" && activeConfig.credential_id) {
          const cred = credentials.find((c) => c.id === activeConfig.credential_id);
          setDefaultModelName(cred?.display_name || cred?.model_id || "Cloud Model");
        }
      } else {
        setDefaultModelName("Not set");
      }
    } catch (error) {
      console.error("Failed to load model options:", error);
    }
  };

  useEffect(() => {
    loadModes();
    loadModelOptions();
  }, []);

  const handleSave = async (mode: ProcessingMode) => {
    try {
      await invoke("save_mode", { mode });
      await loadModes();
      setEditingMode(null);
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to save mode:", error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.mode) return;
    try {
      console.log("Deleting mode:", deleteModal.mode.id);
      await invoke("delete_mode", { modeId: deleteModal.mode.id });
      console.log("Delete successful");
      await loadModes();
      setDeleteModal({ open: false, mode: null });
    } catch (error) {
      console.error("Failed to delete mode:", error);
    }
  };

  const handleResetConfirm = async () => {
    try {
      const result = await invoke<ProcessingMode[]>("reset_modes_to_defaults");
      setModes(result);
      setShowResetModal(false);
    } catch (error) {
      console.error("Failed to reset modes:", error);
    }
  };

  const handleTogglePin = async (modeId: string) => {
    try {
      await invoke("toggle_pin_mode", { modeId });
      await loadModes();
    } catch (error) {
      console.error("Failed to toggle pin:", error);
    }
  };

  const pinnedCount = modes.filter((m) => m.is_pinned).length;

  const handleSetModeModel = async (modeId: string, optionId: string) => {
    const option = modelOptions.find((o) => o.id === optionId);
    if (!option) return;

    try {
      await invoke("set_mode_model", { modeId, modelConfig: option.config });
      await loadModes();
    } catch (error) {
      console.error("Failed to set mode model:", error);
    }
  };

  const getModeModelOptionId = (mode: ProcessingMode): string => {
    if (!mode.model_override) return "default";
    if (mode.model_override.type === "local" && mode.model_override.model_id) {
      return `local:${mode.model_override.model_id}`;
    }
    if (mode.model_override.type === "cloud" && mode.model_override.credential_id) {
      return `cloud:${mode.model_override.credential_id}`;
    }
    return "default";
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingMode({
      id: `mode-${Date.now()}`,
      name: "",
      description: "",
      system_prompt: "",
      user_prompt_template: "{text}",
      is_default: false,
    });
  };

  if (loading) {
    return (
      <div className="p-6 md:px-8 h-full flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (editingMode) {
    return (
      <ModeEditor
        mode={editingMode}
        onSave={handleSave}
        onCancel={() => {
          setEditingMode(null);
          setIsCreating(false);
        }}
        isCreating={isCreating}
      />
    );
  }

  return (
    <>
      <div className="p-6 md:px-8 h-full flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold m-0 text-white tracking-[-0.02em]">
            Modes
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetModal(true)}
              className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 text-xs bg-(--accent) hover:bg-(--accent-hover) border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
            >
              + New Mode
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-3">
            {modes.map((mode) => (
              <div
                key={mode.id}
                className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/8 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-[15px] font-semibold text-white m-0">
                        {mode.name}
                      </h3>
                      {mode.is_default && (
                        <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
                          built-in
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-white/50 m-0 mb-2">
                      {mode.description}
                    </p>
                    {/* Model selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/40">Model:</span>
                      {mode.is_default ? (
                        <span className="text-[11px] text-white/50">
                          Default ({defaultModelName || "Not set"})
                        </span>
                      ) : (
                        <select
                          value={getModeModelOptionId(mode)}
                          onChange={(e) => handleSetModeModel(mode.id, e.target.value)}
                          className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-[11px] outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 6px center',
                            paddingRight: '20px'
                          }}
                        >
                          {!mode.model_override && (
                            <option value="default">Default ({defaultModelName || "Not set"})</option>
                          )}
                          {modelOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleTogglePin(mode.id)}
                      disabled={
                        (!mode.is_pinned && pinnedCount >= MAX_PINNED_MODES) ||
                        (mode.is_pinned && pinnedCount <= 1)
                      }
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                        mode.is_pinned
                          ? pinnedCount <= 1
                            ? "bg-(--accent)/10 border-(--accent)/20 text-(--accent)/50 cursor-not-allowed"
                            : "bg-(--accent)/20 border-(--accent)/30 text-(--accent) hover:bg-(--accent)/30"
                          : pinnedCount >= MAX_PINNED_MODES
                          ? "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
                          : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60"
                      }`}
                      title={
                        mode.is_pinned
                          ? pinnedCount <= 1
                            ? "At least one mode must be pinned"
                            : "Unpin from Spotlight"
                          : pinnedCount >= MAX_PINNED_MODES
                          ? `Maximum ${MAX_PINNED_MODES} pinned modes`
                          : "Pin to Spotlight"
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={mode.is_pinned ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                      </svg>
                    </button>
                    {!mode.is_default ? (
                      <>
                        <button
                          onClick={() => setEditingMode(mode)}
                          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteModal({ open: true, mode })}
                          className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="px-3 py-1.5 text-xs text-white/30">
                        Built-in
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.mode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-white m-0">Delete Mode</h3>
                <p className="text-[13px] text-white/50 m-0">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-[14px] text-white/70 mb-6">
              Are you sure you want to delete <strong className="text-white">{deleteModal.mode.name}</strong>?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, mode: null })}
                className="px-4 py-2 text-[13px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-[13px] bg-red-500 hover:bg-red-600 border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-white m-0">Reset to Defaults</h3>
                <p className="text-[13px] text-white/50 m-0">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-[14px] text-white/70 mb-6">
              All custom modes will be <strong className="text-white">permanently deleted</strong>. Only the 3 built-in modes will remain.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-[13px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfirm}
                className="px-4 py-2 text-[13px] bg-orange-500 hover:bg-orange-600 border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface ModeEditorProps {
  mode: ProcessingMode;
  onSave: (mode: ProcessingMode) => void;
  onCancel: () => void;
  isCreating: boolean;
}

function ModeEditor({ mode, onSave, onCancel, isCreating }: ModeEditorProps) {
  const [form, setForm] = useState<ProcessingMode>(mode);
  const [aiDescription, setAiDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!aiDescription.trim()) return;
    setGenerating(true);
    setAiError(null);
    try {
      const result = await invoke<{
        name: string;
        description: string;
        system_prompt: string;
        user_prompt_template: string;
      }>("generate_mode", { description: aiDescription });
      setForm({
        ...form,
        name: result.name,
        description: result.description,
        system_prompt: result.system_prompt,
        user_prompt_template: result.user_prompt_template,
      });
    } catch (error) {
      setAiError(typeof error === "string" ? error : "Failed to generate mode");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Name is required");
      return;
    }
    onSave(form);
  };

  return (
    <div className="p-6 md:px-8 h-full flex flex-col">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 bg-transparent border-none rounded-lg text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-[22px] font-semibold m-0 text-white tracking-[-0.02em]">
          {isCreating ? "New Mode" : "Edit Mode"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4 overflow-y-auto">
        {isCreating && (
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-2">
            <label className="block text-[13px] text-white/60 mb-2">
              AI Assist
              <span className="text-white/40 ml-2 font-normal">
                Describe your mode and let AI fill in the fields
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder="Describe your mode in one sentence..."
                disabled={generating}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-(--accent)/50 placeholder:text-white/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !aiDescription.trim()}
                className="px-4 py-2 text-[13px] bg-(--accent) hover:bg-(--accent-hover) disabled:bg-(--accent)/50 border-none rounded-lg text-white font-medium transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  "Generate with AI"
                )}
              </button>
            </div>
            {aiError && (
              <p className="text-[12px] text-red-400 mt-2 m-0">{aiError}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-[13px] text-white/60 mb-2">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. TRANSLATE"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="block text-[13px] text-white/60 mb-2">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of what this mode does"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="block text-[13px] text-white/60 mb-2">System Prompt</label>
          <textarea
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            placeholder="Instructions for the AI model..."
            rows={5}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30 resize-none"
          />
        </div>

        <div>
          <label className="block text-[13px] text-white/60 mb-2">
            User Prompt Template
            <span className="text-white/40 ml-2 font-normal">
              (use {"{text}"} for user input)
            </span>
          </label>
          <textarea
            value={form.user_prompt_template}
            onChange={(e) => setForm({ ...form, user_prompt_template: e.target.value })}
            placeholder="e.g. Translate to English: {text}"
            rows={2}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30 resize-none"
          />
        </div>

        <div className="mt-auto pt-4 flex justify-end gap-3 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[13px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-[13px] bg-(--accent) hover:bg-(--accent-hover) border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
          >
            {isCreating ? "Create Mode" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ModesTab;
