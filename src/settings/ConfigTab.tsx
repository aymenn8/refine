import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProcessingMode {
  id: string;
  name: string;
}

interface QuickAction {
  mode_id: string;
  mode_name: string;
  shortcut: string;
}

function ConfigTab() {
  const [globalShortcut, setGlobalShortcut] = useState("CommandOrControl+Shift+R");
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);

  // For adding new quick action
  const [selectedModeId, setSelectedModeId] = useState("");
  const [isRecording, setIsRecording] = useState<string | null>(null); // mode_id being recorded
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [shortcut, modesData, actionsData] = await Promise.all([
        invoke<string>("get_global_shortcut"),
        invoke<ProcessingMode[]>("get_modes"),
        invoke<QuickAction[]>("get_quick_actions"),
      ]);
      setGlobalShortcut(shortcut);
      setModes(modesData);
      setQuickActions(actionsData);
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatShortcut = (shortcut: string): string => {
    return shortcut
      .replace("CommandOrControl", "⌘")
      .replace("Command", "⌘")
      .replace("Control", "⌃")
      .replace("Shift", "⇧")
      .replace("Alt", "⌥")
      .replace("Option", "⌥")
      .replace(/\+/g, " ");
  };

  const keysToShortcut = (keys: Set<string>): string => {
    const parts: string[] = [];
    if (keys.has("Meta") || keys.has("Control")) parts.push("CommandOrControl");
    if (keys.has("Shift")) parts.push("Shift");
    if (keys.has("Alt")) parts.push("Alt");

    // Get the main key (not a modifier)
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

    // Escape to cancel
    if (e.key === "Escape") {
      setIsRecording(null);
      setRecordedKeys(new Set());
      return;
    }

    const newKeys = new Set(recordedKeys);

    // Track modifiers
    if (e.metaKey) newKeys.add("Meta");
    if (e.ctrlKey) newKeys.add("Control");
    if (e.shiftKey) newKeys.add("Shift");
    if (e.altKey) newKeys.add("Alt");

    // Track the main key (non-modifier)
    const isModifier = ["Meta", "Control", "Shift", "Alt"].includes(e.key);
    if (!isModifier && e.key.length === 1) {
      newKeys.add(e.key.toUpperCase());
    }

    setRecordedKeys(newKeys);

    // Check if we have a complete shortcut (modifier + letter key)
    const hasModifier = newKeys.has("Meta") || newKeys.has("Control") || newKeys.has("Shift") || newKeys.has("Alt");
    const mainKey = Array.from(newKeys).find(k => !["Meta", "Control", "Shift", "Alt"].includes(k));

    if (hasModifier && mainKey) {
      const shortcut = keysToShortcut(newKeys);
      console.log("Recording shortcut:", shortcut);

      if (targetId === "global") {
        try {
          await invoke("update_global_shortcut", { shortcutStr: shortcut });
          setGlobalShortcut(shortcut);
        } catch (error) {
          console.error("Failed to update shortcut:", error);
        }
      } else {
        const action = quickActions.find(a => a.mode_id === targetId);
        if (action) {
          try {
            await invoke("save_quick_action", {
              modeId: action.mode_id,
              modeName: action.mode_name,
              shortcut,
            });
            setQuickActions(prev =>
              prev.map(a => a.mode_id === targetId ? { ...a, shortcut } : a)
            );
            await invoke("reload_quick_action_shortcuts");
          } catch (error) {
            console.error("Failed to update quick action:", error);
          }
        }
      }

      setIsRecording(null);
      setRecordedKeys(new Set());
    }
  };

  const startRecording = (targetId: string, buttonRef: HTMLButtonElement | null) => {
    setIsRecording(targetId);
    setRecordedKeys(new Set());
    // Ensure focus stays on the button
    setTimeout(() => buttonRef?.focus(), 10);
  };

  const handleAddQuickAction = async () => {
    if (!selectedModeId) return;

    const mode = modes.find(m => m.id === selectedModeId);
    if (!mode) return;

    // Add with empty shortcut, user will record it
    const newAction: QuickAction = {
      mode_id: mode.id,
      mode_name: mode.name,
      shortcut: "",
    };

    try {
      await invoke("save_quick_action", {
        modeId: mode.id,
        modeName: mode.name,
        shortcut: "",
      });
      setQuickActions(prev => [...prev, newAction]);
      setSelectedModeId("");
      // Start recording will happen when user clicks the shortcut button
    } catch (error) {
      console.error("Failed to add quick action:", error);
    }
  };

  const handleDeleteQuickAction = async (modeId: string) => {
    try {
      await invoke("delete_quick_action", { modeId });
      setQuickActions(prev => prev.filter(a => a.mode_id !== modeId));
      // Reload shortcuts in backend
      await invoke("reload_quick_action_shortcuts");
    } catch (error) {
      console.error("Failed to delete quick action:", error);
    }
  };

  // Modes available for quick actions (not already assigned)
  const availableModes = modes.filter(
    m => !quickActions.some(a => a.mode_id === m.id)
  );

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
    <div className="p-6 md:px-8 h-full overflow-y-auto">
      <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-6">
        Configuration
      </h1>

      {/* Keyboard Shortcuts Section */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          Keyboard Shortcuts
        </h2>

        {/* General Shortcuts */}
        <div className="mb-4">
          <h3 className="text-[13px] text-white/60 mb-2">General</h3>
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white">Open Refine</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => startRecording("global", e.currentTarget)}
                  onKeyDown={(e) => handleKeyDown(e, "global")}
                  tabIndex={0}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all cursor-pointer border outline-none ${
                    isRecording === "global"
                      ? "bg-[#F0B67F]/20 border-[#F0B67F] text-[#F0B67F]"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {isRecording === "global"
                    ? recordedKeys.size > 0
                      ? formatShortcut(keysToShortcut(recordedKeys))
                      : "Press keys..."
                    : formatShortcut(globalShortcut)}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-[13px] text-white/60 mb-1">Quick Actions</h3>
          <p className="text-[12px] text-white/40 mb-3">
            Process selected text instantly without opening Refine
          </p>

          {quickActions.length > 0 && (
            <div className="space-y-2 mb-3">
              {quickActions.map((action) => (
                <div
                  key={action.mode_id}
                  className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl"
                >
                  <span className="text-[14px] text-white">{action.mode_name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => startRecording(action.mode_id, e.currentTarget)}
                      onKeyDown={(e) => handleKeyDown(e, action.mode_id)}
                      tabIndex={0}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all cursor-pointer border outline-none ${
                        isRecording === action.mode_id
                          ? "bg-[#F0B67F]/20 border-[#F0B67F] text-[#F0B67F]"
                          : action.shortcut
                          ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                          : "bg-white/5 border-white/20 text-white/40 hover:bg-white/10"
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
                      className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 cursor-pointer transition-colors border border-white/10"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Quick Action */}
          {availableModes.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl">
              <select
                value={selectedModeId}
                onChange={(e) => setSelectedModeId(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[13px] outline-none focus:border-[#F0B67F] transition-colors cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                <option value="">Select a mode...</option>
                {availableModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddQuickAction}
                disabled={!selectedModeId}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 border-none rounded-lg text-white text-[13px] font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          )}

          {availableModes.length === 0 && quickActions.length > 0 && (
            <p className="text-[12px] text-white/30 text-center py-2">
              All modes have shortcuts assigned
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default ConfigTab;
