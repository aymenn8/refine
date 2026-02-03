import { useState } from "react";
import "./Settings.css";

import HomeTab from "./settings/HomeTab";
import ModesTab from "./settings/ModesTab";
import ConfigTab from "./settings/ConfigTab";
import HistoryTab from "./settings/HistoryTab";
import AboutTab from "./settings/AboutTab";

type TabId = "home" | "modes" | "config" | "history" | "about";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

// SF Symbols style icons
const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  modes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  config: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  about: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const TABS: Tab[] = [
  { id: "home", label: "Home", icon: Icons.home },
  { id: "modes", label: "Modes", icon: Icons.modes },
  { id: "config", label: "Configuration", icon: Icons.config },
  { id: "history", label: "History", icon: Icons.history },
  { id: "about", label: "About", icon: Icons.about },
];

function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <HomeTab />;
      case "modes":
        return <ModesTab />;
      case "config":
        return <ConfigTab />;
      case "history":
        return <HistoryTab />;
      case "about":
        return <AboutTab />;
    }
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-white font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Helvetica_Neue',sans-serif]">
      {/* Sidebar */}
      <aside className="w-[220px] bg-black/25 border-r border-white/8 flex flex-col pb-3">
        <nav className="mt-3 flex-1 flex flex-col gap-0.5 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 border-none rounded-[10px] text-[13px] text-left cursor-pointer transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-white/12 text-white"
                  : "bg-transparent text-white/65 hover:bg-white/8 hover:text-white/90"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={`flex items-center justify-center w-5 h-5 transition-colors duration-150 ${
                activeTab === tab.id ? "text-[#ff9f0a]" : ""
              }`}>
                {tab.icon}
              </span>
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/6 mt-auto">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[13px] text-white/90">Refine</span>
            <span className="text-[11px] text-white/35 bg-white/8 px-2 py-0.5 rounded-md">
              v0.1.0
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="settings-main flex-1 overflow-y-auto bg-[#252525]">
        {renderContent()}
      </main>
    </div>
  );
}

export default Settings;
