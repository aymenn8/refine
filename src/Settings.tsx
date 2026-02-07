import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLicense } from "./hooks/useLicense";
import { useUpdater } from "./hooks/useUpdater";
import "./Settings.css";

import HomeTab from "./settings/HomeTab";
import ModesTab from "./settings/ModesTab";
import FlowsTab from "./settings/FlowsTab";
import ConfigTab from "./settings/ConfigTab";
import QuickActionsTab from "./settings/QuickActionsTab";
import HistoryTab from "./settings/HistoryTab";
import AboutTab from "./settings/AboutTab";
import ModelsLibraryTab from "./settings/ModelsLibraryTab";

type TabId = "home" | "modes" | "flows" | "quickactions" | "config" | "model" | "history" | "about";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  pro?: boolean;
}

// SF Symbols style icons
const Icons = {
  home: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  modes: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  flows: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
  quickactions: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  ),
  config: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  history: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  about: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  model: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

const TABS: Tab[] = [
  { id: "home", label: "Home", icon: Icons.home },
  { id: "modes", label: "Modes", icon: Icons.modes, pro: true },
  { id: "flows", label: "Flows", icon: Icons.flows, pro: true },
  { id: "quickactions", label: "Quick Actions", icon: Icons.quickactions },
  { id: "config", label: "Configuration", icon: Icons.config },
  { id: "model", label: "Models Library", icon: Icons.model, pro: true },
  { id: "history", label: "History", icon: Icons.history },
];

