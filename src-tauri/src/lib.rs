//! # Refine - Application de correction et traduction de texte
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
mod model;
mod modes;
mod native_mac;
mod providers;
mod quick_actions;
mod shortcuts;
mod sound;
mod state;
mod tray;
mod window;

use state::GlobalShortcutState;
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_store::StoreExt;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "macos")]
fn open_settings_from_dock(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        crate::native_mac::activate_our_app();
    }
}

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
    let builder = tauri::Builder::default()
        .menu(|app| tray::build_app_menu(app))
        .on_menu_event(|app, event| tray::handle_menu_action(app, event.id().as_ref()));

    // Optional analytics: disabled by default unless a compile-time key is provided.
    let builder = if let Some(aptabase_key) = option_env!("REFINE_APTABASE_KEY") {
        if !aptabase_key.is_empty() {
            builder.plugin(tauri_plugin_aptabase::Builder::new(aptabase_key).build())
        } else {
            builder
        }
    } else {
        builder
    };

    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        // Check if this is a quick action shortcut
                        if let Some((action_id, action_type)) =
                            shortcuts::get_quick_action_for_shortcut(app, &shortcut)
                        {
                            // Execute quick action in background
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = quick_actions::execute_quick_action(
                                    app_clone,
                                    action_id,
                                    action_type,
                                )
                                .await
                                {
                                    eprintln!("[quick_action] Error: {}", e);
                                }
                            });
                        } else if shortcuts::is_history_shortcut(app, &shortcut) {
                            let spotlight_visible = app
                                .get_webview_window("main")
                                .and_then(|window| window.is_visible().ok())
                                .unwrap_or(false);

                            if spotlight_visible {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.emit("spotlight-history-toggle", ());
                                }
                            } else {
                                // Standalone clipboard history window
                                window::show_clipboard_history_window(app);
                            }
                        } else {
                            // Regular spotlight open
                            if let Some(settings_window) = app.get_webview_window("settings") {
                                let _ = settings_window.emit("spotlight-shortcut-pressed", ());
                            }
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
            commands::show_clipboard_window,
            commands::show_settings_window,
            commands::hide_settings_window,
            commands::minimize_settings_window,
            commands::hide_clipboard_window,
            commands::paste_to_previous_app,
            commands::paste_to_previous_app_keep_open,
            shortcuts::update_global_shortcut,
            shortcuts::get_global_shortcut,
            shortcuts::update_history_shortcut,
            shortcuts::get_history_shortcut,
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
            modes::reorder_pinned_modes,
            modes::set_mode_model,
            clipboard::get_clipboard_history,
            clipboard::query_clipboard_history,
            clipboard::recopy_clipboard_history_entry,
            clipboard::paste_clipboard_history_entry,
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
            commands::check_onboarding_completed,
            commands::complete_onboarding,
            commands::restart_app
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
            clipboard::init_clipboard_store(app.handle()).map_err(std::io::Error::other)?;
            app.manage(clipboard::ClipboardState::new());
            clipboard::start_clipboard_monitor(app.handle().clone());

            // Enregistrer le raccourci global
            app.global_shortcut().register(shortcut)?;

            // Enregistrer le raccourci global de l'historique clipboard
            let history_shortcut = shortcuts::load_history_shortcut_from_store(app.handle());
            if history_shortcut != shortcut {
                app.global_shortcut().register(history_shortcut)?;
            }

            // Enregistrer les raccourcis des quick actions
            shortcuts::register_quick_action_shortcuts(app.handle());

            // Track app launch
            analytics::track(app.handle(), "app_launched", None);

            // Setup System Tray
            tray::setup_tray(app.handle())?;

            // Appliquer l'effet de vibrancy (verre poli macOS) sur les fenêtres
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::WindowBackground,
                    None,
                    Some(12.0),
                )
                .expect("Failed to apply vibrancy effect");
                let _ = window.hide();
            }
            if let Some(window) = app.get_webview_window("clipboard") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::WindowBackground,
                    None,
                    Some(12.0),
                )
                .expect("Failed to apply vibrancy effect to clipboard");
                let _ = window.hide();
            }
            if let Some(window) = app.get_webview_window("settings") {
                #[cfg(target_os = "macos")]
                apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::WindowBackground,
                    None,
                    Some(12.0),
                )
                .expect("Failed to apply vibrancy effect to settings");

                // First launch: show settings (will redirect to onboarding)
                let onboarding_done = app
                    .handle()
                    .store("settings.json")
                    .ok()
                    .and_then(|s| {
                        let val = s.get("onboardingCompleted")?;
                        val.as_bool()
                    })
                    .unwrap_or(false);

                if !onboarding_done {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
                    let _ = window.hide();
                }
            }

            if let Some(window) = app.get_webview_window("toast") {
                // No vibrancy for toast - keep it fully transparent
                let _ = window.hide();
            }

            // Convert main + toast windows to NSPanel for fullscreen overlay support
            window::init_panels(app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            match event {
                RunEvent::Reopen { .. } => open_settings_from_dock(app),
                RunEvent::ExitRequested { code, api, .. } => {
                    // Work around a macOS termination panic inside tao by
                    // exiting the process directly after the exit request.
                    api.prevent_exit();
                    std::process::exit(code.unwrap_or(0));
                }
                _ => {}
            }
        });
}
