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
