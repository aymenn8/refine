//! Loads saved lists (modes, credentials, flows, quick actions) without losing entries.

use serde::de::DeserializeOwned;
use serde_json::Value;
use tauri::Runtime;
use tauri_plugin_store::Store;

/// Returns the entries of a stored list that can be read, and whether anything
/// was left out (including a value that isn't a list at all).
fn split_readable<T: DeserializeOwned>(raw: &Value) -> (Vec<T>, bool) {
    let Some(entries) = raw.as_array() else {
        return (Vec::new(), true);
    };
    let items: Vec<T> = entries
        .iter()
        .filter_map(|entry| serde_json::from_value(entry.clone()).ok())
        .collect();
    let dropped = items.len() != entries.len();
    (items, dropped)
}

/// Returns the backup list with `raw` added, or None if it is already backed up.
fn with_backup(existing: Option<Value>, raw: &Value) -> Option<Value> {
    let mut backups = match existing {
        Some(Value::Array(backups)) => backups,
        Some(other) => vec![other],
        None => Vec::new(),
    };
    if backups.contains(raw) {
        return None;
    }
    backups.push(raw.clone());
    Some(Value::Array(backups))
}

/// Reads the list saved under `key`. Entries that can't be read are left out, and
/// the original value is first copied to `{key}Backup` in the same store, so a later
/// save can never destroy the only copy. Returns None when nothing is saved.
pub fn load_list<R: Runtime, T: DeserializeOwned>(store: &Store<R>, key: &str) -> Option<Vec<T>> {
    let raw = store.get(key)?;
    let (items, dropped) = split_readable(&raw);
    if dropped {
        let backup_key = format!("{key}Backup");
        eprintln!("[stored_list] {key}: some saved entries could not be read; original kept in {backup_key}");
        if let Some(backup) = with_backup(store.get(&backup_key), &raw) {
            store.set(backup_key, backup);
        }
    }
    Some(items)
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

    #[test]
    fn keeps_readable_credentials_when_one_has_an_unknown_provider() {
        let raw = json!([credential("a", "openai"), credential("b", "openai_compatible")]);
        let (items, dropped) = split_readable::<ApiCredential>(&raw);
        assert_eq!(items.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), ["a"]);
        assert!(dropped);
    }

    #[test]
    fn flags_a_saved_value_that_is_not_a_list() {
        let (items, dropped) = split_readable::<ApiCredential>(&json!({ "not": "a list" }));
        assert!(items.is_empty());
        assert!(dropped);
    }

    #[test]
    fn does_not_flag_a_fully_readable_list() {
        let raw = json!([credential("a", "openai"), credential("b", "anthropic")]);
        let (items, dropped) = split_readable::<ApiCredential>(&raw);
        assert_eq!(items.len(), 2);
        assert!(!dropped);
    }

    #[test]
    fn backup_adds_the_original_only_once() {
        let raw = json!([credential("b", "openai_compatible")]);
        let first = with_backup(None, &raw).expect("first backup is written");
        assert_eq!(first, json!([raw.clone()]));
        assert_eq!(with_backup(Some(first), &raw), None);
    }

    #[test]
    fn backup_keeps_earlier_copies() {
        let older = json!([credential("x", "bogus")]);
        let newer = json!([credential("y", "bogus")]);
        let backup = with_backup(Some(json!([older.clone()])), &newer);
        assert_eq!(backup, Some(json!([older, newer])));
    }
}
