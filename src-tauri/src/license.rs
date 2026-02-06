use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const LICENSE_KEY: &str = "licenseData";

/// HMAC secret key embedded in the binary — prevents trivial editing of settings.json.
/// In production, consider using a more complex derivation or obfuscation.
const HMAC_SECRET: &[u8] = b"refine-app-license-hmac-secret-k3y-2024";

// --- Re-validation intervals ---
const REVALIDATION_INTERVAL_SUBSCRIPTION: i64 = 3 * 24 * 60 * 60; // 3 days
const REVALIDATION_INTERVAL_LIFETIME: i64 = 30 * 24 * 60 * 60; // 30 days
const GRACE_PERIOD: i64 = 7 * 24 * 60 * 60; // 7 days offline grace

// =============================================================================
// Feature gate system — single source of truth for premium restrictions
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    CustomModes,
    ApiKeys,
    Ollama,
    Flows,
    ExtraQuickActions, // more than 1 quick action
}

impl Feature {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "custom_modes" => Some(Feature::CustomModes),
            "api_keys" => Some(Feature::ApiKeys),
            "ollama" => Some(Feature::Ollama),
            "flows" => Some(Feature::Flows),
            "extra_quick_actions" => Some(Feature::ExtraQuickActions),
            _ => None,
        }
    }
}

/// Single source of truth: what's available without a license.
/// To change restrictions, only edit this function.
pub fn is_feature_free(feature: &Feature) -> bool {
    match feature {
        Feature::CustomModes => false,
        Feature::ApiKeys => false,
        Feature::Ollama => false,
        Feature::Flows => false,
        Feature::ExtraQuickActions => false,
    }
}

/// Check if a feature is available given the current license status.
pub fn is_feature_available(feature: &Feature, has_license: bool) -> bool {
    if has_license {
        return true;
    }
    is_feature_free(feature)
}

/// Convenience: check a feature from an AppHandle. Returns Ok(()) or a premium-required error.
pub fn require_feature(app: &AppHandle, feature: Feature) -> Result<(), String> {
    let has_license = has_active_license(app);
    if is_feature_available(&feature, has_license) {
        Ok(())
    } else {
        Err(format!("__PREMIUM_REQUIRED__:{:?}", feature))
    }
}

// =============================================================================
// License data model
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license_key: String,
    pub status: String, // "active", "expired", "invalid"
    pub license_type: String, // "monthly", "yearly", "lifetime"
    pub activated_at: i64,
    pub last_validated_at: i64,
    pub hmac_signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub is_active: bool,
    pub license_type: Option<String>,
    pub needs_revalidation: bool,
}

// =============================================================================
// HMAC signing — anti-tampering
// =============================================================================

type HmacSha256 = Hmac<Sha256>;

fn compute_hmac(license: &LicenseInfo) -> String {
    let payload = format!(
        "{}:{}:{}:{}:{}",
        license.license_key,
        license.status,
        license.license_type,
        license.activated_at,
        license.last_validated_at
    );
    let mut mac =
        HmacSha256::new_from_slice(HMAC_SECRET).expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

fn verify_hmac(license: &LicenseInfo) -> bool {
    let expected = compute_hmac(license);
    expected == license.hmac_signature
}

/// Simple hex encoding (avoids adding another dependency)
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}

// =============================================================================
// Store helpers
// =============================================================================

fn get_license_from_store(app: &AppHandle) -> Option<LicenseInfo> {
    let store = app.store("settings.json").ok()?;
    let value = store.get(LICENSE_KEY)?;
    let license: LicenseInfo = serde_json::from_value(value.clone()).ok()?;

    // Verify HMAC — if tampered, treat as no license
    if !verify_hmac(&license) {
        println!("[license] HMAC verification failed — ignoring stored license");
        return None;
    }

    Some(license)
}

