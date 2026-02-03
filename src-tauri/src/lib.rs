use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

// Structure pour stocker le raccourci actuel
struct GlobalShortcutState {
    current_shortcut: Mutex<Option<Shortcut>>,
}

#[tauri::command]
async fn apply_replacement(app: AppHandle, text: String) -> Result<(), String> {
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

#[tauri::command]
async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.center();
        let _ = window.set_focus();
        let _ = window.emit("text-captured", String::new());
    }
    Ok(())
}

#[tauri::command]
async fn show_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
async fn hide_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
async fn minimize_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Parser un raccourci depuis une chaîne (ex: "CommandOrControl+Shift+R")
fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
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

#[tauri::command]
async fn update_global_shortcut(
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
        store
            .set("globalShortcut", shortcut_str)
            .map_err(|e| e.to_string())?;
        store.save().map_err(|e| e.to_string())?;

        // Mettre à jour le state
        *current = Some(new_shortcut);
    }

    Ok(())
}

#[tauri::command]
async fn get_global_shortcut(app: AppHandle) -> Result<String, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;

    if let Some(shortcut) = store.get("globalShortcut") {
        if let Some(shortcut_str) = shortcut.as_str() {
            return Ok(shortcut_str.to_string());
        }
    }

    // Valeur par défaut
    Ok("CommandOrControl+Shift+R".to_string())
}

fn capture_and_show(app: &AppHandle) {
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

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Create menu items
    let open_item = MenuItem::with_id(app, "open", "Open Refine", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    // Create menu
    let menu = Menu::with_items(app, &[&open_item, &settings_item, &quit_item])?;

    // Create tray icon
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.center();
                    let _ = window.set_focus();
                    let _ = window.emit("text-captured", String::new());
                }
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

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
                        capture_and_show(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            apply_replacement,
            hide_window,
            show_main_window,
            show_settings_window,
            hide_settings_window,
            minimize_settings_window,
            update_global_shortcut,
            get_global_shortcut
        ])
        .setup(move |app| {
            // Charger le raccourci depuis le store ou utiliser le défaut
            let store = app.store("settings.json")?;
            let shortcut_str = if let Some(saved_shortcut) = store.get("globalShortcut") {
                saved_shortcut
                    .as_str()
                    .unwrap_or("CommandOrControl+Shift+R")
                    .to_string()
            } else {
                "CommandOrControl+Shift+R".to_string()
            };

            let shortcut = parse_shortcut(&shortcut_str)
                .unwrap_or_else(|| Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR));

            // Initialiser le state avec le raccourci actuel
            app.manage(GlobalShortcutState {
                current_shortcut: Mutex::new(Some(shortcut)),
            });

            // Enregistrer le raccourci global
            app.global_shortcut().register(shortcut)?;

            // Setup System Tray
            setup_tray(app.handle())?;

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
