import { useState, useRef } from "react";

interface FooterBarProps {
  isProcessed: boolean;
  isLoading: boolean;
  hasText: boolean;
  copied: boolean;
  historyShortcut: string;
  onCopy: () => void;
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
  onCopy,
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
    <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white/5 rounded-[10px] border border-white/10">
      <div className="flex items-center gap-2 text-white/50 text-xs font-medium">
        <Kbd>Enter</Kbd>
        <span>{isProcessed ? "copy" : "send"}</span>
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
          onClick={onCopy}
          disabled={!hasText}
          className={`flex items-center gap-2 px-[18px] py-[9px] border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            copied
              ? "bg-[#4CAF50] hover:bg-[#5CBF60]"
              : "bg-(--accent) hover:bg-(--accent-hover)"
          }`}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={isLoading || !hasText}
          className="flex items-center gap-1.5 px-[18px] py-[9px] bg-(--accent) border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 hover:bg-(--accent-hover) disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <svg className="w-[14px] h-[14px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>Send</span>
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
        : "bg-white/10 border-white/15 text-white/70"
    }`}>
      {children}
    </kbd>
  );
}

function Dot() {
  return <span className="text-white/30">&middot;</span>;
}
