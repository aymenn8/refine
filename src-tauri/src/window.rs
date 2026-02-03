use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Capture le texte sélectionné et affiche la fenêtre principale (spotlight)
///
/// Cette fonction implémente un comportement toggle :
/// - Si la fenêtre est visible → la cache
/// - Si la fenêtre est cachée → capture le texte sélectionné et affiche la fenêtre
///
/// # Processus de capture
/// 1. Vérifie si la fenêtre est déjà visible (toggle)
/// 2. Sauvegarde le contenu actuel du clipboard
/// 3. Simule Cmd+A pour sélectionner tout le texte dans le champ actif
/// 4. Simule Cmd+C pour copier le texte sélectionné
/// 5. Compare le nouveau clipboard avec l'ancien
/// 6. Affiche la fenêtre avec le texte capturé
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

    // Sauvegarder le clipboard actuel pour comparer après
    let old_clipboard = app.clipboard().read_text().unwrap_or_default();

    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        // 1. Cmd+A pour sélectionner tout dans l'input actif
        let _ = enigo.key(Key::Meta, Direction::Press);
        thread::sleep(Duration::from_millis(5));
        let _ = enigo.key(Key::Unicode('a'), Direction::Click);
        thread::sleep(Duration::from_millis(5));
        let _ = enigo.key(Key::Meta, Direction::Release);

        // Délai pour que la sélection soit effective
        thread::sleep(Duration::from_millis(50));

        // 2. Cmd+C pour copier
        let _ = enigo.key(Key::Meta, Direction::Press);
        thread::sleep(Duration::from_millis(5));
        let _ = enigo.key(Key::Unicode('c'), Direction::Click);
        thread::sleep(Duration::from_millis(5));
        let _ = enigo.key(Key::Meta, Direction::Release);
    }

    // Attendre que le clipboard soit mis à jour
    thread::sleep(Duration::from_millis(100));

    // Lire le nouveau clipboard
    let new_clipboard = app.clipboard().read_text().unwrap_or_default();

    // Déterminer le texte à afficher
    let text_to_show = if !new_clipboard.is_empty() && new_clipboard != old_clipboard {
        new_clipboard
    } else {
        String::new()
    };

    // Afficher la fenêtre
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
        let _ = window.emit("text-captured", text_to_show);
    }
}
