import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProcessingMode {
  id: string;
  name: string;
}

interface Flow {
  id: string;
  name: string;
  description: string;
  steps: string[];
}

function FlowsTab() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; flow: Flow | null }>({
    open: false,
    flow: null,
  });

  const loadData = async () => {
    try {
      const [flowsData, modesData] = await Promise.all([
        invoke<Flow[]>("get_flows"),
        invoke<ProcessingMode[]>("get_modes"),
      ]);
      setFlows(flowsData);
      setModes(modesData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (flow: Flow) => {
    try {
      await invoke("save_flow", { flow });
      await loadData();
      setEditingFlow(null);
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to save flow:", error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.flow) return;
    try {
      await invoke("delete_flow", { flowId: deleteModal.flow.id });
      await loadData();
      setDeleteModal({ open: false, flow: null });
    } catch (error) {
      console.error("Failed to delete flow:", error);
    }
  };

  const getModeName = (modeId: string) => {
    return modes.find((m) => m.id === modeId)?.name || modeId;
  };

  const getStepsLabel = (steps: string[]) => {
    return steps.map((s) => getModeName(s)).join(" → ");
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingFlow({
      id: `flow-${Date.now()}`,
      name: "",
      description: "",
      steps: [""],
    });
  };

  if (loading) {
    return (
      <div className="p-6 md:px-8 h-full flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (editingFlow) {
    return (
      <FlowEditor
        flow={editingFlow}
        modes={modes}
        onSave={handleSave}
        onCancel={() => {
          setEditingFlow(null);
          setIsCreating(false);
        }}
        isCreating={isCreating}
      />
    );
  }

  return (
    <>
      <div className="p-6 md:px-8 h-full flex flex-col">
        <div className="mb-4">
          <h1 className="text-[22px] font-semibold m-0 text-white tracking-[-0.02em] mb-1">
            Flows
          </h1>
          <p className="text-[13px] text-white/40 m-0">
            Chain multiple modes together into a pipeline. Your text is processed through each step sequentially.
          </p>
        </div>
        <div className="mb-4 flex items-center justify-end">
          <button
            onClick={handleCreateNew}
            className="px-3 py-1.5 text-xs bg-(--accent) hover:bg-(--accent-hover) border-none rounded-lg text-white font-medium transition-colors cursor-pointer"
          >
            + New Flow
          </button>
        </div>

        {/* Search */}
        {flows.length > 0 && (
          <div className="mb-4 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flows..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[13px] outline-none focus:border-white/20 placeholder:text-white/30"
            />
          </div>
        )}

        {flows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white/20 mb-4"
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            <p className="text-[14px] text-white/40 mb-1">No flows yet</p>
            <p className="text-[12px] text-white/30">
              Create a flow to chain multiple modes together
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3">
              {flows
                .filter((f) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
                })
                .map((flow) => (
                <div
                  key={flow.id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/8 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-semibold text-white m-0">
                          {flow.name}
                        </h3>
                        <span className="text-[10px] text-(--accent) bg-(--accent)/15 px-1.5 py-0.5 rounded font-medium">
                          flow
                        </span>
                      </div>
                      {flow.description && (
                        <p className="text-[13px] text-white/50 m-0 mb-2">
                          {flow.description}
                        </p>
                      )}
                      <p className="text-[12px] text-white/40 m-0 font-mono">
                        {getStepsLabel(flow.steps)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setEditingFlow(flow)}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteModal({ open: true, flow })}
                        className="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.flow && (
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
                <h3 className="text-[16px] font-semibold text-white m-0">Delete Flow</h3>
                <p className="text-[13px] text-white/50 m-0">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-[14px] text-white/70 mb-6">
              Are you sure you want to delete <strong className="text-white">{deleteModal.flow.name}</strong>?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, flow: null })}
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

interface FlowEditorProps {
  flow: Flow;
  modes: ProcessingMode[];
  onSave: (flow: Flow) => void;
  onCancel: () => void;
  isCreating: boolean;
}

function FlowEditor({ flow, modes, onSave, onCancel, isCreating }: FlowEditorProps) {
  const [form, setForm] = useState<Flow>(flow);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Name is required");
      return;
    }
    // Filter out empty steps
    const validSteps = form.steps.filter((s) => s !== "");
    if (validSteps.length === 0) {
      alert("At least one step is required");
      return;
    }
    onSave({ ...form, steps: validSteps });
  };

  const updateStep = (index: number, value: string) => {
    const newSteps = [...form.steps];
    newSteps[index] = value;
    setForm({ ...form, steps: newSteps });
  };

  const addStep = () => {
    setForm({ ...form, steps: [...form.steps, ""] });
  };

  const removeStep = (index: number) => {
    if (form.steps.length <= 1) return;
    const newSteps = form.steps.filter((_, i) => i !== index);
    setForm({ ...form, steps: newSteps });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= form.steps.length) return;
    const newSteps = [...form.steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setForm({ ...form, steps: newSteps });
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
          {isCreating ? "New Flow" : "Edit Flow"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-[13px] text-white/60 mb-2">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Correct & Translate"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="block text-[13px] text-white/60 mb-2">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of what this flow does"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[14px] outline-none focus:border-white/20 placeholder:text-white/30"
          />
        </div>

        <div>
          <label className="block text-[13px] text-white/60 mb-2">Steps</label>
          <div className="flex flex-col gap-2">
            {form.steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-[12px] text-white/30 w-5 text-center shrink-0">
                  {index + 1}
                </span>
                <select
                  value={step}
                  onChange={(e) => updateStep(index, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[13px] outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                  }}
                >
                  <option value="">Select a mode...</option>
                  {modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveStep(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-lg text-white/50 hover:text-white/70 cursor-pointer transition-colors"
                    title="Move up"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(index, 1)}
                    disabled={index === form.steps.length - 1}
                    className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-lg text-white/50 hover:text-white/70 cursor-pointer transition-colors"
                    title="Move down"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    disabled={form.steps.length <= 1}
                    className="p-1.5 bg-white/5 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-lg text-white/40 hover:text-red-400 cursor-pointer transition-colors"
                    title="Remove step"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStep}
            className="mt-2 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white/80 transition-colors cursor-pointer"
          >
            + Add Step
          </button>
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
            {isCreating ? "Create Flow" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FlowsTab;
