import type { ProcessingMode } from "./types";

interface SelectorBarProps {
  theme: "dark" | "light";
  pinnedModes: ProcessingMode[];
  mode: string;
  selectedType: "mode" | "flow";
  isLoading: boolean;
  showPalette: boolean;
  isCurrentPinnedMode: boolean;
  currentSelectionName?: string;
  onSelectMode: (id: string) => void;
  onOpenPalette: () => void;
  onResetToDefault: () => void;
}

export function SelectorBar({
  theme,
  pinnedModes,
  mode,
  selectedType,
  isLoading,
  showPalette,
  isCurrentPinnedMode,
  currentSelectionName,
  onSelectMode,
  onOpenPalette,
  onResetToDefault,
}: SelectorBarProps) {
  const showsName = !showPalette && !isCurrentPinnedMode && !!currentSelectionName;
  const inactiveTextClass =
    theme === "light"
      ? "text-black/45 hover:text-black/70"
      : "text-white/40 hover:text-white/60";
  const triggerOpenClass =
    theme === "light" ? "text-black/70 border-b-transparent" : "text-white/60 border-b-transparent";

  const handleTriggerClick = () => {
    if (showPalette) {
      onResetToDefault();
    } else if (showsName) {
      onResetToDefault();
    } else {
      onOpenPalette();
    }
  };

  return (
    <div className="shrink-0 flex gap-1.5 px-1 py-1.5 mb-1">
      {pinnedModes.map((m) => (
        <button
          key={m.id}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium cursor-pointer transition-all duration-150 border-0 border-b-2 border-solid ${
            mode === m.id && selectedType === "mode"
              ? "text-(--accent) border-b-(--accent)"
              : `${inactiveTextClass} border-b-transparent`
          }`}
          onClick={() => onSelectMode(m.id)}
          disabled={isLoading}
        >
          <span>{m.name}</span>
        </button>
      ))}

      <button
        className={`flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium cursor-pointer transition-all duration-150 border-0 border-b-2 border-solid ${
          showsName
            ? "text-(--accent) border-b-(--accent)"
            : showPalette
            ? triggerOpenClass
            : `${inactiveTextClass} border-b-transparent`
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={handleTriggerClick}
        disabled={isLoading}
      >
        {showsName ? (
          <>
            {selectedType === "flow" && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
              </svg>
            )}
            <span>{currentSelectionName}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-0.5 opacity-50"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </>
        ) : showPalette ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </button>
    </div>
  );
}
