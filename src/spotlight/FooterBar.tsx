import { useState, useRef } from "react";

interface FooterBarProps {
  isProcessed: boolean;
  isLoading: boolean;
  hasText: boolean;
  copied: boolean;
  historyShortcut: string;
  onPaste: () => void;
  onSend: () => void;
  onHistoryShortcutChange?: (shortcut: string) => void;
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace("CommandOrControl", "\u2318")
    .replace("Command", "\u2318")
    .replace("Control", "\u2303")
    .replace("Shift", "\u21E7")
    .replace("Alt", "\u2325")
    .replace(/\+/g, "");
}

function keysToShortcut(keys: Set<string>): string {
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
}

export function FooterBar({
  isProcessed,
  isLoading,
  hasText,
  copied,
  historyShortcut,
  onPaste,
  onSend,
  onHistoryShortcutChange,
}: FooterBarProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleStartRecording = () => {
    if (!onHistoryShortcutChange) return;
    setIsRecording(true);
    setRecordedKeys(new Set());
    setTimeout(() => btnRef.current?.focus(), 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(false);
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

    const hasModifier =
      newKeys.has("Meta") || newKeys.has("Control") || newKeys.has("Shift") || newKeys.has("Alt");
    const mainKey = Array.from(newKeys).find(
      (k) => !["Meta", "Control", "Shift", "Alt"].includes(k)
    );

    if (hasModifier && mainKey) {
      const shortcut = keysToShortcut(newKeys);
      onHistoryShortcutChange?.(shortcut);
      setIsRecording(false);
      setRecordedKeys(new Set());
    }
  };

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 mt-1">
      <div className="flex items-center gap-2 text-white/30 text-xs font-medium">
        <Kbd>Enter</Kbd>
        <span>{isProcessed ? "paste" : "refine"}</span>
        <Dot />
        <Kbd>Tab</Kbd>
        <span>browse</span>
        <Dot />
        <button
          ref={btnRef}
          onClick={handleStartRecording}
          onKeyDown={handleKeyDown}
          className={`inline-flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer outline-none ${
            isRecording ? "text-(--accent)" : "text-white/50 hover:text-white/70"
          } transition-colors`}
          title="Click to change shortcut"
        >
          <Kbd highlight={isRecording}>
            {isRecording
              ? recordedKeys.size > 0
                ? formatShortcut(keysToShortcut(recordedKeys))
                : "..."
              : formatShortcut(historyShortcut)}
          </Kbd>
          <span className="text-xs font-medium">history</span>
        </button>
        <Dot />
        <Kbd>Esc</Kbd>
        <span>{isProcessed ? "back" : "close"}</span>
      </div>

      {isProcessed ? (
        <button
          onClick={onPaste}
          disabled={!hasText}
          className={`flex items-center gap-2 px-[18px] py-[9px] rounded-lg text-[13px] font-semibold cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            copied
              ? "bg-transparent border border-[#4CAF50]/50 text-[#4CAF50] hover:bg-[#4CAF50]/10"
              : "bg-transparent border border-(--accent)/50 text-(--accent) hover:bg-(--accent)/10 hover:border-(--accent)"
          }`}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>Pasted!</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span>Paste</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={isLoading || !hasText}
          className="flex items-center gap-1.5 px-[18px] py-[9px] bg-transparent border border-(--accent)/50 rounded-lg text-(--accent) text-[13px] font-semibold cursor-pointer transition-all duration-200 hover:bg-(--accent)/10 hover:border-(--accent) disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <span>Refining</span>
              <span className="loading-dots flex items-center gap-[3px]">
                <span />
                <span />
                <span />
              </span>
            </span>
          ) : (
            <>
              <span>Refine</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}

function Kbd({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <kbd className={`inline-flex items-center justify-center min-w-6 px-[7px] py-1 border rounded-[5px] text-[11px] font-semibold transition-colors ${
      highlight
        ? "bg-(--accent)/20 border-(--accent)/30 text-(--accent)"
        : "bg-white/[0.04] border-white/[0.08] text-white/40"
    }`}>
      {children}
    </kbd>
  );
}

function Dot() {
  return <span className="text-white/30">&middot;</span>;
}
