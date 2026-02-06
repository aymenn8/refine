use crate::credentials::{get_credential_by_id, retrieve_api_key};
use crate::flows::get_flow_by_id;
use crate::history;
use crate::model::{get_active_model_config, ActiveModelConfig};
use crate::modes::get_mode_by_id;
use crate::providers::run_cloud_inference;
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::model::AddBos;
use llama_cpp_2::token::data_array::LlamaTokenDataArray;
use std::num::NonZeroU32;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GeneratedMode {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
}

const STATS_KEY: &str = "stats";

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Stats {
    total_words_refined: u64,
}

/// Get the total words refined (persistent stat)
#[tauri::command]
pub async fn get_total_words_refined(app: AppHandle) -> Result<u64, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let stats: Stats = store
        .get(STATS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(stats.total_words_refined)
}

/// Increment the total words refined counter
fn increment_words_refined(app: &AppHandle, word_count: u64) {
    if let Ok(store) = app.store("settings.json") {
        let mut stats: Stats = store
            .get(STATS_KEY)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        stats.total_words_refined += word_count;

        if let Ok(value) = serde_json::to_value(&stats) {
            store.set(STATS_KEY, value);
            let _ = store.save();
        }
    }
}

/// Core text processing logic (no history/stats) — used by both process_text and process_flow
pub async fn process_text_internal(
    app: &AppHandle,
    text: &str,
    mode_id: &str,
) -> Result<String, String> {
    let process_mode = get_mode_by_id(app, mode_id)?;

    let model_config = match &process_mode.model_override {
        Some(override_config) => override_config.clone(),
        None => get_active_model_config(app.clone())
            .await?
            .ok_or("No active model selected. Please select a model first.")?,
    };

    match model_config {
        ActiveModelConfig::Local { model_id } => {
            run_local_inference(app, &model_id, &process_mode, text).await
        }
        ActiveModelConfig::Cloud { credential_id } => {
            run_api_inference(app, &credential_id, &process_mode, text).await
        }
    }
}

/// Traite le texte avec le modèle actif (local ou cloud)
#[tauri::command]
pub async fn process_text(
    app: AppHandle,
    text: String,
    mode: String,
) -> Result<String, String> {
    let result = process_text_internal(&app, &text, &mode).await;

    // Save to history and increment stats if successful
    if let Ok(ref output) = result {
        let word_count = output.split_whitespace().count() as u64;
        increment_words_refined(&app, word_count);

        // Determine provider type for analytics
        let provider = get_provider_type(&app, &mode).await;
        crate::analytics::track(&app, "text_processed", Some(serde_json::json!({
            "type": "mode",
            "provider": provider,
        })));

        let process_mode = get_mode_by_id(&app, &mode)?;
        let _ = history::add_entry(
            &app,
            text,
            output.clone(),
            process_mode.id.clone(),
            process_mode.name.clone(),
        );
    }

    result
}

#[derive(Clone, serde::Serialize)]
struct FlowStepProgress {
    step_index: usize,
    total_steps: usize,
    mode_name: String,
    status: String, // "processing" | "done"
}

/// Process text through a flow (chain of modes)
#[tauri::command]
pub async fn process_flow(
    app: AppHandle,
    text: String,
    flow_id: String,
) -> Result<String, String> {
    let flow = get_flow_by_id(&app, &flow_id)?;

    if flow.steps.is_empty() {
        return Err("Flow has no steps".to_string());
    }

    let total_steps = flow.steps.len();
    let mut current_text = text.clone();

    for (i, step_mode_id) in flow.steps.iter().enumerate() {
        let mode_name = get_mode_by_id(&app, step_mode_id)
            .map(|m| m.name.clone())
            .unwrap_or_else(|_| step_mode_id.clone());

        // Emit "processing" for this step
        let _ = app.emit("flow-step-progress", FlowStepProgress {
            step_index: i,
            total_steps,
            mode_name: mode_name.clone(),
            status: "processing".to_string(),
        });

        current_text = process_text_internal(&app, &current_text, step_mode_id).await?;

        // Emit "done" for this step
        let _ = app.emit("flow-step-progress", FlowStepProgress {
            step_index: i,
            total_steps,
            mode_name,
            status: "done".to_string(),
        });
    }

    // Save to history and increment stats once at the end
    let word_count = current_text.split_whitespace().count() as u64;
    increment_words_refined(&app, word_count);

    crate::analytics::track(&app, "text_processed", Some(serde_json::json!({
        "type": "flow",
    })));

    let label = format!("Flow: {}", flow.name);
    let _ = history::add_entry(
        &app,
        text,
        current_text.clone(),
        flow.id,
        label,
    );

    Ok(current_text)
}

