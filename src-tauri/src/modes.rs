use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// A processing mode configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingMode {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub is_default: bool,
}

impl ProcessingMode {
    /// Build the complete prompt for llama.cpp using Qwen3 chat template
    pub fn build_prompt(&self, text: &str) -> String {
        let user_prompt = self.user_prompt_template.replace("{text}", text);
        format!(
            "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
            self.system_prompt,
            user_prompt
        )
    }
}

/// Returns the default modes shipped with the app
fn get_default_modes() -> Vec<ProcessingMode> {
    vec![
        ProcessingMode {
            id: "translate-to-english".to_string(),
            name: "TO ENGLISH".to_string(),
            description: "Translate any text to English".to_string(),
            icon: "".to_string(),
            system_prompt: "You are a professional translator. Translate the user's text to English. Output ONLY the translation, nothing else. Be concise.".to_string(),
            user_prompt_template: "Translate to English: {text}".to_string(),
            is_default: true,
        },
        ProcessingMode {
            id: "correct".to_string(),
            name: "CORRECT".to_string(),
            description: "Fix spelling, grammar, and punctuation errors".to_string(),
            icon: "".to_string(),
            system_prompt: "Role: Professional Multilingual Copyeditor.\nTask: Correct all spelling, grammar, and punctuation errors in the provided text.\nConstraints:\n- Language: Maintain the original language of the input. Do NOT translate.\n- Tone/Style: Preserve the author's original tone and intent.\n- Formatting: Maintain the original paragraph structure and Markdown formatting.\n- Output: Provide ONLY the corrected text. Do not include introductory remarks, explanations, or closing comments.".to_string(),
            user_prompt_template: "Fix spelling/grammar errors only (do NOT translate): {text}".to_string(),
            is_default: true,
        },
        ProcessingMode {
            id: "ask".to_string(),
            name: "ASK".to_string(),
            description: "Ask a question and get an answer".to_string(),
            icon: "".to_string(),
            system_prompt: "You are a helpful assistant. Answer the user's question concisely and accurately.".to_string(),
            user_prompt_template: "{text}".to_string(),
            is_default: true,
        },
    ]
}

const MODES_KEY: &str = "processingModes";

/// Get all processing modes from storage
#[tauri::command]
pub async fn get_modes(app: AppHandle) -> Result<Vec<ProcessingMode>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);

    Ok(modes)
}

/// Save a new mode or update an existing one
#[tauri::command]
pub async fn save_mode(app: AppHandle, mode: ProcessingMode) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);

    // Check if mode with this ID exists
    if let Some(existing) = modes.iter_mut().find(|m| m.id == mode.id) {
        *existing = mode;
    } else {
        modes.push(mode);
    }

    store.set(
        MODES_KEY,
        serde_json::to_value(&modes).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Delete a mode by ID
#[tauri::command]
pub async fn delete_mode(app: AppHandle, mode_id: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);

    // Don't allow deleting if it would leave no modes
    if modes.len() <= 1 {
        return Err("Cannot delete the last mode".to_string());
    }

    modes.retain(|m| m.id != mode_id);

    store.set(
        MODES_KEY,
        serde_json::to_value(&modes).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Reset modes to defaults
#[tauri::command]
pub async fn reset_modes_to_defaults(app: AppHandle) -> Result<Vec<ProcessingMode>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let defaults = get_default_modes();

    store.set(
        MODES_KEY,
        serde_json::to_value(&defaults).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(defaults)
}

/// Get a specific mode by ID (used by inference)
pub fn get_mode_by_id(app: &AppHandle, mode_id: &str) -> Result<ProcessingMode, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);

    modes
        .into_iter()
        .find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode not found: {}", mode_id))
}
