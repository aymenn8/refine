use serde::{Deserialize, Serialize};
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const QUICK_ACTIONS_KEY: &str = "quickActions";

/// A quick action shortcut configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub mode_id: String,
    pub mode_name: String,
    pub shortcut: String, // e.g., "CommandOrControl+Shift+C"
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
) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut actions: Vec<QuickAction> = store
        .get(QUICK_ACTIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Check if mode already has a quick action
    if let Some(existing) = actions.iter_mut().find(|a| a.mode_id == mode_id) {
        existing.shortcut = shortcut;
        existing.mode_name = mode_name;
    } else {
        actions.push(QuickAction {
            mode_id,
            mode_name,
            shortcut,
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

/// Execute a quick action: copy selected text, process, paste result
pub async fn execute_quick_action(app: AppHandle, mode_id: String) -> Result<(), String> {
    println!("[quick_action] Executing quick action for mode: {}", mode_id);

    // Emit loading state to tray
    let _ = app.emit("quick-action-loading", true);

    // Small delay to ensure we don't interfere with the shortcut
    thread::sleep(Duration::from_millis(50));

    // 1. Simulate Cmd+X to CUT selected text (this removes it and copies to clipboard)
    let cut_result = Command::new("osascript")
        .arg("-e")
        .arg("tell application \"System Events\" to keystroke \"x\" using command down")
        .output();

    if let Err(e) = cut_result {
        let _ = app.emit("quick-action-loading", false);
        return Err(format!("Failed to cut: {}", e));
    }

    // Wait for clipboard to update
    thread::sleep(Duration::from_millis(150));

    // 2. Get the clipboard content
    let clipboard_content = get_clipboard_content()?;

    if clipboard_content.trim().is_empty() {
        let _ = app.emit("quick-action-loading", false);
        return Err("No text selected".to_string());
    }

    println!("[quick_action] Copied text: {} chars", clipboard_content.len());

    // 3. Process the text
    let result = crate::inference::process_text(app.clone(), clipboard_content, mode_id).await;

    match result {
        Ok(processed_text) => {
            println!("[quick_action] Processed text: {} chars", processed_text.len());

            // 4. Set the clipboard to the processed text
            set_clipboard_content(&processed_text)?;

            // Small delay
            thread::sleep(Duration::from_millis(50));

            // 5. Simulate Cmd+V to paste
            let paste_result = Command::new("osascript")
                .arg("-e")
                .arg("tell application \"System Events\" to keystroke \"v\" using command down")
                .output();

            if let Err(e) = paste_result {
                let _ = app.emit("quick-action-loading", false);
                return Err(format!("Failed to paste: {}", e));
            }

            let _ = app.emit("quick-action-loading", false);
            let _ = app.emit("quick-action-success", ());

            Ok(())
        }
        Err(e) => {
            let _ = app.emit("quick-action-loading", false);
            let _ = app.emit("quick-action-error", e.clone());
            Err(e)
        }
    }
}

/// Get clipboard content using pbpaste
fn get_clipboard_content() -> Result<String, String> {
    let output = Command::new("pbpaste")
        .output()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid clipboard content: {}", e))
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

    child.wait().map_err(|e| format!("Failed to set clipboard: {}", e))?;

    Ok(())
}
