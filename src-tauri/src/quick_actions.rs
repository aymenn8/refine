use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, Manager};
use tauri_plugin_store::StoreExt;

const QUICK_ACTIONS_KEY: &str = "quickActions";

fn default_action_type() -> String {
    "mode".to_string()
}

/// A quick action shortcut configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub mode_id: String,
    pub mode_name: String,
    pub shortcut: String, // e.g., "CommandOrControl+Shift+C"
    #[serde(default = "default_action_type")]
    pub action_type: String, // "mode" or "flow"
}

/// Get all quick actions from store
#[tauri::command]
pub async fn get_quick_actions(app: AppHandle) -> Result<Vec<QuickAction>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let actions: Vec<QuickAction> = crate::stored_list::load_list(&store, QUICK_ACTIONS_KEY)
        .unwrap_or_default();

    Ok(actions)
}

/// Save a quick action (add or update)
#[tauri::command]
pub async fn save_quick_action(
    app: AppHandle,
    mode_id: String,
    mode_name: String,
    shortcut: String,
    action_type: Option<String>,
) -> Result<(), String> {
    let action_type = action_type.unwrap_or_else(|| "mode".to_string());

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut actions: Vec<QuickAction> = crate::stored_list::load_list(&store, QUICK_ACTIONS_KEY)
        .unwrap_or_default();

    // Check if this target already has a quick action (match by mode_id AND action_type)
    if let Some(existing) = actions
        .iter_mut()
        .find(|a| a.mode_id == mode_id && a.action_type == action_type)
    {
        existing.shortcut = shortcut;
        existing.mode_name = mode_name;
    } else {
        actions.push(QuickAction {
            mode_id,
            mode_name,
            shortcut,
            action_type,
        });
    }

    store.set(
        QUICK_ACTIONS_KEY,
        serde_json::to_value(&actions).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Delete a quick action
#[tauri::command]
pub async fn delete_quick_action(app: AppHandle, mode_id: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut actions: Vec<QuickAction> = crate::stored_list::load_list(&store, QUICK_ACTIONS_KEY)
        .unwrap_or_default();

    actions.retain(|a| a.mode_id != mode_id);

    store.set(
        QUICK_ACTIONS_KEY,
        serde_json::to_value(&actions).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Get quick actions for registration (internal use)
pub fn get_quick_actions_sync(app: &AppHandle) -> Vec<QuickAction> {
    let store = match app.store("settings.json") {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    crate::stored_list::load_list(&store, QUICK_ACTIONS_KEY)
        .unwrap_or_default()
}

/// Show the toast window at top-right of screen with loading state
fn show_toast(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("toast") {
        // Position at top right - get primary monitor
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_width = monitor.size().width as f64 / monitor.scale_factor();
            let x = screen_width - 220.0; // 200px window + 20px margin
            let _ = window.set_position(LogicalPosition::new(x, 12.0));
        }

        let _ = window.emit(
            "toast-state",
            serde_json::json!({
                "state": "loading"
            }),
        );
    }

    // Show via panel API (works over fullscreen apps)
    crate::window::show_toast_panel(app);
}

/// Show done state and hide toast after delay
fn show_done_and_hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("toast") {
        let _ = window.emit(
            "toast-state",
            serde_json::json!({
                "state": "done"
            }),
        );
    }
    thread::sleep(Duration::from_millis(800));
    crate::window::hide_toast_panel(app);
}

/// Show error state and hide toast after delay
fn show_error_and_hide(app: &AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("toast") {
        let _ = window.emit(
            "toast-state",
            serde_json::json!({
                "state": "error",
                "message": message
            }),
        );
    }
    thread::sleep(Duration::from_millis(1500));
    crate::window::hide_toast_panel(app);
}

/// Loading toast immediately followed by an error message.
pub(crate) fn show_error_toast(app: &AppHandle, message: &str) {
    show_toast(app);
    show_error_and_hide(app, message);
}

/// Execute a quick action: copy selected text, process, paste result
pub async fn execute_quick_action(
    app: AppHandle,
    mode_id: String,
    action_type: String,
) -> Result<(), String> {
    // The paste goes back to the app that had the selection.
    crate::native_mac::get_and_store_frontmost_app();

    let captured = tokio::task::spawn_blocking(crate::selection::capture_selection)
        .await
        .map_err(|e| format!("Failed to copy: {}", e))?;
    let selected_text = match captured {
        Ok(text) if !text.trim().is_empty() => text,
        Ok(_) => {
            show_error_toast(&app, "No text selected");
            return Err("No text selected".to_string());
        }
        Err(message) => {
            show_error_toast(&app, &message);
            return Err(message);
        }
    };

    // Now we know there's a selection - show toast
    show_toast(&app);
    crate::analytics::track(&app, "quick_action_used", None);

    let result = if action_type == "flow" {
        crate::inference::process_flow(app.clone(), selected_text, mode_id).await
    } else {
        crate::inference::process_text(app.clone(), selected_text, mode_id).await
    };

    match result {
        Ok(processed_text) => {
            let pasted = tokio::task::spawn_blocking(move || {
                crate::selection::paste_into_previous_app(&processed_text)
            })
            .await
            .map_err(|e| format!("Failed to paste: {}", e))?;

            if let Err(message) = pasted {
                show_error_and_hide(&app, &message);
                return Err(message);
            }

            // Show "Done!" then hide
            show_done_and_hide(&app);

            Ok(())
        }
        Err(e) => {
            show_error_and_hide(&app, "Processing failed");
            Err(e)
        }
    }
}
