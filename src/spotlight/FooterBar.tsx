interface FooterBarProps {
  isProcessed: boolean;
  isLoading: boolean;
  hasText: boolean;
  copied: boolean;
  historyShortcut: string;
  onCopy: () => void;
  onSend: () => void;
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

export function FooterBar({
  isProcessed,
  isLoading,
  hasText,
  copied,
  historyShortcut,
  onCopy,
  onSend,
}: FooterBarProps) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white/5 rounded-[10px] border border-white/10">
      <div className="flex items-center gap-2 text-white/50 text-xs font-medium">
        <Kbd>Enter</Kbd>
        <span>{isProcessed ? "copy" : "send"}</span>
        <Dot />
        <Kbd>Tab</Kbd>
        <span>browse</span>
        <Dot />
        <Kbd>{formatShortcut(historyShortcut)}</Kbd>
        <span>history</span>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
      {children}
    </kbd>
  );
}

function Dot() {
  return <span className="text-white/30">&middot;</span>;
}
