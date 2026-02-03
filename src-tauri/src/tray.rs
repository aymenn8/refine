use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// Configure le system tray (icône dans la barre de menu) avec ses menus
///
/// Crée une icône dans la barre de menu macOS avec trois options :
/// - **Open Refine** : Ouvre le spotlight avec le focus
/// - **Settings...** : Ouvre la fenêtre des paramètres
/// - **Quit** : Quitte l'application
///
/// # Arguments
/// * `app` - Handle de l'application Tauri
///
/// # Returns
/// * `Ok(())` si le tray est créé avec succès
/// * `Err(Box<dyn std::error::Error>)` si une erreur se produit
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
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
