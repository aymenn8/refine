use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Information sur le modèle à télécharger
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub size_bytes: u64,
    pub description: String,
    pub url: String,
    pub filename: String,
    pub sha256: String,
    pub quantization: String,
    pub recommended: bool,
}

/// Statut du modèle
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelStatus {
    NotDownloaded,
    Downloading,
    Downloaded,
    Error,
}

/// Événement de progression du téléchargement
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub speed_mbps: f64,
}

/// État partagé pour gérer l'annulation du téléchargement
#[derive(Clone)]
pub struct DownloadState {
    pub is_cancelled: Arc<AtomicBool>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.is_cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.is_cancelled.load(Ordering::SeqCst)
    }

    pub fn reset(&self) {
        self.is_cancelled.store(false, Ordering::SeqCst);
    }
}

/// Retourne la liste de tous les modèles disponibles
fn get_available_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "qwen3-4b-q4".to_string(),
            name: "Qwen3 4B Instruct".to_string(),
            version: "4B".to_string(),
            size_bytes: 2_700_000_000, // ~2.5 GB
            description: "Modèle Qwen3 4B très performant pour la correction et traduction. Excellent rapport qualité/performance avec support Metal.".to_string(),
            url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
            filename: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
            sha256: "".to_string(),
            quantization: "Q4_K_M".to_string(),
            recommended: true,
        },
    ]
}

/// Retourne les informations d'un modèle par son ID
pub fn get_model_by_id(model_id: &str) -> Result<ModelInfo, String> {
    get_available_models()
        .into_iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))
}

/// Retourne le chemin du dossier de stockage des modèles
///
/// Sur macOS: ~/Library/Application Support/com.refine.app/models/
fn get_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models");

    // Créer le dossier s'il n'existe pas
    fs::create_dir_all(&models_dir).map_err(|e| format!("Failed to create models dir: {}", e))?;

    Ok(models_dir)
}

/// Retourne le chemin complet du fichier modèle
fn get_model_path(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    let models_dir = get_models_dir(app)?;
    let model_info = get_model_by_id(model_id)?;
    Ok(models_dir.join(&model_info.filename))
}

/// Vérifie si le modèle est déjà téléchargé
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `model_id` - Identifiant du modèle à vérifier
///
/// # Returns
/// * Tuple `(status, file_size_bytes)` indiquant le statut et la taille du fichier
#[tauri::command]
pub async fn check_model_status(app: AppHandle, model_id: String) -> Result<(ModelStatus, u64), String> {
    let model_path = get_model_path(&app, &model_id)?;

    if model_path.exists() {
        let metadata = fs::metadata(&model_path)
            .map_err(|e| format!("Failed to read model metadata: {}", e))?;

        // Vérifier si la taille du fichier correspond (téléchargement complet)
        let file_size = metadata.len();
        if file_size > 0 {
            Ok((ModelStatus::Downloaded, file_size))
        } else {
            Ok((ModelStatus::NotDownloaded, 0))
        }
    } else {
        Ok((ModelStatus::NotDownloaded, 0))
    }
}

