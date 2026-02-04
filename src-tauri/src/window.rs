#![allow(deprecated)]

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use objc::runtime::YES;

/// NSWindow levels
#[cfg(target_os = "macos")]
const NS_FLOATING_WINDOW_LEVEL: i64 = 3;

/// Stocke la référence à l'app précédente pour pouvoir la réactiver
#[cfg(target_os = "macos")]
static PREVIOUS_APP: Mutex<Option<usize>> = Mutex::new(None);

/// Payload envoyé au frontend lors de l'ouverture du spotlight
#[derive(Clone, Serialize)]
pub struct SpotlightPayload {
    pub text: String,
    pub previous_app: String,
}

/// Configure the window as floating overlay
#[cfg(target_os = "macos")]
pub fn configure_overlay_window(window: &tauri::WebviewWindow) {
    let ns_window = window.ns_window().unwrap() as id;

    unsafe {
        // Set window level to floating (always on top)
        let _: () = msg_send![ns_window, setLevel: NS_FLOATING_WINDOW_LEVEL];

        // Set collection behavior: can join all spaces + fullscreen auxiliary
        let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorTransient;
        ns_window.setCollectionBehavior_(behavior);

        // Don't hide on deactivate
        let _: () = msg_send![ns_window, setHidesOnDeactivate: NO];

        // Allow mouse events
        let _: () = msg_send![ns_window, setAcceptsMouseMovedEvents: YES];
    }
}

#[cfg(target_os = "macos")]
use objc::*;

#[cfg(target_os = "macos")]
const NO: i8 = 0;

#[cfg(not(target_os = "macos"))]
pub fn configure_overlay_window(_window: &tauri::WebviewWindow) {}

#[cfg(not(target_os = "macos"))]
static PREVIOUS_APP: Mutex<Option<usize>> = Mutex::new(None);

/// Récupère et stocke l'application active (avant Refine)
#[cfg(target_os = "macos")]
fn get_and_store_frontmost_app() -> String {
    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let frontmost_app: id = msg_send![workspace, frontmostApplication];

        if frontmost_app == nil {
            return String::new();
        }

        // Stocker la référence pour réactivation ultérieure
        // On stocke l'adresse mémoire comme usize (pas idéal mais fonctionne pour la session)
        if let Ok(mut prev) = PREVIOUS_APP.lock() {
            *prev = Some(frontmost_app as usize);
        }

        let name: id = msg_send![frontmost_app, localizedName];
        if name == nil {
            return String::new();
        }

        let utf8: *const i8 = msg_send![name, UTF8String];
        if utf8.is_null() {
            return String::new();
        }

        std::ffi::CStr::from_ptr(utf8)
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(not(target_os = "macos"))]
fn get_and_store_frontmost_app() -> String {
    String::new()
}

/// Réactive l'application précédemment stockée
#[cfg(target_os = "macos")]
pub fn activate_previous_app() {
    unsafe {
        if let Ok(prev) = PREVIOUS_APP.lock() {
            if let Some(app_ptr) = *prev {
                let app = app_ptr as id;
                // NSApplicationActivateIgnoringOtherApps = 1 << 1
                let _: i8 = msg_send![app, activateWithOptions: 2u64];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn activate_previous_app() {}

/// Affiche la fenêtre principale (spotlight)
///
/// Cette fonction implémente un comportement toggle :
/// - Si la fenêtre est visible → la cache
/// - Si la fenêtre est cachée → lit le clipboard et affiche la fenêtre
///
/// # Processus
/// 1. Vérifie si la fenêtre est déjà visible (toggle)
/// 2. Détecte le nom de l'application active
/// 3. Lit le contenu du clipboard
/// 4. Affiche la fenêtre avec le texte et le nom de l'app
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
pub fn capture_and_show(app: &AppHandle) {
    // Vérifier si la fenêtre est déjà visible
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            // Si la fenêtre est visible, la cacher
            let _ = window.hide();
            return;
        }
    }

    // Détecter et stocker l'application active AVANT d'afficher Refine
    let previous_app = get_and_store_frontmost_app();

    // Lire le clipboard actuel (l'utilisateur a fait Cmd+C lui-même)
    let clipboard_text = app.clipboard().read_text().unwrap_or_default();

    // Afficher la fenêtre
    if let Some(window) = app.get_webview_window("main") {
        // Configure as overlay panel
        configure_overlay_window(&window);

        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();

        // Envoyer le payload avec le texte et le nom de l'app
        let payload = SpotlightPayload {
            text: clipboard_text,
            previous_app,
        };
        let _ = window.emit("spotlight-open", payload);
    }
}
