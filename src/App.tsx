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
  icon: string;
  system_prompt: string;
  user_prompt_template: string;
  is_default: boolean;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load clipboard history from Rust backend
  const loadClipboardHistory = useCallback(async () => {
    try {
      const history = await invoke<string[]>("get_clipboard_history");
      setClipboardHistory(history);
    } catch (error) {
      console.error("Failed to load clipboard history:", error);
    }
  }, []);

  useEffect(() => {
    // Load modes and default mode
    const loadData = async () => {
      try {
        const loadedModes = await invoke<ProcessingMode[]>("get_modes");
        setModes(loadedModes);

        const store = await load("settings.json");
        const defaultMode = await store.get<string>("defaultMode");
        if (defaultMode && loadedModes.some((m) => m.id === defaultMode)) {
          setMode(defaultMode);
        } else if (loadedModes.length > 0) {
          setMode(loadedModes[0].id);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    loadData();

    // Listen for spotlight open event
    const unlisten = listen<SpotlightPayload>("spotlight-open", (event) => {
      const { text: clipboardText } = event.payload;
      setText(clipboardText || "");
      setIsProcessed(false);
      setCopied(false);
      setShowHistory(false);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 50);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
    try {
      const transformedText = await invoke<string>("process_text", {
        text: text,
        mode: mode,
      });

      setText(transformedText);
      setIsProcessed(true);
    } catch (error) {
      console.error("Failed to process text:", error);
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
                Processed with <span className="text-white/60">{modes.find(m => m.id === mode)?.name}</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 p-1 bg-white/5 rounded-[10px] border border-white/10">
              {modes.map((m) => (
                <button
                  key={m.id}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
                    mode === m.id
                      ? "bg-[#F0B67F] text-white"
                      : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
                  }`}
                  onClick={() => setMode(m.id)}
                  disabled={isLoading}
                >
                  {m.icon && (
                    <span className="text-base leading-none">{m.icon}</span>
                  )}
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-4 flex-1 relative">
            {/* Clipboard History Dropdown */}
            {showHistory && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl max-h-[240px] overflow-y-auto">
                <div className="p-2">
                  <div className="text-white/40 text-[11px] font-medium px-2 py-1 uppercase tracking-wide flex items-center justify-between">
                    <span>Clipboard History</span>
                    <span className="normal-case font-normal">Last {MAX_HISTORY_ITEMS} items</span>
                  </div>
                  {clipboardHistory.length > 0 ? (
                    clipboardHistory.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => selectHistoryItem(item)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] text-white/80 truncate transition-colors border-none cursor-pointer ${
                          index === selectedHistoryIndex
                            ? "bg-[#F0B67F]/20 text-white"
                            : "bg-transparent hover:bg-white/5"
                        }`}
                      >
                        {item.length > 80 ? item.substring(0, 80) + "..." : item}
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
              onChange={(e) => setText(e.target.value)}
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
                      : "bg-[#F0B67F] hover:bg-[#F5C88A]"
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
                  className="flex items-center gap-1.5 px-[18px] py-[9px] bg-[#F0B67F] border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 hover:bg-[#F5C88A] disabled:opacity-40 disabled:cursor-not-allowed"
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
