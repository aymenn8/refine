import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Settings.css";

import HomeTab from "./settings/HomeTab";
import ModesTab from "./settings/ModesTab";
import ConfigTab from "./settings/ConfigTab";
import HistoryTab from "./settings/HistoryTab";
import AboutTab from "./settings/AboutTab";
import ModelsLibraryTab from "./settings/ModelsLibraryTab";

type TabId = "home" | "modes" | "config" | "model" | "history" | "about";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
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
  { id: "modes", label: "Modes", icon: Icons.modes },
  { id: "config", label: "Configuration", icon: Icons.config },
  { id: "model", label: "Models Library", icon: Icons.model },
  { id: "history", label: "History", icon: Icons.history },
];

function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [hoveredButton, setHoveredButton] = useState<'close' | 'minimize' | null>(null);

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
      case "config":
        return <ConfigTab />;
      case "model":
        return <ModelsLibraryTab />;
      case "history":
        return <HistoryTab />;
      case "about":
        return <AboutTab />;
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
              </button>
            ))}
          </nav>

          <div className="px-3 py-3 mt-auto">
            <button
              onClick={() => setActiveTab("about")}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all w-full"
            >
              <span className="text-[15px] text-white/70 tracking-wide">
                refine
              </span>
              <span className="text-[10px] text-white/50 bg-white/10 px-1.5 py-0.5 rounded font-medium">
                BETA
              </span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="settings-main flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default Settings;
