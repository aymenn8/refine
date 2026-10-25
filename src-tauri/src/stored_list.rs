//! Loads saved lists (modes, credentials, flows, quick actions) without losing entries.
//!
//! Entries the current build can't read are kept in `<key>Backup` (a flat list of
//! entries). Once a later build can read one again, it is restored into the list.

use std::collections::HashSet;

use serde::de::DeserializeOwned;
use serde_json::Value;
use tauri::Runtime;
use tauri_plugin_store::Store;

struct Reconciled<T> {
    /// Entries to hand to the caller: the readable ones, plus any restored from the backup.
    items: Vec<T>,
    /// The list to store under the key, set only when something was restored.
    list_to_save: Option<Value>,
    /// The backup to store, set only when it changed.
    backup_to_save: Option<Value>,
}

fn id_of(entry: &Value) -> Option<String> {
    entry.get("id")?.as_str().map(str::to_string)
}

fn reconcile<T: DeserializeOwned>(raw: &Value, backup: Option<&Value>) -> Reconciled<T> {
    let mut items = Vec::new();
    let mut readable_raw = Vec::new();
    let mut unreadable = Vec::new();
    match raw.as_array() {
        Some(entries) => {
            for entry in entries {
                match serde_json::from_value::<T>(entry.clone()) {
                    Ok(item) => {
                        items.push(item);
                        readable_raw.push(entry.clone());
                    }
                    Err(_) => unreadable.push(entry.clone()),
                }
            }
        }
        None => unreadable.push(raw.clone()),
    }

    // The first backup format stored whole-list snapshots; flatten them into single
    // entries, flagged as legacy (`true`). A readable legacy entry may be one the user
    // has deleted since, so legacy entries are never restored, only kept if unreadable.
    let backed_up: Vec<(Value, bool)> = match backup {
        Some(Value::Array(entries)) => entries
            .iter()
            .flat_map(|e| match e {
                Value::Array(inner) => inner.iter().map(|i| (i.clone(), true)).collect(),
                other => vec![(other.clone(), false)],
            })
            .collect(),
        Some(other) => vec![(other.clone(), false)],
        None => Vec::new(),
    };

    let mut present: HashSet<String> = readable_raw.iter().filter_map(id_of).collect();
    let mut restored_raw = Vec::new();
    let mut kept: Vec<Value> = Vec::new();
    for (entry, legacy) in backed_up {
        match (serde_json::from_value::<T>(entry.clone()), id_of(&entry)) {
            (Ok(_), _) if legacy => {} // readable legacy snapshot entry: drop
            (Ok(item), Some(id)) => {
                // Readable again: restore it unless that id is already in the list.
                if present.insert(id) {
                    items.push(item);
                    restored_raw.push(entry);
                }
            }
            _ => {
                if !kept.contains(&entry) {
                    kept.push(entry);
                }
            }
        }
    }
    for entry in unreadable {
        if !kept.contains(&entry) {
            kept.push(entry);
        }
    }

    let new_backup = Value::Array(kept);
    let backup_to_save = match backup {
        None if new_backup.as_array().is_some_and(|k| k.is_empty()) => None,
        Some(old) if *old == new_backup => None,
        _ => Some(new_backup),
    };
    let list_to_save = (!restored_raw.is_empty()).then(|| {
        readable_raw.extend(restored_raw);
        Value::Array(readable_raw)
    });

    Reconciled { items, list_to_save, backup_to_save }
}

