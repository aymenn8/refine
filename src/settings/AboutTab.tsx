import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LICENSE_CONFIG } from "../config/license";
import { getVersion } from "@tauri-apps/api/app";

const LICENSE_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  yearly: "Annual",
  lifetime: "Lifetime",
};

interface AboutTabProps {
  updater: {
    checking: boolean;
    available: boolean;
    version: string | null;
    checkForUpdate: () => Promise<void>;
    downloadAndInstall: () => Promise<void>;
    downloading: boolean;
    progress: number;
    ready: boolean;
  };
  license: {
    hasLicense: boolean;
    licenseType: string | null;
    loading: boolean;
    activate: (key: string) => Promise<unknown>;
    deactivate: () => Promise<void>;
  };
}

function AboutTab({ updater, license }: AboutTabProps) {
  const { hasLicense, licenseType, loading, activate, deactivate } = license;
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  useState(() => {
    getVersion().then(setAppVersion);
  });

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    setActivating(true);
    setError(null);
    try {
      await activate(licenseKey.trim());
      setLicenseKey("");
      setShowKeyInput(false);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivate();
      setConfirmDeactivate(false);
    } catch (e) {
      console.error("Failed to deactivate:", e);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top: Logo + identity */}
      <div className="flex flex-col items-center pt-10 pb-6">
        <img src="/logo-white-no-bg.png" alt="Refine" className="h-14 opacity-90" />
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xl font-semibold text-white/80 tracking-wide">refine</span>
          {hasLicense && (
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-(--accent)/20 text-(--accent) border border-(--accent)/30">
              PRO
            </span>
          )}
        </div>
        <span className="text-[11px] text-white/25 font-mono mt-1">
          {appVersion ? `v${appVersion}` : ""}
          {" "}
          <span className="text-white/15">BETA</span>
        </span>
      </div>

      {/* Middle: License + Update */}
      <div className="flex-1 flex flex-col items-center px-8">
        <div className="w-full max-w-xs space-y-3">
          {/* License card */}
          {!loading && (
            hasLicense ? (
              <div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-white/90">Refine PRO</div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {LICENSE_TYPE_LABELS[licenseType || ""] || licenseType} license
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] text-green-400/80">Active</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5">
                  {confirmDeactivate ? (
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeactivate}
                        className="flex-1 py-1.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeactivate(false)}
                        className="flex-1 py-1.5 text-[11px] text-white/40 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeactivate(true)}
                      className="text-[11px] text-white/25 hover:text-white/40 bg-transparent border-none cursor-pointer transition-colors p-0"
                    >
                      Deactivate license
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
                {showKeyInput ? (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={(e) => {
                        setLicenseKey(e.target.value);
                        if (error) setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleActivate();
                        if (e.key === "Escape") {
                          setShowKeyInput(false);
                          setError(null);
                        }
                      }}
                      placeholder="Paste your license key..."
                      disabled={activating}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-[12px] outline-none focus:border-white/20 transition-colors placeholder:text-white/25 disabled:opacity-50"
                      autoFocus
                    />
                    {error && (
                      <p className="text-[11px] text-red-400 px-0.5">{error}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleActivate}
                        disabled={activating || !licenseKey.trim()}
                        className="flex-1 py-2 rounded-lg text-[12px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {activating ? "Activating..." : "Activate"}
                      </button>
                      <button
                        onClick={() => { setShowKeyInput(false); setError(null); }}
                        className="px-3 py-2 rounded-lg text-[12px] text-white/40 bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="text-[12px] text-white/50">Upgrade to unlock all features</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openUrl(LICENSE_CONFIG.purchaseUrl)}
                        className="flex-1 py-2 rounded-lg text-[12px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white"
                      >
                        Get PRO
                      </button>
                      <button
                        onClick={() => setShowKeyInput(true)}
                        className="flex-1 py-2 rounded-lg text-[12px] font-medium border border-white/10 cursor-pointer transition-all bg-white/5 hover:bg-white/10 text-white/60"
                      >
                        Enter key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* Update */}
          <button
            onClick={() => updater.checkForUpdate()}
            disabled={updater.checking}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all disabled:cursor-wait ${
              updater.available
                ? "bg-(--accent)/10 border-(--accent)/20 hover:bg-(--accent)/15"
                : "bg-white/5 border-white/10 hover:bg-white/8"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={updater.available ? "text-(--accent)" : "text-white/40"}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className={`text-[12px] font-medium ${updater.available ? "text-(--accent)" : "text-white/50"}`}>
                {updater.checking
                  ? "Checking for updates..."
                  : updater.available
                  ? `Update to v${updater.version}`
                  : "Check for updates"}
              </span>
            </div>
            {!updater.checking && !updater.available && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Bottom: subtle footer */}
      <div className="flex flex-col items-center pb-6 pt-2 gap-1">
        <p className="text-[11px] text-white/20 text-center max-w-[260px]">
          AI text processing, locally or via cloud APIs.
        </p>
      </div>
    </div>
  );
}

export default AboutTab;
