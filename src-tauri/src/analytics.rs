use posthog_rs::{ClientOptionsBuilder, Event};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const ANALYTICS_KEY: &str = "analyticsEnabled";
const ANALYTICS_DISTINCT_ID_KEY: &str = "analyticsDistinctId";
const FIRST_APP_LAUNCH_TRACKED_KEY: &str = "analyticsFirstAppLaunchTracked";
const DEFAULT_POSTHOG_ENDPOINT: &str = "https://us.i.posthog.com/i/v0/e/";

fn is_configured() -> bool {
    option_env!("REFINE_POSTHOG_API_KEY")
        .filter(|k| !k.is_empty())
        .is_some()
}

fn get_api_key() -> &'static str {
    option_env!("REFINE_POSTHOG_API_KEY").unwrap_or("")
}

fn get_api_endpoint() -> String {
    let host = option_env!("REFINE_POSTHOG_HOST")
        .filter(|value| !value.is_empty());

    match host {
        Some(h) => format!("{}/i/v0/e/", h.trim_end_matches('/')),
        None => DEFAULT_POSTHOG_ENDPOINT.to_string(),
    }
}

/// Check if analytics is enabled (default: false)
fn is_enabled(app: &AppHandle) -> bool {
    if !is_configured() {
        return false;
    }

    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return false,
    };

    store
        .get(ANALYTICS_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn get_or_create_distinct_id(app: &AppHandle) -> Option<String> {
    let store = app.store("settings.json").ok()?;

    if let Some(existing_id) = store
        .get(ANALYTICS_DISTINCT_ID_KEY)
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
    {
        return Some(existing_id);
    }

    let distinct_id = Uuid::new_v4().to_string();
    store.set(ANALYTICS_DISTINCT_ID_KEY, Value::String(distinct_id.clone()));
    let _ = store.save();
    Some(distinct_id)
}

fn mark_first_app_launch_tracked(app: &AppHandle) {
    let Ok(store) = app.store("settings.json") else {
        return;
    };

    store.set(FIRST_APP_LAUNCH_TRACKED_KEY, Value::Bool(true));
    let _ = store.save();
}

fn is_first_app_launch_tracked(app: &AppHandle) -> bool {
    let Ok(store) = app.store("settings.json") else {
        return false;
    };

    store
        .get(FIRST_APP_LAUNCH_TRACKED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Track an event only if analytics is enabled
pub fn track(app: &AppHandle, event_name: &str, props: Option<serde_json::Value>) {
    if !is_enabled(app) {
        return;
    }

    let Some(distinct_id) = get_or_create_distinct_id(app) else {
        return;
    };

    let api_key = get_api_key().to_string();
    let api_endpoint = get_api_endpoint();

    let mut event = Event::new(event_name, &distinct_id);
    event.insert_prop("$process_person_profile", false).ok();
    event.insert_prop("source", "tauri").ok();
    event.insert_prop("app_version", env!("CARGO_PKG_VERSION")).ok();

    if let Some(Value::Object(map)) = props {
        for (key, value) in map {
            match value {
                Value::String(s) => { event.insert_prop(&key, s).ok(); }
                Value::Bool(b) => { event.insert_prop(&key, b).ok(); }
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        event.insert_prop(&key, i).ok();
                    } else if let Some(f) = n.as_f64() {
                        event.insert_prop(&key, f).ok();
                    }
                }
                _ => {}
            }
        }
    }

    std::thread::spawn(move || {
        let options = ClientOptionsBuilder::default()
            .api_key(api_key)
            .api_endpoint(api_endpoint)
            .build()
            .expect("Failed to build PostHog client options");
        let client = posthog_rs::client(options);
        if let Err(e) = client.capture(event) {
            eprintln!("[analytics] PostHog capture failed: {}", e);
        }
    });
}

pub fn track_app_launch(app: &AppHandle) {
    track(app, "app_launched", None);
    track_first_app_launch_if_needed(app, None);
}

pub fn track_first_app_launch_if_needed(app: &AppHandle, source: Option<&str>) {
    if !is_enabled(app) || is_first_app_launch_tracked(app) {
        return;
    }

    let props = source.map(|value| serde_json::json!({ "consent_source": value }));
    track(app, "first_app_launch", props);
    mark_first_app_launch_tracked(app);
}

pub fn set_enabled(app: &AppHandle, enabled: bool, source: Option<&str>) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(ANALYTICS_KEY, Value::Bool(enabled));
    store.save().map_err(|e| e.to_string())?;

    if enabled {
        track_first_app_launch_if_needed(app, source);
    }

    Ok(())
}
