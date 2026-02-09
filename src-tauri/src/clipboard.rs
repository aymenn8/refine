use chrono::{Duration as ChronoDuration, Utc};
use plist::Value;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

const POLL_INTERVAL_MS: u64 = 350;
const MAX_HISTORY_ITEMS: usize = 500;
const MAX_TEXT_CHARS: usize = 20_000;
const MAX_DB_SIZE_BYTES: u64 = 25 * 1024 * 1024;
const ICON_CACHE_MAX_BYTES: u64 = 20 * 1024 * 1024;
const ICON_CACHE_MAX_FILES: usize = 200;
const RETENTION_DAYS: i64 = 30;
const STORE_SOURCE_ICONS: bool = false;

pub struct ClipboardState {
    pub last_content: Mutex<String>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self {
            last_content: Mutex::new(String::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardHistoryEntry {
    pub id: i64,
    pub text: String,
    pub copied_at: i64,
    pub source_app_name: String,
    pub source_bundle_id: String,
    pub source_icon_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardHistoryPage {
    pub entries: Vec<ClipboardHistoryEntry>,
    pub total: usize,
    pub has_more: bool,
}

fn app_data_clipboard_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("clipboard");

    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create clipboard dir {}: {}", dir.display(), e))?;

    Ok(dir)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_clipboard_dir(app)?.join("history.db"))
}

fn icons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_clipboard_dir(app)?.join("icons");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create icons dir {}: {}", dir.display(), e))?;
    Ok(dir)
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(&path)
        .map_err(|e| format!("Failed to open sqlite db {}: {}", path.display(), e))?;

    conn.busy_timeout(Duration::from_millis(1500))
        .map_err(|e| format!("Failed to set sqlite busy timeout: {}", e))?;
    let _ = conn.pragma_update(None, "journal_mode", "WAL");

    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS clipboard_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT NOT NULL DEFAULT 'text',
            text_content TEXT NOT NULL,
            source_app_name TEXT NOT NULL DEFAULT '',
            source_bundle_id TEXT NOT NULL DEFAULT '',
            source_icon_path TEXT,
            copied_at INTEGER NOT NULL,
            content_hash TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_clipboard_entries_copied_at
            ON clipboard_entries(copied_at DESC);

        CREATE INDEX IF NOT EXISTS idx_clipboard_entries_hash
            ON clipboard_entries(content_hash);
        ",
    )
    .map_err(|e| format!("Failed to init clipboard schema: {}", e))
}

pub fn init_clipboard_store(app: &AppHandle) -> Result<(), String> {
    let conn = open_db(app)?;
    init_schema(&conn)?;
    Ok(())
}

fn normalized_text(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.chars().count() > MAX_TEXT_CHARS {
        Some(trimmed.chars().take(MAX_TEXT_CHARS).collect())
    } else {
        Some(trimmed.to_string())
    }
}

fn hash_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn sanitize_filename_component(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn dict_get_str<'a>(dict: &'a plist::Dictionary, key: &str) -> Option<&'a str> {
    dict.get(key)?.as_string()
}

fn find_icon_name(info: &Value) -> Option<String> {
    let dict = info.as_dictionary()?;

    if let Some(name) = dict_get_str(dict, "CFBundleIconFile") {
        return Some(name.to_string());
    }

    if let Some(icons) = dict.get("CFBundleIcons").and_then(|v| v.as_dictionary()) {
        if let Some(primary) = icons
            .get("CFBundlePrimaryIcon")
            .and_then(|v| v.as_dictionary())
        {
            if let Some(files) = primary
                .get("CFBundleIconFiles")
                .and_then(|v| v.as_array())
            {
                if let Some(name) = files.iter().rev().find_map(|v| v.as_string()) {
                    return Some(name.to_string());
                }
            }
        }
    }

    dict_get_str(dict, "CFBundleIconName").map(ToString::to_string)
}

fn resolve_icns_path(bundle_path: &Path) -> Option<PathBuf> {
    let info_plist = bundle_path.join("Contents").join("Info.plist");
    if !info_plist.exists() {
        return None;
    }

    let info = Value::from_file(&info_plist).ok()?;
    let resources_dir = bundle_path.join("Contents").join("Resources");

    if let Some(mut name) = find_icon_name(&info) {
        let mut candidates = Vec::new();

        if name.ends_with(".icns") {
            candidates.push(name.clone());
        } else {
            candidates.push(name.clone());
            name.push_str(".icns");
            candidates.push(name.clone());
        }

        for candidate in candidates {
            let icon_path = resources_dir.join(candidate);
            if icon_path.exists() {
                return Some(icon_path);
            }
        }
    }

    let fallback = resources_dir.join("AppIcon.icns");
    if fallback.exists() {
        return Some(fallback);
    }

    if let Ok(entries) = fs::read_dir(resources_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_icns = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("icns"))
                .unwrap_or(false);

            if is_icns {
                return Some(path);
            }
        }
    }

    None
}

