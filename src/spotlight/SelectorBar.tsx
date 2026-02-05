import type { ProcessingMode } from "./types";

interface SelectorBarProps {
  pinnedModes: ProcessingMode[];
  mode: string;
  selectedType: "mode" | "flow";
  isLoading: boolean;
  showPalette: boolean;
  isCurrentPinnedMode: boolean;
  currentSelectionName?: string;
  onSelectMode: (id: string) => void;
  onOpenPalette: () => void;
  onClosePalette: () => void;
  onResetToDefault: () => void;
}

export function SelectorBar({
  pinnedModes,
  mode,
  selectedType,
  isLoading,
  showPalette,
  isCurrentPinnedMode,
  currentSelectionName,
  onSelectMode,
  onOpenPalette,
  onClosePalette,
  onResetToDefault,
}: SelectorBarProps) {
  const showsName = !isCurrentPinnedMode && !!currentSelectionName;

  const handleTriggerClick = () => {
    if (showsName) {
      onResetToDefault();
    } else if (showPalette) {
      onClosePalette();
    } else {
      onOpenPalette();
    }
  };

  return (
    <div className="shrink-0 flex gap-1.5 p-1 bg-white/5 rounded-[10px] border border-white/10">
      {pinnedModes.map((m) => (
        <button
          key={m.id}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
            mode === m.id && selectedType === "mode"
              ? "bg-(--accent) text-white"
              : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
          }`}
          onClick={() => onSelectMode(m.id)}
          disabled={isLoading}
        >
          <span>{m.name}</span>
        </button>
      ))}

      <button
        className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
          showsName
            ? "bg-(--accent) text-white"
            : showPalette
            ? "bg-white/10 text-white/80"
            : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
        }`}
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
