import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { playNotificationSound } from "./utils/sound";
import { SelectorBar } from "./spotlight/SelectorBar";
import { ProcessedBar } from "./spotlight/ProcessedBar";
import { CommandPalette } from "./spotlight/CommandPalette";
import { PipelineStrip } from "./spotlight/PipelineStrip";
import { ClipboardHistory } from "./spotlight/ClipboardHistory";
import { FooterBar } from "./spotlight/FooterBar";
import type { ProcessingMode, Flow, FlowStepProgress } from "./spotlight/types";
import "./App.css";

interface SpotlightPayload {
  text: string;
  previous_app: string;
}

function App() {
  const [text, setText] = useState("");
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [mode, setMode] = useState<string>("correct");
  const [selectedType, setSelectedType] = useState<"mode" | "flow">("mode");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [clipboardHistory, setClipboardHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowStepProgress, setFlowStepProgress] = useState<FlowStepProgress | null>(null);
  const [historyShortcut, setHistoryShortcut] = useState("CommandOrControl+Shift+V");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Data loading ---

  const loadClipboardHistory = useCallback(async () => {
    try {
      const history = await invoke<string[]>("get_clipboard_history");
      setClipboardHistory(history);
    } catch (err) {
      console.error("Failed to load clipboard history:", err);
    }
  }, []);

  const loadModes = useCallback(async () => {
    try {
      const loadedModes = await invoke<ProcessingMode[]>("get_modes");
      setModes(loadedModes);
      return loadedModes;
    } catch (err) {
      console.error("Failed to load modes:", err);
      return [];
    }
  }, []);

  const loadFlows = useCallback(async () => {
    try {
      const loadedFlows = await invoke<Flow[]>("get_flows");
      setFlows(loadedFlows);
    } catch (err) {
      console.error("Failed to load flows:", err);
    }
  }, []);

  // --- Derived values ---

  const pinnedModes = modes.filter((m) => m.is_pinned);
  const isCurrentPinnedMode = pinnedModes.some((m) => m.id === mode) && selectedType === "mode";
  const currentSelectionName =
    selectedType === "flow"
      ? flows.find((f) => f.id === mode)?.name
      : modes.find((m) => m.id === mode)?.name;

  const getFlowStepNames = useCallback(
    (flowId: string): string[] => {
      const flow = flows.find((f) => f.id === flowId);
      if (!flow) return [];
      return flow.steps.map(
        (stepId) => modes.find((m) => m.id === stepId)?.name || stepId
      );
    },
    [flows, modes]
  );

  // --- Palette helpers ---

  const openPalette = useCallback(() => {
    setShowPalette(true);
  }, []);

  const closePalette = useCallback(() => {
    setShowPalette(false);
    textareaRef.current?.focus();
  }, []);

  const selectFromPalette = useCallback(
    (itemType: "mode" | "flow", itemId: string) => {
      setMode(itemId);
      setSelectedType(itemType);
      setShowPalette(false);
      textareaRef.current?.focus();
    },
    []
  );

  const resetToDefault = useCallback(() => {
    if (pinnedModes.length > 0) {
      setMode(pinnedModes[0].id);
      setSelectedType("mode");
    } else if (modes.length > 0) {
      setMode(modes[0].id);
      setSelectedType("mode");
    }
  }, [pinnedModes, modes]);

  // --- Actions ---

  const handleBack = useCallback(() => {
    setText(originalText);
    setIsProcessed(false);
    setCopied(false);
    setFlowStepProgress(null);
    textareaRef.current?.focus();
  }, [originalText]);

  const handleSendToAI = useCallback(async () => {
    if (!text.trim() || isLoading) return;

    setOriginalText(text);
    setIsLoading(true);
    setError(null);
    try {
      let transformedText: string;
      if (selectedType === "flow") {
        transformedText = await invoke<string>("process_flow", {
          text,
          flowId: mode,
        });
      } else {
        transformedText = await invoke<string>("process_text", {
          text,
          mode,
        });
      }
      setText(transformedText);
      setIsProcessed(true);
      playNotificationSound();
    } catch (err) {
      console.error("Failed to process text:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setFlowStepProgress(null);
    }
  }, [text, isLoading, selectedType, mode]);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return;
    try {
      await writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  const handleClose = useCallback(async () => {
    try {
      await invoke("hide_window");
      setText("");
      setIsProcessed(false);
      setCopied(false);
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  }, []);

  const selectHistoryItem = useCallback((item: string) => {
    setText(item);
    setShowHistory(false);
    textareaRef.current?.focus();
  }, []);

  const closeHistory = useCallback(() => {
    setShowHistory(false);
  }, []);

  // --- Effects ---

  useEffect(() => {
    const loadData = async () => {
      const loadedModes = await loadModes();
      await loadFlows();
      const store = await load("settings.json");
      const defaultMode = await store.get<string>("defaultMode");
      if (defaultMode && loadedModes.some((m) => m.id === defaultMode)) {
        setMode(defaultMode);
      } else if (loadedModes.length > 0) {
        setMode(loadedModes[0].id);
      }
      const savedHistoryShortcut = await store.get<string>("historyShortcut");
      if (savedHistoryShortcut) setHistoryShortcut(savedHistoryShortcut);
    };
    loadData();

    const unlisten = listen<SpotlightPayload>("spotlight-open", async (event) => {
      const { text: clipboardText } = event.payload;
      setText(clipboardText || "");
      setIsProcessed(false);
      setCopied(false);
      setShowHistory(false);
      setShowPalette(false);
      setError(null);

      await loadModes();
      await loadFlows();
      const store = await load("settings.json");
      const savedHistoryShortcut = await store.get<string>("historyShortcut");
      if (savedHistoryShortcut) setHistoryShortcut(savedHistoryShortcut);

      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadModes, loadFlows]);

  useEffect(() => {
    const unlisten = listen<FlowStepProgress>("flow-step-progress", (event) => {
      setFlowStepProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) handleClose();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleClose]);

  // --- Keyboard ---

  const matchesShortcut = (e: React.KeyboardEvent, shortcut: string): boolean => {
    const parts = shortcut.split("+");
    const key = parts[parts.length - 1].toLowerCase();
    const needsMeta = parts.includes("CommandOrControl") || parts.includes("Command");
    const needsShift = parts.includes("Shift");
    const needsAlt = parts.includes("Alt");
    return (
      e.key.toLowerCase() === key &&
      (!needsMeta || e.metaKey || e.ctrlKey) &&
      (!needsShift || e.shiftKey) &&
      (!needsAlt || e.altKey)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (matchesShortcut(e, historyShortcut)) {
      e.preventDefault();
      if (!showHistory) loadClipboardHistory();
      setShowHistory((prev) => !prev);
      return;
    }

    if (showHistory) return;

    if (e.key === "Tab" && !isLoading && !isProcessed && !showPalette) {
      e.preventDefault();
      openPalette();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      isProcessed ? handleCopy() : handleSendToAI();
    } else if (e.key === "Escape") {
      e.preventDefault();
      isProcessed ? handleBack() : handleClose();
    }
  };

  // --- Placeholder ---

  const getPlaceholder = () => {
    if (selectedType === "flow") {
      const flow = flows.find((f) => f.id === mode);
      if (flow) return `Enter text for flow "${flow.name}"...`;
    } else {
      const m = modes.find((m) => m.id === mode);
      if (m) return `Enter text for ${m.name.toLowerCase()}...`;
    }
    return "Enter text...";
  };

  // --- Render ---

  return (
    <div className="h-screen w-screen bg-transparent flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col animate-slide-in min-h-0">
        <div className="p-5 flex flex-col gap-3 flex-1 min-h-0">
          {/* Header: selector or processed bar */}
          {isProcessed ? (
            <ProcessedBar
              selectedType={selectedType}
              modeName={modes.find((m) => m.id === mode)?.name}
              flowStepNames={getFlowStepNames(mode)}
              onBack={handleBack}
            />
          ) : (
            <SelectorBar
              pinnedModes={pinnedModes}
              mode={mode}
              selectedType={selectedType}
              isLoading={isLoading}
              showPalette={showPalette}
              isCurrentPinnedMode={isCurrentPinnedMode}
              currentSelectionName={currentSelectionName}
              onSelectMode={(id) => {
                setMode(id);
                setSelectedType("mode");
              }}
              onOpenPalette={openPalette}
              onClosePalette={closePalette}
              onResetToDefault={resetToDefault}
            />
          )}

          {/* Flow pipeline strip */}
          {selectedType === "flow" && !isProcessed && (
            <PipelineStrip
              stepNames={getFlowStepNames(mode)}
              isLoading={isLoading}
              flowStepProgress={flowStepProgress}
            />
          )}

          {/* Main content area */}
          <div className="relative flex flex-col flex-1 min-h-0 gap-3">
            {/* Command palette overlay — covers full content area */}
            {showPalette && (
              <CommandPalette
                modes={modes}
                flows={flows}
                currentMode={mode}
                currentType={selectedType}
                onSelect={selectFromPalette}
                onClose={closePalette}
              />
            )}

            {/* Error */}
            {error && (
              <div className="shrink-0 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="flex-1">
                  <p className="text-red-400 text-[13px] font-medium">
                    {error.includes("No active model") || error.includes("not found") || error.includes("not downloaded")
                      ? "No model configured"
                      : "Processing failed"}
                  </p>
                  <p className="text-red-400/70 text-[12px] mt-0.5">
                    {error.includes("No active model") || error.includes("not found") || error.includes("not downloaded")
                      ? "Please download a model or add an API key in Settings \u2192 Models Library"
                      : error}
                  </p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="p-1 bg-transparent border-none cursor-pointer text-red-400/50 hover:text-red-400 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Textarea + overlays */}
            <div className="relative flex-1 min-h-0">
              {showHistory && (
                <ClipboardHistory
                  items={clipboardHistory}
                  onSelect={selectHistoryItem}
                  onClose={closeHistory}
                />
              )}

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder()}
                disabled={isLoading}
                className="text-input w-full h-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none resize-none text-white text-[15px] leading-relaxed select-text transition-all duration-200 placeholder:text-white/40 focus:bg-white/8 focus:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Footer */}
          <FooterBar
            isProcessed={isProcessed}
            isLoading={isLoading}
            hasText={!!text.trim()}
            copied={copied}
            historyShortcut={historyShortcut}
            onCopy={handleCopy}
            onSend={handleSendToAI}
            onHistoryShortcutChange={async (shortcut) => {
              try {
                const store = await import("@tauri-apps/plugin-store").then(m => m.load("settings.json"));
                await store.set("historyShortcut", shortcut);
                await store.save();
                setHistoryShortcut(shortcut);
              } catch (error) {
                console.error("Failed to update history shortcut:", error);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
