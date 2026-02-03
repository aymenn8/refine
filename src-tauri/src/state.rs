use std::sync::Mutex;
use tauri_plugin_global_shortcut::Shortcut;

/// State partagé de l'application pour le raccourci global
///
/// Cette structure stocke le raccourci clavier actuellement enregistré
/// dans un Mutex pour permettre un accès thread-safe depuis différentes
/// parties de l'application.
///
/// # Fields
/// * `current_shortcut` - Le raccourci actuellement enregistré, protégé par un Mutex
pub struct GlobalShortcutState {
    /// Le raccourci global actuellement enregistré
    /// Protégé par un Mutex pour un accès concurrent sécurisé
    pub current_shortcut: Mutex<Option<Shortcut>>,
}