function Settings() {
  const license = useLicense();
  const updater = useUpdater();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [hoveredButton, setHoveredButton] = useState<'close' | 'minimize' | null>(null);

  // First-launch: redirect to onboarding if not completed
  useEffect(() => {
    invoke<boolean>("check_onboarding_completed").then((completed) => {
      if (!completed) {
        window.location.href = "/onboarding";
      }
    }).catch(() => {});
  }, []);

  // Listen for tray menu navigation events
  useEffect(() => {
    const unlisten1 = listen<string>("navigate-tab", (event) => {
      setActiveTab(event.payload as TabId);
    });
    const unlisten2 = listen("check-update", () => {
      setActiveTab("about");
      updater.checkForUpdate();
    });
    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, [updater]);

  const handleClose = async () => {
    try {
      await invoke("hide_settings_window");
    } catch (error) {
      console.error("Failed to close settings:", error);
    }
  };

  const handleMinimize = async () => {
    try {
      await invoke("minimize_settings_window");
    } catch (error) {
      console.error("Failed to minimize settings:", error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <HomeTab onNavigate={(tab) => setActiveTab(tab as TabId)} />;
      case "modes":
        return <ModesTab />;
      case "flows":
        return <FlowsTab />;
      case "quickactions":
        return <QuickActionsTab />;
      case "config":
        return <ConfigTab />;
      case "model":
        return <ModelsLibraryTab />;
      case "history":
        return <HistoryTab />;
      case "about":
        return <AboutTab updater={updater} license={license} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-transparent text-white font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Helvetica_Neue',sans-serif]">
      {/* Title bar - draggable */}
      <div className="h-12 flex items-center px-4 border-b border-white/10 shrink-0 relative">
        {/* Buttons - Not draggable */}
        <div className="flex items-center gap-2 z-10">
          <button
            onClick={handleClose}
            onMouseEnter={() => setHoveredButton('close')}
            onMouseLeave={() => setHoveredButton(null)}
            className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff4136] transition-colors border-none flex items-center justify-center relative"
            title="Fermer"
          >
            {hoveredButton !== null && (
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="absolute">
                <path d="M1 1L5 5M5 1L1 5" stroke="#4a0000" strokeWidth="1" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            onClick={handleMinimize}
            onMouseEnter={() => setHoveredButton('minimize')}
            onMouseLeave={() => setHoveredButton(null)}
            className="w-3 h-3 rounded-full bg-[#f5bf4f] hover:bg-[#f5a623] transition-colors border-none flex items-center justify-center relative"
            title="Réduire"
          >
            {hoveredButton !== null && (
              <svg width="6" height="1" viewBox="0 0 6 1" fill="none" className="absolute">
                <rect width="6" height="1" fill="#704800" />
              </svg>
            )}
          </button>
        </div>

        {/* Drag region - Covers the rest of the title bar */}
        <div
          className="absolute inset-0 flex items-center justify-center z-0"
          data-tauri-drag-region
        >
          <span className="text-sm font-medium text-white/70 pointer-events-none">
            Refine Settings
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[200px] border-r border-white/10 flex flex-col py-3">
          <div className="px-3 mb-2">
            <span className="text-[10px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded font-medium">
              BETA
            </span>
          </div>
          <nav className="flex-1 flex flex-col gap-0.5 px-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`flex items-center gap-3 px-3 py-2 border-none rounded-lg text-[13px] text-left cursor-pointer transition-all duration-150 ${
                  activeTab === tab.id
                    ? "bg-white/15 text-white"
                    : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 transition-colors duration-150 ${
                    activeTab === tab.id ? "text-(--accent)" : ""
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="font-medium">{tab.label}</span>
                {tab.pro && !license.hasLicense && (
                  <span className="text-[8px] font-bold tracking-wider px-1 py-0.5 rounded bg-(--accent)/20 text-(--accent) ml-auto">PRO</span>
                )}
              </button>
            ))}
          </nav>

          <div className="px-3 py-3 mt-auto space-y-2">
            {updater.available && (
              <button
                onClick={() => {
                  if (updater.ready) {
                    updater.installAndRelaunch();
                  } else if (!updater.downloading) {
                    updater.downloadAndInstall();
                  }
                }}
                disabled={updater.downloading}
                className="flex items-center gap-2 px-3 py-2 bg-(--accent)/10 hover:bg-(--accent)/20 border border-(--accent)/20 rounded-lg cursor-pointer transition-all w-full disabled:cursor-wait"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent) shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[11px] text-(--accent) font-medium truncate">
                    {updater.ready
                      ? "Restart to update"
                      : updater.downloading
                      ? `Downloading... ${updater.progress}%`
                      : `v${updater.version} available`}
                  </span>
                </div>
              </button>
            )}
            <button
              onClick={() => setActiveTab("about")}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all w-full"
            >
              <img src="/logo-white-no-bg.png" alt="Refine" className="h-4 opacity-70" />
              <span className="text-[12px] font-medium text-white/50">refine</span>
              {license.hasLicense && (
                <span className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-(--accent)/20 text-(--accent)">
                  PRO
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="settings-main flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* Update modal — shows aggressively when update is available and not dismissed */}
      {updater.available && !updater.dismissed && !updater.ready && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-[420px] w-full mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-(--accent)/15 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-white">
                  Refine v{updater.version} is available
                </h3>
                <p className="text-[11px] text-white/40">
                  A new version is ready to install
                </p>
              </div>
            </div>

            {/* Patch notes */}
            {updater.body && (
              <div className="bg-white/5 rounded-xl p-4 mb-4 max-h-[200px] overflow-y-auto">
                <h4 className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">
                  What's new
                </h4>
                <div className="text-[12px] text-white/60 leading-relaxed whitespace-pre-wrap">
                  {updater.body}
                </div>
              </div>
            )}

            {/* Progress bar when downloading */}
            {updater.downloading && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-white/40">Downloading update...</span>
                  <span className="text-[11px] text-(--accent) font-medium">{updater.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-(--accent) rounded-full transition-all duration-300"
                    style={{ width: `${updater.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => updater.downloadAndInstall()}
                disabled={updater.downloading}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white disabled:opacity-60 disabled:cursor-wait"
              >
                {updater.downloading ? "Downloading..." : "Update now"}
              </button>
              {!updater.downloading && (
                <button
                  onClick={() => updater.dismiss()}
                  className="px-4 py-2.5 rounded-xl text-[12px] text-white/30 bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 hover:text-white/50 transition-colors"
                >
                  Later
                </button>
              )}
            </div>

            <p className="text-[10px] text-white/20 text-center mt-3">
              We strongly recommend updating for the latest fixes and features.
            </p>
          </div>
        </div>
      )}

      {/* Restart modal — after download is complete */}
      {updater.ready && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-(--accent)/30 rounded-2xl p-6 max-w-[380px] w-full mx-4 shadow-2xl">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-(--accent)/15 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h3 className="text-[16px] font-semibold text-white">Update ready!</h3>
              <p className="text-[12px] text-white/40">
                Refine v{updater.version} has been downloaded. Restart to apply the update.
              </p>
              <button
                onClick={() => updater.installAndRelaunch()}
                className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white"
              >
                Restart now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
