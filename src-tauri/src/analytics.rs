use tauri::AppHandle;
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_store::StoreExt;

const ANALYTICS_KEY: &str = "analyticsEnabled";

/// Check if analytics is enabled (default: true)
fn is_enabled(app: &AppHandle) -> bool {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return true,
    };

    store
        .get(ANALYTICS_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Track an event only if analytics is enabled
pub fn track(app: &AppHandle, event: &str, props: Option<serde_json::Value>) {
    if !is_enabled(app) {
        return;
    }
    let _ = app.track_event(event, props);
}
