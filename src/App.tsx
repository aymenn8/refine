import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

interface ProcessingMode {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  user_prompt_template: string;
  is_default: boolean;
  is_pinned?: boolean;
}

interface SpotlightPayload {
  text: string;
  previous_app: string;
}

const MAX_HISTORY_ITEMS = 20;

function App() {
  const [text, setText] = useState("");
  const [modes, setModes] = useState<ProcessingMode[]>([]);
  const [mode, setMode] = useState<string>("correct");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [clipboardHistory, setClipboardHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [showMoreModes, setShowMoreModes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const moreModesRef = useRef<HTMLDivElement>(null);

  // Load clipboard history from Rust backend
  const loadClipboardHistory = useCallback(async () => {
    try {
      const history = await invoke<string[]>("get_clipboard_history");
      setClipboardHistory(history);
    } catch (error) {
      console.error("Failed to load clipboard history:", error);
    }
  }, []);

  // Load modes from backend
  const loadModes = useCallback(async () => {
    try {
      const loadedModes = await invoke<ProcessingMode[]>("get_modes");
      setModes(loadedModes);
      return loadedModes;
    } catch (error) {
      console.error("Failed to load modes:", error);
      return [];
    }
  }, []);

  useEffect(() => {
    // Load modes and default mode on mount
    const loadData = async () => {
      const loadedModes = await loadModes();

      const store = await load("settings.json");
      const defaultMode = await store.get<string>("defaultMode");
      if (defaultMode && loadedModes.some((m) => m.id === defaultMode)) {
        setMode(defaultMode);
      } else if (loadedModes.length > 0) {
        setMode(loadedModes[0].id);
      }
    };
    loadData();

    // Listen for spotlight open event
    const unlisten = listen<SpotlightPayload>(
      "spotlight-open",
      async (event) => {
        const { text: clipboardText } = event.payload;
        setText(clipboardText || "");
        setIsProcessed(false);
        setCopied(false);
        setShowHistory(false);
        setShowMoreModes(false);
        setError(null);

        // Reload modes to get latest pin status
        await loadModes();

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
          }
        }, 50);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadModes]);

  // Go back to prompt mode
  const handleBack = () => {
    setText(originalText);
    setIsProcessed(false);
    setCopied(false);
    textareaRef.current?.focus();
  };

  // Send to AI
  const handleSendToAI = async () => {
    if (!text.trim() || isLoading) return;

    setOriginalText(text);
    setIsLoading(true);
    setError(null);
    try {
      const transformedText = await invoke<string>("process_text", {
        text: text,
        mode: mode,
      });

      setText(transformedText);
      setIsProcessed(true);
    } catch (err) {
      console.error("Failed to process text:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!text.trim()) return;

    try {
      await writeText(text);
      setCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleClose = useCallback(async () => {
    try {
      await invoke("hide_window");
      setText("");
      setIsProcessed(false);
      setCopied(false);
    } catch (error) {
      console.error("Failed to hide window:", error);
    }
  }, []);

  // Hide window when it loses focus
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        handleClose();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleClose]);

  // Close more modes dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreModesRef.current &&
        !moreModesRef.current.contains(event.target as Node)
      ) {
        setShowMoreModes(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Select item from history
  const selectHistoryItem = (item: string) => {
    setText(item);
    setShowHistory(false);
    setSelectedHistoryIndex(0);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd+Shift+V to toggle clipboard history
    if (e.key === "v" && e.metaKey && e.shiftKey) {
      e.preventDefault();
      if (!showHistory) {
        // Load fresh history when opening
        loadClipboardHistory();
      }
      setShowHistory((prev) => !prev);
      setSelectedHistoryIndex(0);
      return;
    }

    // When history is open
    if (showHistory) {
      if (e.key === "ArrowDown" && clipboardHistory.length > 0) {
        e.preventDefault();
        setSelectedHistoryIndex((prev) =>
          prev < clipboardHistory.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp" && clipboardHistory.length > 0) {
        e.preventDefault();
        setSelectedHistoryIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && clipboardHistory.length > 0) {
        e.preventDefault();
        selectHistoryItem(clipboardHistory[selectedHistoryIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowHistory(false);
      }
      return;
    }

    // Normal behavior
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isProcessed) {
        handleCopy();
      } else {
        handleSendToAI();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isProcessed) {
        handleBack();
      } else {
        handleClose();
      }
    }
  };

  const getPlaceholder = () => {
    const currentMode = modes.find((m) => m.id === mode);
    if (currentMode) {
      return `Enter text for ${currentMode.name.toLowerCase()}...`;
    }
    return "Enter text...";
  };

  return (
    <div className="h-screen w-screen bg-transparent flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col animate-slide-in">
        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Mode selector or back button */}
          {isProcessed ? (
            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-[10px] border border-white/10">
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
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
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>
              <div className="flex-1 text-center text-[13px] text-white/40">
                Processed with{" "}
                <span className="text-white/60">
                  {modes.find((m) => m.id === mode)?.name}
                </span>
              </div>
            </div>
          ) : (
            (() => {
              const pinnedModes = modes.filter((m) => m.is_pinned);
              const unpinnedModes = modes.filter((m) => !m.is_pinned);
              const selectedUnpinnedMode = unpinnedModes.find(
                (m) => m.id === mode
              );

              return (
                <div className="flex gap-1.5 p-1 bg-white/5 rounded-[10px] border border-white/10">
                  {pinnedModes.map((m) => (
                    <button
                      key={m.id}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
                        mode === m.id
                          ? "bg-(--accent) text-white"
                          : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
                      }`}
                      onClick={() => {
                        setMode(m.id);
                        setShowMoreModes(false);
                      }}
                      disabled={isLoading}
                    >
                      <span>{m.name}</span>
                    </button>
                  ))}

                  {unpinnedModes.length > 0 && (
                    <div className="relative" ref={moreModesRef}>
                      <button
                        className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
                          selectedUnpinnedMode
                            ? "bg-(--accent) text-white"
                            : showMoreModes
                            ? "bg-white/10 text-white/80"
                            : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
                        }`}
                        onClick={() => setShowMoreModes(!showMoreModes)}
                        disabled={isLoading}
                      >
                        {selectedUnpinnedMode ? (
                          <>
                            <span>{selectedUnpinnedMode.name}</span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="ml-1.5"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </>
                        ) : (
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
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="19" cy="12" r="1" />
                            <circle cx="5" cy="12" r="1" />
                          </svg>
                        )}
                      </button>

                      {showMoreModes && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl min-w-[160px] overflow-hidden">
                          <div className="p-1">
                            {unpinnedModes.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  setMode(m.id);
                                  setShowMoreModes(false);
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left transition-colors border-none cursor-pointer ${
                                  mode === m.id
                                    ? "bg-(--accent)/20 text-white"
                                    : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                                }`}
                              >
                                <span>{m.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          )}

          <div className="flex flex-col gap-4 flex-1 relative">
            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  className="shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="flex-1">
                  <p className="text-red-400 text-[13px] font-medium">
                    {error.includes("No active model") ||
                    error.includes("not found") ||
                    error.includes("not downloaded")
                      ? "No model configured"
                      : "Processing failed"}
                  </p>
                  <p className="text-red-400/70 text-[12px] mt-0.5">
                    {error.includes("No active model") ||
                    error.includes("not found") ||
                    error.includes("not downloaded")
                      ? "Please download a model or add an API key in Settings → Models Library"
                      : error}
                  </p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="p-1 bg-transparent border-none cursor-pointer text-red-400/50 hover:text-red-400 transition-colors"
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
            )}

            {/* Clipboard History Dropdown */}
            {showHistory && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl max-h-[240px] overflow-y-auto">
                <div className="p-2">
                  <div className="text-white/40 text-[11px] font-medium px-2 py-1 uppercase tracking-wide flex items-center justify-between">
                    <span>Clipboard History</span>
                    <span className="normal-case font-normal">
                      Last {MAX_HISTORY_ITEMS} items
                    </span>
                  </div>
                  {clipboardHistory.length > 0 ? (
                    clipboardHistory.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => selectHistoryItem(item)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] text-white/80 truncate transition-colors border-none cursor-pointer ${
                          index === selectedHistoryIndex
                            ? "bg-(--accent)/20 text-white"
                            : "bg-transparent hover:bg-white/5"
                        }`}
                      >
                        {item.length > 80
                          ? item.substring(0, 80) + "..."
                          : item}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-white/40 text-[13px]">
                      No history yet. Start copying text to build your history.
                    </div>
                  )}
                </div>
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
              placeholder={getPlaceholder()}
              disabled={isLoading}
              className="text-input w-full min-h-[140px] flex-1 p-4 bg-white/5 border border-white/10 rounded-xl outline-none resize-none text-white text-[15px] leading-relaxed select-text transition-all duration-200 placeholder:text-white/40 focus:bg-white/8 focus:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-[10px] border border-white/10">
              <div className="flex items-center gap-2 text-white/50 text-xs font-medium">
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
                  Enter
                </kbd>
                <span>{isProcessed ? "copy" : "send"}</span>
                <span className="text-white/30">·</span>
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
                  {"\u2318\u21E7V"}
                </kbd>
                <span>history</span>
                <span className="text-white/30">·</span>
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
                  Esc
                </kbd>
                <span>{isProcessed ? "back" : "close"}</span>
              </div>

              {isProcessed ? (
                // Copy button after processing
                <button
                  onClick={handleCopy}
                  disabled={!text.trim()}
                  className={`flex items-center gap-2 px-[18px] py-[9px] border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                    copied
                      ? "bg-[#4CAF50] hover:bg-[#5CBF60]"
                      : "bg-(--accent) hover:bg-(--accent-hover)"
                  }`}
                >
                  {copied ? (
                    <>
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
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
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
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
              ) : (
                // Send to AI button
                <button
                  onClick={handleSendToAI}
                  disabled={isLoading || !text.trim()}
                  className="flex items-center gap-1.5 px-[18px] py-[9px] bg-(--accent) border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 hover:bg-(--accent-hover) disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="w-[14px] h-[14px] animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>Send</span>
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
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
