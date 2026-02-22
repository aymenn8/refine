import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./Onboarding.css";

interface DownloadProgress {
  model_id: string;
  downloaded_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_mbps: number;
}

const MODELS = [
  {
    id: "qwen3-4b-q4",
    name: "Qwen3 4B",
    size: "2.7 GB",
    description: "Fast and accurate. Great quality/performance ratio.",
    recommended: true,
  },
  {
    id: "gemma3-4b-q4",
    name: "Gemma 3 4B",
    size: "2.49 GB",
    description: "Google's model. Multilingual support for 140+ languages.",
    recommended: false,
  },
];

function Onboarding() {
  const [step, setStep] = useState(0);
  const [selectedModel, setSelectedModel] = useState("qwen3-4b-q4");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState("");
  const [downloadedModels, setDownloadedModels] = useState<Set<string>>(new Set());

  // Route protection: redirect if onboarding already completed
  useEffect(() => {
    invoke<boolean>("check_onboarding_completed").then((done) => {
      if (done) window.location.href = "/settings";
    });
  }, []);

  // Check which models are already downloaded
  useEffect(() => {
    Promise.all(
      MODELS.map(async (m) => {
        const [status] = await invoke<[string, number]>("check_model_status", { modelId: m.id });
        return { id: m.id, downloaded: status === "downloaded" };
      })
    ).then((results) => {
      const downloaded = new Set(results.filter((r) => r.downloaded).map((r) => r.id));
      setDownloadedModels(downloaded);
    });
  }, []);

  useEffect(() => {
    if (!downloading) return;
    const unlisten = listen<DownloadProgress>(
      `model-download-progress-${selectedModel}`,
      (event) => {
        const p = event.payload;
        setProgress(p.percentage);
        setDownloadSpeed(p.speed_mbps);
        setDownloadedBytes(p.downloaded_bytes);
        setTotalBytes(p.total_bytes);
      }
    );
    return () => { unlisten.then((f) => f()); };
  }, [downloading, selectedModel]);

  const handleDownload = async () => {
    // If already downloaded, just set active and advance
    if (downloadedModels.has(selectedModel)) {
      await invoke("set_active_model", { modelId: selectedModel });
      setStep(3);
      return;
    }
    setDownloading(true);
    setProgress(0);
    setError("");
    try {
      await invoke("download_model", { modelId: selectedModel });
      setDownloading(false);
      await invoke("set_active_model", { modelId: selectedModel });
      setStep(3);
    } catch (e) {
      setDownloading(false);
      setProgress(0);
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const handleComplete = async () => {
    await invoke("complete_onboarding");
    window.location.href = "/settings";
  };

  useEffect(() => {
    const unlisten = listen("spotlight-shortcut-pressed", async () => {
      if (step !== 3) return;
      await invoke("complete_onboarding");
      await invoke("hide_settings_window");
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [step]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <div className="auto-light-contrast h-screen flex flex-col bg-transparent select-none">
      {/* Title bar */}
      <div className="h-12 shrink-0" data-tauri-drag-region />

      {/* Step content — centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-10 overflow-hidden">
        <div key={step} className="onboarding-step w-full flex flex-col items-center">
          {step === 0 && <StepWelcome />}
          {step === 1 && <StepFeatures />}
          {step === 2 && (
            <StepModel
              models={MODELS}
              selectedModel={selectedModel}
              onSelectModel={(id) => !downloading && setSelectedModel(id)}
              downloading={downloading}
              progress={progress}
              downloadSpeed={downloadSpeed}
              downloadedBytes={downloadedBytes}
              totalBytes={totalBytes}
              error={error}
              formatBytes={formatBytes}
              downloadedModels={downloadedModels}
            />
          )}
          {step === 3 && <StepReady />}
        </div>
      </div>

      {/* Footer — buttons + dots */}
      <div className="shrink-0 flex flex-col items-center gap-5 pb-8 pt-2">
        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {step === 0 && (
            <button onClick={() => setStep(1)} className="onb-btn-primary">
              Get Started
            </button>
          )}

          {step === 1 && (
            <>
              <button onClick={() => setStep(0)} className="onb-btn-ghost">Back</button>
              <button onClick={() => setStep(2)} className="onb-btn-primary">Continue</button>
            </>
          )}

          {step === 2 && !downloading && (
            <>
              <button onClick={() => setStep(1)} className="onb-btn-ghost">Back</button>
              <button onClick={handleDownload} className="onb-btn-primary">
                {downloadedModels.has(selectedModel) ? "Continue" : "Download & Continue"}
              </button>
            </>
          )}
          {step === 2 && downloading && (
            <span className="text-[12px] text-white/30">Downloading model...</span>
          )}

          {step === 3 && (
            <button onClick={handleComplete} className="onb-btn-primary">Open Refine</button>
          )}
        </div>

        {/* Skip link (model step only) */}
        {step === 2 && !downloading && (
          <button
            onClick={() => setStep(3)}
            className="text-[11px] text-white/20 hover:text-white/40 bg-transparent border-none cursor-pointer transition-colors -mt-2"
          >
            Skip — I'll set up a model later
          </button>
        )}

        {/* Dots */}
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "bg-(--accent) w-4" : i < step ? "bg-(--accent)/50 w-1.5" : "bg-white/20 w-1.5"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Step 1: Welcome ---- */
function StepWelcome() {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <img src="/logo-white-no-bg.png" alt="Refine" className="h-20 opacity-90" />
      <h1 className="text-2xl font-semibold text-white/90 tracking-wide m-0">
        Welcome to refine
      </h1>
      <p className="text-[14px] text-white/40 max-w-[300px] leading-relaxed m-0">
        AI-powered text refinement for macOS.
        <br />
        Private, fast, and always at your fingertips.
      </p>
    </div>
  );
}

/* ---- Step 2: Features ---- */
function StepFeatures() {
  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
      title: "Spotlight",
      desc: "Select text anywhere, press Cmd+Shift+R — Refine appears instantly.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" />
          <path d="M17.8 11.8L19 13" /><path d="M15 9h.01" />
          <path d="M17.8 6.2L19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2L11 5" />
        </svg>
      ),
      title: "Modes",
      desc: "PROMPT IT, CORRECT, ASK, TO ENGLISH — or create your own custom modes.",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
      title: "Quick Actions",
      desc: "Assign global shortcuts to process text without even opening Refine.",
    },
  ];

  return (
    <div className="flex flex-col items-center w-full max-w-md gap-4">
      <div className="text-center mb-1">
        <h2 className="text-xl font-semibold text-white/90 m-0">How it works</h2>
        <p className="text-[13px] text-white/35 mt-1 m-0">Everything you need to refine text</p>
      </div>
      <div className="w-full space-y-2.5">
        {features.map((f) => (
          <div key={f.title} className="flex items-start gap-4 p-3.5 bg-white/5 border border-white/10 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-(--accent)/15 flex items-center justify-center shrink-0 text-(--accent)">
              {f.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white/90">{f.title}</div>
              <div className="text-[12px] text-white/40 mt-0.5 leading-relaxed">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Step 3: Model Selection ---- */
function StepModel({
  models, selectedModel, onSelectModel,
  downloading, progress, downloadSpeed, downloadedBytes, totalBytes,
  error, formatBytes, downloadedModels,
}: {
  models: typeof MODELS;
  selectedModel: string;
  onSelectModel: (id: string) => void;
  downloading: boolean;
  progress: number;
  downloadSpeed: number;
  downloadedBytes: number;
  totalBytes: number;
  error: string;
  formatBytes: (b: number) => string;
  downloadedModels: Set<string>;
}) {
  return (
    <div className="flex flex-col items-center w-full max-w-md gap-4">
      <div className="text-center mb-1">
        <h2 className="text-xl font-semibold text-white/90 m-0">Choose your model</h2>
        <p className="text-[13px] text-white/35 mt-1 m-0">Download a local model for private, offline processing</p>
      </div>

      <div className="w-full flex gap-3">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelectModel(model.id)}
            disabled={downloading}
            className={`flex-1 p-3.5 rounded-xl border text-left cursor-pointer transition-all disabled:cursor-default ${
              selectedModel === model.id
                ? "bg-(--accent)/10 border-(--accent)/40"
                : "bg-white/5 border-white/10 hover:bg-white/8"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-semibold text-white/90">{model.name}</span>
              {model.recommended && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-(--accent)/20 text-(--accent)">REC</span>
              )}
              {downloadedModels.has(model.id) && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">DOWNLOADED</span>
              )}
            </div>
            <div className="text-[11px] text-white/30 mb-1">{model.size}</div>
            <div className="text-[11px] text-white/40 leading-relaxed">{model.description}</div>
          </button>
        ))}
      </div>

      {/* Progress bar (when downloading) */}
      {downloading && (
        <div className="w-full space-y-2">
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-(--accent) rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/40">
            <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
            <span>{progress.toFixed(0)}%{downloadSpeed > 0 ? ` — ${downloadSpeed.toFixed(1)} MB/s` : ""}</span>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400 text-center m-0">{error}</p>}
    </div>
  );
}

/* ---- Step 4: Ready ---- */
function StepReady() {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-(--accent)/15 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white/90 m-0">You're all set!</h2>
      <p className="text-[13px] text-white/40 leading-relaxed max-w-[280px] m-0">
        Select text anywhere and press the shortcut to start refining.
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        {["⌘", "⇧", "R"].map((key) => (
          <span key={key} className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 border border-white/15 text-[15px] font-medium text-white/70">
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

export default Onboarding;
