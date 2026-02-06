import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface HomeTabProps {
  onNavigate: (tab: string) => void;
}

interface ProcessingMode {
  id: string;
  is_default: boolean;
}

interface Stats {
  totalWords: number;
  thisWeek: number;
  quickActions: number;
  customModes: number;
}

function HomeTab({ onNavigate }: HomeTabProps) {
  const [stats, setStats] = useState<Stats>({
    totalWords: 0,
    thisWeek: 0,
    quickActions: 0,
    customModes: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Get persistent total words refined
      const totalWords = await invoke<number>("get_total_words_refined");

      // Get history total (refinements this week - history is 7 days)
      const history = await invoke<{ total: number }>("get_history", {
        offset: 0,
        limit: 1,
      });

      // Get modes - filter by is_default field
      const modes = await invoke<ProcessingMode[]>("get_modes");
      const customModes = modes.filter((m) => !m.is_default);

      // Get quick actions count
      const quickActions = await invoke<Array<{ mode_id: string }>>(
        "get_quick_actions"
      );

      setStats({
        totalWords,
        thisWeek: history.total,
        quickActions: quickActions.length,
        customModes: customModes.length,
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  };

  const features = [
    {
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      ),
      title: "Create a mode",
      description: "Build custom refinement modes for your workflow.",
      action: () => onNavigate("modes"),
      shortcut: null,
    },
    {
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
        </svg>
      ),
      title: "Set up quick actions",
      description:
        "Assign shortcuts to refine text instantly without opening Refine.",
      action: () => onNavigate("config"),
      shortcut: null,
    },
    {
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      title: "Configure AI model",
      description: "Download a local model or connect your API keys.",
      action: () => onNavigate("model"),
      shortcut: null,
    },
    {
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      title: "Customize settings",
      description: "Change the global shortcut and other preferences.",
      action: () => onNavigate("config"),
      shortcut: "⌘ ⇧ R",
    },
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <img src="/logo-white-no-bg.png" alt="Refine" className="h-7 opacity-80" />
        <span className="text-[15px] font-medium text-white/70 tracking-wide">refine</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-semibold text-white">
            {stats.totalWords.toLocaleString()}
          </div>
          <div className="text-xs text-white/50 mt-1">Words refined</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-white">
            {stats.thisWeek}
          </div>
          <div className="text-xs text-white/50 mt-1"> Refine this week</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-white">
            {stats.quickActions}
          </div>
          <div className="text-xs text-white/50 mt-1">Quick actions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-white">
            {stats.customModes}
          </div>
          <div className="text-xs text-white/50 mt-1">Custom modes</div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Get Started */}
      <div>
        <h3 className="text-sm font-medium text-white/70 mb-4">Get started</h3>
        <div className="space-y-1">
          {features.map((feature, index) => (
            <button
              key={index}
              onClick={feature.action}
              className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
            >
              <div className="text-white/50 group-hover:text-(--accent-hover) transition-colors">
                {feature.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white/90">
                  {feature.title}
                </div>
                <div className="text-xs text-white/50 truncate">
                  {feature.description}
                </div>
              </div>
              {feature.shortcut && (
                <div className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded">
                  {feature.shortcut}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HomeTab;
