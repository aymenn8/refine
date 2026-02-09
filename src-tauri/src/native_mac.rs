//! Native macOS helpers using the legacy objc/cocoa crates.
//! Separated from window.rs to avoid msg_send macro conflicts with tauri-nspanel's objc2.

#![allow(deprecated)]

use std::sync::Mutex;

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};

#[cfg(target_os = "macos")]
use objc::*;

#[cfg(target_os = "macos")]
static PREVIOUS_APP: Mutex<Option<usize>> = Mutex::new(None);

#[cfg(not(target_os = "macos"))]
static PREVIOUS_APP: Mutex<Option<usize>> = Mutex::new(None);

/// Get the name of the frontmost app and store a reference for later reactivation.
#[cfg(target_os = "macos")]
pub fn get_and_store_frontmost_app() -> String {
    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let frontmost_app: id = msg_send![workspace, frontmostApplication];

        if frontmost_app == nil {
            return String::new();
        }

        if let Ok(mut prev) = PREVIOUS_APP.lock() {
            *prev = Some(frontmost_app as usize);
        }

        let name: id = msg_send![frontmost_app, localizedName];
        if name == nil {
            return String::new();
        }

        let utf8: *const i8 = msg_send![name, UTF8String];
        if utf8.is_null() {
            return String::new();
        }

        std::ffi::CStr::from_ptr(utf8)
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(not(target_os = "macos"))]
pub fn get_and_store_frontmost_app() -> String {
    String::new()
}

/// Reactivate the previously stored frontmost app.
#[cfg(target_os = "macos")]
pub fn activate_previous_app() {
    unsafe {
        if let Ok(prev) = PREVIOUS_APP.lock() {
            if let Some(app_ptr) = *prev {
                let app = app_ptr as id;
                let _: i8 = msg_send![app, activateWithOptions: 2u64];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn activate_previous_app() {}

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