/// Reads the list saved under `key`. Entries that can't be read are left out and kept in
/// `{key}Backup`; backed-up entries that read again are restored into the list. The backup
/// is updated before the list, so a later save can never destroy the only copy.
/// Returns None when nothing is saved under `key`.
pub fn load_list<R: Runtime, T: DeserializeOwned>(store: &Store<R>, key: &str) -> Option<Vec<T>> {
    let raw = store.get(key)?;
    let backup_key = format!("{key}Backup");
    let result = reconcile::<T>(&raw, store.get(&backup_key).as_ref());
    if let Some(backup) = result.backup_to_save {
        eprintln!("[stored_list] {key}: updated {backup_key} (unreadable entries are kept there)");
        store.set(backup_key.clone(), backup);
    }
    if let Some(list) = result.list_to_save {
        eprintln!("[stored_list] {key}: restored entries from {backup_key}");
        store.set(key, list);
    }
    Some(result.items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::ApiCredential;
    use serde_json::json;

    fn credential(id: &str, provider: &str) -> Value {
        json!({
            "id": id,
            "provider": provider,
            "model_id": "some-model",
            "display_name": id,
            "created_at": 1
        })
    }

    fn ids(items: &[ApiCredential]) -> Vec<&str> {
        items.iter().map(|c| c.id.as_str()).collect()
    }

    #[test]
    fn keeps_readable_entries_and_backs_up_the_unreadable_one() {
        let (a, b) = (credential("a", "openai"), credential("b", "not_a_provider"));
        let r = reconcile::<ApiCredential>(&json!([a, b.clone()]), None);
        assert_eq!(ids(&r.items), ["a"]);
        assert_eq!(r.backup_to_save, Some(json!([b])));
        assert_eq!(r.list_to_save, None);
    }

    #[test]
    fn does_not_touch_storage_when_everything_reads() {
        let raw = json!([credential("a", "openai"), credential("c", "anthropic")]);
        let r = reconcile::<ApiCredential>(&raw, None);
        assert_eq!(ids(&r.items), ["a", "c"]);
        assert_eq!((r.backup_to_save, r.list_to_save), (None, None));
    }

    #[test]
    fn treats_a_non_list_value_as_one_unreadable_entry() {
        let raw = json!({ "not": "a list" });
        let r = reconcile::<ApiCredential>(&raw, None);
        assert!(r.items.is_empty());
        assert_eq!(r.backup_to_save, Some(json!([raw])));
    }

    #[test]
    fn does_not_back_up_the_same_entry_twice() {
        let b = credential("b", "not_a_provider");
        let r = reconcile::<ApiCredential>(&json!([credential("a", "openai"), b.clone()]), Some(&json!([b])));
        assert_eq!(r.backup_to_save, None);
    }

    #[test]
    fn restores_a_backup_entry_that_reads_now() {
        let (a, d) = (credential("a", "openai"), credential("d", "openai"));
        let r = reconcile::<ApiCredential>(&json!([a.clone()]), Some(&json!([d.clone()])));
        assert_eq!(ids(&r.items), ["a", "d"]);
        assert_eq!(r.list_to_save, Some(json!([a, d])));
        assert_eq!(r.backup_to_save, Some(json!([])));
    }

    #[test]
    fn drops_backup_entries_already_in_the_list() {
        let a = credential("a", "openai");
        let r = reconcile::<ApiCredential>(&json!([a.clone()]), Some(&json!([a])));
        assert_eq!(ids(&r.items), ["a"]);
        assert_eq!(r.backup_to_save, Some(json!([])));
        assert_eq!(r.list_to_save, None);
    }

    #[test]
    fn flattens_the_old_backup_format() {
        let (a, b) = (credential("a", "openai"), credential("b", "not_a_provider"));
        let r = reconcile::<ApiCredential>(&json!([a.clone()]), Some(&json!([[a, b.clone()]])));
        assert_eq!(r.backup_to_save, Some(json!([b])));
        assert_eq!(r.list_to_save, None);
    }

    #[test]
    fn never_restores_readable_entries_from_the_old_backup_format() {
        // The old format snapshotted whole lists, so a readable entry there may be one
        // the user deleted since; it must not come back.
        let (a, b) = (credential("a", "openai"), credential("b", "not_a_provider"));
        let r = reconcile::<ApiCredential>(&json!([]), Some(&json!([[a, b.clone()]])));
        assert!(r.items.is_empty());
        assert_eq!(r.list_to_save, None);
        assert_eq!(r.backup_to_save, Some(json!([b])));
    }

    #[test]
    fn keeps_unreadable_backup_entries() {
        let b = credential("b", "not_a_provider");
        let r = reconcile::<ApiCredential>(&json!([credential("a", "openai")]), Some(&json!([b])));
        assert_eq!(r.backup_to_save, None);
    }
}
