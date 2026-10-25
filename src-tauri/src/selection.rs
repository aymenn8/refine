//! Selected-text capture (⌘C) and paste-back (⌘V) that always put the user's clipboard back.

use std::time::{Duration, Instant};

pub const NOT_FRONTMOST: &str = "Couldn't switch back to the original app — nothing was pasted.";
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const KEYSTROKE_FAILED: &str = "Refine couldn't send keystrokes. Allow it in System Settings → Privacy & Security → Accessibility (and Automation → System Events).";

pub struct Timings {
    pub modifier_wait: Duration,
    pub change_wait: Duration,
    pub frontmost_wait: Duration,
    pub poll: Duration,
}

impl Default for Timings {
    fn default() -> Self {
        Timings {
            modifier_wait: Duration::from_millis(500),
            change_wait: Duration::from_millis(500),
            frontmost_wait: Duration::from_millis(1000),
            poll: Duration::from_millis(10),
        }
    }
}

/// True as soon as `done()` is; false once `timeout` has passed.
pub fn wait_until(timeout: Duration, poll: Duration, mut done: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if done() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(poll);
    }
}

pub struct CaptureOps<'a, S> {
    pub snapshot: Box<dyn FnMut() -> S + 'a>,
    pub restore: Box<dyn FnMut(&S) + 'a>,
    pub modifiers_held: Box<dyn FnMut() -> bool + 'a>,
    pub change_count: Box<dyn FnMut() -> i64 + 'a>,
    pub send_copy: Box<dyn FnMut() -> Result<(), String> + 'a>,
    pub read_text: Box<dyn FnMut() -> String + 'a>,
}

/// Copies the selection and returns it, then puts the clipboard back.
/// Empty when nothing was selected (the clipboard never changed).
pub fn capture_with<S>(mut ops: CaptureOps<S>, t: Timings) -> Result<String, String> {
    let snap = (ops.snapshot)();
    // ⌘C while the user still holds ⌃ or ⇧ would arrive as a different shortcut.
    wait_until(t.modifier_wait, t.poll, || !(ops.modifiers_held)());
    let before = (ops.change_count)();
    (ops.send_copy)()?;
    if !wait_until(t.change_wait, t.poll, || (ops.change_count)() != before) {
        return Ok(String::new());
    }
    let text = (ops.read_text)();
    (ops.restore)(&snap);
    Ok(text)
}

pub struct PasteOps<'a, S> {
    pub snapshot: Box<dyn FnMut() -> S + 'a>,
    pub write_text: Box<dyn FnMut(&str) -> Result<(), String> + 'a>,
    pub activate_target: Box<dyn FnMut() + 'a>,
    pub target_is_frontmost: Box<dyn FnMut() -> bool + 'a>,
    pub send_paste: Box<dyn FnMut() -> Result<(), String> + 'a>,
    pub restore: Box<dyn FnMut(&S) + 'a>,
    pub settle: Box<dyn FnMut() + 'a>,
}

/// Pastes `text` into the target app only if it is frontmost; always puts the clipboard back.
pub fn guarded_paste_with<S>(mut ops: PasteOps<S>, text: &str, t: Timings) -> Result<(), String> {
    let snap = (ops.snapshot)();
    (ops.write_text)(text)?;
    (ops.activate_target)();
    if !wait_until(t.frontmost_wait, t.poll, || (ops.target_is_frontmost)()) {
        (ops.restore)(&snap);
        return Err(NOT_FRONTMOST.to_string());
    }
    if let Err(e) = (ops.send_paste)() {
        (ops.restore)(&snap);
        return Err(e);
    }
    (ops.settle)();
    (ops.restore)(&snap);
    Ok(())
}

#[cfg(target_os = "macos")]
fn keystroke(key: &str) -> Result<(), String> {
    let script = format!("tell application \"System Events\" to keystroke \"{key}\" using command down");
    match std::process::Command::new("osascript").arg("-e").arg(script).output() {
        Ok(out) if out.status.success() => Ok(()),
        _ => Err(KEYSTROKE_FAILED.to_string()),
    }
}

/// The frontmost app's selected text (empty if none), with the clipboard left as it was.
#[cfg(target_os = "macos")]
pub fn capture_selection() -> Result<String, String> {
    use crate::pasteboard;
    capture_with(
        CaptureOps {
            snapshot: Box::new(pasteboard::snapshot_general),
            restore: Box::new(pasteboard::restore_general),
            modifiers_held: Box::new(pasteboard::modifiers_held),
            change_count: Box::new(pasteboard::general_change_count),
            send_copy: Box::new(|| keystroke("c")),
            read_text: Box::new(pasteboard::read_general_text),
        },
        Timings::default(),
    )
}

#[cfg(not(target_os = "macos"))]
pub fn capture_selection() -> Result<String, String> {
    Err("Capturing the selection is only supported on macOS.".to_string())
}

/// Pastes `text` into the app that was frontmost before the panel opened.
#[cfg(target_os = "macos")]
pub fn paste_into_previous_app(text: &str) -> Result<(), String> {
    use crate::{native_mac, pasteboard};
    let Some(target) = native_mac::previous_app_bundle_id() else {
        return Err(NOT_FRONTMOST.to_string());
    };
    guarded_paste_with(
        PasteOps {
            snapshot: Box::new(pasteboard::snapshot_general),
            write_text: Box::new(|t| {
                pasteboard::write_general_text_transient(t);
                Ok(())
            }),
            activate_target: Box::new(native_mac::activate_previous_app),
            target_is_frontmost: Box::new(move || native_mac::get_frontmost_app_info().bundle_id == target),
            send_paste: Box::new(|| keystroke("v")),
            restore: Box::new(pasteboard::restore_general),
            settle: Box::new(|| std::thread::sleep(Duration::from_millis(500))),
        },
        text,
        Timings::default(),
    )
}

