import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import "./App.css";

type Mode = "en-fr" | "fr-en" | "correct";

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "en-fr", label: "EN → FR", icon: "🇬🇧" },
  { id: "fr-en", label: "FR → EN", icon: "🇫🇷" },
  { id: "correct", label: "Corriger", icon: "✨" },
];

function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("correct");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Charger le mode par défaut depuis les settings
    const loadDefaultMode = async () => {
      try {
        const store = await load("settings.json");
        const defaultMode = await store.get<string>("defaultMode");
        if (defaultMode && (defaultMode === "en-fr" || defaultMode === "fr-en" || defaultMode === "correct")) {
          setMode(defaultMode);
        }
      } catch (error) {
        console.error("Failed to load default mode:", error);
      }
    };
    loadDefaultMode();

    // Écouter les événements de capture de texte
    const unlisten = listen<string>("text-captured", (event) => {
      setText(event.payload || "");

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 50);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleApply = async () => {
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    try {
      // TODO: Appeler l'API IA avec le mode sélectionné
      // Pour l'instant, on copie juste le texte tel quel
      const transformedText = text;

      console.log("Mode:", mode);
      console.log("Text:", text);

      await invoke("apply_replacement", { text: transformedText });
      setText("");
    } catch (error) {
      console.error("Failed to apply replacement:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      await invoke("hide_window");
      setText("");
    } catch (error) {
      console.error("Failed to hide window:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleApply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const getPlaceholder = () => {
    switch (mode) {
      case "en-fr":
        return "Entrez le texte anglais à traduire...";
      case "fr-en":
        return "Entrez le texte français à traduire...";
      case "correct":
        return "Entrez le texte à corriger...";
    }
  };

  return (
    <div className="h-screen w-screen bg-transparent flex items-center justify-center p-2">
      <div className="w-full max-w-[680px] bg-[rgba(30,30,30,0.95)] backdrop-blur-2xl backdrop-saturate-180 rounded-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col overflow-hidden animate-slide-in">
        <div className="p-5 flex flex-col gap-4">
          {/* Mode selector */}
          <div className="flex gap-1.5 p-1 bg-black/25 rounded-[10px] border border-white/6">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[7px] text-[13px] font-semibold cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] relative border-none ${
                  mode === m.id
                    ? "bg-linear-to-br from-[#0A84FF] to-[#0066CC] text-white shadow-[0_2px_8px_rgba(10,132,255,0.4),0_1px_3px_rgba(0,0,0,0.3)] -translate-y-px before:content-[''] before:absolute before:inset-0 before:rounded-[7px] before:p-px before:bg-linear-to-br before:from-white/20 before:to-transparent before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:mask-exclude"
                    : "bg-transparent text-white/55 hover:bg-white/6 hover:text-white/75 hover:-translate-y-px"
                }`}
                onClick={() => setMode(m.id)}
              >
                <span className="text-[15px] leading-none">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4 min-h-[200px]">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getPlaceholder()}
              disabled={isLoading}
              className="text-input w-full min-h-[140px] p-4 bg-black/20 border border-white/8 rounded-xl outline-none resize-y text-white/95 text-[15px] leading-relaxed select-text transition-all duration-200 placeholder:text-white/30 focus:bg-black/25 focus:border-[rgba(10,132,255,0.4)] focus:shadow-[0_0_0_3px_rgba(10,132,255,0.1),inset_0_1px_2px_rgba(0,0,0,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <div className="flex items-center justify-between px-4 py-3 bg-black/15 rounded-[10px] border border-white/5">
              <div className="flex items-center gap-2 text-white/45 text-xs font-medium">
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/8 border border-white/12 rounded-[5px] text-[11px] font-semibold text-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  Enter
                </kbd>
                <span>copier</span>
                <span className="text-white/25 font-light">·</span>
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/8 border border-white/12 rounded-[5px] text-[11px] font-semibold text-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  Esc
                </kbd>
                <span>fermer</span>
              </div>

              <button
                onClick={handleApply}
                disabled={isLoading || !text.trim()}
                className="flex items-center gap-1.5 px-[18px] py-[9px] bg-linear-to-br from-[#0A84FF] to-[#0066CC] border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_2px_8px_rgba(10,132,255,0.3),0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] relative before:content-[''] before:absolute before:inset-0 before:rounded-lg before:p-px before:bg-linear-to-br before:from-white/30 before:to-transparent before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:mask-exclude hover:bg-linear-to-br hover:from-[#1E90FF] hover:to-[#0077DD] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(10,132,255,0.4),0_2px_6px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:translate-y-0 active:shadow-[0_1px_4px_rgba(10,132,255,0.3),0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? (
                  <>
                    <svg className="w-[14px] h-[14px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>Traitement...</span>
                  </>
                ) : (
                  <span>Copier</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
