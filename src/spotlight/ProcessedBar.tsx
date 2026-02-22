interface ProcessedBarProps {
  theme: "dark" | "light";
  selectedType: "mode" | "flow";
  modeName?: string;
  flowStepNames: string[];
  onBack: () => void;
}

export function ProcessedBar({
  theme,
  selectedType,
  modeName,
  flowStepNames,
  onBack,
}: ProcessedBarProps) {
  const backButtonClass =
    theme === "light"
      ? "text-black/65 hover:bg-black/8 hover:text-black/90"
      : "text-white/60 hover:bg-white/10 hover:text-white/80";
  const textMutedClass = theme === "light" ? "text-black/45" : "text-white/40";
  const textPrimaryClass = theme === "light" ? "text-black/70" : "text-white/60";

  return (
    <div className="shrink-0 flex items-center gap-2 px-1 py-1.5 mb-1">
      <button
        onClick={onBack}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none bg-transparent ${backButtonClass}`}
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
      <div className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] ${textMutedClass}`}>
        {selectedType === "flow" ? (
          <>
            <span className="mr-1">Processed:</span>
            {flowStepNames.map((name, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-(--accent)">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span className="text-[11px] font-medium">{name}</span>
                </span>
                {i < arr.length - 1 && (
                  <span className="text-(--accent)/50 text-[10px]">&rarr;</span>
                )}
              </span>
            ))}
          </>
        ) : (
          <>
            Processed with{" "}
            <span className={textPrimaryClass}>{modeName}</span>
          </>
        )}
      </div>
    </div>
  );
}
