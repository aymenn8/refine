use crate::window::activate_previous_app;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Applique le texte de remplacement dans le clipboard et cache la fenêtre principale
///
/// Cette commande est appelée lorsque l'utilisateur sélectionne un texte de remplacement.
/// Le texte est copié dans le clipboard système et la fenêtre spotlight est cachée.
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `text` - Texte à copier dans le clipboard
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn apply_replacement(app: AppHandle, text: String) -> Result<(), String> {
    // Écrire le texte dans le clipboard
    app.clipboard()
        .write_text(&text)
        .map_err(|e| e.to_string())?;

    // Cacher la fenêtre
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    Ok(())
}

/// Cache la fenêtre principale (spotlight)
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Affiche la fenêtre principale (spotlight) et la centre à l'écran
///
/// Cette commande centre la fenêtre, lui donne le focus et émet un événement
/// "text-captured" avec une chaîne vide pour réinitialiser l'interface.
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
        let _ = window.emit("text-captured", String::new());
    }
    Ok(())
}

/// Affiche la fenêtre des paramètres et lui donne le focus
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn show_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

/// Cache la fenêtre des paramètres
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn hide_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.hide();
    }
    Ok(())
}

/// Minimise la fenêtre des paramètres dans le dock
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn minimize_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Colle le texte dans l'application précédente
///
/// Cette commande :
/// 1. Écrit le texte dans le clipboard
/// 2. Cache la fenêtre Refine
/// 3. Attend 150ms pour que macOS redonne le focus à l'app précédente
/// 4. Simule Cmd+V pour coller le texte
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `text` - Texte à coller
///
/// # Returns
/// * `Ok(())` si l'opération réussit
/// * `Err(String)` si une erreur se produit
#[tauri::command]
pub async fn paste_to_previous_app(app: AppHandle, text: String) -> Result<(), String> {
    // Écrire le texte dans le clipboard
    app.clipboard()
        .write_text(&text)
        .map_err(|e| e.to_string())?;

    // Cacher la fenêtre
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    // Exécuter le paste dans un thread séparé pour ne pas bloquer
    tokio::task::spawn_blocking(move || {
        // Réactiver l'application précédente
        activate_previous_app();

        // Attendre que l'app précédente soit bien active
        thread::sleep(Duration::from_millis(100));

        // Simuler Cmd+V pour coller
        if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
            let _ = enigo.key(Key::Meta, Direction::Press);
            thread::sleep(Duration::from_millis(10));
            let _ = enigo.key(Key::Unicode('v'), Direction::Click);
            thread::sleep(Duration::from_millis(10));
            let _ = enigo.key(Key::Meta, Direction::Release);
        }
    })
    .await
    .map_err(|e| format!("Failed to paste: {}", e))?;

    Ok(())
}
