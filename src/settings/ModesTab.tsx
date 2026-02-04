import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProcessingMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  user_prompt_template: string;
  is_default: boolean;
}

function ModesTab() {
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMode, setEditingMode] = useState<ProcessingMode | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; mode: ProcessingMode | null }>({
    open: false,
    mode: null,
  });

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

  useEffect(() => {
    loadModes();
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

  const handleReset = async () => {
    if (!confirm("Reset all modes to defaults? Custom modes will be deleted.")) return;
    try {
      const result = await invoke<ProcessingMode[]>("reset_modes_to_defaults");
      setModes(result);
    } catch (error) {
      console.error("Failed to reset modes:", error);
    }
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingMode({
      id: `mode-${Date.now()}`,
      name: "",
      description: "",
      icon: "",
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
              onClick={handleReset}
              className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 text-xs bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
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
                      {mode.icon && <span className="text-lg">{mode.icon}</span>}
                      <h3 className="text-[15px] font-semibold text-white m-0">
                        {mode.name}
                      </h3>
                      {mode.is_default && (
                        <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded">
                          default
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-white/50 m-0 line-clamp-2">
                      {mode.description}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
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
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-[13px] text-white/60 mb-2">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. TRANSLATE"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30"
            />
          </div>
          <div className="w-20">
            <label className="block text-[13px] text-white/60 mb-2">Icon</label>
            <input
              type="text"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder=""
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30 text-center"
            />
          </div>
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
            className="px-4 py-2 text-[13px] bg-[#F0B67F] hover:bg-[#F5C88A] border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
          >
            {isCreating ? "Create Mode" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ModesTab;