#[cfg(not(target_os = "macos"))]
pub fn paste_into_previous_app(_text: &str) -> Result<(), String> {
    Err("Pasting is only supported on macOS.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    fn timings() -> Timings {
        Timings {
            modifier_wait: Duration::from_millis(100),
            change_wait: Duration::from_millis(20),
            frontmost_wait: Duration::from_millis(20),
            poll: Duration::from_millis(1),
        }
    }

    /// Capture fakes: ⌘C bumps the change count from 1 to 2; the selection is "sel".
    fn capture_ops<'a>(log: &'a RefCell<Vec<&'static str>>, copied: &'a Cell<bool>) -> CaptureOps<'a, u8> {
        CaptureOps {
            snapshot: Box::new(move || {
                log.borrow_mut().push("snapshot");
                7
            }),
            restore: Box::new(move |s| {
                assert_eq!(*s, 7);
                log.borrow_mut().push("restore");
            }),
            modifiers_held: Box::new(|| false),
            change_count: Box::new(move || if copied.get() { 2 } else { 1 }),
            send_copy: Box::new(move || {
                log.borrow_mut().push("copy");
                copied.set(true);
                Ok(())
            }),
            read_text: Box::new(move || {
                log.borrow_mut().push("read");
                "sel".to_string()
            }),
        }
    }

    fn paste_ops<'a>(log: &'a RefCell<Vec<&'static str>>, frontmost: bool) -> PasteOps<'a, u8> {
        PasteOps {
            snapshot: Box::new(move || {
                log.borrow_mut().push("snapshot");
                7
            }),
            write_text: Box::new(move |t| {
                assert_eq!(t, "result");
                log.borrow_mut().push("write");
                Ok(())
            }),
            activate_target: Box::new(move || log.borrow_mut().push("activate")),
            target_is_frontmost: Box::new(move || frontmost),
            send_paste: Box::new(move || {
                log.borrow_mut().push("paste");
                Ok(())
            }),
            restore: Box::new(move |s| {
                assert_eq!(*s, 7);
                log.borrow_mut().push("restore");
            }),
            settle: Box::new(move || log.borrow_mut().push("settle")),
        }
    }

    #[test]
    fn wait_until_returns_true_once_done() {
        let calls = Cell::new(0);
        let done = wait_until(Duration::from_millis(50), Duration::from_millis(1), || {
            calls.set(calls.get() + 1);
            calls.get() >= 3
        });
        assert!(done);
        assert_eq!(calls.get(), 3);
    }

    #[test]
    fn wait_until_times_out() {
        let start = Instant::now();
        assert!(!wait_until(Duration::from_millis(20), Duration::from_millis(1), || false));
        assert!(start.elapsed() >= Duration::from_millis(20));
        assert!(start.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn capture_restores_the_clipboard_after_reading() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        assert_eq!(capture_with(capture_ops(&log, &copied), timings()), Ok("sel".to_string()));
        assert_eq!(*log.borrow(), ["snapshot", "copy", "read", "restore"]);
    }

    #[test]
    fn capture_leaves_clipboard_alone_when_nothing_selected() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = capture_ops(&log, &copied);
        ops.change_count = Box::new(|| 1);
        assert_eq!(capture_with(ops, timings()), Ok(String::new()));
        assert!(!log.borrow().contains(&"read"));
        assert!(!log.borrow().contains(&"restore"));
    }

    #[test]
    fn capture_reports_keystroke_failure() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = capture_ops(&log, &copied);
        ops.send_copy = Box::new(|| Err("denied".to_string()));
        assert_eq!(capture_with(ops, timings()), Err("denied".to_string()));
        assert!(!log.borrow().contains(&"restore"));
    }

    #[test]
    fn capture_waits_for_modifier_release() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let checks = Cell::new(0);
        let mut ops = capture_ops(&log, &copied);
        // Held for the first 3 checks, released on the 4th.
        ops.modifiers_held = Box::new(|| {
            checks.set(checks.get() + 1);
            log.borrow_mut().push("mods");
            checks.get() <= 3
        });
        assert_eq!(capture_with(ops, timings()), Ok("sel".to_string()));
        let log = log.borrow();
        let copy_at = log.iter().position(|e| *e == "copy").unwrap();
        assert_eq!(log[..copy_at].iter().filter(|e| **e == "mods").count(), 4);
    }

    #[test]
    fn paste_writes_pastes_then_restores() {
        let log = RefCell::new(vec![]);
        assert_eq!(guarded_paste_with(paste_ops(&log, true), "result", timings()), Ok(()));
        assert_eq!(*log.borrow(), ["snapshot", "write", "activate", "paste", "settle", "restore"]);
    }

    #[test]
    fn paste_refused_when_target_not_frontmost() {
        let log = RefCell::new(vec![]);
        assert_eq!(
            guarded_paste_with(paste_ops(&log, false), "result", timings()),
            Err(NOT_FRONTMOST.to_string())
        );
        assert!(log.borrow().contains(&"restore"));
        assert!(!log.borrow().contains(&"paste"));
    }

    #[test]
    fn paste_failure_still_restores() {
        let log = RefCell::new(vec![]);
        let mut ops = paste_ops(&log, true);
        ops.send_paste = Box::new(|| Err("denied".to_string()));
        assert_eq!(guarded_paste_with(ops, "result", timings()), Err("denied".to_string()));
        assert_eq!(log.borrow().last(), Some(&"restore"));
    }
}
