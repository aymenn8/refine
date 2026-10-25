use crate::state::GlobalShortcutState;
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use tauri_plugin_store::StoreExt;

const HISTORY_SHORTCUT_KEY: &str = "historyShortcut";

/// Parse un raccourci depuis une chaîne de caractères
///
/// Convertit une représentation textuelle d'un raccourci clavier en objet Shortcut Tauri.
///
/// # Format supporté
/// `"Modifier1+Modifier2+Key"` où :
/// - Modifiers : `Command`, `CommandOrControl`, `Control`, `Shift`, `Alt`
/// - Key : `A-Z`, `Space`, etc.
///
/// # Exemples
/// ```text
/// parse_shortcut("CommandOrControl+Shift+R") // Command+Shift+R sur macOS, Ctrl+Shift+R sur Windows
/// parse_shortcut("Command+Alt+E")            // Command+Alt+E
/// parse_shortcut("Shift+Space")              // Shift+Space
/// ```
///
/// # Arguments
/// * `shortcut_str` - Chaîne représentant le raccourci
///
/// # Returns
/// * `Some(Shortcut)` si le parsing réussit
/// * `None` si le format est invalide
pub fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    if parts.is_empty() {
        return None;
    }

    let mut modifiers = Modifiers::empty();
    let mut key_code = None;

    for part in parts {
        let part_lower = part.to_lowercase();
        match part_lower.as_str() {
            "command" | "cmd" | "super" | "commandorcontrol" => {
                modifiers |= Modifiers::SUPER;
            }
            "control" | "ctrl" => {
                modifiers |= Modifiers::CONTROL;
            }
            "shift" => {
                modifiers |= Modifiers::SHIFT;
            }
            "alt" | "option" => {
                modifiers |= Modifiers::ALT;
            }
            key => {
                // Parser la touche
                key_code = match key {
                    "r" => Some(Code::KeyR),
                    "t" => Some(Code::KeyT),
                    "e" => Some(Code::KeyE),
                    "a" => Some(Code::KeyA),
                    "s" => Some(Code::KeyS),
                    "d" => Some(Code::KeyD),
                    "f" => Some(Code::KeyF),
                    "g" => Some(Code::KeyG),
                    "h" => Some(Code::KeyH),
                    "j" => Some(Code::KeyJ),
                    "k" => Some(Code::KeyK),
                    "l" => Some(Code::KeyL),
                    "q" => Some(Code::KeyQ),
                    "w" => Some(Code::KeyW),
                    "z" => Some(Code::KeyZ),
                    "x" => Some(Code::KeyX),
                    "c" => Some(Code::KeyC),
                    "v" => Some(Code::KeyV),
                    "b" => Some(Code::KeyB),
                    "n" => Some(Code::KeyN),
                    "m" => Some(Code::KeyM),
                    "space" => Some(Code::Space),
                    "i" => Some(Code::KeyI),
                    "o" => Some(Code::KeyO),
                    "p" => Some(Code::KeyP),
                    "u" => Some(Code::KeyU),
                    "y" => Some(Code::KeyY),
                    "1" => Some(Code::Digit1),
                    "2" => Some(Code::Digit2),
                    "3" => Some(Code::Digit3),
                    "4" => Some(Code::Digit4),
                    "5" => Some(Code::Digit5),
                    "6" => Some(Code::Digit6),
                    "7" => Some(Code::Digit7),
                    "8" => Some(Code::Digit8),
                    "9" => Some(Code::Digit9),
                    "0" => Some(Code::Digit0),
                    _ => None,
                };
            }
        }
    }

    key_code.map(|code| {
        if modifiers.is_empty() {
            Shortcut::new(None, code)
        } else {
            Shortcut::new(Some(modifiers), code)
        }
    })
}

/// Replaces a registered shortcut without ever leaving the user with none: registers
/// `new` first and only then unregisters `old`. If registering fails (e.g. another app
/// holds the combination), `old` stays registered and the error is returned.
fn swap_shortcut<S: Copy + PartialEq, E>(
    old: Option<S>,
    new: S,
    mut register: impl FnMut(S) -> Result<(), E>,
    mut unregister: impl FnMut(S),
) -> Result<(), E> {
    if old == Some(new) {
        return Ok(());
    }
    register(new)?;
    if let Some(old) = old {
        unregister(old);
    }
    Ok(())
}

