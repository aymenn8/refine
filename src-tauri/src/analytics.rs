use chrono::Utc;
use reqwest::Client;
use serde_json::{Map, Value};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const ANALYTICS_KEY: &str = "analyticsEnabled";
const ANALYTICS_DISTINCT_ID_KEY: &str = "analyticsDistinctId";
const FIRST_APP_LAUNCH_TRACKED_KEY: &str = "analyticsFirstAppLaunchTracked";
const DEFAULT_POSTHOG_HOST: &str = "https://us.i.posthog.com";

struct AnalyticsConfig {
    api_key: &'static str,
    host: &'static str,
}

impl AnalyticsConfig {
    fn from_env() -> Option<Self> {
        let api_key = option_env!("REFINE_POSTHOG_API_KEY")?;
        if api_key.is_empty() {
            return None;
        }

        let host = option_env!("REFINE_POSTHOG_HOST")
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_POSTHOG_HOST);

        Some(Self { api_key, host })
    }
}

/// Check if analytics is enabled (default: false)
fn is_enabled(app: &AppHandle) -> bool {
    if AnalyticsConfig::from_env().is_none() {
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
pub fn track(app: &AppHandle, event: &str, props: Option<serde_json::Value>) {
    if !is_enabled(app) {
        return;
    }

    let Some(config) = AnalyticsConfig::from_env() else {
        return;
    };

    let Some(distinct_id) = get_or_create_distinct_id(app) else {
        return;
    };

    let mut properties = match props {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    properties.insert(
        "$process_person_profile".to_string(),
        Value::Bool(false),
    );
    properties.insert("source".to_string(), Value::String("tauri".to_string()));
    properties.insert(
        "app_version".to_string(),
        Value::String(env!("CARGO_PKG_VERSION").to_string()),
    );

    let payload = serde_json::json!({
        "api_key": config.api_key,
        "event": event,
        "distinct_id": distinct_id,
        "properties": properties,
        "timestamp": Utc::now().to_rfc3339(),
    });

    let url = format!("{}/i/v0/e/", config.host.trim_end_matches('/'));
    tauri::async_runtime::spawn(async move {
        let client = Client::new();
        let response = client.post(url).json(&payload).send().await;

        match response {
            Ok(response) if response.status().is_success() => {}
            Ok(response) => eprintln!(
                "[analytics] PostHog capture failed with status {}",
                response.status()
            ),
            Err(error) => eprintln!("[analytics] PostHog capture request failed: {}", error),
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
