use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::model::ActiveModelConfig;

/// A processing mode configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingMode {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub is_default: bool,
    #[serde(default)]
    pub is_pinned: bool,
    /// Optional model override - if None, uses the default active model
    #[serde(default)]
    pub model_override: Option<ActiveModelConfig>,
}

impl ProcessingMode {
    /// Build the complete prompt for llama.cpp using the appropriate chat template
    pub fn build_prompt(&self, text: &str, model_id: &str) -> String {
        let user_prompt = self.user_prompt_template.replace("{text}", text);
        if model_id.starts_with("gemma") {
            // Gemma chat template
            format!(
                "<start_of_turn>user\n{}\n\n{}<end_of_turn>\n<start_of_turn>model\n",
                self.system_prompt,
                user_prompt
            )
        } else {
            // ChatML template (Qwen, etc.)
            format!(
                "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
                self.system_prompt,
                user_prompt
            )
        }
    }
}

/// Returns the default modes shipped with the app
fn get_default_modes() -> Vec<ProcessingMode> {
    vec![
        ProcessingMode {
            id: "prompt-it".to_string(),
            name: "PROMPT IT".to_string(),
            description: "Turn rough ideas into a short, high-quality LLM prompt".to_string(),

            system_prompt: "You are an expert prompt engineer. Transform the user's input into one short, high-impact prompt that an LLM can execute clearly. Keep it concise, specific, and actionable. Preserve the user's language unless translation is explicitly requested. Output ONLY the final prompt sentence.".to_string(),
            user_prompt_template: "Create a concise, high-quality prompt from this idea: {text}".to_string(),
            is_default: true,
            is_pinned: true,
            model_override: None,
        },
        ProcessingMode {
            id: "translate-to-english".to_string(),
            name: "TO ENGLISH".to_string(),
            description: "Translate any text to English".to_string(),

            system_prompt: "You are a professional translator. Translate the user's text to English. Output ONLY the translation, nothing else. Be concise.".to_string(),
            user_prompt_template: "Translate to English: {text}".to_string(),
            is_default: true,
            is_pinned: false,
            model_override: None,
        },
        ProcessingMode {
            id: "correct".to_string(),
            name: "CORRECT".to_string(),
            description: "Fix spelling, grammar, and punctuation errors".to_string(),

            system_prompt: "Role: Professional Multilingual Copyeditor.\nTask: Correct all spelling, grammar, and punctuation errors in the provided text.\nConstraints:\n- Language: Maintain the original language of the input. Do NOT translate.\n- Tone/Style: Preserve the author's original tone and intent.\n- Formatting: Maintain the original paragraph structure and Markdown formatting.\n- Output: Provide ONLY the corrected text. Do not include introductory remarks, explanations, or closing comments.".to_string(),
            user_prompt_template: "Fix spelling/grammar errors only (do NOT translate): {text}".to_string(),
            is_default: true,
            is_pinned: true,
            model_override: None,
        },
        ProcessingMode {
            id: "ask".to_string(),
            name: "ASK".to_string(),
            description: "Ask a question and get an answer".to_string(),

            system_prompt: "You are a helpful assistant. Answer the user's question concisely and accurately.".to_string(),
            user_prompt_template: "{text}".to_string(),
            is_default: true,
            is_pinned: true,
            model_override: None,
        },
    ]
}

const MODES_KEY: &str = "processingModes";

fn append_missing_default_modes(modes: &mut Vec<ProcessingMode>) -> bool {
    let mut changed = false;
    for default_mode in get_default_modes() {
        if !modes.iter().any(|m| m.id == default_mode.id) {
            modes.push(default_mode);
            changed = true;
        }
    }

    // Migration: replace old pinned default setup
    // Old setup had TO ENGLISH + CORRECT + ASK pinned (and PROMPT IT unpinned).
    let prompt_pinned = modes
        .iter()
        .find(|m| m.id == "prompt-it")
        .map(|m| m.is_pinned)
        .unwrap_or(false);
    let translate_pinned = modes
        .iter()
        .find(|m| m.id == "translate-to-english")
        .map(|m| m.is_pinned)
        .unwrap_or(false);
    let correct_pinned = modes
        .iter()
        .find(|m| m.id == "correct")
        .map(|m| m.is_pinned)
        .unwrap_or(false);
    let ask_pinned = modes
        .iter()
        .find(|m| m.id == "ask")
        .map(|m| m.is_pinned)
        .unwrap_or(false);
    let pinned_count = modes.iter().filter(|m| m.is_pinned).count();

    if !prompt_pinned && translate_pinned && correct_pinned && ask_pinned && pinned_count == 3 {
        if let Some(mode) = modes.iter_mut().find(|m| m.id == "prompt-it") {
            mode.is_pinned = true;
            changed = true;
        }
        if let Some(mode) = modes.iter_mut().find(|m| m.id == "translate-to-english") {
            mode.is_pinned = false;
            changed = true;
        }
    }

    // Ensure PROMPT IT is first so it becomes the default selected mode when no explicit default exists.
    if let Some(prompt_idx) = modes.iter().position(|m| m.id == "prompt-it") {
        if prompt_idx != 0 {
            let prompt_mode = modes.remove(prompt_idx);
            modes.insert(0, prompt_mode);
            changed = true;
        }
    }

    changed
}