/// Met à jour le raccourci global de l'application
///
/// Cette commande permet de changer le raccourci clavier qui ouvre le spotlight.
/// Elle désenregistre l'ancien raccourci, enregistre le nouveau, et le sauvegarde
/// dans le store pour persister entre les sessions.
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
/// * `shortcut_str` - Nouveau raccourci au format "Modifier+Key"
/// * `state` - State partagé contenant le raccourci actuel
///
/// # Returns
/// * `Ok(())` si le raccourci a été mis à jour avec succès
/// * `Err(String)` si le format est invalide ou si l'enregistrement échoue
///
/// # Exemples
/// ```typescript
/// await invoke("update_global_shortcut", { shortcutStr: "Command+Alt+R" });
/// ```
#[tauri::command]
pub async fn update_global_shortcut(
    app: AppHandle,
    shortcut_str: String,
    state: State<'_, GlobalShortcutState>,
) -> Result<(), String> {
    // Parser le nouveau raccourci
    let new_shortcut = parse_shortcut(&shortcut_str)
        .ok_or_else(|| format!("Invalid shortcut format: {}", shortcut_str))?;

    if let Ok(mut current) = state.current_shortcut.lock() {
        // Register the new shortcut before releasing the old one
        let shortcuts = app.global_shortcut();
        swap_shortcut(
            *current,
            new_shortcut,
            |s| shortcuts.register(s).map_err(|e| e.to_string()),
            |s| {
                let _ = shortcuts.unregister(s);
            },
        )?;

        // Sauvegarder dans le store
        let store = app.store("settings.json").map_err(|e| e.to_string())?;
        store.set("globalShortcut", shortcut_str);
        store.save().map_err(|e| e.to_string())?;

        // Mettre à jour le state
        *current = Some(new_shortcut);
    }

    Ok(())
}

/// Récupère le raccourci global actuellement configuré
///
/// Lit le raccourci depuis le store et le retourne sous forme de chaîne.
/// Si aucun raccourci n'est configuré, retourne le raccourci par défaut.
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(String)` - Le raccourci configuré (ex: "CommandOrControl+Shift+R")
/// * `Err(String)` - Si une erreur se produit lors de la lecture du store
///
/// # Exemples
/// ```typescript
/// const shortcut = await invoke<string>("get_global_shortcut");
/// console.log(shortcut); // "CommandOrControl+Shift+R"
/// ```
#[tauri::command]
pub async fn get_global_shortcut(app: AppHandle) -> Result<String, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    if let Some(shortcut) = store.get("globalShortcut") {
        if let Some(shortcut_str) = shortcut.as_str() {
            return Ok(shortcut_str.to_string());
        }
    }

    // Valeur par défaut
    Ok("CommandOrControl+Shift+R".to_string())
}

#[tauri::command]
pub async fn get_history_shortcut(app: AppHandle) -> Result<String, String> {
    Ok(get_history_shortcut_from_store(&app))
}

