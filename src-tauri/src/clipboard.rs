use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_store::StoreExt;

const MAX_HISTORY_ITEMS: usize = 20;
const CLIPBOARD_HISTORY_KEY: &str = "clipboardHistory";

/// State to track the last clipboard content
pub struct ClipboardState {
    pub last_content: Mutex<String>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            last_content: Mutex::new(String::new()),
        }
    }
}

/// Start monitoring the clipboard in the background
pub fn start_clipboard_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(500));

            // Read current clipboard
            let current = match app.clipboard().read_text() {
                Ok(text) => text,
                Err(_) => continue,
            };

            // Skip empty clipboard
            if current.trim().is_empty() {
                continue;
            }

            // Check if content changed
            let state = app.state::<ClipboardState>();
            let mut last = state.last_content.lock().unwrap();

            if *last != current {
                *last = current.clone();
                drop(last); // Release lock before async operation

                // Add to history
                if let Err(e) = add_to_history(&app, current) {
                    eprintln!("Failed to add to clipboard history: {}", e);
                }
            }
        }
    });
}

/// Add text to clipboard history
fn add_to_history(app: &AppHandle, text: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut history: Vec<String> = store
        .get(CLIPBOARD_HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Remove if already exists (to move it to front)
    history.retain(|item| item != &text);

    // Add to front
    history.insert(0, text);

    // Limit to max items
    history.truncate(MAX_HISTORY_ITEMS);

    // Save
    store.set(
        CLIPBOARD_HISTORY_KEY,
        serde_json::to_value(&history).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Get clipboard history
#[tauri::command]
pub async fn get_clipboard_history(app: AppHandle) -> Result<Vec<String>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let history: Vec<String> = store
        .get(CLIPBOARD_HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(history)
}

/// Clear clipboard history
#[tauri::command]
pub async fn clear_clipboard_history(app: AppHandle) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set(
        CLIPBOARD_HISTORY_KEY,
        serde_json::to_value::<Vec<String>>(vec![]).unwrap(),
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}