fn normalized_bundle_path(raw_bundle_path: &str) -> Option<PathBuf> {
    if raw_bundle_path.is_empty() {
        return None;
    }

    let bundle_path = PathBuf::from(raw_bundle_path);

    if bundle_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("app"))
        .unwrap_or(false)
    {
        return Some(bundle_path);
    }

    if bundle_path.join("Contents").join("Info.plist").exists() {
        return Some(bundle_path);
    }

    for ancestor in bundle_path.ancestors() {
        let is_app_bundle = ancestor
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("app"))
            .unwrap_or(false);

        if is_app_bundle {
            return Some(ancestor.to_path_buf());
        }
    }

    None
}

fn maybe_resolve_icon_path(
    app: &AppHandle,
    source: &crate::native_mac::FrontmostAppInfo,
) -> Option<String> {
    if source.bundle_path.is_empty() {
        return None;
    }

    let icon_cache_dir = icons_dir(app).ok()?;
    let identity = if !source.bundle_id.is_empty() {
        source.bundle_id.clone()
    } else {
        hash_text(&source.bundle_path)
    };

    let icon_file = format!("{}.png", sanitize_filename_component(&identity));
    let icon_png_path = icon_cache_dir.join(icon_file);
    if icon_png_path.exists() {
        return Some(icon_png_path.to_string_lossy().into_owned());
    }

    let bundle_path = normalized_bundle_path(&source.bundle_path)?;
    let icns_path = resolve_icns_path(Path::new(&bundle_path))?;
    let status = Command::new("sips")
        .arg("-z")
        .arg("64")
        .arg("64")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(&icns_path)
        .arg("--out")
        .arg(&icon_png_path)
        .status()
        .ok()?;

    if status.success() && icon_png_path.exists() {
        prune_icon_cache(&icon_cache_dir);
        return Some(icon_png_path.to_string_lossy().into_owned());
    }

    None
}

fn prune_icon_cache(cache_dir: &Path) {
    let mut files = match fs::read_dir(cache_dir) {
        Ok(entries) => entries
            .flatten()
            .filter_map(|entry| {
                let path = entry.path();
                let metadata = entry.metadata().ok()?;
                if !metadata.is_file() {
                    return None;
                }
                let modified = metadata.modified().ok();
                Some((path, metadata.len(), modified))
            })
            .collect::<Vec<_>>(),
        Err(_) => return,
    };

    files.sort_by(|a, b| b.2.cmp(&a.2));

    let mut total_bytes: u64 = files.iter().map(|(_, len, _)| *len).sum();

    for (index, (path, len, _)) in files.iter().enumerate() {
        let over_count = index >= ICON_CACHE_MAX_FILES;
        let over_size = total_bytes > ICON_CACHE_MAX_BYTES;

        if over_count || over_size {
            let _ = fs::remove_file(path);
            total_bytes = total_bytes.saturating_sub(*len);
        }
    }
}

fn prune_history(conn: &Connection, app: &AppHandle) -> Result<(), String> {
    let cutoff = (Utc::now() - ChronoDuration::days(RETENTION_DAYS)).timestamp();

    conn.execute(
        "DELETE FROM clipboard_entries WHERE copied_at < ?1",
        params![cutoff],
    )
    .map_err(|e| format!("Failed to prune old clipboard entries: {}", e))?;

    conn.execute(
        "DELETE FROM clipboard_entries WHERE id IN (
            SELECT id FROM clipboard_entries
            ORDER BY copied_at DESC
            LIMIT -1 OFFSET ?1
        )",
        params![MAX_HISTORY_ITEMS as i64],
    )
    .map_err(|e| format!("Failed to prune clipboard entry count: {}", e))?;

    let db_file = db_path(app)?;
    let size = fs::metadata(&db_file).map(|m| m.len()).unwrap_or(0);

    if size > MAX_DB_SIZE_BYTES {
        conn.execute(
            "DELETE FROM clipboard_entries WHERE id IN (
                SELECT id FROM clipboard_entries
                ORDER BY copied_at ASC
                LIMIT 100
            )",
            [],
        )
        .map_err(|e| format!("Failed to prune oversized clipboard db: {}", e))?;

        let _ = conn.execute_batch("VACUUM;");
    }

    Ok(())
}