/// Charge le raccourci depuis le store ou retourne le raccourci par défaut
///
/// Cette fonction est utilisée au démarrage de l'application pour restaurer
/// le raccourci configuré par l'utilisateur.
///
/// # Comportement
/// 1. Essaie de lire le raccourci depuis le store "settings.json"
/// 2. Si trouvé, parse et retourne le raccourci
/// 3. Si non trouvé ou invalide, retourne Command+Shift+R (par défaut)
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Shortcut` - Le raccourci configuré ou le raccourci par défaut
pub fn load_shortcut_from_store(app: &AppHandle) -> Shortcut {
    let shortcut_str = if let Ok(store) = app.store("settings.json") {
        if let Some(saved_shortcut) = store.get("globalShortcut") {
            saved_shortcut
                .as_str()
                .unwrap_or("CommandOrControl+Shift+R")
                .to_string()
        } else {
            "CommandOrControl+Shift+R".to_string()
        }
    } else {
        "CommandOrControl+Shift+R".to_string()
    };

    parse_shortcut(&shortcut_str)
        .unwrap_or_else(|| Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR))
}

fn get_history_shortcut_from_store(app: &AppHandle) -> String {
    if let Ok(store) = app.store("settings.json") {
        if let Some(saved_shortcut) = store.get(HISTORY_SHORTCUT_KEY) {
            return saved_shortcut
                .as_str()
                .unwrap_or("CommandOrControl+Shift+V")
                .to_string();
        }
    }

    "CommandOrControl+Shift+V".to_string()
}

pub fn load_history_shortcut_from_store(app: &AppHandle) -> Shortcut {
    let shortcut_str = get_history_shortcut_from_store(app);

    parse_shortcut(&shortcut_str)
        .unwrap_or_else(|| Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV))
}

pub fn is_history_shortcut(app: &AppHandle, shortcut: &Shortcut) -> bool {
    let parsed = load_history_shortcut_from_store(app);
    parsed == *shortcut
}

#[tauri::command]
pub async fn update_history_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let new_shortcut = parse_shortcut(&shortcut_str)
        .ok_or_else(|| format!("Invalid shortcut format: {}", shortcut_str))?;

    let main_shortcut = load_shortcut_from_store(&app);
    if new_shortcut == main_shortcut {
        return Err("Shortcut already used by Open Refine".to_string());
    }

    let actions = crate::quick_actions::get_quick_actions_sync(&app);
    for action in &actions {
        if action.shortcut.is_empty() {
            continue;
        }
        if let Some(parsed) = parse_shortcut(&action.shortcut) {
            if parsed == new_shortcut {
                return Err(format!("Shortcut already used by Quick Action: {}", action.mode_name));
            }
        }
    }

    let old_shortcut_str = get_history_shortcut_from_store(&app);
    let old_shortcut = parse_shortcut(&old_shortcut_str);

    let shortcuts = app.global_shortcut();
    swap_shortcut(
        old_shortcut,
        new_shortcut,
        |s| shortcuts.register(s).map_err(|e| e.to_string()),
        |s| {
            let _ = shortcuts.unregister(s);
        },
    )?;

    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(HISTORY_SHORTCUT_KEY, shortcut_str);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Register all quick action shortcuts
pub fn register_quick_action_shortcuts(app: &AppHandle) {
    let actions = crate::quick_actions::get_quick_actions_sync(app);

    for action in actions {
        if action.shortcut.is_empty() {
            continue;
        }

        if let Some(shortcut) = parse_shortcut(&action.shortcut) {
            let _ = app.global_shortcut().register(shortcut);
        }
    }
}

/// Check if a shortcut matches a quick action and return (target_id, action_type)
pub fn get_quick_action_for_shortcut(app: &AppHandle, shortcut: &Shortcut) -> Option<(String, String)> {
    let actions = crate::quick_actions::get_quick_actions_sync(app);

    for action in actions {
        if action.shortcut.is_empty() {
            continue;
        }

        if let Some(parsed) = parse_shortcut(&action.shortcut) {
            if parsed == *shortcut {
                return Some((action.mode_id, action.action_type));
            }
        }
    }

    None
}

/// Reload quick action shortcuts (unregister ALL global shortcuts, then re-register everything)
///
/// This approach is necessary because when a shortcut is changed, the old shortcut
/// string is no longer in the store - so we can't selectively unregister it.
/// Instead, we unregister everything and re-register from scratch.
#[tauri::command]
pub async fn reload_quick_action_shortcuts(app: AppHandle) -> Result<(), String> {
    // 1. Unregister ALL global shortcuts
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    // 2. Re-register the main spotlight shortcut
    let main_shortcut = load_shortcut_from_store(&app);
    let _ = app.global_shortcut().register(main_shortcut);

    // 2b. Re-register clipboard history shortcut
    let history_shortcut = load_history_shortcut_from_store(&app);
    if history_shortcut != main_shortcut {
        let _ = app.global_shortcut().register(history_shortcut);
    }

    // 3. Re-register all quick action shortcuts
    let actions = crate::quick_actions::get_quick_actions_sync(&app);
    for action in &actions {
        if !action.shortcut.is_empty() {
            if let Some(shortcut) = parse_shortcut(&action.shortcut) {
                let _ = app.global_shortcut().register(shortcut);
            }
        }
    }

    Ok(())
}

/// Check if a shortcut string is already in use by another binding.
/// Returns the name/label of the conflicting binding, or null if available.
#[tauri::command]
pub async fn check_shortcut_conflict(
    app: AppHandle,
    shortcut_str: String,
    exclude_id: Option<String>,
) -> Result<Option<String>, String> {
    let new_shortcut = match parse_shortcut(&shortcut_str) {
        Some(s) => s,
        None => return Ok(None), // Can't parse = no conflict
    };

    // Check against global spotlight shortcut
    let global_str = if let Ok(store) = app.store("settings.json") {
        store
            .get("globalShortcut")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "CommandOrControl+Shift+R".to_string())
    } else {
        "CommandOrControl+Shift+R".to_string()
    };

    // Only check if we're not editing the global shortcut itself
    if exclude_id.as_deref() != Some("global") {
        if let Some(global_parsed) = parse_shortcut(&global_str) {
            if global_parsed == new_shortcut {
                return Ok(Some("Open Refine".to_string()));
            }
        }
    }

    // Check against clipboard history global shortcut
    if exclude_id.as_deref() != Some("history") {
        let history_str = get_history_shortcut_from_store(&app);
        if let Some(history_parsed) = parse_shortcut(&history_str) {
            if history_parsed == new_shortcut {
                return Ok(Some("Clipboard History".to_string()));
            }
        }
    }

    // Check against all quick action shortcuts
    let actions = crate::quick_actions::get_quick_actions_sync(&app);
    for action in &actions {
        if action.shortcut.is_empty() {
            continue;
        }
        // Skip the action we're currently editing
        if let Some(ref exc) = exclude_id {
            if *exc == action.mode_id {
                continue;
            }
        }
        if let Some(parsed) = parse_shortcut(&action.shortcut) {
            if parsed == new_shortcut {
                return Ok(Some(format!("Quick Action: {}", action.mode_name)));
            }
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs swap_shortcut with closures that log their calls.
    fn run_swap(old: Option<u8>, new: u8, register_ok: bool) -> (Result<(), String>, Vec<String>) {
        let log = std::cell::RefCell::new(Vec::new());
        let result = swap_shortcut(
            old,
            new,
            |s| {
                log.borrow_mut().push(format!("register {s}"));
                if register_ok { Ok(()) } else { Err("taken".to_string()) }
            },
            |s| log.borrow_mut().push(format!("unregister {s}")),
        );
        (result, log.into_inner())
    }

    #[test]
    fn swap_registers_new_before_unregistering_old() {
        assert_eq!(run_swap(Some(1), 2, true), (Ok(()), vec!["register 2".to_string(), "unregister 1".to_string()]));
    }

    #[test]
    fn failed_registration_keeps_the_old_shortcut() {
        assert_eq!(run_swap(Some(1), 2, false), (Err("taken".to_string()), vec!["register 2".to_string()]));
    }

    #[test]
    fn same_shortcut_is_left_alone() {
        assert_eq!(run_swap(Some(2), 2, true), (Ok(()), Vec::<String>::new()));
    }

    #[test]
    fn first_shortcut_has_nothing_to_unregister() {
        assert_eq!(run_swap(None, 2, true), (Ok(()), vec!["register 2".to_string()]));
    }

    #[test]
    fn parses_control_space() {
        assert_eq!(parse_shortcut("Control+Space"), Some(Shortcut::new(Some(Modifiers::CONTROL), Code::Space)));
    }

    #[test]
    fn legacy_command_or_control_still_parses_as_command() {
        let legacy = parse_shortcut("CommandOrControl+Shift+R");
        assert!(legacy.is_some());
        assert_eq!(legacy, parse_shortcut("Command+Shift+R"));
    }
}