/// Get all processing modes from storage
#[tauri::command]
pub async fn get_modes(app: AppHandle) -> Result<Vec<ProcessingMode>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let from_store = store.get(MODES_KEY);
    println!("[get_modes] From store: {:?}", from_store.is_some());

    let mut modes: Vec<ProcessingMode> = from_store
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);

    let defaults_added = append_missing_default_modes(&mut modes);
    if defaults_added {
        store.set(
            MODES_KEY,
            serde_json::to_value(&modes)
                .map_err(|e| format!("Failed to serialize modes: {}", e))?,
        );
        store
            .save()
            .map_err(|e| format!("Failed to save store: {}", e))?;
    }

    println!("[get_modes] Returning {} modes", modes.len());
    println!("[get_modes] Mode IDs: {:?}", modes.iter().map(|m| &m.id).collect::<Vec<_>>());

    Ok(modes)
}

/// Save a new mode or update an existing one
#[tauri::command]
pub async fn save_mode(app: AppHandle, mode: ProcessingMode) -> Result<(), String> {
    println!("[save_mode] Called with mode id: {}, name: {}", mode.id, mode.name);

    // Premium check: creating a new custom (non-default) mode requires a license
    if !mode.is_default {
        let store_check = app
            .store("settings.json")
            .map_err(|e| format!("Failed to load store: {}", e))?;
        let mut existing_modes: Vec<ProcessingMode> = store_check
            .get(MODES_KEY)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(get_default_modes);
        append_missing_default_modes(&mut existing_modes);
        let is_new = !existing_modes.iter().any(|m| m.id == mode.id);
        if is_new {
            crate::license::require_feature(&app, crate::license::Feature::CustomModes)?;
        }
    }

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);
    append_missing_default_modes(&mut modes);

    println!("[save_mode] Current modes count: {}", modes.len());

    // Check if mode with this ID exists
    let is_new_mode = !modes.iter().any(|m| m.id == mode.id);
    if let Some(existing) = modes.iter_mut().find(|m| m.id == mode.id) {
        println!("[save_mode] Updating existing mode");
        *existing = mode;
    } else {
        println!("[save_mode] Adding new mode");
        modes.push(mode);
    }

    if is_new_mode {
        crate::analytics::track(&app, "mode_created", None);
    }

    println!("[save_mode] New modes count: {}", modes.len());

    store.set(
        MODES_KEY,
        serde_json::to_value(&modes).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    println!("[save_mode] Store saved successfully");

    Ok(())
}

/// Delete a mode by ID
#[tauri::command]
pub async fn delete_mode(app: AppHandle, mode_id: String) -> Result<(), String> {
    println!("[delete_mode] Called with mode_id: {}", mode_id);

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);
    append_missing_default_modes(&mut modes);

    println!("[delete_mode] Current modes count: {}", modes.len());
    println!("[delete_mode] Mode IDs: {:?}", modes.iter().map(|m| &m.id).collect::<Vec<_>>());

    // Don't allow deleting if it would leave no modes
    if modes.len() <= 1 {
        return Err("Cannot delete the last mode".to_string());
    }

    let before_count = modes.len();
    modes.retain(|m| m.id != mode_id);
    let after_count = modes.len();

    println!("[delete_mode] Removed {} mode(s)", before_count - after_count);

    store.set(
        MODES_KEY,
        serde_json::to_value(&modes).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    println!("[delete_mode] Store saved successfully");

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

const MAX_PINNED_MODES: usize = 3;

/// Toggle pin status for a mode
#[tauri::command]
pub async fn toggle_pin_mode(app: AppHandle, mode_id: String) -> Result<(), String> {
    println!("[toggle_pin_mode] Called with mode_id: {}", mode_id);

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);
    append_missing_default_modes(&mut modes);

    // Find the mode and check current pin status
    let mode = modes.iter().find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode not found: {}", mode_id))?;

    let currently_pinned = mode.is_pinned;
    let pinned_count = modes.iter().filter(|m| m.is_pinned).count();

    // If trying to unpin, check we have at least 2 pinned (so 1 remains)
    if currently_pinned && pinned_count <= 1 {
        return Err("At least one mode must be pinned".to_string());
    }

    // If trying to pin, check if we already have max pinned modes
    if !currently_pinned && pinned_count >= MAX_PINNED_MODES {
        return Err(format!("Cannot pin more than {} modes", MAX_PINNED_MODES));
    }

    // Toggle the pin status
    if let Some(mode) = modes.iter_mut().find(|m| m.id == mode_id) {
        mode.is_pinned = !mode.is_pinned;
        println!("[toggle_pin_mode] Mode {} is now pinned: {}", mode_id, mode.is_pinned);
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

/// Set the model override for a mode
#[tauri::command]
pub async fn set_mode_model(
    app: AppHandle,
    mode_id: String,
    model_config: Option<ActiveModelConfig>,
) -> Result<(), String> {
    println!("[set_mode_model] Setting model for mode: {}", mode_id);

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);
    append_missing_default_modes(&mut modes);

    // Find and update the mode
    let mode = modes.iter_mut().find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode not found: {}", mode_id))?;

    mode.model_override = model_config;

    store.set(
        MODES_KEY,
        serde_json::to_value(&modes).map_err(|e| format!("Failed to serialize modes: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    println!("[set_mode_model] Model override updated successfully");

    Ok(())
}

/// Get a specific mode by ID (used by inference)
pub fn get_mode_by_id(app: &AppHandle, mode_id: &str) -> Result<ProcessingMode, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut modes: Vec<ProcessingMode> = store
        .get(MODES_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(get_default_modes);
    append_missing_default_modes(&mut modes);

    modes
        .into_iter()
        .find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode not found: {}", mode_id))
}
