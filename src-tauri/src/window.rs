use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(SpotlightPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })

    panel!(ToastPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })

    panel!(ClipboardPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

/// Payload envoyé au frontend lors de l'ouverture du spotlight
#[derive(Clone, Serialize)]
pub struct SpotlightPayload {
    pub text: String,
    pub previous_app: String,
}

#[derive(Clone, Serialize)]
pub struct ClipboardWindowPayload {
    pub previous_app: String,
}

pub use crate::native_mac::activate_previous_app;

#[cfg(target_os = "macos")]
fn run_on_main_thread<F>(app: &AppHandle, task: F)
where
    F: FnOnce(AppHandle) + Send + 'static,
{
    let app_handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || task(app_handle)) {
        eprintln!("[window] Failed to schedule main-thread task: {}", e);
    }
}

/// Convert the main and toast windows to NSPanel instances.
/// Must be called once during setup, after vibrancy is applied.
#[cfg(target_os = "macos")]
pub fn init_panels(app: &AppHandle) {
    // Convert main window to NSPanel
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(panel) = window.to_panel::<SpotlightPanel>() {
            panel.set_level(PanelLevel::ScreenSaver.value());
            panel.set_collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .into(),
            );
            panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
            panel.set_hides_on_deactivate(false);
            panel.set_floating_panel(true);
            panel.set_accepts_mouse_moved_events(true);
            panel.hide();
        }
    }

    // Convert toast window to NSPanel
    if let Some(window) = app.get_webview_window("toast") {
        if let Ok(panel) = window.to_panel::<ToastPanel>() {
            panel.set_level(PanelLevel::ScreenSaver.value());
            panel.set_collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .into(),
            );
            panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
            panel.set_hides_on_deactivate(false);
            panel.set_floating_panel(true);
            panel.set_ignores_mouse_events(false);
            panel.hide();
        }
    }

    // Convert clipboard window to NSPanel
    if let Some(window) = app.get_webview_window("clipboard") {
        if let Ok(panel) = window.to_panel::<ClipboardPanel>() {
            panel.set_level(PanelLevel::ScreenSaver.value());
            panel.set_collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .into(),
            );
            panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
            panel.set_hides_on_deactivate(false);
            panel.set_floating_panel(true);
            panel.set_accepts_mouse_moved_events(true);
            panel.hide();
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn init_panels(_app: &AppHandle) {}

/// Show the toast panel (called from quick_actions)
#[cfg(target_os = "macos")]
pub fn show_toast_panel(app: &AppHandle) {
    run_on_main_thread(app, |app_handle| {
        if let Ok(panel) = app_handle.get_webview_panel("toast") {
            panel.order_front_regardless();
        } else if let Some(window) = app_handle.get_webview_window("toast") {
            let _ = window.show();
        }
    });
}

/// Hide the toast panel
#[cfg(target_os = "macos")]
pub fn hide_toast_panel(app: &AppHandle) {
    run_on_main_thread(app, |app_handle| {
        if let Ok(panel) = app_handle.get_webview_panel("toast") {
            panel.hide();
        } else if let Some(window) = app_handle.get_webview_window("toast") {
            let _ = window.hide();
        }
    });
}

/// Show standalone clipboard history window as panel.
#[cfg(target_os = "macos")]
pub fn show_clipboard_history_window(app: &AppHandle) {
    run_on_main_thread(app, |app_handle| {
        if let Ok(panel) = app_handle.get_webview_panel("clipboard") {
            if panel.is_visible() {
                panel.hide();
                return;
            }

            // Hide spotlight panel if open
            if let Ok(main_panel) = app_handle.get_webview_panel("main") {
                if main_panel.is_visible() {
                    main_panel.hide();
                }
            }

            // Capture current front app for paste-back on Enter
            let previous_app = crate::native_mac::get_and_store_frontmost_app();

            if let Some(window) = app_handle.get_webview_window("clipboard") {
                let _ = window.center();
            }

            panel.show_and_make_key();
            crate::native_mac::activate_our_app();

            let content_view = panel.content_view();
            panel.make_first_responder(Some(&content_view));

            if let Some(window) = app_handle.get_webview_window("clipboard") {
                let payload = ClipboardWindowPayload { previous_app };
                let _ = window.emit("clipboard-open", payload);
            }
        } else if let Some(window) = app_handle.get_webview_window("clipboard") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
                return;
            }

            let previous_app = crate::native_mac::get_and_store_frontmost_app();
            let _ = window.show();
            let _ = window.center();
            let _ = window.set_focus();

            let payload = ClipboardWindowPayload { previous_app };
            let _ = window.emit("clipboard-open", payload);
        }
    });
}

#[cfg(target_os = "macos")]
pub fn hide_clipboard_history_window(app: &AppHandle) {
    run_on_main_thread(app, |app_handle| {
        if let Ok(panel) = app_handle.get_webview_panel("clipboard") {
            panel.hide();
        } else if let Some(window) = app_handle.get_webview_window("clipboard") {
            let _ = window.hide();
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub fn show_toast_panel(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("toast") {
        let _ = window.show();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn hide_toast_panel(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("toast") {
        let _ = window.hide();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn show_clipboard_history_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("clipboard") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn hide_clipboard_history_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("clipboard") {
        let _ = window.hide();
    }
}

/// Affiche la fenêtre principale (spotlight) par-dessus les apps en plein écran.
///
/// Utilise NSPanel via tauri-nspanel pour overlay sans quitter le Space plein écran.
pub fn capture_and_show(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        run_on_main_thread(app, |app_handle| {
            if let Ok(clipboard_panel) = app_handle.get_webview_panel("clipboard") {
                if clipboard_panel.is_visible() {
                    clipboard_panel.hide();
                }
            } else if let Some(window) = app_handle.get_webview_window("clipboard") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                }
            }

            if let Ok(panel) = app_handle.get_webview_panel("main") {
                if panel.is_visible() {
                    panel.hide();
                    return;
                }

                // Détecter et stocker l'application active AVANT d'afficher Refine
                let previous_app = crate::native_mac::get_and_store_frontmost_app();

                // Center the underlying webview window (do not convert the panel back to a window)
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.center();
                }

                // Phase 1: Show the panel without activating the app (no Space switch)
                panel.show_and_make_key();

                // Phase 2: Activate app to receive keyboard events.
                crate::native_mac::activate_our_app();

                // Make the webview content view the first responder for keyboard input
                let content_view = panel.content_view();
                panel.make_first_responder(Some(&content_view));

                // Emit event to the frontend
                if let Some(window) = app_handle.get_webview_window("main") {
                    let payload = SpotlightPayload {
                        text: String::new(),
                        previous_app,
                    };
                    let _ = window.emit("spotlight-open", payload);
                }
            } else if let Some(window) = app_handle.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                    return;
                }

                let previous_app = crate::native_mac::get_and_store_frontmost_app();

                let _ = window.show();
                let _ = window.center();
                let _ = window.set_focus();

                let payload = SpotlightPayload {
                    text: String::new(),
                    previous_app,
                };
                let _ = window.emit("spotlight-open", payload);
            }
        });
        return;
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window("clipboard") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            }
        }

        if let Some(window) = app.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
                return;
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let previous_app = crate::native_mac::get_and_store_frontmost_app();

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.center();
            let _ = window.set_focus();

            let payload = SpotlightPayload {
                text: String::new(),
                previous_app,
            };
            let _ = window.emit("spotlight-open", payload);
        }
    }
}
