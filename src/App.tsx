import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";
import { playNotificationSound } from "./utils/sound";
import { applyAccentColor } from "./utils/accent";
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

function getModeShortcutIndex(e: {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): number | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) {
    return null;
  }

  const codeMatch =
    e.code.match(/^Digit([1-9])$/) ?? e.code.match(/^Numpad([1-9])$/);
  if (codeMatch) {
    return Number(codeMatch[1]) - 1;
  }

  const keyMatch = e.key.match(/^[1-9]$/);
  if (keyMatch) {
    return Number(keyMatch[0]) - 1;
  }

  return null;
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
  const [showHistory, setShowHistory] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowStepProgress, setFlowStepProgress] = useState<FlowStepProgress | null>(null);
  const [historyShortcut, setHistoryShortcut] = useState("CommandOrControl+Shift+V");
  const [spotlightTheme, setSpotlightTheme] = useState<"dark" | "light">("dark");
  const [autoCopied, setAutoCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurUntilRef = useRef(0);
  const modeRef = useRef(mode);
  const selectedTypeRef = useRef(selectedType);

  // --- Data loading ---

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

  const resolveSpotlightTheme = useCallback(async () => {
    try {
      const store = await load("settings.json");
      const raw =
        (await store.get<string>("themeMode")) ||
        (await store.get<string>("appearance")) ||
        (await store.get<string>("theme")) ||
        "dark";
      const mode = raw.toLowerCase();

      if (mode === "light") {
        setSpotlightTheme("light");
      } else if (mode === "system") {
        setSpotlightTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      } else {
        setSpotlightTheme("dark");
      }
    } catch {
      setSpotlightTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
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

  const pickPinnedMode = useCallback(
    (loadedModes: ProcessingMode[], preferredModeId?: string | null): string | null => {
      if (loadedModes.length === 0) return null;

      const pinned = loadedModes
        .filter((m) => m.is_pinned)
        .sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0));

      if (preferredModeId && pinned.some((m) => m.id === preferredModeId)) {
        return preferredModeId;
      }

      return pinned[0]?.id ?? loadedModes[0].id;
    },
    []
  );

  // --- Derived values ---

  const pinnedModes = modes.filter((m) => m.is_pinned).sort((a, b) => (a.pin_order ?? 0) - (b.pin_order ?? 0));
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
    setShowPalette(false);
    setShowHistory(false);
    textareaRef.current?.focus();
  }, [pinnedModes, modes]);

  // --- Actions ---

  const handleBack = useCallback(() => {
    setText(originalText);
    setIsProcessed(false);
    setCopied(false);
    setAutoCopied(false);
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
      setAutoCopied(false);
      playNotificationSound();
      // Auto-copy result to clipboard if enabled
      const store = await load("settings.json");
      const autoCopy = await store.get<boolean>("autoCopyEnabled");
      if (autoCopy !== false) {
        try {
          await writeText(transformedText);
          setAutoCopied(true);
          setTimeout(() => setAutoCopied(false), 3000);
        } catch (e) {
          console.error("Auto-copy failed:", e);
        }
      }
    } catch (err) {
      console.error("Failed to process text:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setFlowStepProgress(null);
    }
  }, [text, isLoading, selectedType, mode]);

  const handlePasteProcessed = useCallback(async () => {
    if (!text.trim()) return;
    try {
      ignoreBlurUntilRef.current = Date.now() + 1500;
      await invoke("paste_to_previous_app", { text });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to paste processed text:", err);
      ignoreBlurUntilRef.current = 0;
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

  const closeHistory = useCallback(() => {
    setShowHistory(false);
  }, []);

  const switchToPinnedModeByIndex = useCallback(
    (modeIndex: number): boolean => {
      const targetMode = pinnedModes[modeIndex];
      if (!targetMode) return false;

      setMode(targetMode.id);
      setSelectedType("mode");
      if (showPalette) setShowPalette(false);
      if (showHistory) setShowHistory(false);
      return true;
    },
    [pinnedModes, showPalette, showHistory]
  );

  // --- Effects ---

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    selectedTypeRef.current = selectedType;
  }, [selectedType]);

  useEffect(() => {
    const loadData = async () => {
      const loadedModes = await loadModes();
      await loadFlows();
      const store = await load("settings.json");
      const defaultMode = await store.get<string>("defaultMode");
      const initialMode = pickPinnedMode(loadedModes, defaultMode ?? null);
      if (initialMode) {
        setMode(initialMode);
        setSelectedType("mode");
      }
      const currentHistoryShortcut = await invoke<string>("get_history_shortcut");
      setHistoryShortcut(currentHistoryShortcut);
      await resolveSpotlightTheme();
    };
    loadData();
  }, [loadModes, loadFlows, resolveSpotlightTheme, pickPinnedMode]);

  useEffect(() => {
    const unlisten = listen<SpotlightPayload>("spotlight-open", async (event) => {
      const { text: clipboardText } = event.payload;
      setText(clipboardText || "");
      setIsProcessed(false);
      setCopied(false);
      setShowHistory(false);
      setShowPalette(false);
      setError(null);

      await applyAccentColor();
      const loadedModes = await loadModes();
      await loadFlows();

      const currentType = selectedTypeRef.current;
      const currentMode = modeRef.current;

      if (currentType === "mode") {
        const store = await load("settings.json");
        const defaultMode = await store.get<string>("defaultMode");
        const currentModePinned = loadedModes.some((m) => m.id === currentMode && m.is_pinned);
        const preferredMode = currentModePinned ? currentMode : defaultMode ?? null;
        const nextMode = pickPinnedMode(loadedModes, preferredMode);
        if (nextMode && nextMode !== currentMode) {
          setMode(nextMode);
        }
      }

      const currentHistoryShortcut = await invoke<string>("get_history_shortcut");
      setHistoryShortcut(currentHistoryShortcut);
      await resolveSpotlightTheme();

      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    });

    const unlistenHistoryToggle = listen("spotlight-history-toggle", () => {
      setShowPalette(false);
      setShowHistory((prev) => !prev);
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenHistoryToggle.then((fn) => fn());
    };
  }, [loadModes, loadFlows, resolveSpotlightTheme, pickPinnedMode]);

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
      if (focused) {
        ignoreBlurUntilRef.current = 0;
        return;
      }

      if (Date.now() < ignoreBlurUntilRef.current) {
        return;
      }

      handleClose();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modeIndex = getModeShortcutIndex(e);
      if (modeIndex === null) return;

      if (switchToPinnedModeByIndex(modeIndex)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [switchToPinnedModeByIndex]);

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
      setShowHistory((prev) => !prev);
      return;
    }

    // Handle clipboard shortcuts manually (NSPanel doesn't route edit menu shortcuts)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const ta = textareaRef.current;
      if (ta) {
        switch (e.key.toLowerCase()) {
          case "a":
            e.preventDefault();
            ta.select();
            return;
          case "c": {
            const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
            if (selected) {
              e.preventDefault();
              writeText(selected).catch(console.error);
            }
            return;
          }
          case "x": {
            const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
            if (selected) {
              e.preventDefault();
              const start = ta.selectionStart;
              writeText(selected).catch(console.error);
              const newText = ta.value.substring(0, start) + ta.value.substring(ta.selectionEnd);
              setText(newText);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start;
              });
            }
            return;
          }
          case "v": {
            e.preventDefault();
            readText().then((clipText) => {
              if (clipText) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newText = ta.value.substring(0, start) + clipText + ta.value.substring(end);
                setText(newText);
                const newPos = start + clipText.length;
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = newPos;
                });
              }
            }).catch(console.error);
            return;
          }
        }
      }
    }

    const modeIndex = getModeShortcutIndex(e);
    if (modeIndex !== null && switchToPinnedModeByIndex(modeIndex)) {
      e.preventDefault();
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
      isProcessed ? handlePasteProcessed() : handleSendToAI();
    } else if (e.key === "Escape") {
      e.preventDefault();
      isProcessed ? handleBack() : handleClose();
    }
  };

  // --- Placeholder ---

  const getPlaceholder = () => {
    if (selectedType === "flow") {
      const flow = flows.find((f) => f.id === mode);
      if (flow) return `Refine your text with ${flow.name}...`;
    } else {
      const m = modes.find((m) => m.id === mode);
      if (m) return `Refine your text with ${m.name}...`;
    }
    return "Refine your text...";
  };

  // --- Render ---
  const isLightTheme = spotlightTheme === "light";

  return (
    <div className={`auto-light-contrast h-screen w-screen bg-transparent flex flex-col overflow-hidden ${isLightTheme ? "text-black" : "text-white"}`}>
      <div className="flex-1 flex flex-col animate-slide-in min-h-0">
        <div className="px-5 pt-3 pb-3 flex flex-col flex-1 min-h-0">
          {/* Header: selector or processed bar */}
          {isProcessed ? (
            <ProcessedBar
              theme={spotlightTheme}
              selectedType={selectedType}
              modeName={modes.find((m) => m.id === mode)?.name}
              flowStepNames={getFlowStepNames(mode)}
              onBack={handleBack}
            />
          ) : (
            <SelectorBar
              theme={spotlightTheme}
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
              onResetToDefault={resetToDefault}
            />
          )}

          {/* Flow pipeline strip */}
          {selectedType === "flow" && !isProcessed && (
            <PipelineStrip
              theme={spotlightTheme}
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
                theme={spotlightTheme}
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
                  theme={spotlightTheme}
                  onClose={closeHistory}
                />
              )}

              {/* Auto-copy notification */}
              {autoCopied && (
                <div
                  className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur-sm text-[12px] animate-fade-in ${
                    isLightTheme
                      ? "bg-white/85 border border-black/10 text-black/70"
                      : "bg-white/10 border border-white/10 text-white/70"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied to clipboard
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={handleKeyDown}
                onMouseDown={() => {
                  if (isProcessed) {
                    setIsProcessed(false);
                    setCopied(false);
                    setAutoCopied(false);
                  }
                }}
                placeholder={getPlaceholder()}
                disabled={isLoading}
                className={`text-input w-full h-full p-4 rounded-xl outline-none resize-none text-[15px] leading-relaxed select-text transition-all duration-200 disabled:cursor-not-allowed ${
                  isLightTheme
                    ? "bg-black/[0.02] border border-black/[0.12] text-black/85 placeholder:text-black/35 focus:bg-black/[0.04] focus:border-black/[0.2]"
                    : "bg-white/[0.03] border border-white/[0.06] text-white placeholder:text-white/30 focus:bg-white/[0.05] focus:border-white/[0.12]"
                } ${isLoading ? "animate-border-glow" : ""}`}
              />
            </div>
          </div>

          {/* Footer */}
          <FooterBar
            theme={spotlightTheme}
            isProcessed={isProcessed}
            isLoading={isLoading}
            hasText={!!text.trim()}
            copied={copied}
            historyShortcut={historyShortcut}
            onPaste={handlePasteProcessed}
            onSend={handleSendToAI}
            onHistoryShortcutChange={async (shortcut) => {
              try {
                await invoke("update_history_shortcut", { shortcutStr: shortcut });
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
