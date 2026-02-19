import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { ProcessingMode, Flow } from "./types";

interface CommandPaletteProps {
  modes: ProcessingMode[];
  flows: Flow[];
  currentMode: string;
  currentType: "mode" | "flow";
  onSelect: (type: "mode" | "flow", id: string) => void;
  onClose: () => void;
}

export function CommandPalette({
  modes,
  flows,
  currentMode,
  currentType,
  onSelect,
  onClose,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filtered items
  const paletteItems = useMemo(() => {
    const q = search.toLowerCase();
    const filteredModes = modes.filter(
      (m) => !m.is_pinned && m.name.toLowerCase().includes(q)
    );
    const filteredFlows = flows.filter((f) => f.name.toLowerCase().includes(q));
    const items: {
      type: "mode" | "flow";
      id: string;
      name: string;
      description: string;
      steps?: string[];
    }[] = [];
    filteredModes.forEach((m) =>
      items.push({
        type: "mode",
        id: m.id,
        name: m.name,
        description: m.description,
      })
    );
    filteredFlows.forEach((f) =>
      items.push({
        type: "flow",
        id: f.id,
        name: f.name,
        description: f.description,
        steps: f.steps,
      })
    );
    return {
      items,
      modeCount: filteredModes.length,
      flowCount: filteredFlows.length,
    };
  }, [modes, flows, search]);

  // Clamp index when results change
  useEffect(() => {
    setIndex((prev) =>
      paletteItems.items.length > 0
        ? Math.min(prev, paletteItems.items.length - 1)
        : 0
    );
  }, [paletteItems.items.length]);

  // Global keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const total = paletteItems.items.length;
      if (e.key === "ArrowDown" && total > 0) {
        e.preventDefault();
        setIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp" && total > 0) {
        e.preventDefault();
        setIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && total > 0) {
        e.preventDefault();
        const item = paletteItems.items[index];
        if (item) onSelect(item.type, item.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteItems, index, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!containerRef.current) return;
    const items = containerRef.current.querySelectorAll("[data-palette-item]");
    const selected = items[index] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [index]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const resolveStepNames = useCallback(
    (steps: string[]) =>
      steps.map((stepId) => modes.find((m) => m.id === stepId)?.name || stepId),
    [modes]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/[0.06] rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Search input */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/40 shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIndex(0);
          }}
          placeholder="Search modes & flows..."
          className="flex-1 bg-transparent border-none outline-none text-white text-[13px] placeholder:text-white/30"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {paletteItems.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-white/40 text-[13px]">
            No results found
          </div>
        ) : (
          <>
            {paletteItems.modeCount > 0 && (
              <>
                <div className="text-[10px] text-white/30 uppercase tracking-wider px-3 py-1.5 font-medium">
                  Modes
                </div>
                {paletteItems.items
                  .filter((item) => item.type === "mode")
                  .map((item) => {
                    const flatIndex = paletteItems.items.indexOf(item);
                    const isSelected =
                      currentMode === item.id && currentType === "mode";
                    const isHighlighted = flatIndex === index;
                    return (
                      <button
                        key={item.id}
                        data-palette-item
                        onClick={() => onSelect(item.type, item.id)}
                        className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors border-none cursor-pointer ${
                          isHighlighted
                            ? "bg-white/10"
                            : isSelected
                            ? "bg-(--accent)/15"
                            : "bg-transparent hover:bg-white/5"
                        }`}
                      >
                        <span
                          className={`mt-1 w-[6px] h-[6px] rounded-full shrink-0 ${
                            isSelected ? "bg-(--accent)" : "bg-white/25"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-[13px] font-medium ${
                              isSelected ? "text-(--accent)" : "text-white/80"
                            }`}
                          >
                            {item.name}
                          </div>
                          {item.description && (
                            <div className="text-[11px] text-white/35 truncate mt-0.5">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </>
            )}

            {paletteItems.flowCount > 0 && (
              <>
                {paletteItems.modeCount > 0 && (
                  <div className="my-1 border-t border-white/10" />
                )}
                <div className="text-[10px] text-white/30 uppercase tracking-wider px-3 py-1.5 font-medium">
                  Flows
                </div>
                {paletteItems.items
                  .filter((item) => item.type === "flow")
                  .map((item) => {
                    const flatIndex = paletteItems.items.indexOf(item);
                    const isSelected =
                      currentMode === item.id && currentType === "flow";
                    const isHighlighted = flatIndex === index;
                    const stepNames = item.steps
                      ? resolveStepNames(item.steps)
                      : [];
                    return (
                      <button
                        key={item.id}
                        data-palette-item
                        onClick={() => onSelect(item.type, item.id)}
                        className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors border-none cursor-pointer ${
                          isHighlighted
                            ? "bg-white/10"
                            : isSelected
                            ? "bg-(--accent)/15"
                            : "bg-transparent hover:bg-white/5"
                        }`}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`mt-0.5 shrink-0 ${
                            isSelected ? "text-(--accent)" : "text-white/40"
                          }`}
                        >
                          <polyline points="16 3 21 3 21 8" />
                          <line x1="4" y1="20" x2="21" y2="3" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[13px] font-medium ${
                                isSelected ? "text-(--accent)" : "text-white/80"
                              }`}
                            >
                              {item.name}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/8 text-white/30 font-medium">
                              flow
                            </span>
                          </div>
                          {stepNames.length > 0 && (
                            <div className="text-[11px] text-white/35 truncate mt-0.5">
                              {stepNames.join(" \u2192 ")}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
