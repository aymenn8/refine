import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const PAGE_SIZE = 80;

interface ClipboardEntry {
  id: number;
  text: string;
  copied_at: number;
  source_app_name: string;
  source_bundle_id: string;
  source_icon_path: string | null;
}

interface ClipboardHistoryPage {
  entries: ClipboardEntry[];
  total: number;
  has_more: boolean;
}

interface ClipboardHistoryProps {
  theme: "dark" | "light";
  onClose: () => void;
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const suffix = day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix}`;
}

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return `${date.toLocaleDateString(undefined, { weekday: "long" })}, ${ordinal(date.getDate())}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstCharBadge(name: string): string {
  const normalized = (name || "Unknown App").trim();
  if (!normalized) return "A";
  return normalized.slice(0, 1).toUpperCase();
}

export function ClipboardHistory({ theme, onClose }: ClipboardHistoryProps) {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const entriesRef = useRef<ClipboardEntry[]>([]);
  const selectedIndexRef = useRef(0);
  const queryRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const loadPage = useCallback(async (reset: boolean, customQuery?: string) => {
    const search = (customQuery ?? queryRef.current).trim();
    const offset = reset ? 0 : entriesRef.current.length;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const page = await invoke<ClipboardHistoryPage>("query_clipboard_history", {
        offset,
        limit: PAGE_SIZE,
        query: search.length > 0 ? search : null,
      });

      setTotal(page.total);
      setHasMore(page.has_more);
      setEntries((prev) => (reset ? page.entries : [...prev, ...page.entries]));
      if (reset) {
        setSelectedIndex(0);
      }
    } catch (error) {
      console.error("Failed to load clipboard history:", error);
    } finally {
      if (reset) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      queryRef.current = query;
      loadPage(true, query);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [query, loadPage]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    loadPage(false);
  }, [hasMore, isLoading, isLoadingMore, loadPage]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const onScroll = () => {
      const distanceToBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (distanceToBottom < 160) {
        handleLoadMore();
      }
    };

    node.addEventListener("scroll", onScroll);
    return () => node.removeEventListener("scroll", onScroll);
  }, [handleLoadMore]);

  const recopySelected = useCallback(async () => {
    const selected = entriesRef.current[selectedIndexRef.current];
    if (!selected) return;

    try {
      await invoke("recopy_clipboard_history_entry", { id: selected.id });
      setCopiedId(selected.id);
      window.setTimeout(() => setCopiedId(null), 1200);
    } catch (error) {
      console.error("Failed to recopy clipboard entry:", error);
    }
  }, []);

  const pasteEntry = useCallback(async (id: number) => {
    try {
      await invoke("paste_clipboard_history_entry", { id });
      onClose();
    } catch (error) {
      console.error("Failed to paste clipboard entry:", error);
    }
  }, [onClose]);

  const pasteSelected = useCallback(async () => {
    const selected = entriesRef.current[selectedIndexRef.current];
    if (!selected) return;
    await pasteEntry(selected.id);
  }, [pasteEntry]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        recopySelected();
        return;
      }

      if (e.key === "ArrowDown" && entriesRef.current.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, entriesRef.current.length - 1));
      } else if (e.key === "ArrowUp" && entriesRef.current.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        pasteSelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, pasteSelected, recopySelected]);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>(`[data-entry-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((prev) => Math.min(prev, entries.length - 1));
  }, [entries]);

  const sections = useMemo(() => {
    const rows: { key: string; label: string; items: { entry: ClipboardEntry; index: number }[] }[] = [];

    entries.forEach((item, index) => {
      const key = new Date(item.copied_at * 1000).toDateString();
      const label = dateLabel(item.copied_at);
      const last = rows[rows.length - 1];

      if (!last || last.key !== key) {
        rows.push({ key, label, items: [{ entry: item, index }] });
      } else {
        last.items.push({ entry: item, index });
      }
    });

    return rows;
  }, [entries]);

  const surfaceClass =
    theme === "light"
      ? "bg-white/95 border-black/10"
      : "bg-[#1a1a1a]/95 border-white/10";

  const textMutedClass = theme === "light" ? "text-black/45" : "text-white/40";
  const textPrimaryClass = theme === "light" ? "text-black/85" : "text-white/85";
  const hoverClass = theme === "light" ? "hover:bg-black/5" : "hover:bg-white/5";

  return (
    <div
      className={`absolute inset-0 z-10 backdrop-blur-xl border rounded-xl shadow-2xl flex flex-col overflow-hidden ${surfaceClass}`}
    >
      <div className={`shrink-0 flex items-center gap-2 px-3 py-2.5 border-b ${theme === "light" ? "border-black/10" : "border-white/10"}`}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={textMutedClass}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clipboard history..."
          className={`flex-1 bg-transparent border-none outline-none text-[13px] ${textPrimaryClass} ${theme === "light" ? "placeholder:text-black/35" : "placeholder:text-white/30"}`}
        />
        <span className={`text-[11px] ${textMutedClass}`}>{total}</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className={`px-3 py-8 text-center text-[13px] ${textMutedClass}`}>Loading clipboard history...</div>
        ) : entries.length === 0 ? (
          <div className={`px-3 py-8 text-center text-[13px] ${textMutedClass}`}>
            {query.trim().length > 0 ? "No matching items" : "Clipboard history is empty"}
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <div key={section.key} className="mb-2">
                <div className={`px-2 py-1 text-[10px] uppercase tracking-wide font-medium ${textMutedClass}`}>
                  {section.label}
                </div>

                {section.items.map(({ entry, index }) => {
                  const flatIndex = index;
                  const selected = flatIndex === selectedIndex;
                  const badgeText = firstCharBadge(entry.source_app_name);

                  return (
                    <button
                      key={entry.id}
                      data-entry-index={flatIndex}
                      onClick={() => setSelectedIndex(flatIndex)}
                      onDoubleClick={() => pasteEntry(entry.id)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border-none cursor-pointer transition-colors ${
                        selected ? "bg-(--accent)/20" : `bg-transparent ${hoverClass}`
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md shrink-0 overflow-hidden flex items-center justify-center ${theme === "light" ? "bg-black/10 text-black/65" : "bg-white/10 text-white/70"}`}>
                        <span className="max-w-full px-0.5 truncate text-[10px] font-semibold leading-none">
                          {badgeText}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className={`flex items-center gap-2 text-[11px] ${textMutedClass}`}>
                          <span className="truncate">{entry.source_app_name || "Unknown App"}</span>
                          <span>&middot;</span>
                          <span>{formatTime(entry.copied_at)}</span>
                          {copiedId === entry.id && (
                            <span className="text-(--accent)">Copied</span>
                          )}
                        </div>
                        <div className={`mt-0.5 text-[13px] leading-relaxed line-clamp-2 ${textPrimaryClass}`}>
                          {entry.text}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

            {isLoadingMore && (
              <div className={`px-2 py-2 text-[12px] ${textMutedClass}`}>Loading more...</div>
            )}
          </>
        )}
      </div>

      <div className={`shrink-0 flex items-center justify-between px-3 py-2 border-t text-[11px] ${theme === "light" ? "border-black/10" : "border-white/10"} ${textMutedClass}`}>
        <span>Enter paste</span>
        <span>Cmd+C recopy</span>
        <span>Esc close</span>
      </div>
    </div>
  );
}
