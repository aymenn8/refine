//! Guards that keep this fork from shipping with upstream Refine's release wiring.

const UPSTREAM_REPO: &str = "aymenn8/refine";

#[test]
fn tauri_config_has_no_updater_plugin() {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .expect("tauri.conf.json is valid JSON");
    assert!(
        config.pointer("/plugins/updater").is_none(),
        "updater config must stay removed until the fork has its own feed and signing key"
    );
}

#[test]
fn release_files_never_point_at_upstream() {
    for (name, text) in [
        ("tauri.conf.json", include_str!("../tauri.conf.json")),
        ("scripts/release.sh", include_str!("../../scripts/release.sh")),
    ] {
        assert!(
            !text.to_lowercase().contains(UPSTREAM_REPO),
            "{name} still references {UPSTREAM_REPO}"
        );
    }
}

fn tauri_config() -> serde_json::Value {
    serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json is valid JSON")
}

#[test]
fn identity_is_recast_and_keychain_stays_legacy() {
    assert_eq!(tauri_config()["identifier"], "com.drummerms.recast");
    // Saved API keys stay under the old Keychain service; the copied settings.json names them.
    assert!(include_str!("credentials.rs").contains(r#"const SERVICE_NAME: &str = "com.refine";"#));
    assert_eq!(crate::identity_migration::LEGACY_IDENTIFIER, "com.refine");
    // The copy must be the first thing setup does: anything that writes into the app-data
    // folder first would make it look non-empty and the copy would be skipped.
    let lib = include_str!("lib.rs");
    let after_setup = &lib[lib.find(".setup(move |app| {").expect("setup closure")..];
    let first_code_line = after_setup
        .lines()
        .skip(1)
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("//"))
        .expect("setup body");
    assert!(
        first_code_line.starts_with("match identity_migration::run(app.handle())"),
        "setup must start with the migration, found: {first_code_line}"
    );
    assert!(include_str!("../../LICENSE").contains("Copyright (c) 2026 Refine contributors"));
}

#[test]
fn product_name_and_windows_say_recast() {
    let config = tauri_config();
    assert_eq!(config["productName"], "Recast");
    for window in config["app"]["windows"].as_array().expect("windows array") {
        let title = window["title"].as_str().expect("window title");
        // The toast window has no visible title bar and leaves its title blank.
        assert!(title.is_empty() || title.starts_with("Recast"), "window title {title:?} should say Recast");
    }
    assert!(include_str!("../../index.html").contains("<title>Recast</title>"));
}

#[test]
fn user_facing_text_says_recast() {
    for (name, text) in [
        ("tray.rs", include_str!("tray.rs")),
        ("shortcuts.rs", include_str!("shortcuts.rs")),
        ("selection.rs", include_str!("selection.rs")),
        ("Onboarding.tsx", include_str!("../../src/Onboarding.tsx")),
        ("ConfigTab.tsx", include_str!("../../src/settings/ConfigTab.tsx")),
        ("QuickActionsTab.tsx", include_str!("../../src/settings/QuickActionsTab.tsx")),
        ("HomeTab.tsx", include_str!("../../src/settings/HomeTab.tsx")),
        ("Settings.tsx", include_str!("../../src/Settings.tsx")),
        ("App.tsx", include_str!("../../src/App.tsx")),
        ("FooterBar.tsx", include_str!("../../src/spotlight/FooterBar.tsx")),
        ("AboutTab.tsx", include_str!("../../src/settings/AboutTab.tsx")),
        ("Toast.tsx", include_str!("../../src/Toast.tsx")),
    ] {
        let text = text.replace("Based on Refine by aymenn8", "");
        assert!(!text.contains("Refin"), "{name} still says Refine");
        assert!(!text.contains("refining"), "{name} still says refining");
        assert!(!text.contains(">refine<"), "{name} still shows the refine wordmark");
        assert!(!text.contains("logo-white-no-bg.png"), "{name} still uses the Refine logo");
    }
}

#[test]
fn about_tab_has_no_upstream_social_links() {
    let about = include_str!("../../src/settings/AboutTab.tsx");
    assert!(!about.contains("canny.io"));
    assert!(!about.contains("getrefineapp"));
    assert!(about.contains("https://github.com/Drummerms/refine/issues"));
    assert!(about.contains("Based on Refine by aymenn8 · MIT License"), "keep upstream credit");
    assert!(about.contains("https://github.com/aymenn8/refine"), "keep upstream credit link");
}

#[test]
fn tray_icon_is_a_template_glyph() {
    let image = tauri::image::Image::from_bytes(include_bytes!("../icons/tray/RecastMenuBarTemplate@2x.png"))
        .expect("tray icon decodes");
    assert_eq!((image.width(), image.height()), (36, 36));
    let pixels = image.rgba();
    // macOS template rendering uses alpha only; fully transparent pixels may carry any color.
    assert!(
        pixels.chunks(4).filter(|p| p[3] > 0).all(|p| p[..3] == [0, 0, 0]),
        "visible pixels of the template glyph must be pure black"
    );
    assert!(pixels.chunks(4).any(|p| p[3] > 0), "template glyph must not be empty");
    assert!(include_str!("tray.rs").contains(".icon_as_template(true)"), "tray must render as a template");
}
