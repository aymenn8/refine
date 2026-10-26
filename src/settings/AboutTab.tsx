import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";

function AboutTab() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col items-center pt-10 pb-6">
        <img src="/recast-mark-white.png" alt="Recast" className="h-14 opacity-90" />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xl font-semibold text-white/80 tracking-wide">Recast</span>
        </div>
        <span className="text-[11px] text-white/25 font-mono mt-1">
          {appVersion ? `v${appVersion}` : ""}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center pb-6 pt-2 gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              openUrl("https://github.com/Drummerms/refine/issues");
            }}
            className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/50 bg-transparent border-none cursor-pointer transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Feedback
          </button>
        </div>
        <p className="text-[11px] text-white/20 text-center max-w-[260px]">
          AI text processing, locally or via cloud APIs.
        </p>
        <button
          onClick={() => {
            openUrl("https://github.com/aymenn8/refine");
          }}
          className="text-[10px] text-white/20 hover:text-white/40 bg-transparent border-none cursor-pointer transition-colors"
        >
          Based on Refine by aymenn8 · MIT License
        </button>
        <button
          onClick={async () => {
            await invoke("complete_onboarding").catch(() => {});
            const { load } = await import("@tauri-apps/plugin-store");
            const store = await load("settings.json");
            await store.set("onboardingCompleted", false);
            await store.save();
            window.location.href = "/onboarding";
          }}
          className="text-[10px] text-white/15 hover:text-white/30 bg-transparent border-none cursor-pointer transition-colors"
        >
          Replay onboarding
        </button>
      </div>
    </div>
  );
}

export default AboutTab;
