import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProcessingMode {
  id: string;
  name: string;
}

interface Flow {
  id: string;
  name: string;
}

interface QuickAction {
  mode_id: string;
  mode_name: string;
  shortcut: string;
  action_type: string;
}

function QuickActionsTab() {
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModeId, setSelectedModeId] = useState("");
  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [modesData, flowsData, actionsData] = await Promise.all([
        invoke<ProcessingMode[]>("get_modes"),
        invoke<Flow[]>("get_flows"),
        invoke<QuickAction[]>("get_quick_actions"),
      ]);
      setModes(modesData);
      setFlows(flowsData);
      setQuickActions(actionsData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatShortcut = (shortcut: string): string => {
    return shortcut
      .replace("CommandOrControl", "\u2318")
      .replace("Command", "\u2318")
      .replace("Control", "\u2303")
      .replace("Shift", "\u21E7")
      .replace("Alt", "\u2325")
      .replace("Option", "\u2325")
      .replace(/\+/g, " ");
  };

  const keysToShortcut = (keys: Set<string>): string => {
    const parts: string[] = [];
    if (keys.has("Meta") || keys.has("Control")) parts.push("CommandOrControl");
    if (keys.has("Shift")) parts.push("Shift");
    if (keys.has("Alt")) parts.push("Alt");
    for (const key of keys) {
      if (!["Meta", "Control", "Shift", "Alt"].includes(key)) {
        parts.push(key.toUpperCase());
        break;
      }
    }
    return parts.join("+");
  };

  const handleKeyDown = async (e: React.KeyboardEvent, targetId: string) => {
    if (isRecording !== targetId) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(null);
      setRecordedKeys(new Set());
      return;
    }

    const newKeys = new Set(recordedKeys);
    if (e.metaKey) newKeys.add("Meta");
    if (e.ctrlKey) newKeys.add("Control");
    if (e.shiftKey) newKeys.add("Shift");
    if (e.altKey) newKeys.add("Alt");

    const isModifier = ["Meta", "Control", "Shift", "Alt"].includes(e.key);
    if (!isModifier && e.key.length === 1) {
      newKeys.add(e.key.toUpperCase());
    }

    setRecordedKeys(newKeys);

    const hasModifier = newKeys.has("Meta") || newKeys.has("Control") || newKeys.has("Shift") || newKeys.has("Alt");
    const mainKey = Array.from(newKeys).find(k => !["Meta", "Control", "Shift", "Alt"].includes(k));

    if (hasModifier && mainKey) {
      const shortcut = keysToShortcut(newKeys);
      const action = quickActions.find(a => a.mode_id === targetId);
      if (action) {
        try {
          await invoke("save_quick_action", {
            modeId: action.mode_id,
            modeName: action.mode_name,
            shortcut,
            actionType: action.action_type || "mode",
          });
          setQuickActions(prev =>
            prev.map(a => a.mode_id === targetId ? { ...a, shortcut } : a)
          );
          await invoke("reload_quick_action_shortcuts");
        } catch (error) {
          console.error("Failed to update quick action:", error);
        }
      }
      setIsRecording(null);
      setRecordedKeys(new Set());
    }
  };

  const startRecording = (targetId: string, buttonRef: HTMLButtonElement | null) => {
    setIsRecording(targetId);
    setRecordedKeys(new Set());
    setTimeout(() => buttonRef?.focus(), 10);
  };

  const handleAddQuickAction = async () => {
    if (!selectedModeId) return;

    const [type, ...idParts] = selectedModeId.split(":");
    const targetId = idParts.join(":");
    const actionType = type === "flow" ? "flow" : "mode";

    let targetName = "";
    if (actionType === "flow") {
      const flow = flows.find(f => f.id === targetId);
      if (!flow) return;
      targetName = flow.name;
    } else {
      const mode = modes.find(m => m.id === targetId);
      if (!mode) return;
      targetName = mode.name;
    }

    try {
      await invoke("save_quick_action", {
        modeId: targetId,
        modeName: targetName,
        shortcut: "",
        actionType,
      });
      setQuickActions(prev => [...prev, {
        mode_id: targetId,
        mode_name: targetName,
        shortcut: "",
        action_type: actionType,
      }]);
      setSelectedModeId("");
    } catch (error) {
      console.error("Failed to add quick action:", error);
    }
  };

  const handleDeleteQuickAction = async (modeId: string) => {
    try {
      await invoke("delete_quick_action", { modeId });
      setQuickActions(prev => prev.filter(a => a.mode_id !== modeId));
      await invoke("reload_quick_action_shortcuts");
    } catch (error) {
      console.error("Failed to delete quick action:", error);
    }
  };

  const availableModes = modes.filter(
    m => !quickActions.some(a => a.mode_id === m.id && a.action_type === "mode")
  );
  const availableFlows = flows.filter(
    f => !quickActions.some(a => a.mode_id === f.id && a.action_type === "flow")
  );
  const hasAvailableOptions = availableModes.length > 0 || availableFlows.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-white/60">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:px-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-1">
          Quick Actions
        </h1>
        <p className="text-[13px] text-white/40 m-0">
          Process text from any app without opening Refine. Select text anywhere on your Mac, press the shortcut, and the result automatically replaces your selection. Assign a mode or flow to each shortcut.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {quickActions.length === 0 && !hasAvailableOptions ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
              </svg>
            </div>
            <p className="text-[14px] text-white/40 mb-1">No modes or flows available</p>
            <p className="text-[12px] text-white/30">Create modes or flows first to set up quick actions</p>
          </div>
        ) : quickActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
              </svg>
            </div>
            <p className="text-[14px] text-white/40 mb-1">No quick actions yet</p>
            <p className="text-[12px] text-white/30 mb-4">Add a mode or flow below to create your first quick action</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {quickActions.map((action) => (
            <div
              key={action.mode_id}
              className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl group"
            >
              {/* Icon */}
              {action.action_type === "flow" ? (
                <div className="w-9 h-9 rounded-lg bg-(--accent)/10 flex items-center justify-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)">
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                  </svg>
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              )}

              {/* Name + badge */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-white font-medium truncate">{action.mode_name}</span>
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    action.action_type === "flow"
                      ? "text-(--accent) bg-(--accent)/15"
                      : "text-white/40 bg-white/8"
                  }`}>
                    {action.action_type}
                  </span>
                </div>
              </div>

              {/* Shortcut + delete */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => startRecording(action.mode_id, e.currentTarget)}
                  onKeyDown={(e) => handleKeyDown(e, action.mode_id)}
                  tabIndex={0}
                  className={`min-w-[110px] px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all cursor-pointer border outline-none text-center ${
                    isRecording === action.mode_id
                      ? "bg-(--accent)/20 border-(--accent) text-(--accent)"
                      : action.shortcut
                      ? "bg-white/8 border-white/12 text-white/70 hover:bg-white/12"
                      : "bg-white/5 border-dashed border-white/20 text-white/30 hover:bg-white/8 hover:text-white/50"
                  }`}
                >
                  {isRecording === action.mode_id
                    ? recordedKeys.size > 0
                      ? formatShortcut(keysToShortcut(recordedKeys))
                      : "Press keys..."
                    : action.shortcut
                    ? formatShortcut(action.shortcut)
                    : "Set shortcut"}
                </button>
                <button
                  onClick={() => handleDeleteQuickAction(action.mode_id)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors border-none bg-transparent opacity-0 group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Add Quick Action */}
          {hasAvailableOptions && (
            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <select
                value={selectedModeId}
                onChange={(e) => setSelectedModeId(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[13px] outline-none focus:border-(--accent) transition-colors cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                <option value="">Select a mode or flow...</option>
                {availableModes.length > 0 && (
                  <optgroup label="Modes">
                    {availableModes.map((mode) => (
                      <option key={mode.id} value={`mode:${mode.id}`}>
                        {mode.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availableFlows.length > 0 && (
                  <optgroup label="Flows">
                    {availableFlows.map((flow) => (
                      <option key={flow.id} value={`flow:${flow.id}`}>
                        {flow.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                onClick={handleAddQuickAction}
                disabled={!selectedModeId}
                className="px-4 py-2 bg-(--accent) hover:bg-(--accent-hover) disabled:bg-white/5 disabled:text-white/30 border-none rounded-lg text-white text-[13px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          )}

          {!hasAvailableOptions && quickActions.length > 0 && (
            <p className="text-[12px] text-white/30 text-center py-2">
              All modes and flows have shortcuts assigned
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickActionsTab;
