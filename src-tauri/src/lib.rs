use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

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
        let _ = window.center();
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

fn capture_and_show(app: &AppHandle) {
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
                    let _ = window.center();
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
    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
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
            hide_settings_window
        ])
        .setup(move |app| {
            // Enregistrer le raccourci global
            app.global_shortcut().register(shortcut)?;

            // Setup System Tray
            setup_tray(app.handle())?;

            // Cacher les fenêtres au démarrage
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.hide();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
