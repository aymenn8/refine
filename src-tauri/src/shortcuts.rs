use crate::state::GlobalShortcutState;
use tauri::{AppHandle, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use tauri_plugin_store::StoreExt;

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
/// ```
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

    // Désenregistrer l'ancien raccourci
    if let Ok(mut current) = state.current_shortcut.lock() {
        if let Some(old_shortcut) = current.as_ref() {
            let _ = app.global_shortcut().unregister(*old_shortcut);
        }

        // Enregistrer le nouveau raccourci
        app.global_shortcut()
            .register(new_shortcut)
            .map_err(|e| e.to_string())?;

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
