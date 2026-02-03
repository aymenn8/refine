//! # Refine App - Application de correction et traduction de texte
//!
//! Cette application macOS permet de capturer rapidement du texte sélectionné,
//! de le corriger ou de le traduire, et de remplacer le texte original.
//!
//! ## Architecture
//! - `commands` : Commandes Tauri pour gérer les fenêtres
//! - `shortcuts` : Gestion des raccourcis clavier globaux
//! - `state` : Structures d'état partagées
//! - `tray` : Configuration du system tray (icône barre de menu)
//! - `window` : Logique de capture et affichage du spotlight

// Modules
mod commands;
mod shortcuts;
mod state;
mod tray;
mod window;

use state::GlobalShortcutState;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

/// Point d'entrée principal de l'application Tauri
///
/// Configure et lance l'application avec tous ses plugins et handlers :
/// - Plugin clipboard pour gérer le presse-papier
/// - Plugin store pour persister les paramètres
/// - Plugin global shortcut pour les raccourcis clavier système
/// - Vibrancy effect pour le design macOS
/// - System tray pour l'icône dans la barre de menu
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::capture_and_show(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::apply_replacement,
            commands::hide_window,
            commands::show_main_window,
            commands::show_settings_window,
            commands::hide_settings_window,
            commands::minimize_settings_window,
            shortcuts::update_global_shortcut,
            shortcuts::get_global_shortcut
        ])
        .setup(move |app| {
            // Charger le raccourci depuis le store
            let shortcut = shortcuts::load_shortcut_from_store(app.handle());

            // Initialiser le state avec le raccourci actuel
            app.manage(GlobalShortcutState {
                current_shortcut: Mutex::new(Some(shortcut)),
            });

            // Enregistrer le raccourci global
            app.global_shortcut().register(shortcut)?;

            // Setup System Tray
            tray::setup_tray(app.handle())?;

            // Appliquer l'effet de vibrancy (verre poli macOS) sur les fenêtres
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(12.0))
                    .expect("Failed to apply vibrancy effect");
                let _ = window.hide();
            }
            if let Some(window) = app.get_webview_window("settings") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, Some(12.0))
                    .expect("Failed to apply vibrancy effect to settings");
                let _ = window.hide();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
