import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import "@melloware/coloris/dist/coloris.css";
import Coloris from "@melloware/coloris";
import { playNotificationSound } from "../utils/sound";

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(
    255,
    (num >> 16) + Math.round(((255 - (num >> 16)) * percent) / 100)
  );
  const g = Math.min(
    255,
    ((num >> 8) & 0x00ff) +
      Math.round(((255 - ((num >> 8) & 0x00ff)) * percent) / 100)
  );
  const b = Math.min(
    255,
    (num & 0x0000ff) + Math.round(((255 - (num & 0x0000ff)) * percent) / 100)
  );
  return `#${((1 << 24) | (r << 16) | (g << 8) | b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

function ConfigTab() {
  const [globalShortcut, setGlobalShortcut] = useState(
    "CommandOrControl+Shift+R"
  );
  const [historyShortcut, setHistoryShortcut] = useState(
    "CommandOrControl+Shift+V"
  );
  const [loading, setLoading] = useState(true);

  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());

  // Sound
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [soundType, setSoundType] = useState("Glass");

  // Accent color
  const [accentColor, setAccentColor] = useState("#F0B67F");
  const [customColor, setCustomColor] = useState<string | null>(null);
  const colorisInitialized = useRef(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const applyAccent = useCallback(
    async (hex: string, saveCustom?: string | null) => {
      setAccentColor(hex);
      document.documentElement.style.setProperty("--accent", hex);
      document.documentElement.style.setProperty(
        "--accent-hover",
        lightenColor(hex, 15)
      );
      try {
        const store = await load("settings.json");
        await store.set("accentColor", hex);
        if (saveCustom !== undefined) {
          await store.set("customAccentColor", saveCustom);
        }
        await store.save();
      } catch (error) {
        console.error("Failed to save accent color:", error);
      }
    },
    []
  );

  const handleAccentChange = useCallback(
    async (color: string) => {
      const hex = color.toUpperCase();
      setAccentColor(hex);
      setCustomColor(hex);
      await applyAccent(hex, hex);
    },
    [applyAccent]
  );

  const handlePresetClick = useCallback(
    async (color: string) => {
      setAccentColor(color);
      await applyAccent(color);
    },
    [applyAccent]
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (colorisInitialized.current) return;
    colorisInitialized.current = true;

    Coloris.init();
    Coloris({
      el: "#accent-color-input",
      theme: "polaroid",
      themeMode: "dark",
      alpha: false,
      format: "hex",
      wrap: false,
      focusInput: false,
      selectInput: false,
      swatches: [],
      onChange: (color) => {
        handleAccentChange(color);
      },
    });
  }, [handleAccentChange]);

  const loadData = async () => {
    try {
      const shortcut = await invoke<string>("get_global_shortcut");
      setGlobalShortcut(shortcut);

      const store = await load("settings.json");
      const savedHistoryShortcut = await store.get<string>("historyShortcut");
      if (savedHistoryShortcut) setHistoryShortcut(savedHistoryShortcut);
      const saved = await store.get<string>("accentColor");
      if (saved) setAccentColor(saved);
      const savedCustom = await store.get<string | null>("customAccentColor");
      if (savedCustom) setCustomColor(savedCustom);

      const savedSoundEnabled = await store.get<boolean>("soundEnabled");
      if (savedSoundEnabled !== null && savedSoundEnabled !== undefined)
        setSoundEnabled(savedSoundEnabled);
      const savedSoundVolume = await store.get<number>("soundVolume");
      if (savedSoundVolume !== null && savedSoundVolume !== undefined)
        setSoundVolume(savedSoundVolume);
      const savedSoundType = await store.get<string>("soundType");
      if (savedSoundType) setSoundType(savedSoundType);
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatShortcut = (shortcut: string): string => {
    return shortcut
      .replace("CommandOrControl", "\u2318")
      .replace("Command", "\u2318")
      .replace("Control", "\u2303")
      .replace("Shift", "\u21E7")
      .replace("Alt", "\u2325")
      .replace("Option", "\u2325")
      .replace(/\+/g, " ");
  };

  const keysToShortcut = (keys: Set<string>): string => {
    const parts: string[] = [];
    if (keys.has("Meta") || keys.has("Control")) parts.push("CommandOrControl");
    if (keys.has("Shift")) parts.push("Shift");
    if (keys.has("Alt")) parts.push("Alt");
    for (const key of keys) {
      if (!["Meta", "Control", "Shift", "Alt"].includes(key)) {
        parts.push(key.toUpperCase());
        break;
      }
    }
    return parts.join("+");
  };

  const handleKeyDown = async (e: React.KeyboardEvent, targetId: string) => {
    if (isRecording !== targetId) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(null);
      setRecordedKeys(new Set());
      return;
    }

    const newKeys = new Set(recordedKeys);
    if (e.metaKey) newKeys.add("Meta");
    if (e.ctrlKey) newKeys.add("Control");
    if (e.shiftKey) newKeys.add("Shift");
    if (e.altKey) newKeys.add("Alt");

    const isModifier = ["Meta", "Control", "Shift", "Alt"].includes(e.key);
    if (!isModifier && e.key.length === 1) {
      newKeys.add(e.key.toUpperCase());
    }

    setRecordedKeys(newKeys);

    const hasModifier =
      newKeys.has("Meta") ||
      newKeys.has("Control") ||
      newKeys.has("Shift") ||
      newKeys.has("Alt");
    const mainKey = Array.from(newKeys).find(
      (k) => !["Meta", "Control", "Shift", "Alt"].includes(k)
    );

    if (hasModifier && mainKey) {
      const shortcut = keysToShortcut(newKeys);

      if (targetId === "global") {
        try {
          await invoke("update_global_shortcut", { shortcutStr: shortcut });
          setGlobalShortcut(shortcut);
        } catch (error) {
          console.error("Failed to update shortcut:", error);
        }
      } else if (targetId === "history") {
        try {
          const store = await load("settings.json");
          await store.set("historyShortcut", shortcut);
          await store.save();
          setHistoryShortcut(shortcut);
        } catch (error) {
          console.error("Failed to update history shortcut:", error);
        }
      }

      setIsRecording(null);
      setRecordedKeys(new Set());
    }
  };

  const startRecording = (
    targetId: string,
    buttonRef: HTMLButtonElement | null
  ) => {
    setIsRecording(targetId);
    setRecordedKeys(new Set());
    setTimeout(() => buttonRef?.focus(), 10);
  };

  const PRESET_COLORS = ["#F0B67F", "#6BBFFF", "#A78BFA", "#F472B6", "#34D399"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-white/60">
          <svg
            className="w-5 h-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:px-8 h-full overflow-y-auto">
      <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] mb-1">
        Configuration
      </h1>
      <p className="text-[13px] text-white/40 m-0 mb-6">
        Customize keyboard shortcuts, appearance, and notification preferences.
      </p>

      {/* Keyboard Shortcuts Section */}
      <section>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-2">
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white">Open Refine</span>
              <button
                onClick={(e) => startRecording("global", e.currentTarget)}
                onKeyDown={(e) => handleKeyDown(e, "global")}
                tabIndex={0}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all cursor-pointer border outline-none ${
                  isRecording === "global"
                    ? "bg-(--accent)/20 border-(--accent) text-(--accent)"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                {isRecording === "global"
                  ? recordedKeys.size > 0
                    ? formatShortcut(keysToShortcut(recordedKeys))
                    : "Press keys..."
                  : formatShortcut(globalShortcut)}
              </button>
            </div>
          </div>

          <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-white">Clipboard History</span>
              <button
                onClick={(e) => startRecording("history", e.currentTarget)}
                onKeyDown={(e) => handleKeyDown(e, "history")}
                tabIndex={0}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all cursor-pointer border outline-none ${
                  isRecording === "history"
                    ? "bg-(--accent)/20 border-(--accent) text-(--accent)"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                {isRecording === "history"
                  ? recordedKeys.size > 0
                    ? formatShortcut(keysToShortcut(recordedKeys))
                    : "Press keys..."
                  : formatShortcut(historyShortcut)}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Appearance Section */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          Appearance
        </h2>
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[14px] text-white">Accent Color</span>
              <p className="text-[12px] text-white/40 mt-0.5">
                Customize the highlight color across the app
              </p>
            </div>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handlePresetClick(color)}
                  className="w-6 h-6 rounded-full border-2 transition-all cursor-pointer p-0"
                  style={{
                    backgroundColor: color,
                    borderColor:
                      accentColor === color ? "white" : "transparent",
                    transform:
                      accentColor === color ? "scale(1.15)" : "scale(1)",
                  }}
                  title={color}
                />
              ))}
              {customColor && !PRESET_COLORS.includes(customColor) && (
                <button
                  onClick={() => handlePresetClick(customColor)}
                  className="w-6 h-6 rounded-full border-2 transition-all cursor-pointer p-0"
                  style={{
                    backgroundColor: customColor,
                    borderColor:
                      accentColor === customColor ? "white" : "transparent",
                    transform:
                      accentColor === customColor ? "scale(1.15)" : "scale(1)",
                  }}
                  title={customColor}
                />
              )}
              <input
                ref={colorInputRef}
                id="accent-color-input"
                type="text"
                value={accentColor}
                readOnly
                data-coloris
                className="w-0 h-0 overflow-hidden opacity-0 absolute pointer-events-none"
              />
              <button
                onClick={() => colorInputRef.current?.click()}
                className="w-6 h-6 rounded-full border border-white/20 hover:border-white/40 transition-colors cursor-pointer p-0 flex items-center justify-center bg-white/5"
                title="Pick a color"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-50"
                >
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Sound Section */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
          Sound
        </h2>
        <div className="space-y-3">
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/60"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <span className="text-[14px] text-white">
                  Notification Sound
                </span>
              </div>
              <button
                onClick={async () => {
                  const newValue = !soundEnabled;
                  setSoundEnabled(newValue);
                  try {
                    const store = await load("settings.json");
                    await store.set("soundEnabled", newValue);
                    await store.save();
                  } catch (error) {
                    console.error("Failed to save sound setting:", error);
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors border-none cursor-pointer ${
                  soundEnabled ? "bg-(--accent)" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    soundEnabled ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {soundEnabled && (
            <>
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-white">Alert Sound</span>
                  <div className="flex items-center gap-2">
                    {["Glass", "Ping", "Funk"].map((name) => (
                      <button
                        key={name}
                        onClick={async () => {
                          setSoundType(name);
                          try {
                            const store = await load("settings.json");
                            await store.set("soundType", name);
                            await store.save();
                          } catch (error) {
                            console.error("Failed to save sound type:", error);
                          }
                          invoke("play_system_sound", {
                            name,
                            volume: soundVolume,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all border ${
                          soundType === name
                            ? "bg-(--accent) text-white border-transparent"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[14px] text-white shrink-0">
                    Volume
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={soundVolume}
                    onChange={async (e) => {
                      const val = parseFloat(e.target.value);
                      setSoundVolume(val);
                      try {
                        const store = await load("settings.json");
                        await store.set("soundVolume", val);
                        await store.save();
                      } catch (error) {
                        console.error("Failed to save volume:", error);
                      }
                    }}
                    className="flex-1 h-1 accent-(--accent) cursor-pointer"
                  />
                  <button
                    onClick={() => playNotificationSound()}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[12px] text-white/60 hover:text-white/80 cursor-pointer transition-colors shrink-0"
                    title="Preview sound"
                  >
                    Preview
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default ConfigTab;
