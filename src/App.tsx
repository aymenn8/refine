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
    <div className="h-screen w-screen bg-transparent flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col animate-slide-in">
        <div className="p-5 flex flex-col gap-4 flex-1">
          {/* Mode selector */}
          <div className="flex gap-1.5 p-1 bg-white/5 rounded-[10px] border border-white/10">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-150 border-none ${
                  mode === m.id
                    ? "bg-[#0A84FF] text-white"
                    : "bg-transparent text-white/60 hover:bg-white/10 hover:text-white/80"
                }`}
                onClick={() => setMode(m.id)}
              >
                <span className="text-base leading-none">{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getPlaceholder()}
              disabled={isLoading}
              className="text-input w-full min-h-[140px] flex-1 p-4 bg-white/5 border border-white/10 rounded-xl outline-none resize-none text-white text-[15px] leading-relaxed select-text transition-all duration-200 placeholder:text-white/40 focus:bg-white/8 focus:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-[10px] border border-white/10">
              <div className="flex items-center gap-2 text-white/50 text-xs font-medium">
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
                  Enter
                </kbd>
                <span>copier</span>
                <span className="text-white/30">·</span>
                <kbd className="inline-flex items-center justify-center min-w-6 px-[7px] py-1 bg-white/10 border border-white/15 rounded-[5px] text-[11px] font-semibold text-white/70">
                  Esc
                </kbd>
                <span>fermer</span>
              </div>

              <button
                onClick={handleApply}
                disabled={isLoading || !text.trim()}
                className="flex items-center gap-1.5 px-[18px] py-[9px] bg-[#0A84FF] border-none rounded-lg text-white text-[13px] font-semibold cursor-pointer transition-all duration-200 hover:bg-[#1E90FF] active:bg-[#0066CC] disabled:opacity-40 disabled:cursor-not-allowed"
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
