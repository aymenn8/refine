//! One-time copy of an existing Refine install's data into Recast's app-data folder.
//!
//! The bundle identifier names the app-data folder, so moving from `com.refine` to
//! Recast's identifier would otherwise start everyone on blank settings. The old folder
//! is only read, never changed or deleted.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub const LEGACY_IDENTIFIER: &str = "com.refine";

#[derive(Debug, PartialEq)]
pub enum Outcome {
    NoLegacyData,
    TargetHasData,
    Migrated,
}

/// Copies the legacy app-data folder to `target`, but only when `target` is missing or empty.
///
/// The copy goes to `<target>.migrating` first and is renamed into place at the end, so a
/// crash mid-copy leaves no half-filled `target` and the next launch simply tries again.
pub fn migrate_app_data(legacy: &Path, target: &Path) -> io::Result<Outcome> {
    if has_entries(target)? {
        return Ok(Outcome::TargetHasData);
    }
    if !legacy.is_dir() {
        return Ok(Outcome::NoLegacyData);
    }

    let staging = staging_path(target);
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    if let Err(e) = copy_dir(legacy, &staging).and_then(|()| check_settings(&staging)) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    if target.exists() {
        fs::remove_dir(target)?; // empty, checked above
    }
    fs::rename(&staging, target)?;
    Ok(Outcome::Migrated)
}

/// Runs the migration for this app: legacy data lives next to the app-data folder.
/// The error is a plain sentence for the user.
pub fn run(app: &tauri::AppHandle) -> Result<Outcome, String> {
    let target = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let legacy = target.with_file_name(LEGACY_IDENTIFIER);
    // Refine may be mid-save (settings.json, the clipboard database's WAL), so don't copy under it.
    if !has_entries(&target).unwrap_or(true) && legacy.is_dir() && crate::native_mac::is_app_running(LEGACY_IDENTIFIER) {
        return Err("Refine is still open. Quit Refine, then open Recast again.".to_string());
    }
    migrate_app_data(&legacy, &target).map_err(|e| {
        format!("{e} (copying {}). Free up disk space or check permissions, then open Recast again.", legacy.display())
    })
}

/// A half-saved settings.json would become Recast's settings for good, so refuse it.
fn check_settings(dir: &Path) -> io::Result<()> {
    let path = dir.join("settings.json");
    if !path.exists() {
        return Ok(());
    }
    serde_json::from_slice::<serde_json::Value>(&fs::read(&path)?)
        .map(|_| ())
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("settings.json is not valid JSON: {e}")))
}

