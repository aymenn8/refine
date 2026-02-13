use serde::{Deserialize, Serialize};
use std::process::Command;
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

    let actions: Vec<QuickAction> = store
        .get(QUICK_ACTIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
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

    let mut actions: Vec<QuickAction> = store
        .get(QUICK_ACTIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Premium check: free users can only have 1 quick action
    let is_new = !actions
        .iter()
        .any(|a| a.mode_id == mode_id && a.action_type == action_type);
    if is_new && actions.len() >= 1 {
        crate::license::require_feature(&app, crate::license::Feature::ExtraQuickActions)?;
    }

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

    let mut actions: Vec<QuickAction> = store
        .get(QUICK_ACTIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
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

    store
        .get(QUICK_ACTIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
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

/// Execute a quick action: copy selected text, process, paste result
pub async fn execute_quick_action(
    app: AppHandle,
    mode_id: String,
    action_type: String,
) -> Result<(), String> {
    // 1. Save current clipboard content to detect if selection exists
    let previous_clipboard = get_clipboard_content().unwrap_or_default();

    // 2. Clear clipboard with a unique marker
    let marker = format!(
        "__refine_marker_{}__",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    set_clipboard_content(&marker)?;

    // Small delay
    thread::sleep(Duration::from_millis(50));

    // 3. Simulate Cmd+C to COPY selected text (not cut yet)
    let copy_result = Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to keystroke \"c\" using command down")
        .output();

    if let Err(e) = copy_result {
        // Restore clipboard
        let _ = set_clipboard_content(&previous_clipboard);
        return Err(format!("Failed to copy: {}", e));
    }

    // Wait for clipboard to update
    thread::sleep(Duration::from_millis(150));

    // 4. Get the clipboard content
    let clipboard_content = get_clipboard_content()?;

    // 5. Check if clipboard changed (if still marker = nothing was selected)
    if clipboard_content == marker || clipboard_content.trim().is_empty() {
        let _ = set_clipboard_content(&previous_clipboard);
        show_toast(&app);
        show_error_and_hide(&app, "No text selected");
        return Err("No text selected".to_string());
    }

    // Now we know there's a selection - show toast
    show_toast(&app);
    crate::analytics::track(&app, "quick_action_used", None);

    // 3. Process the text
    let result = if action_type == "flow" {
        crate::inference::process_flow(app.clone(), clipboard_content, mode_id).await
    } else {
        crate::inference::process_text(app.clone(), clipboard_content, mode_id).await
    };

    match result {
        Ok(processed_text) => {
            // Set the clipboard to the processed text
            set_clipboard_content(&processed_text)?;

            // Small delay
            thread::sleep(Duration::from_millis(50));

            // 5. Simulate Cmd+V to paste
            let paste_result = Command::new("osascript")
                .arg("-e")
                .arg("tell application \"System Events\" to keystroke \"v\" using command down")
                .output();

            if let Err(e) = paste_result {
                show_error_and_hide(&app, "Failed to paste");
                return Err(format!("Failed to paste: {}", e));
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

/// Get clipboard content using pbpaste
fn get_clipboard_content() -> Result<String, String> {
    let output = Command::new("pbpaste")
        .output()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    String::from_utf8(output.stdout).map_err(|e| format!("Invalid clipboard content: {}", e))
}

/// Set clipboard content using pbcopy
fn set_clipboard_content(content: &str) -> Result<(), String> {
    use std::io::Write;
    use std::process::Stdio;

    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to set clipboard: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
    }

    child
        .wait()
        .map_err(|e| format!("Failed to set clipboard: {}", e))?;

    Ok(())
}
