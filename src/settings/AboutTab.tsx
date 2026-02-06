import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLicense } from "../hooks/useLicense";
import { LICENSE_CONFIG } from "../config/license";

const LICENSE_TYPE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  lifetime: "Lifetime",
};

function AboutTab() {
  const { hasLicense, licenseType, loading, activate, deactivate } = useLicense();
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

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
    <div className="p-6 md:px-8 h-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        {/* Logo + name */}
        <img src="/logo-white-no-bg.png" alt="Refine" className="h-16 opacity-90" />
        <span className="text-2xl font-semibold text-white/80 tracking-wide">refine</span>

        {/* Badges */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/50 bg-white/10 px-2 py-0.5 rounded font-medium">
            BETA
          </span>
          {hasLicense && (
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-(--accent)/20 text-(--accent) border border-(--accent)/30">
              PRO
            </span>
          )}
        </div>

        <p className="text-white/40 text-sm text-center max-w-xs mt-2">
          Refine your text with AI, locally or via cloud APIs. Fast, private, and always at your fingertips.
        </p>

        {/* Divider */}
        <div className="w-full border-t border-white/10 mt-4" />

        {/* License section */}
        {loading ? (
          <div className="text-white/30 text-sm">Loading license...</div>
        ) : hasLicense ? (
          /* Active license */
          <div className="w-full space-y-3 mt-2">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
              <div>
                <div className="text-[13px] font-medium text-white/90">Refine PRO</div>
                <div className="text-[11px] text-white/40">
                  {LICENSE_TYPE_LABELS[licenseType || ""] || licenseType} license
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[11px] text-green-400">Active</span>
              </div>
            </div>

            {confirmDeactivate ? (
              <div className="flex gap-2">
                <button
                  onClick={handleDeactivate}
                  className="flex-1 py-2 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors"
                >
                  Confirm deactivation
                </button>
                <button
                  onClick={() => setConfirmDeactivate(false)}
                  className="flex-1 py-2 text-[12px] text-white/50 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeactivate(true)}
                className="w-full py-2 text-[12px] text-white/30 hover:text-white/50 bg-transparent border-none cursor-pointer transition-colors"
              >
                Deactivate license
              </button>
            )}
          </div>
        ) : (
          /* No license */
          <div className="w-full space-y-3 mt-2">
            {showKeyInput ? (
              <div className="space-y-2">
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
                  placeholder="Enter your license key..."
                  disabled={activating}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-[13px] outline-none focus:border-white/20 transition-colors placeholder:text-white/30 disabled:opacity-50"
                  autoFocus
                />

                {error && (
                  <p className="text-[12px] text-red-400 px-1">{error}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleActivate}
                    disabled={activating || !licenseKey.trim()}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activating ? "Activating..." : "Activate"}
                  </button>
                  <button
                    onClick={() => {
                      setShowKeyInput(false);
                      setError(null);
                    }}
                    className="px-4 py-2.5 rounded-xl text-[13px] text-white/50 bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => openUrl(LICENSE_CONFIG.purchaseUrl)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white"
                >
                  Get Refine PRO
                </button>
                <button
                  onClick={() => setShowKeyInput(true)}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium border border-white/10 cursor-pointer transition-all bg-white/5 hover:bg-white/10 text-white/70"
                >
                  I have a license key
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AboutTab;
