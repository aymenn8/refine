import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { load } from "@tauri-apps/plugin-store";
import App from "./App";
import Settings from "./Settings";
import Toast from "./Toast";
import "./App.css";

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + Math.round(((255 - (num >> 16)) * percent) / 100));
  const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round(((255 - ((num >> 8) & 0x00ff)) * percent) / 100));
  const b = Math.min(255, (num & 0x0000ff) + Math.round(((255 - (num & 0x0000ff)) * percent) / 100));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

async function applyAccentColor() {
  try {
    const store = await load("settings.json");
    const accent = await store.get<string>("accentColor");
    if (accent) {
      document.documentElement.style.setProperty("--accent", accent);
      document.documentElement.style.setProperty("--accent-hover", lightenColor(accent, 15));
    }
  } catch {
    // Use CSS defaults
  }
}

applyAccentColor().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/toast" element={<Toast />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  );
});
