use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime,
};

pub fn handle_menu_action<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
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
        "history" => {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("navigate-tab", "history");
            }
        }
        "check_update" => {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("navigate-tab", "about");
                let _ = window.emit("check-update", ());
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open_item = MenuItem::with_id(app, "open", "Open Refine", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let update_item =
        MenuItem::with_id(app, "check_update", "Check for Updates...", true, None::<&str>)?;
    let history_item = MenuItem::with_id(app, "history", "History...", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Refine", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let refine_menu = Submenu::with_items(
        app,
        "Refine",
        true,
        &[
            &open_item,
            &settings_item,
            &update_item,
            &separator1,
            &quit_item,
        ],
    )?;
    let view_menu = Submenu::with_items(app, "View", true, &[&history_item])?;

    Menu::with_items(app, &[&refine_menu, &view_menu])
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let version = app.config().version.clone().unwrap_or_default();

    // Menu items
    let open_item = MenuItem::with_id(app, "open", "Open Refine", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let history_item = MenuItem::with_id(app, "history", "History...", true, None::<&str>)?;

    let separator1 = PredefinedMenuItem::separator(app)?;

    let version_item = MenuItem::with_id(app, "version", format!("Version {}", version), false, None::<&str>)?;
    let update_item =
        MenuItem::with_id(app, "check_update", "Check for Updates...", true, None::<&str>)?;

    let separator2 = PredefinedMenuItem::separator(app)?;

    let quit_item = MenuItem::with_id(app, "quit", "Quit Refine", true, None::<&str>)?;

    // Build menu
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &settings_item,
            &history_item,
            &separator1,
            &version_item,
            &update_item,
            &separator2,
            &quit_item,
        ],
    )?;

    // Create tray icon
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu_action(app, event.id.as_ref()))
        .build(app)?;

    Ok(())
}
