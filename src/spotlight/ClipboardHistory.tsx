import { useEffect, useRef, useState } from "react";

const MAX_HISTORY_ITEMS = 20;

interface ClipboardHistoryProps {
  items: string[];
  onSelect: (item: string) => void;
  onClose: () => void;
}

export function ClipboardHistory({ items, onSelect, onClose }: ClipboardHistoryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(0);

  // Reset index when opened with new items
  useEffect(() => {
    setSelectedIndex(0);
    selectedIndexRef.current = 0;
  }, [items]);

  // Keep ref in sync
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const els = listRef.current.querySelectorAll("[data-history-item]");
    const selected = els[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Global keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && items.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp" && items.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && items.length > 0) {
        e.preventDefault();
        onSelect(items[selectedIndexRef.current]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, onSelect, onClose]);

  return (
    <div
      ref={listRef}
      className="absolute top-0 left-0 right-0 z-10 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl max-h-[240px] overflow-y-auto"
    >
      <div className="p-2">
        <div className="text-white/40 text-[11px] font-medium px-2 py-1 uppercase tracking-wide flex items-center justify-between">
          <span>Clipboard History</span>
          <span className="normal-case font-normal">Last {MAX_HISTORY_ITEMS} items</span>
        </div>
        {items.length > 0 ? (
          items.map((item, i) => (
            <button
              key={i}
              data-history-item
              onClick={() => onSelect(item)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[13px] text-white/80 truncate transition-colors border-none cursor-pointer ${
                i === selectedIndex
                  ? "bg-(--accent)/20 text-white"
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
  );
}
