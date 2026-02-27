use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use keyring::Entry;
use uuid::Uuid;
use chrono::Utc;

const CREDENTIALS_KEY: &str = "apiCredentials";
const SERVICE_NAME: &str = "com.refine";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    OpenAI,
    Anthropic,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCredential {
    pub id: String,
    pub provider: Provider,
    pub model_id: String,
    pub display_name: String,
    pub created_at: i64,
}

impl ApiCredential {
    pub fn new(provider: Provider, model_id: String, display_name: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            provider,
            model_id,
            display_name,
            created_at: Utc::now().timestamp(),
        }
    }

    fn keyring_username(&self) -> String {
        format!("api_key_{}", self.id)
    }
}

/// Get keyring entry for a credential
fn get_keyring_entry(credential: &ApiCredential) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, &credential.keyring_username())
        .map_err(|e| format!("Failed to create keyring entry: {}", e))
}

/// Store API key in macOS Keychain
fn store_api_key(credential: &ApiCredential, api_key: &str) -> Result<(), String> {
    let entry = get_keyring_entry(credential)?;
    entry
        .set_password(api_key)
        .map_err(|e| format!("Failed to store API key in keychain: {}", e))
}

/// Retrieve API key from macOS Keychain
pub fn retrieve_api_key(credential: &ApiCredential) -> Result<String, String> {
    let entry = get_keyring_entry(credential)?;
    entry
        .get_password()
        .map_err(|e| format!("Failed to retrieve API key from keychain: {}", e))
}

/// Delete API key from macOS Keychain
fn delete_api_key(credential: &ApiCredential) -> Result<(), String> {
    let entry = get_keyring_entry(credential)?;
    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete API key from keychain: {}", e))
}

/// Get all credentials from store
fn get_credentials_from_store(app: &AppHandle) -> Result<Vec<ApiCredential>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let credentials: Vec<ApiCredential> = store
        .get(CREDENTIALS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(credentials)
}

/// Save credentials to store
fn save_credentials_to_store(app: &AppHandle, credentials: &[ApiCredential]) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set(
        CREDENTIALS_KEY,
        serde_json::to_value(credentials).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))
}

/// Save a new API credential
#[tauri::command]
pub async fn save_api_credential(
    app: AppHandle,
    provider: Provider,
    model_id: String,
    display_name: String,
    api_key: String,
) -> Result<ApiCredential, String> {
    println!("[save_api_credential] Saving credential for {:?} - {}", provider, model_id);

    // Create new credential
    let credential = ApiCredential::new(provider, model_id, display_name);

    // Store API key (or Ollama URL) in Keychain
    store_api_key(&credential, &api_key)?;

    // Get existing credentials and add new one
    let mut credentials = get_credentials_from_store(&app)?;
    credentials.push(credential.clone());

    // Save to store
    save_credentials_to_store(&app, &credentials)?;

    println!("[save_api_credential] Credential saved successfully with id: {}", credential.id);

    Ok(credential)
}

/// Get all API credentials (without API keys)
#[tauri::command]
pub async fn get_api_credentials(app: AppHandle) -> Result<Vec<ApiCredential>, String> {
    get_credentials_from_store(&app)
}

/// Delete an API credential
#[tauri::command]
pub async fn delete_api_credential(app: AppHandle, credential_id: String) -> Result<(), String> {
    println!("[delete_api_credential] Deleting credential: {}", credential_id);

    let mut credentials = get_credentials_from_store(&app)?;

    // Find the credential to delete
    let credential = credentials
        .iter()
        .find(|c| c.id == credential_id)
        .cloned()
        .ok_or_else(|| "Credential not found".to_string())?;

    // Delete API key from Keychain
    if let Err(e) = delete_api_key(&credential) {
        println!("[delete_api_credential] Warning: failed to delete from keychain: {}", e);
    }

    // Remove from list
    credentials.retain(|c| c.id != credential_id);

    // Save updated list
    save_credentials_to_store(&app, &credentials)?;

    println!("[delete_api_credential] Credential deleted successfully");

    Ok(())
}

/// Get a specific credential by ID
pub fn get_credential_by_id(app: &AppHandle, credential_id: &str) -> Result<ApiCredential, String> {
    let credentials = get_credentials_from_store(app)?;
    credentials
        .into_iter()
        .find(|c| c.id == credential_id)
        .ok_or_else(|| format!("Credential not found: {}", credential_id))
}