/// Determine provider type for analytics (returns "local" or the credential provider name)
async fn get_provider_type(app: &AppHandle, mode_id: &str) -> String {
    let mode = match get_mode_by_id(app, mode_id) {
        Ok(m) => m,
        Err(_) => return "unknown".to_string(),
    };

    let config = match &mode.model_override {
        Some(c) => c.clone(),
        None => match get_active_model_config(app.clone()).await {
            Ok(Some(c)) => c,
            _ => return "unknown".to_string(),
        },
    };

    match config {
        ActiveModelConfig::Local { .. } => "local".to_string(),
        ActiveModelConfig::Cloud { credential_id } => {
            crate::credentials::get_credential_by_id(app, &credential_id)
                .map(|c| format!("{:?}", c.provider).to_lowercase())
                .unwrap_or_else(|_| "cloud".to_string())
        }
    }
}

/// Exécute l'inférence locale avec llama-cpp
async fn run_local_inference(
    app: &AppHandle,
    model_id: &str,
    process_mode: &crate::modes::ProcessingMode,
    text: &str,
) -> Result<String, String> {
    // Récupérer le chemin du modèle
    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("models");

    let model_info = crate::model::get_model_by_id(model_id)?;
    let model_path = models_dir.join(&model_info.filename);

    if !model_path.exists() {
        return Err(format!(
            "Model file not found: {}. Please re-download the model.",
            model_path.display()
        ));
    }

    // Construire le prompt
    let prompt = process_mode.build_prompt(text);

    // Exécuter l'inférence dans un thread bloquant
    let result = tokio::task::spawn_blocking(move || {
        run_inference_llama_cpp(model_path, prompt)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

/// Exécute l'inférence via API cloud
async fn run_api_inference(
    app: &AppHandle,
    credential_id: &str,
    process_mode: &crate::modes::ProcessingMode,
    text: &str,
) -> Result<String, String> {
    // Récupérer le credential
    let credential = get_credential_by_id(app, credential_id)?;

    // Récupérer la clé API depuis le Keychain
    let api_key = retrieve_api_key(&credential)?;

    // Construire le prompt utilisateur
    let user_prompt = process_mode.user_prompt_template.replace("{text}", text);

    // Appeler l'API du provider
    run_cloud_inference(
        credential.provider,
        &credential.model_id,
        &api_key,
        &process_mode.system_prompt,
        &user_prompt,
    )
    .await
}

/// Exécute l'inférence avec llama.cpp + Metal
fn run_inference_llama_cpp(model_path: PathBuf, prompt: String) -> Result<String, String> {
    // Initialiser le backend llama.cpp
    let backend = LlamaBackend::init()
        .map_err(|e| format!("Failed to init llama backend: {}", e))?;

    // Paramètres du modèle avec Metal (GPU)
    let model_params = LlamaModelParams::default()
        .with_n_gpu_layers(99); // Mettre toutes les couches sur GPU

    // Charger le modèle
    let model = LlamaModel::load_from_file(&backend, &model_path, &model_params)
        .map_err(|e| format!("Failed to load model: {}", e))?;

    // Paramètres du contexte
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(2048));

    // Créer le contexte
    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    // Tokenizer le prompt
    let tokens = model
        .str_to_token(&prompt, AddBos::Always)
        .map_err(|e| format!("Failed to tokenize: {}", e))?;

    let n_tokens = tokens.len();

    // Créer le batch
    let mut batch = LlamaBatch::new(2048, 1);

    // Ajouter les tokens au batch
    for (i, token) in tokens.iter().enumerate() {
        let is_last = i == n_tokens - 1;
        batch.add(*token, i as i32, &[0], is_last)
            .map_err(|e| format!("Failed to add token to batch: {}", e))?;
    }

    // Évaluer le prompt
    ctx.decode(&mut batch)
        .map_err(|e| format!("Failed to decode prompt: {}", e))?;

    // Générer les tokens
    let mut output_tokens = Vec::new();
    let max_tokens = 512;
    let mut n_cur = n_tokens;

    for _ in 0..max_tokens {
        // Obtenir les logits
        let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
        let mut candidates_array = LlamaTokenDataArray::from_iter(candidates, false);

        // Utiliser greedy sampling (le plus probable)
        let new_token = candidates_array.sample_token_greedy();

        // Vérifier si c'est la fin
        if model.is_eog_token(new_token) {
            break;
        }

        output_tokens.push(new_token);

        // Préparer le prochain batch
        batch.clear();
        batch.add(new_token, n_cur as i32, &[0], true)
            .map_err(|e| format!("Failed to add token: {}", e))?;

        n_cur += 1;

        // Décoder
        ctx.decode(&mut batch)
            .map_err(|e| format!("Failed to decode: {}", e))?;
    }

    // Convertir les tokens en texte
    let mut output = String::new();
    for token in output_tokens {
        if let Ok(bytes) = model.token_to_piece_bytes(token, 64, false, None) {
            if let Ok(s) = String::from_utf8(bytes) {
                output.push_str(&s);
            }
        }
    }

    Ok(output.trim().to_string())
}

const GENERATE_MODE_SYSTEM_PROMPT: &str = r#"You are a mode configuration generator for a text processing app. Given the user's description, generate a JSON object with these exact fields:
- "name": short uppercase name (1-3 words, e.g. "SUMMARIZE", "TO FRENCH")
- "description": brief description (1 sentence)
- "system_prompt": detailed instructions for the AI (2-5 sentences). IMPORTANT: the system_prompt MUST always instruct the AI to output ONLY the raw processed text, with no introductory phrases, no quotes, no explanations, no preamble like "Sure, here's..." or "Here is...". Just the direct result.
- "user_prompt_template": template string using {text} as placeholder for user input

Output ONLY the JSON object, no markdown, no explanation."#;

/// Generate a mode configuration from a user description using AI
#[tauri::command]
pub async fn generate_mode(app: AppHandle, description: String) -> Result<GeneratedMode, String> {
    let model_config = get_active_model_config(app.clone())
        .await?
        .ok_or("No active model configured. Please set up a model first in Settings.")?;

    let raw_output = match model_config {
        ActiveModelConfig::Local { model_id } => {
            let models_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?
                .join("models");

            let model_info = crate::model::get_model_by_id(&model_id)?;
            let model_path = models_dir.join(&model_info.filename);

            if !model_path.exists() {
                return Err(format!(
                    "Model file not found: {}. Please re-download the model.",
                    model_path.display()
                ));
            }

            let prompt = format!(
                "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
                GENERATE_MODE_SYSTEM_PROMPT, description
            );

            tokio::task::spawn_blocking(move || run_inference_llama_cpp(model_path, prompt))
                .await
                .map_err(|e| format!("Task failed: {}", e))??
        }
        ActiveModelConfig::Cloud { credential_id } => {
            let credential = get_credential_by_id(&app, &credential_id)?;
            let api_key = retrieve_api_key(&credential)?;

            run_cloud_inference(
                credential.provider,
                &credential.model_id,
                &api_key,
                GENERATE_MODE_SYSTEM_PROMPT,
                &description,
            )
            .await?
        }
    };

    // Extract JSON from the response (handle potential markdown wrapping)
    let json_str = extract_json(&raw_output).ok_or_else(|| {
        format!(
            "Failed to parse AI response as JSON. Raw response: {}",
            raw_output
        )
    })?;

    serde_json::from_str::<GeneratedMode>(&json_str).map_err(|e| {
        format!(
            "Invalid mode format in AI response: {}. Raw response: {}",
            e, raw_output
        )
    })
}

/// Extract a JSON object from a string, handling potential markdown code blocks
fn extract_json(text: &str) -> Option<String> {
    let trimmed = text.trim();

    // Try direct parse first
    if trimmed.starts_with('{') {
        if let Some(end) = find_matching_brace(trimmed) {
            return Some(trimmed[..=end].to_string());
        }
    }

    // Try extracting from markdown code block
    if let Some(start) = trimmed.find("```") {
        let after_backticks = &trimmed[start + 3..];
        // Skip optional language identifier (e.g. ```json)
        let content_start = after_backticks.find('\n').map(|i| i + 1).unwrap_or(0);
        let content = &after_backticks[content_start..];
        if let Some(end_backticks) = content.find("```") {
            let json_part = content[..end_backticks].trim();
            if json_part.starts_with('{') {
                return Some(json_part.to_string());
            }
        }
    }

    // Try finding first { and last }
    let first_brace = trimmed.find('{')?;
    let last_brace = trimmed.rfind('}')?;
    if first_brace < last_brace {
        Some(trimmed[first_brace..=last_brace].to_string())
    } else {
        None
    }
}

/// Find the index of the matching closing brace for the opening brace at index 0
fn find_matching_brace(s: &str) -> Option<usize> {
    let mut depth = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in s.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape_next = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}