fn save_license_to_store(app: &AppHandle, license: &LicenseInfo) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.set(
        LICENSE_KEY,
        serde_json::to_value(license).map_err(|e| format!("Failed to serialize license: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

fn clear_license_from_store(app: &AppHandle) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    store.delete(LICENSE_KEY);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

// =============================================================================
// License logic
// =============================================================================

/// Check if the user currently has an active license (cached, offline-safe).
pub fn has_active_license(app: &AppHandle) -> bool {
    let license = match get_license_from_store(app) {
        Some(l) => l,
        None => return false,
    };

    if license.status != "active" {
        return false;
    }

    // For subscriptions, check grace period
    if license.license_type != "lifetime" {
        let now = Utc::now().timestamp();
        let since_last_validation = now - license.last_validated_at;
        let revalidation_interval = REVALIDATION_INTERVAL_SUBSCRIPTION;
        let max_allowed = revalidation_interval + GRACE_PERIOD;

        if since_last_validation > max_allowed {
            println!(
                "[license] Subscription expired grace period ({} seconds since last validation)",
                since_last_validation
            );
            return false;
        }
    }

    true
}

fn needs_revalidation(license: &LicenseInfo) -> bool {
    let now = Utc::now().timestamp();
    let interval = if license.license_type == "lifetime" {
        REVALIDATION_INTERVAL_LIFETIME
    } else {
        REVALIDATION_INTERVAL_SUBSCRIPTION
    };
    (now - license.last_validated_at) > interval
}

// =============================================================================
// Lemon Squeezy API
// =============================================================================

#[derive(Debug, Deserialize)]
struct LemonSqueezyValidateResponse {
    valid: bool,
    meta: Option<LemonSqueezyMeta>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyMeta {
    variant_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyActivateResponse {
    activated: bool,
    meta: Option<LemonSqueezyMeta>,
    error: Option<String>,
}

async fn activate_with_lemon_squeezy(license_key: &str) -> Result<(bool, String), String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.lemonsqueezy.com/v1/licenses/activate")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "license_key": license_key,
            "instance_name": "Refine Desktop"
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let body: LemonSqueezyActivateResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !body.activated {
        let msg = body.error.unwrap_or_else(|| "Activation failed".to_string());
        return Err(msg);
    }

    // Determine license type from variant name
    let license_type = determine_license_type(
        body.meta
            .as_ref()
            .and_then(|m| m.variant_name.as_deref())
            .unwrap_or(""),
    );

    Ok((true, license_type))
}

async fn validate_with_lemon_squeezy(license_key: &str) -> Result<(bool, String), String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.lemonsqueezy.com/v1/licenses/validate")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "license_key": license_key,
            "instance_name": "Refine Desktop"
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let body: LemonSqueezyValidateResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if !body.valid {
        let msg = body
            .error
            .unwrap_or_else(|| "License is no longer valid".to_string());
        return Err(msg);
    }

    let license_type = determine_license_type(
        body.meta
            .as_ref()
            .and_then(|m| m.variant_name.as_deref())
            .unwrap_or(""),
    );

    Ok((true, license_type))
}

/// Map Lemon Squeezy variant name to our license type.
/// Adjust the matching strings to match your actual Lemon Squeezy product variant names.
fn determine_license_type(variant_name: &str) -> String {
    let lower = variant_name.to_lowercase();
    if lower.contains("lifetime") {
        "lifetime".to_string()
    } else if lower.contains("yearly") || lower.contains("annual") {
        "yearly".to_string()
    } else {
        "monthly".to_string()
    }
}

async fn deactivate_with_lemon_squeezy(license_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.lemonsqueezy.com/v1/licenses/deactivate")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "license_key": license_key,
            "instance_name": "Refine Desktop"
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        return Err("Failed to deactivate license".to_string());
    }

    Ok(())
}

// =============================================================================
// Tauri commands
// =============================================================================

/// Get current license status (for frontend)
#[tauri::command]
pub async fn get_license_status(app: AppHandle) -> Result<LicenseStatus, String> {
    let license = get_license_from_store(&app);

    match license {
        Some(ref l) if l.status == "active" => {
            let active = has_active_license(&app);
            Ok(LicenseStatus {
                is_active: active,
                license_type: Some(l.license_type.clone()),
                needs_revalidation: active && needs_revalidation(l),
            })
        }
        _ => Ok(LicenseStatus {
            is_active: false,
            license_type: None,
            needs_revalidation: false,
        }),
    }
}

/// Activate a license key via Lemon Squeezy
#[tauri::command]
pub async fn activate_license(app: AppHandle, license_key: String) -> Result<LicenseStatus, String> {
    let key = license_key.trim().to_string();
    if key.is_empty() {
        return Err("Please enter a license key".to_string());
    }

    println!("[license] Activating license...");

    let (valid, license_type) = activate_with_lemon_squeezy(&key).await?;

    if !valid {
        return Err("Invalid license key".to_string());
    }

    let now = Utc::now().timestamp();
    let mut license = LicenseInfo {
        license_key: key,
        status: "active".to_string(),
        license_type: license_type.clone(),
        activated_at: now,
        last_validated_at: now,
        hmac_signature: String::new(),
    };

    // Sign the license data
    license.hmac_signature = compute_hmac(&license);

    // Save to store
    save_license_to_store(&app, &license)?;

    println!("[license] License activated successfully (type: {})", license_type);

    crate::analytics::track(&app, "license_activated", Some(serde_json::json!({
        "type": license_type,
    })));

    Ok(LicenseStatus {
        is_active: true,
        license_type: Some(license_type),
        needs_revalidation: false,
    })
}

/// Deactivate the current license
#[tauri::command]
pub async fn deactivate_license(app: AppHandle) -> Result<(), String> {
    // Try to deactivate on Lemon Squeezy first
    if let Some(license) = get_license_from_store(&app) {
        let _ = deactivate_with_lemon_squeezy(&license.license_key).await;
    }

    clear_license_from_store(&app)?;

    println!("[license] License deactivated");

    Ok(())
}

/// Re-validate the current license (called periodically or manually)
#[tauri::command]
pub async fn revalidate_license(app: AppHandle) -> Result<LicenseStatus, String> {
    let license = get_license_from_store(&app)
        .ok_or("No license to revalidate")?;

    println!("[license] Re-validating license...");

    match validate_with_lemon_squeezy(&license.license_key).await {
        Ok((valid, license_type)) => {
            if valid {
                let now = Utc::now().timestamp();
                let mut updated = LicenseInfo {
                    license_key: license.license_key,
                    status: "active".to_string(),
                    license_type: license_type.clone(),
                    activated_at: license.activated_at,
                    last_validated_at: now,
                    hmac_signature: String::new(),
                };
                updated.hmac_signature = compute_hmac(&updated);
                save_license_to_store(&app, &updated)?;

                println!("[license] Re-validation successful");

                Ok(LicenseStatus {
                    is_active: true,
                    license_type: Some(license_type),
                    needs_revalidation: false,
                })
            } else {
                // License no longer valid — clear it
                clear_license_from_store(&app)?;
                Ok(LicenseStatus {
                    is_active: false,
                    license_type: None,
                    needs_revalidation: false,
                })
            }
        }
        Err(e) => {
            // Network error — don't clear, rely on grace period
            println!("[license] Re-validation failed (network?): {}", e);
            Ok(LicenseStatus {
                is_active: has_active_license(&app),
                license_type: Some(license.license_type),
                needs_revalidation: true,
            })
        }
    }
}

/// Check if a specific feature is accessible (for frontend)
#[tauri::command]
pub async fn check_feature_access(app: AppHandle, feature: String) -> Result<bool, String> {
    let feat = Feature::from_str(&feature)
        .ok_or_else(|| format!("Unknown feature: {}", feature))?;
    let has_license = has_active_license(&app);
    Ok(is_feature_available(&feat, has_license))
}
