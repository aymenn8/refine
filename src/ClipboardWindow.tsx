import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { resolveTheme as themeFor } from "./utils/theme";
import { applyAccentColor } from "./utils/accent";
import { ClipboardHistory } from "./spotlight/ClipboardHistory";

interface ClipboardOpenPayload {
  previous_app: string;
}

function ClipboardWindow() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [openSequence, setOpenSequence] = useState(0);

  const resolveTheme = useCallback(async () => {
    try {
      const store = await load("settings.json");
      const raw =
        (await store.get<string>("themeMode")) ||
        (await store.get<string>("appearance")) ||
        (await store.get<string>("theme"));
      setTheme(themeFor(raw, window.matchMedia("(prefers-color-scheme: light)").matches));
    } catch {
      setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await invoke("hide_clipboard_window");
    } catch (error) {
      console.error("Failed to hide clipboard window:", error);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await applyAccentColor();
      await resolveTheme();
      setOpenSequence((prev) => prev + 1);
    };

    bootstrap();

    const unlistenOpen = listen<ClipboardOpenPayload>("clipboard-open", async () => {
      await applyAccentColor();
      await resolveTheme();
      setOpenSequence((prev) => prev + 1);
    });

    return () => {
      unlistenOpen.then((fn) => fn());
    };
  }, [resolveTheme]);

  // Follow macOS when the appearance changes while the window is open
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => void resolveTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [resolveTheme]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        void handleClose();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleClose]);

  return (
    <div className="auto-light-contrast h-screen w-screen bg-transparent flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col animate-slide-in min-h-0">
        <div className="p-5 flex flex-col gap-3 flex-1 min-h-0">
          <div className="relative flex-1 min-h-0">
            <ClipboardHistory
              key={openSequence}
              theme={theme}
              onClose={handleClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClipboardWindow;
