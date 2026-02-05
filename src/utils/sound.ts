import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

export async function playNotificationSound(): Promise<void> {
  try {
    const store = await load("settings.json");
    const enabled = await store.get<boolean>("soundEnabled");
    if (enabled === false) return;

    const volume = (await store.get<number>("soundVolume")) ?? 0.5;
    const soundType = (await store.get<string>("soundType")) ?? "Glass";

    await invoke("play_system_sound", { name: soundType, volume });
  } catch (error) {
    console.error("Failed to play notification sound:", error);
  }
}
