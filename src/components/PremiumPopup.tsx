import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LICENSE_CONFIG } from "../config/license";

interface PremiumPopupProps {
  feature: string;
  onClose: () => void;
  onOpenLicense?: () => void;
}

const FEATURE_LABELS: Record<string, { title: string; description: string }> = {
  CustomModes: {
    title: "Custom Modes",
    description: "Create your own processing modes with custom prompts.",
  },
  ApiKeys: {
    title: "Cloud API Keys",
    description: "Connect OpenAI, Anthropic, and other cloud AI providers.",
  },
  Ollama: {
    title: "Ollama Integration",
    description: "Use Ollama for local AI inference with more model options.",
  },
  Flows: {
    title: "Flows",
    description:
      "Chain multiple modes together for advanced text processing pipelines.",
  },
  ExtraQuickActions: {
    title: "More Quick Actions",
    description:
      "Free users can create 1 quick action. Upgrade to PRO for unlimited.",
  },
};

export function PremiumPopup({
  feature,
  onClose,
  onOpenLicense,
}: PremiumPopupProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const info = FEATURE_LABELS[feature] || {
    title: feature,
    description: "This feature requires Refine PRO.",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#1c1c1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* PRO badge */}
        <div className="flex items-center justify-center mb-4">
          <span className="text-[11px] font-bold tracking-wider px-3 py-1 rounded-full bg-(--accent)/20 text-(--accent) border border-(--accent)/30">
            PRO
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-white text-center mb-1">
          {info.title}
        </h3>
        <p className="text-sm text-white/50 text-center mb-6">
          {info.description}
        </p>

        {/* Upgrade message */}
        <p className="text-[13px] text-white/60 text-center mb-5">
          Upgrade to{" "}
          <span className="text-(--accent) font-medium">Refine PRO</span> to
          unlock this feature.
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => openUrl(LICENSE_CONFIG.purchaseUrl)}
            onMouseEnter={() => setHoveredButton("buy")}
            onMouseLeave={() => setHoveredButton(null)}
            className="w-full py-2.5 rounded-xl text-[13px] font-medium border-none cursor-pointer transition-all bg-(--accent) hover:bg-(--accent-hover) text-white"
          >
            Get Refine PRO
          </button>

          {onOpenLicense && (
            <button
              onClick={() => {
                onClose();
                onOpenLicense();
              }}
              onMouseEnter={() => setHoveredButton("key")}
              onMouseLeave={() => setHoveredButton(null)}
              className={`w-full py-2.5 rounded-xl text-[13px] font-medium border border-white/10 cursor-pointer transition-all ${
                hoveredButton === "key"
                  ? "bg-white/10 text-white"
                  : "bg-white/5 text-white/70"
              }`}
            >
              I have a license key
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-[12px] text-white/40 hover:text-white/60 bg-transparent border-none cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
