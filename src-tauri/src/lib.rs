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
mod analytics;
mod clipboard;
mod commands;
mod credentials;
mod flows;
mod history;
mod inference;
pub mod license;
mod model;
mod modes;
mod providers;
mod quick_actions;
mod shortcuts;
mod sound;
mod state;
mod tray;
mod window;

use state::GlobalShortcutState;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
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
        .plugin(tauri_plugin_aptabase::Builder::new("A-EU-6987116306").build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        // Check if this is a quick action shortcut
                        if let Some((action_id, action_type)) = shortcuts::get_quick_action_for_shortcut(app, &shortcut) {
                            // Execute quick action in background
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = quick_actions::execute_quick_action(app_clone, action_id, action_type).await {
                                    eprintln!("[quick_action] Error: {}", e);
                                }
                            });
                        } else {
                            // Regular spotlight open
                            window::capture_and_show(app);
                        }
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
            commands::paste_to_previous_app,
            shortcuts::update_global_shortcut,
            shortcuts::get_global_shortcut,
            model::check_model_status,
            model::download_model,
            model::cancel_download,
            model::delete_model,
            model::get_model_info,
            model::get_available_models_list,
            model::set_active_model,
            model::get_active_model,
            inference::process_text,
            inference::process_flow,
            inference::get_total_words_refined,
            inference::generate_mode,
            flows::get_flows,
            flows::save_flow,
            flows::delete_flow,
            modes::get_modes,
            modes::save_mode,
            modes::delete_mode,
            modes::reset_modes_to_defaults,
            modes::toggle_pin_mode,
            modes::set_mode_model,
            clipboard::get_clipboard_history,
            clipboard::clear_clipboard_history,
            credentials::save_api_credential,
            credentials::get_api_credentials,
            credentials::delete_api_credential,
            providers::test_api_key,
            model::set_active_cloud_model,
            model::get_active_model_config,
            history::get_history,
            history::clear_history,
            history::set_history_enabled,
            history::get_history_enabled,
            quick_actions::get_quick_actions,
            quick_actions::save_quick_action,
            quick_actions::delete_quick_action,
            shortcuts::reload_quick_action_shortcuts,
            shortcuts::check_shortcut_conflict,
            sound::play_system_sound,
            license::get_license_status,
            license::activate_license,
            license::deactivate_license,
            license::revalidate_license,
            license::check_feature_access
        ])
        .setup(move |app| {
            // Charger le raccourci depuis le store
            let shortcut = shortcuts::load_shortcut_from_store(app.handle());

            // Initialiser le state avec le raccourci actuel
            app.manage(GlobalShortcutState {
                current_shortcut: Mutex::new(Some(shortcut)),
            });

            // Initialiser le state pour le téléchargement du modèle
            app.manage(model::DownloadState::new());

            // Initialiser le state pour le clipboard et démarrer le monitoring
            app.manage(clipboard::ClipboardState::new());
            clipboard::start_clipboard_monitor(app.handle().clone());

            // Enregistrer le raccourci global
            app.global_shortcut().register(shortcut)?;

            // Enregistrer les raccourcis des quick actions
            shortcuts::register_quick_action_shortcuts(app.handle());

            // Track app launch
            analytics::track(app.handle(), "app_launched", None);

            // Setup System Tray
            tray::setup_tray(app.handle())?;

            // Appliquer l'effet de vibrancy (verre poli macOS) sur les fenêtres
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, Some(12.0))
                    .expect("Failed to apply vibrancy effect");
                let _ = window.hide();
            }
            if let Some(window) = app.get_webview_window("settings") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, Some(12.0))
                    .expect("Failed to apply vibrancy effect to settings");
                let _ = window.hide();
            }

            if let Some(window) = app.get_webview_window("toast") {
                // No vibrancy for toast - keep it fully transparent
                let _ = window.hide();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
