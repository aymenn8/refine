import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface HistoryEntry {
  id: string;
  input: string;
  output: string;
  mode_id: string;
  mode_name: string;
  created_at: number;
}

interface HistoryPage {
  entries: HistoryEntry[];
  total: number;
  has_more: boolean;
}

const PAGE_SIZE = 30;

function HistoryTab() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [historyData, enabled] = await Promise.all([
        invoke<HistoryPage>("get_history", { offset: 0, limit: PAGE_SIZE }),
        invoke<boolean>("get_history_enabled"),
      ]);
      setEntries(historyData.entries);
      setHasMore(historyData.has_more);
      setTotal(historyData.total);
      setHistoryEnabled(enabled);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const historyData = await invoke<HistoryPage>("get_history", {
        offset: entries.length,
        limit: PAGE_SIZE,
      });
      setEntries((prev) => [...prev, ...historyData.entries]);
      setHasMore(historyData.has_more);
      setTotal(historyData.total);
    } catch (error) {
      console.error("Failed to load more history:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleEnabled = async () => {
    const newValue = !historyEnabled;
    try {
      await invoke("set_history_enabled", { enabled: newValue });
      setHistoryEnabled(newValue);
    } catch (error) {
      console.error("Failed to toggle history:", error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await invoke("clear_history");
      setEntries([]);
      setHasMore(false);
      setTotal(0);
      setShowClearModal(false);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const handleCopy = async (entry: HistoryEntry) => {
    try {
      await writeText(entry.output);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  // Group entries by date
  const groupedEntries = entries.reduce(
    (acc, entry) => {
      const dateKey = formatDate(entry.created_at);
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(entry);
      return acc;
    },
    {} as Record<string, HistoryEntry[]>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-white/60">
          <svg
            className="w-5 h-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-sm">Loading history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:px-8 h-full overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-1">
          History
        </h1>
        <p className="text-[13px] text-white/40 m-0">
          Browse your past text processing results. Copy any previous output to reuse it.
        </p>
      </div>

      {/* Toggle Section */}
      <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-white/60"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[15px] font-medium text-white">
              Save history
            </span>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors border-none cursor-pointer ${
              historyEnabled ? "bg-(--accent)" : "bg-white/20"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                historyEnabled ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-white/40 ml-8">
          History is stored locally on your device and never sent anywhere.
        </p>
      </div>

      {/* History Entries */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-white/40">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="mb-4 opacity-50"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-sm">No history yet</p>
          <p className="text-xs mt-1">
            Your processing history will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([date, dateEntries]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
                {date}
              </h3>
              <div className="space-y-2">
                {dateEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 bg-white/5 border border-white/10 rounded-xl"
                  >
                    {/* Mode + Output */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-(--accent) bg-(--accent)/20 px-2 py-0.5 rounded">
                            {entry.mode_name}
                          </span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-white/30"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                        <p className="text-[14px] text-white leading-relaxed">
                          {truncate(entry.output, 150)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopy(entry)}
                        className={`p-2 rounded-lg border transition-all cursor-pointer shrink-0 ${
                          copiedId === entry.id
                            ? "bg-green-500/20 border-green-500/30 text-green-400"
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                        title="Copy output"
                      >
                        {copiedId === entry.id ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Original input */}
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-xs text-white/40">
                        {truncate(entry.input, 100)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 hover:text-white text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loadingMore ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Loading...
              </>
            ) : (
              <>
                Load more
                <span className="text-white/40 text-xs">
                  ({entries.length} / {total})
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Clear History Button */}
      {entries.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <button
            onClick={() => setShowClearModal(true)}
            className="px-4 py-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-lg text-white/60 hover:text-red-400 text-sm font-medium cursor-pointer transition-all"
          >
            Clear all history
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-[320px] shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-white">
                  Clear history?
                </h3>
                <p className="text-xs text-white/50">This cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-white/60 mb-6">
              All your processing history will be permanently deleted.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/15 border-none rounded-lg text-white text-sm font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 border-none rounded-lg text-white text-sm font-medium cursor-pointer transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HistoryTab;