fn has_entries(dir: &Path) -> io::Result<bool> {
    match fs::read_dir(dir) {
        Ok(mut entries) => Ok(entries.next().is_some()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

fn staging_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().unwrap_or_default().to_os_string();
    name.push(".migrating");
    target.with_file_name(name)
}

/// Recursive copy. `fs::copy` clones on APFS, so large model files cost little space or time.
fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if kind.is_symlink() {
            std::os::unix::fs::symlink(fs::read_link(entry.path())?, &dest)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), &dest)?;
        } // Sockets and pipes hold no saved data, and opening a pipe would block.
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "recast-migration-{name}-{}-{:?}",
                std::process::id(),
                std::time::SystemTime::now()
            ));
            fs::create_dir_all(&dir).unwrap();
            Scratch(dir)
        }
        fn legacy(&self) -> PathBuf {
            self.0.join(LEGACY_IDENTIFIER)
        }
        fn target(&self) -> PathBuf {
            self.0.join("com.drummerms.recast")
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, bytes: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    fn seed_legacy(s: &Scratch) {
        write(&s.legacy().join("settings.json"), br#"{"apiCredentials":[{"id":"abc"}]}"#);
        write(&s.legacy().join("clipboard/history.db"), b"sqlite bytes");
        write(&s.legacy().join("models/a/b.bin"), &[0u8, 1, 2, 255]);
    }

    #[test]
    fn no_legacy_data_does_nothing() {
        let s = Scratch::new("none");
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::NoLegacyData);
        assert!(!s.target().exists());
    }

    #[test]
    fn copies_nested_files_byte_for_byte() {
        let s = Scratch::new("copy");
        seed_legacy(&s);
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::Migrated);
        for rel in ["settings.json", "clipboard/history.db", "models/a/b.bin"] {
            assert_eq!(
                fs::read(s.target().join(rel)).unwrap(),
                fs::read(s.legacy().join(rel)).unwrap(),
                "{rel}"
            );
        }
    }

    #[test]
    fn legacy_is_untouched() {
        let s = Scratch::new("untouched");
        seed_legacy(&s);
        migrate_app_data(&s.legacy(), &s.target()).unwrap();
        assert_eq!(fs::read(s.legacy().join("settings.json")).unwrap(), br#"{"apiCredentials":[{"id":"abc"}]}"#);
        assert_eq!(fs::read(s.legacy().join("models/a/b.bin")).unwrap(), [0u8, 1, 2, 255]);
    }

    #[test]
    fn second_run_is_a_no_op() {
        let s = Scratch::new("twice");
        seed_legacy(&s);
        migrate_app_data(&s.legacy(), &s.target()).unwrap();
        write(&s.target().join("settings.json"), b"changed in Recast");
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::TargetHasData);
        assert_eq!(fs::read(s.target().join("settings.json")).unwrap(), b"changed in Recast");
    }

    #[test]
    fn existing_target_data_is_never_overwritten() {
        let s = Scratch::new("existing");
        seed_legacy(&s);
        write(&s.target().join("settings.json"), b"fresh Recast install");
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::TargetHasData);
        assert_eq!(fs::read(s.target().join("settings.json")).unwrap(), b"fresh Recast install");
        assert!(!s.target().join("models").exists());
    }

    #[test]
    fn empty_target_dir_is_filled() {
        let s = Scratch::new("empty");
        seed_legacy(&s);
        fs::create_dir_all(s.target()).unwrap();
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::Migrated);
        assert!(s.target().join("settings.json").exists());
    }

    #[test]
    fn leftover_staging_is_replaced() {
        let s = Scratch::new("staging");
        seed_legacy(&s);
        let staging = s.0.join("com.drummerms.recast.migrating");
        write(&staging.join("half-copied.bin"), b"partial");
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::Migrated);
        assert!(!staging.exists());
        assert!(!s.target().join("half-copied.bin").exists());
        assert!(s.target().join("models/a/b.bin").exists());
    }

    #[test]
    fn corrupt_settings_are_not_migrated() {
        let s = Scratch::new("corrupt");
        seed_legacy(&s);
        write(&s.legacy().join("settings.json"), b"{\"apiCredentials\": [");
        assert!(migrate_app_data(&s.legacy(), &s.target()).is_err());
        assert!(!s.target().exists());
        assert!(!s.0.join("com.drummerms.recast.migrating").exists());
    }

    #[test]
    fn special_files_are_skipped() {
        let s = Scratch::new("fifo");
        seed_legacy(&s);
        let fifo = s.legacy().join("clipboard/pipe");
        assert!(std::process::Command::new("mkfifo").arg(&fifo).status().unwrap().success());
        assert_eq!(migrate_app_data(&s.legacy(), &s.target()).unwrap(), Outcome::Migrated);
        assert!(!s.target().join("clipboard/pipe").exists());
        assert!(s.target().join("clipboard/history.db").exists());
    }

    #[test]
    fn failed_copy_leaves_no_target() {
        let s = Scratch::new("fail");
        seed_legacy(&s);
        let locked = s.legacy().join("clipboard/history.db");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();
        let result = migrate_app_data(&s.legacy(), &s.target());
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(result.is_err());
        assert!(!s.target().exists());
        assert!(!s.0.join("com.drummerms.recast.migrating").exists());
        assert_eq!(fs::read(&locked).unwrap(), b"sqlite bytes");
    }
}
