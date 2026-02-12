import { useState, useEffect, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { load } from "@tauri-apps/plugin-store";

interface UpdateState {
  checking: boolean;
  available: boolean;
  version: string | null;
  body: string | null; // patch notes markdown
  downloading: boolean;
  progress: number;
  ready: boolean;
  dismissed: boolean;
  noUpdateNotice: boolean;
  error: string | null;
}

let cachedUpdate: Update | null = null;

export function useUpdater() {
  const noUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    version: null,
    body: null,
    downloading: false,
    progress: 0,
    ready: false,
    dismissed: false,
    noUpdateNotice: false,
    error: null,
  });

  const clearNoUpdateTimer = useCallback(() => {
    if (noUpdateTimerRef.current) {
      clearTimeout(noUpdateTimerRef.current);
      noUpdateTimerRef.current = null;
    }
  }, []);

  const dismissNoUpdateNotice = useCallback(() => {
    clearNoUpdateTimer();
    setState((s) => ({ ...s, noUpdateNotice: false }));
  }, [clearNoUpdateTimer]);

  const checkForUpdate = useCallback(async (manual = false) => {
    clearNoUpdateTimer();
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        cachedUpdate = update;
        setState((s) => ({
          ...s,
          checking: false,
          available: true,
          version: update.version,
          body: update.body ?? null,
          dismissed: false,
          noUpdateNotice: false,
        }));
      } else {
        setState((s) => ({
          ...s,
          checking: false,
          available: false,
          version: null,
          body: null,
          noUpdateNotice: manual,
        }));
        if (manual) {
          noUpdateTimerRef.current = setTimeout(() => {
            setState((s) => ({ ...s, noUpdateNotice: false }));
            noUpdateTimerRef.current = null;
          }, 3500);
        }
      }
    } catch (error) {
      console.error("Update check failed:", error);
      setState((s) => ({ ...s, checking: false, error: String(error) }));
    }
  }, [clearNoUpdateTimer]);

  useEffect(() => {
    (async () => {
      try {
        const store = await load("settings.json");
        const autoUpdate = await store.get<boolean>("autoUpdateEnabled");
        if (autoUpdate === false) return;
      } catch { /* default to checking */ }
      checkForUpdate(false);
    })();
  }, [checkForUpdate]);

  useEffect(() => {
    return () => {
      clearNoUpdateTimer();
    };
  }, [clearNoUpdateTimer]);

  async function downloadAndInstall() {
    const update = cachedUpdate ?? (await check());
    if (!update) return;
    cachedUpdate = update;

    setState((s) => ({ ...s, downloading: true, progress: 0, error: null }));

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              setState((s) => ({
                ...s,
                progress: Math.round((downloadedBytes / totalBytes) * 100),
              }));
            }
            break;
          case "Finished":
            setState((s) => ({ ...s, downloading: false, ready: true }));
            break;
        }
      });
    } catch (error) {
      console.error("Update failed:", error);
      setState((s) => ({ ...s, downloading: false, error: String(error) }));
    }
  }

  async function installAndRelaunch() {
    await relaunch();
  }

  function dismiss() {
    setState((s) => ({ ...s, dismissed: true }));
  }

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
    installAndRelaunch,
    dismiss,
    dismissNoUpdateNotice,
  };
}
