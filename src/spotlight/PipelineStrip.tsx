import type { FlowStepProgress } from "./types";

interface PipelineStripProps {
  stepNames: string[];
  isLoading: boolean;
  flowStepProgress: FlowStepProgress | null;
}

export function PipelineStrip({
  stepNames,
  isLoading,
  flowStepProgress,
}: PipelineStripProps) {
  if (stepNames.length === 0) return null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg">
      {stepNames.map((name, i) => {
        let stepStatus: "pending" | "processing" | "done" = "pending";
        if (isLoading && flowStepProgress) {
          if (i < flowStepProgress.step_index) {
            stepStatus = "done";
          } else if (i === flowStepProgress.step_index) {
            stepStatus = flowStepProgress.status === "done" ? "done" : "processing";
          }
        }

        return (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 transition-all duration-300 ${
                isLoading
                  ? stepStatus === "done"
                    ? "text-(--accent)"
                    : stepStatus === "processing"
                    ? "text-(--accent) animate-step-pulse"
                    : "text-white/20"
                  : "text-white/45"
              }`}
            >
              {isLoading && stepStatus === "done" ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : isLoading && stepStatus === "processing" ? (
                <svg className="w-[10px] h-[10px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <span className={`w-[6px] h-[6px] rounded-full ${isLoading ? "bg-white/15" : "bg-white/25"}`} />
              )}
              <span className="text-[11px] font-medium">{name}</span>
            </span>
            {i < stepNames.length - 1 && (
              <span
                className={`text-[10px] transition-all duration-300 ${
                  isLoading
                    ? stepStatus === "done"
                      ? "text-(--accent)/40"
                      : "text-white/10"
                    : "text-white/20"
                }`}
              >
                &rarr;
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
