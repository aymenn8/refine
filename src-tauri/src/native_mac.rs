//! Native macOS helpers using the legacy objc/cocoa crates.
//! Separated from window.rs to avoid msg_send macro conflicts with tauri-nspanel's objc2.

#![allow(deprecated)]

use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};

#[cfg(target_os = "macos")]
use objc::*;

#[cfg(target_os = "macos")]
static PREVIOUS_APP_BUNDLE_ID: Mutex<Option<String>> = Mutex::new(None);


#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FrontmostAppInfo {
    pub name: String,
    pub bundle_id: String,
    pub bundle_path: String,
}

#[cfg(target_os = "macos")]
fn nsstring_to_string(ns_string: id) -> String {
    unsafe {
        if ns_string == nil {
            return String::new();
        }
        let utf8: *const i8 = msg_send![ns_string, UTF8String];
        if utf8.is_null() {
            return String::new();
        }
        std::ffi::CStr::from_ptr(utf8)
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(target_os = "macos")]
fn frontmost_app_info(store_previous: bool) -> FrontmostAppInfo {
    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let frontmost_app: id = msg_send![workspace, frontmostApplication];

        if frontmost_app == nil {
            return FrontmostAppInfo::default();
        }

        let name: id = msg_send![frontmost_app, localizedName];
        let bundle_id: id = msg_send![frontmost_app, bundleIdentifier];
        let bundle_url: id = msg_send![frontmost_app, bundleURL];
        let bundle_path: id = if bundle_url == nil {
            nil
        } else {
            msg_send![bundle_url, path]
        };

        let app_name = nsstring_to_string(name);
        let app_bundle_id = nsstring_to_string(bundle_id);

        if store_previous {
            if let Ok(mut prev_bundle) = PREVIOUS_APP_BUNDLE_ID.lock() {
                *prev_bundle = if app_bundle_id.is_empty() {
                    None
                } else {
                    Some(app_bundle_id.clone())
                };
            }
        }

        FrontmostAppInfo {
            name: app_name,
            bundle_id: app_bundle_id,
            bundle_path: nsstring_to_string(bundle_path),
        }
    }
}

/// Get the name of the frontmost app and store a reference for later reactivation.
#[cfg(target_os = "macos")]
pub fn get_and_store_frontmost_app() -> String {
    frontmost_app_info(true).name
}

#[cfg(not(target_os = "macos"))]
pub fn get_and_store_frontmost_app() -> String {
    String::new()
}

/// Return frontmost app metadata without mutating previous-app activation state.
#[cfg(target_os = "macos")]
pub fn get_frontmost_app_info() -> FrontmostAppInfo {
    frontmost_app_info(false)
}

#[cfg(not(target_os = "macos"))]
pub fn get_frontmost_app_info() -> FrontmostAppInfo {
    FrontmostAppInfo::default()
}

#[cfg(target_os = "macos")]
pub fn clipboard_change_count() -> i64 {
    unsafe {
        let pasteboard: id = msg_send![class!(NSPasteboard), generalPasteboard];
        if pasteboard == nil {
            return 0;
        }
        let count: isize = msg_send![pasteboard, changeCount];
        count as i64
    }
}

#[cfg(not(target_os = "macos"))]
pub fn clipboard_change_count() -> i64 {
    0
}

#[cfg(target_os = "macos")]
fn running_app(bundle_id: &str) -> Option<id> {
    unsafe {
        let ns_id: id = msg_send![class!(NSString), alloc];
        let ns_id: id = msg_send![ns_id, initWithBytes: bundle_id.as_ptr() length: bundle_id.len() encoding: 4usize];
        let ns_id: id = msg_send![ns_id, autorelease];
        let apps: id = msg_send![class!(NSRunningApplication), runningApplicationsWithBundleIdentifier: ns_id];
        let count: usize = msg_send![apps, count];
        if count == 0 {
            return None;
        }
        Some(msg_send![apps, objectAtIndex: 0usize])
    }
}

/// True if an app with this bundle ID is running.
#[cfg(target_os = "macos")]
pub fn is_app_running(bundle_id: &str) -> bool {
    objc::rc::autoreleasepool(|| running_app(bundle_id).is_some())
}

/// Brings the running app forward without relaunching it or opening a new window.
/// False if it isn't running.
#[cfg(target_os = "macos")]
pub fn activate_running_app(bundle_id: &str) -> bool {
    objc::rc::autoreleasepool(|| match running_app(bundle_id) {
        Some(app) => unsafe {
            const ACTIVATE_IGNORING_OTHER_APPS: usize = 1 << 1;
            let _: bool = msg_send![app, activateWithOptions: ACTIVATE_IGNORING_OTHER_APPS];
            true
        },
        None => false,
    })
}

/// Bundle ID of the app that was frontmost before the panel opened, if known.
#[cfg(target_os = "macos")]
pub fn previous_app_bundle_id() -> Option<String> {
    PREVIOUS_APP_BUNDLE_ID.lock().ok()?.clone().filter(|id| !id.is_empty())
}

/// Activate our own app so it receives keyboard events.
/// Call this AFTER the panel is already visible on the current space —
/// since the panel is already on-screen, this won't trigger a space switch.
#[cfg(target_os = "macos")]
pub fn activate_our_app() {
    unsafe {
        let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![ns_app, activateIgnoringOtherApps: objc::runtime::YES];
    }
}

#[cfg(not(target_os = "macos"))]
pub fn activate_our_app() {}
