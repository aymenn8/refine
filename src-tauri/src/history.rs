use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;
use chrono::Utc;

const HISTORY_KEY: &str = "history";
const HISTORY_ENABLED_KEY: &str = "historyEnabled";
const RETENTION_DAYS: i64 = 7;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub input: String,
    pub output: String,
    pub mode_id: String,
    pub mode_name: String,
    pub created_at: i64,
}

impl HistoryEntry {
    pub fn new(input: String, output: String, mode_id: String, mode_name: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            input,
            output,
            mode_id,
            mode_name,
            created_at: Utc::now().timestamp(),
        }
    }
}

/// Check if history is enabled
fn is_history_enabled(app: &AppHandle) -> bool {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return true, // Default to enabled
    };

    store
        .get(HISTORY_ENABLED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true) // Default to enabled
}

/// Get history entries from store
fn get_history_from_store(app: &AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let entries: Vec<HistoryEntry> = store
        .get(HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(entries)
}

/// Save history entries to store
fn save_history_to_store(app: &AppHandle, entries: &[HistoryEntry]) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set(
        HISTORY_KEY,
        serde_json::to_value(entries).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Clean up entries older than 7 days
fn cleanup_old_entries(entries: &mut Vec<HistoryEntry>) {
    let now = Utc::now().timestamp();
    let cutoff = now - (RETENTION_DAYS * 24 * 60 * 60);
    entries.retain(|e| e.created_at > cutoff);
}

/// Add a new history entry (called from inference)
pub fn add_entry(app: &AppHandle, input: String, output: String, mode_id: String, mode_name: String) -> Result<(), String> {
    // Check if history is enabled
    if !is_history_enabled(app) {
        return Ok(());
    }

    let mut entries = get_history_from_store(app)?;

    // Cleanup old entries first
    cleanup_old_entries(&mut entries);

    // Add new entry at the beginning
    let entry = HistoryEntry::new(input, output, mode_id, mode_name);
    entries.insert(0, entry);

    save_history_to_store(app, &entries)
}

/// Get history entries with pagination (with cleanup)
#[tauri::command]
pub async fn get_history(app: AppHandle, offset: usize, limit: usize) -> Result<HistoryPage, String> {
    let mut entries = get_history_from_store(&app)?;

    // Cleanup old entries
    let before_count = entries.len();
    cleanup_old_entries(&mut entries);

    // Save if we removed any
    if entries.len() != before_count {
        save_history_to_store(&app, &entries)?;
    }

    let total = entries.len();
    let has_more = offset + limit < total;

    // Get paginated slice
    let paginated: Vec<HistoryEntry> = entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    Ok(HistoryPage {
        entries: paginated,
        total,
        has_more,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPage {
    pub entries: Vec<HistoryEntry>,
    pub total: usize,
    pub has_more: bool,
}

/// Clear all history
#[tauri::command]
pub async fn clear_history(app: AppHandle) -> Result<(), String> {
    save_history_to_store(&app, &[])
}

/// Set history enabled/disabled
#[tauri::command]
pub async fn set_history_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set(HISTORY_ENABLED_KEY, serde_json::Value::Bool(enabled));

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Get history enabled status
#[tauri::command]
pub async fn get_history_enabled(app: AppHandle) -> Result<bool, String> {
    Ok(is_history_enabled(&app))
}
