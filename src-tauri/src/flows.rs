use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const FLOWS_KEY: &str = "processingFlows";
const MAX_PINNED_FLOWS: usize = 3;

/// A processing flow that chains multiple modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<String>, // mode_ids
    #[serde(default)]
    pub is_pinned: bool,
}

/// Get all flows from store
#[tauri::command]
pub async fn get_flows(app: AppHandle) -> Result<Vec<Flow>, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let flows: Vec<Flow> = store
        .get(FLOWS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    Ok(flows)
}

/// Save a flow (add or update)
#[tauri::command]
pub async fn save_flow(app: AppHandle, flow: Flow) -> Result<(), String> {
    if flow.steps.is_empty() {
        return Err("A flow must have at least one step".to_string());
    }

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut flows: Vec<Flow> = store
        .get(FLOWS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    if let Some(existing) = flows.iter_mut().find(|f| f.id == flow.id) {
        *existing = flow;
    } else {
        flows.push(flow);
    }

    store.set(
        FLOWS_KEY,
        serde_json::to_value(&flows).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Delete a flow by ID
#[tauri::command]
pub async fn delete_flow(app: AppHandle, flow_id: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut flows: Vec<Flow> = store
        .get(FLOWS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    flows.retain(|f| f.id != flow_id);

    store.set(
        FLOWS_KEY,
        serde_json::to_value(&flows).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Toggle pin status for a flow
#[tauri::command]
pub async fn toggle_pin_flow(app: AppHandle, flow_id: String) -> Result<(), String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let mut flows: Vec<Flow> = store
        .get(FLOWS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let flow = flows.iter().find(|f| f.id == flow_id)
        .ok_or_else(|| format!("Flow not found: {}", flow_id))?;

    let currently_pinned = flow.is_pinned;
    let pinned_count = flows.iter().filter(|f| f.is_pinned).count();

    if !currently_pinned && pinned_count >= MAX_PINNED_FLOWS {
        return Err(format!("Cannot pin more than {} flows", MAX_PINNED_FLOWS));
    }

    if let Some(flow) = flows.iter_mut().find(|f| f.id == flow_id) {
        flow.is_pinned = !flow.is_pinned;
    }

    store.set(
        FLOWS_KEY,
        serde_json::to_value(&flows).map_err(|e| format!("Failed to serialize: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Get a flow by ID (internal use, not a command)
pub fn get_flow_by_id(app: &AppHandle, flow_id: &str) -> Result<Flow, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("Failed to load store: {}", e))?;

    let flows: Vec<Flow> = store
        .get(FLOWS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    flows
        .into_iter()
        .find(|f| f.id == flow_id)
        .ok_or_else(|| format!("Flow not found: {}", flow_id))
}