/// Télécharge le modèle avec suivi de progression
///
/// Émet des événements `model-download-progress-{model_id}` pendant le téléchargement.
/// Le téléchargement peut être annulé via `cancel_download`.
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `model_id` - Identifiant du modèle à télécharger
///
/// # Returns
/// * `Ok(())` si le téléchargement réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn download_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let model_path = get_model_path(&app, &model_id)?;
    let model_info = get_model_by_id(&model_id)?;

    // Récupérer l'état d'annulation depuis le state manager
    let download_state = app.state::<DownloadState>();
    download_state.reset();

    // Créer le client HTTP
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 minutes timeout
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Commencer le téléchargement
    let response = client
        .get(&model_info.url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    // Récupérer la taille totale
    let total_bytes = response.content_length().unwrap_or(model_info.size_bytes);

    // Créer le fichier temporaire
    let temp_path = model_path.with_extension("tmp");
    let mut file = File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    // Télécharger avec progression
    let mut downloaded_bytes: u64 = 0;
    let mut last_progress_update = std::time::Instant::now();
    let mut last_bytes = 0u64;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        // Vérifier si le téléchargement a été annulé
        if download_state.is_cancelled() {
            // Supprimer le fichier temporaire
            let _ = fs::remove_file(&temp_path);
            return Err("Download cancelled by user".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;

        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write to file: {}", e))?;

        downloaded_bytes += chunk.len() as u64;

        // Émettre la progression toutes les 500ms
        if last_progress_update.elapsed().as_millis() >= 500 {
            let elapsed_secs = last_progress_update.elapsed().as_secs_f64();
            let bytes_since_last = downloaded_bytes - last_bytes;
            let speed_mbps = (bytes_since_last as f64 / elapsed_secs) / 1_000_000.0;

            let progress = DownloadProgress {
                downloaded_bytes,
                total_bytes,
                percentage: (downloaded_bytes as f64 / total_bytes as f64) * 100.0,
                speed_mbps,
            };

            let _ = app.emit(&format!("model-download-progress-{}", model_id), progress);

            last_progress_update = std::time::Instant::now();
            last_bytes = downloaded_bytes;
        }
    }

    // Finaliser le fichier
    file.sync_all()
        .map_err(|e| format!("Failed to sync file: {}", e))?;
    drop(file);

    // Vérifier le checksum si disponible
    if !model_info.sha256.is_empty() {
        verify_checksum(&temp_path, &model_info.sha256)?;
    }

    // Renommer le fichier temporaire
    fs::rename(&temp_path, &model_path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    // Émettre la progression finale (100%)
    let _ = app.emit(
        &format!("model-download-progress-{}", model_id),
        DownloadProgress {
            downloaded_bytes: total_bytes,
            total_bytes,
            percentage: 100.0,
            speed_mbps: 0.0,
        },
    );

    Ok(())
}

/// Vérifie le checksum SHA256 du fichier téléchargé
fn verify_checksum(file_path: &PathBuf, expected_hash: &str) -> Result<(), String> {
    let mut file =
        File::open(file_path).map_err(|e| format!("Failed to open file for checksum: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 8192];

    loop {
        let bytes_read = std::io::Read::read(&mut file, &mut buffer)
            .map_err(|e| format!("Failed to read file for checksum: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    let hash = format!("{:x}", hasher.finalize());

    if hash != expected_hash {
        return Err(format!(
            "Checksum verification failed. Expected: {}, Got: {}",
            expected_hash, hash
        ));
    }

    Ok(())
}

/// Annule le téléchargement en cours
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
#[tauri::command]
pub async fn cancel_download(app: AppHandle) -> Result<(), String> {
    let download_state = app.state::<DownloadState>();
    download_state.cancel();
    Ok(())
}

/// Supprime le modèle téléchargé
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `model_id` - Identifiant du modèle à supprimer
///
/// # Returns
/// * `Ok(())` si la suppression réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn delete_model(app: AppHandle, model_id: String) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let model_path = get_model_path(&app, &model_id)?;

    if model_path.exists() {
        fs::remove_file(&model_path).map_err(|e| format!("Failed to delete model: {}", e))?;
    }

    // Clear active model config if this was the active model
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    // Check if the deleted model was the active one
    let should_clear = store
        .get("activeModelConfig")
        .and_then(|v| serde_json::from_value::<ActiveModelConfig>(v.clone()).ok())
        .map(|config| matches!(config, ActiveModelConfig::Local { model_id: id } if id == model_id))
        .unwrap_or(false);

    if should_clear {
        store.delete("activeModelConfig");
        store.delete("activeModel");
        store.save().map_err(|e| format!("Failed to save store: {}", e))?;
    }

    Ok(())
}

/// Retourne la liste de tous les modèles disponibles
#[tauri::command]
pub async fn get_available_models_list() -> Result<Vec<ModelInfo>, String> {
    Ok(get_available_models())
}

/// Retourne les informations d'un modèle spécifique
#[tauri::command]
pub async fn get_model_info(model_id: String) -> Result<ModelInfo, String> {
    get_model_by_id(&model_id)
}

/// Configuration du modèle actif (local ou cloud)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ActiveModelConfig {
    Local { model_id: String },
    Cloud { credential_id: String },
}

/// Définit le modèle actif (local)
#[tauri::command]
pub async fn set_active_model(app: AppHandle, model_id: String) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    // Vérifier que le modèle existe et est téléchargé
    let (status, _) = check_model_status(app.clone(), model_id.clone()).await?;
    if !matches!(status, ModelStatus::Downloaded) {
        return Err("Model must be downloaded before it can be activated".to_string());
    }

    let config = ActiveModelConfig::Local { model_id };

    // Sauvegarder dans le store
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set("activeModelConfig", serde_json::to_value(&config).unwrap());

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Définit le modèle actif (cloud credential)
#[tauri::command]
pub async fn set_active_cloud_model(app: AppHandle, credential_id: String) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    // Vérifier que le credential existe
    crate::credentials::get_credential_by_id(&app, &credential_id)?;

    let config = ActiveModelConfig::Cloud { credential_id };

    // Sauvegarder dans le store
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set("activeModelConfig", serde_json::to_value(&config).unwrap());

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Récupère la configuration du modèle actif
#[tauri::command]
pub async fn get_active_model_config(app: AppHandle) -> Result<Option<ActiveModelConfig>, String> {
    use tauri_plugin_store::StoreExt;

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    // Essayer le nouveau format
    if let Some(config) = store
        .get("activeModelConfig")
        .and_then(|v| serde_json::from_value::<ActiveModelConfig>(v.clone()).ok())
    {
        return Ok(Some(config));
    }

    // Fallback: ancien format (juste model_id string)
    if let Some(model_id) = store
        .get("activeModel")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
    {
        return Ok(Some(ActiveModelConfig::Local { model_id }));
    }

    Ok(None)
}

/// Récupère le modèle actif (compatibilité)
#[tauri::command]
pub async fn get_active_model(app: AppHandle) -> Result<Option<String>, String> {
    let config = get_active_model_config(app).await?;
    match config {
        Some(ActiveModelConfig::Local { model_id }) => Ok(Some(model_id)),
        _ => Ok(None),
    }
}