fn upsert_history(
    app: &AppHandle,
    text: String,
    source: crate::native_mac::FrontmostAppInfo,
) -> Result<(), String> {
    let normalized_source_name = if source.name.trim().is_empty() {
        if !source.bundle_id.trim().is_empty() {
            source
                .bundle_id
                .rsplit('.')
                .next()
                .filter(|part| !part.is_empty())
                .map(|part| part.replace(['-', '_'], " "))
                .unwrap_or_else(|| "Unknown App".to_string())
        } else {
            "Unknown App".to_string()
        }
    } else {
        source.name.clone()
    };

    let content_hash = hash_text(&text);
    let now = Utc::now().timestamp();

    let mut conn = open_db(app)?;
    init_schema(&conn)?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start clipboard transaction: {}", e))?;

    let existing_id: Option<i64> = tx
        .query_row(
            "SELECT id FROM clipboard_entries WHERE content_hash = ?1 ORDER BY copied_at DESC LIMIT 1",
            params![content_hash],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to query existing clipboard entry: {}", e))?;

    let icon_path = if STORE_SOURCE_ICONS {
        maybe_resolve_icon_path(app, &source)
    } else {
        None
    };

    if let Some(id) = existing_id {
        tx.execute(
            "UPDATE clipboard_entries
             SET text_content = ?1,
                 source_app_name = ?2,
                 source_bundle_id = ?3,
                 source_icon_path = ?4,
                 copied_at = ?5
             WHERE id = ?6",
            params![
                text,
                normalized_source_name,
                source.bundle_id,
                icon_path,
                now,
                id
            ],
        )
        .map_err(|e| format!("Failed to update clipboard entry: {}", e))?;
    } else {
        tx.execute(
            "INSERT INTO clipboard_entries (
                content_type,
                text_content,
                source_app_name,
                source_bundle_id,
                source_icon_path,
                copied_at,
                content_hash
            ) VALUES ('text', ?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                text,
                normalized_source_name,
                source.bundle_id,
                icon_path,
                now,
                content_hash
            ],
        )
        .map_err(|e| format!("Failed to insert clipboard entry: {}", e))?;
    }

    prune_history(&tx, app)?;

    tx.commit()
        .map_err(|e| format!("Failed to commit clipboard transaction: {}", e))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn capture_frontmost_app_info(app: &AppHandle) -> crate::native_mac::FrontmostAppInfo {
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    if app
        .run_on_main_thread(move || {
            let info = crate::native_mac::get_frontmost_app_info();
            let _ = tx.send(info);
        })
        .is_ok()
    {
        if let Ok(info) = rx.recv_timeout(Duration::from_millis(250)) {
            return info;
        }
    }

    crate::native_mac::get_frontmost_app_info()
}

#[cfg(not(target_os = "macos"))]
fn capture_frontmost_app_info(_app: &AppHandle) -> crate::native_mac::FrontmostAppInfo {
    crate::native_mac::get_frontmost_app_info()
}

fn query_history(
    app: &AppHandle,
    offset: usize,
    limit: usize,
    query: &str,
) -> Result<ClipboardHistoryPage, String> {
    let conn = open_db(app)?;
    init_schema(&conn)?;

    let safe_limit = limit.clamp(1, 200);
    let needle = query.trim();
    let search = format!("%{}%", needle.replace('%', "\\%").replace('_', "\\_"));

    let total: i64 = if needle.is_empty() {
        conn.query_row("SELECT COUNT(*) FROM clipboard_entries", [], |row| row.get(0))
            .map_err(|e| format!("Failed to count clipboard entries: {}", e))?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM clipboard_entries
             WHERE LOWER(text_content) LIKE LOWER(?1) ESCAPE '\\'",
            params![search],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count filtered clipboard entries: {}", e))?
    };

    let mut entries = Vec::new();

    if needle.is_empty() {
        let mut stmt = conn
            .prepare(
                "SELECT id, text_content, copied_at, source_app_name, source_bundle_id, source_icon_path
                 FROM clipboard_entries
                 ORDER BY copied_at DESC
                 LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| format!("Failed to prepare clipboard query: {}", e))?;

        let rows = stmt
            .query_map(params![safe_limit as i64, offset as i64], |row| {
                Ok(ClipboardHistoryEntry {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    copied_at: row.get(2)?,
                    source_app_name: row.get(3)?,
                    source_bundle_id: row.get(4)?,
                    source_icon_path: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to execute clipboard query: {}", e))?;

        for row in rows {
            entries.push(row.map_err(|e| format!("Failed to read clipboard row: {}", e))?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, text_content, copied_at, source_app_name, source_bundle_id, source_icon_path
                 FROM clipboard_entries
                 WHERE LOWER(text_content) LIKE LOWER(?1) ESCAPE '\\'
                 ORDER BY copied_at DESC
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| format!("Failed to prepare filtered clipboard query: {}", e))?;

        let rows = stmt
            .query_map(params![search, safe_limit as i64, offset as i64], |row| {
                Ok(ClipboardHistoryEntry {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    copied_at: row.get(2)?,
                    source_app_name: row.get(3)?,
                    source_bundle_id: row.get(4)?,
                    source_icon_path: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to execute filtered clipboard query: {}", e))?;

        for row in rows {
            entries.push(row.map_err(|e| format!("Failed to read filtered clipboard row: {}", e))?);
        }
    }

    let total_usize = total.max(0) as usize;
    Ok(ClipboardHistoryPage {
        has_more: offset + entries.len() < total_usize,
        total: total_usize,
        entries,
    })
}

fn get_entry_text(app: &AppHandle, id: i64) -> Result<Option<String>, String> {
    let conn = open_db(app)?;
    init_schema(&conn)?;

    conn.query_row(
        "SELECT text_content FROM clipboard_entries WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("Failed to load clipboard entry {}: {}", id, e))
}

fn touch_entry(app: &AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(app)?;
    init_schema(&conn)?;

    conn.execute(
        "UPDATE clipboard_entries SET copied_at = ?1 WHERE id = ?2",
        params![Utc::now().timestamp(), id],
    )
    .map_err(|e| format!("Failed to update clipboard recency: {}", e))?;

    prune_history(&conn, app)?;
    Ok(())
}

/// Start monitoring the clipboard in the background.
pub fn start_clipboard_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_change_count = crate::native_mac::clipboard_change_count();

        loop {
            std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));

            let current_change_count = crate::native_mac::clipboard_change_count();
            let uses_change_count = current_change_count > 0;
            if uses_change_count {
                if current_change_count == last_change_count {
                    continue;
                }
                last_change_count = current_change_count;
            }

            let current_text = match app.clipboard().read_text() {
                Ok(text) => text,
                Err(_) => continue,
            };

            let text = match normalized_text(&current_text) {
                Some(value) => value,
                None => continue,
            };

            let state = app.state::<ClipboardState>();
            let mut last = match state.last_content.lock() {
                Ok(lock) => lock,
                Err(_) => continue,
            };

            if !uses_change_count && *last == text {
                continue;
            }
            *last = text.clone();
            drop(last);

            let source = capture_frontmost_app_info(&app);
            if source.bundle_id == app.config().identifier {
                continue;
            }

            if let Err(e) = upsert_history(&app, text, source) {
                eprintln!("[clipboard] Failed to upsert history: {}", e);
            }
        }
    });
}

/// Backward-compatible command: return latest text-only items.
#[tauri::command]
pub async fn get_clipboard_history(app: AppHandle) -> Result<Vec<String>, String> {
    let page = query_history(&app, 0, 50, "")?;
    Ok(page.entries.into_iter().map(|item| item.text).collect())
}

#[tauri::command]
pub async fn query_clipboard_history(
    app: AppHandle,
    offset: usize,
    limit: usize,
    query: Option<String>,
) -> Result<ClipboardHistoryPage, String> {
    query_history(&app, offset, limit, query.as_deref().unwrap_or_default())
}

#[tauri::command]
pub async fn recopy_clipboard_history_entry(app: AppHandle, id: i64) -> Result<(), String> {
    let Some(text) = get_entry_text(&app, id)? else {
        return Err(format!("Clipboard entry {} not found", id));
    };

    app.clipboard()
        .write_text(&text)
        .map_err(|e| format!("Failed to write clipboard text: {}", e))?;

    touch_entry(&app, id)
}

#[tauri::command]
pub async fn paste_clipboard_history_entry(app: AppHandle, id: i64) -> Result<(), String> {
    let Some(text) = get_entry_text(&app, id)? else {
        return Err(format!("Clipboard entry {} not found", id));
    };

    touch_entry(&app, id)?;
    crate::commands::paste_to_previous_app(app, text).await
}

#[tauri::command]
pub async fn clear_clipboard_history(app: AppHandle) -> Result<(), String> {
    let conn = open_db(&app)?;
    init_schema(&conn)?;

    conn.execute("DELETE FROM clipboard_entries", [])
        .map_err(|e| format!("Failed to clear clipboard history: {}", e))?;

    if let Ok(icon_cache_dir) = icons_dir(&app) {
        if let Ok(entries) = fs::read_dir(&icon_cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }

    let _ = conn.execute_batch("VACUUM;");

    Ok(())
}
