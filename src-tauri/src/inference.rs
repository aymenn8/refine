use crate::credentials::{get_credential_by_id, retrieve_api_key};
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
use tauri::{AppHandle, Manager};

/// Traite le texte avec le modèle actif (local ou cloud)
#[tauri::command]
pub async fn process_text(
    app: AppHandle,
    text: String,
    mode: String,
) -> Result<String, String> {
    // Récupérer le mode depuis le storage
    let process_mode = get_mode_by_id(&app, &mode)?;

    // Utiliser le model_override du mode si défini, sinon le modèle par défaut
    let model_config = match &process_mode.model_override {
        Some(override_config) => override_config.clone(),
        None => get_active_model_config(app.clone())
            .await?
            .ok_or("No active model selected. Please select a model first.")?,
    };

    let result = match model_config {
        ActiveModelConfig::Local { model_id } => {
            // Inférence locale avec llama-cpp
            run_local_inference(&app, &model_id, &process_mode, &text).await
        }
        ActiveModelConfig::Cloud { credential_id } => {
            // Inférence cloud via API
            run_api_inference(&app, &credential_id, &process_mode, &text).await
        }
    };

    // Save to history if successful
    if let Ok(ref output) = result {
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
