//! Selected-text capture (⌘C) and paste-back (⌘V) that always put the user's clipboard back.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub const NOT_FRONTMOST: &str = "Couldn't switch back to the original app — nothing was pasted.";
pub const APP_GONE: &str = "The original app isn't open anymore — nothing was pasted.";
pub const CLIPBOARD_UNREADABLE: &str =
    "Refine couldn't save what's on your clipboard, so it left everything as it was. Copy something else and try again.";
pub const BUSY: &str = "Refine is still finishing the last request — try again in a moment.";
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const KEYSTROKE_FAILED: &str = "Refine couldn't send keystrokes. Allow it in System Settings → Privacy & Security → Accessibility (and Automation → System Events).";

/// How long a copy that arrives after `change_wait` is still watched for, so the clipboard can be put back.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const LATE_COPY_WAIT: Duration = Duration::from_millis(1500);

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

static FLOW_RUNNING: AtomicBool = AtomicBool::new(false);

/// Held while a capture or paste uses the clipboard; released on drop.
pub struct FlowGuard(());

impl Drop for FlowGuard {
    fn drop(&mut self) {
        FLOW_RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Only one flow touches the clipboard at a time, so one never saves another's temporary contents.
pub fn try_begin_flow(wait: Duration, poll: Duration) -> Option<FlowGuard> {
    let acquire = || FLOW_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok();
    wait_until(wait, poll, acquire).then_some(FlowGuard(()))
}

/// Apps that can read the clipboard well after ⌘V (Office, JetBrains, remote desktops and VMs).
pub fn settle_for(bundle_id: &str) -> Duration {
    const SLOW_PREFIXES: [&str; 9] = [
        "com.microsoft.Word",
        "com.microsoft.Excel",
        "com.microsoft.Powerpoint",
        "com.microsoft.Outlook",
        "com.microsoft.rdc",
        "com.jetbrains.",
        "com.parallels.",
        "com.vmware.",
        "com.citrix.",
    ];
    if SLOW_PREFIXES.iter().any(|prefix| bundle_id.starts_with(prefix)) {
        Duration::from_millis(1500)
    } else {
        Duration::from_millis(500)
    }
}

pub struct CaptureOps<'a, S> {
    pub snapshot: Box<dyn FnMut() -> Option<S> + 'a>,
    pub restore: Box<dyn FnMut(&S) + 'a>,
    pub modifiers_held: Box<dyn FnMut() -> bool + 'a>,
    pub change_count: Box<dyn FnMut() -> i64 + 'a>,
    pub send_copy: Box<dyn FnMut() -> Result<(), String> + 'a>,
    pub read_text: Box<dyn FnMut() -> String + 'a>,
    /// Called when ⌘C hasn't changed the clipboard in time: keeps watching and restores if it does.
    pub restore_if_late: Box<dyn FnMut(S, i64) + 'a>,
}

/// Copies the selection and returns it, then puts the clipboard back.
/// Empty when nothing was selected (the clipboard never changed).
pub fn capture_with<S>(mut ops: CaptureOps<S>, t: Timings) -> Result<String, String> {
    // ⌘C while the user still holds ⌃ or ⇧ would arrive as a different shortcut.
    wait_until(t.modifier_wait, t.poll, || !(ops.modifiers_held)());
    let Some(snap) = (ops.snapshot)() else {
        return Err(CLIPBOARD_UNREADABLE.to_string());
    };
    let before = (ops.change_count)();
    (ops.send_copy)()?;
    if !wait_until(t.change_wait, t.poll, || (ops.change_count)() != before) {
        (ops.restore_if_late)(snap, before);
        return Ok(String::new());
    }
    let copied = (ops.change_count)();
    let text = (ops.read_text)();
    // Only put the old clipboard back over our own copy, never over something newer.
    if (ops.change_count)() == copied {
        (ops.restore)(&snap);
    }
    Ok(text)
}

pub struct PasteOps<'a, S> {
    pub modifiers_held: Box<dyn FnMut() -> bool + 'a>,
    /// False when the target app isn't running any more.
    pub activate_target: Box<dyn FnMut() -> bool + 'a>,
    pub target_is_frontmost: Box<dyn FnMut() -> bool + 'a>,
    pub snapshot: Box<dyn FnMut() -> Option<S> + 'a>,
    pub write_text: Box<dyn FnMut(&str) -> Result<(), String> + 'a>,
    pub change_count: Box<dyn FnMut() -> i64 + 'a>,
    pub send_paste: Box<dyn FnMut() -> Result<(), String> + 'a>,
    pub settle: Box<dyn FnMut() + 'a>,
    pub restore: Box<dyn FnMut(&S) + 'a>,
}

/// Pastes `text` into the target app only if it is frontmost; the clipboard is put back afterwards
/// and is never touched when the paste is refused.
pub fn guarded_paste_with<S>(mut ops: PasteOps<S>, text: &str, t: Timings) -> Result<(), String> {
    if !(ops.activate_target)() {
        return Err(APP_GONE.to_string());
    }
    if !wait_until(t.frontmost_wait, t.poll, || (ops.target_is_frontmost)()) {
        return Err(NOT_FRONTMOST.to_string());
    }
    // ⌘V while ⇧ is held would arrive as ⇧⌘V.
    wait_until(t.modifier_wait, t.poll, || !(ops.modifiers_held)());
    let Some(snap) = (ops.snapshot)() else {
        return Err(CLIPBOARD_UNREADABLE.to_string());
    };
    if let Err(e) = (ops.write_text)(text) {
        (ops.restore)(&snap);
        return Err(e);
    }
    let written = (ops.change_count)();
    let result = (ops.send_paste)();
    if result.is_ok() {
        (ops.settle)();
    }
    // Only put the old clipboard back over our own write, never over something newer.
    if (ops.change_count)() == written {
        (ops.restore)(&snap);
    }
    result
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
    let timings = Timings::default();
    let mut guard = Some(try_begin_flow(Duration::ZERO, timings.poll).ok_or_else(|| BUSY.to_string())?);
    capture_with(
        CaptureOps {
            snapshot: Box::new(pasteboard::snapshot_general),
            restore: Box::new(pasteboard::restore_general),
            modifiers_held: Box::new(pasteboard::modifiers_held),
            change_count: Box::new(pasteboard::general_change_count),
            send_copy: Box::new(|| keystroke("c")),
            read_text: Box::new(pasteboard::read_general_text),
            // The flow stays locked until the late watch ends.
            restore_if_late: Box::new(move |snap, before| {
                let guard = guard.take();
                std::thread::spawn(move || {
                    let _guard = guard;
                    let poll = Duration::from_millis(10);
                    if wait_until(LATE_COPY_WAIT, poll, || pasteboard::general_change_count() != before) {
                        pasteboard::restore_general(&snap);
                    }
                });
            }),
        },
        timings,
    )
}

#[cfg(not(target_os = "macos"))]
pub fn capture_selection() -> Result<String, String> {
    Err("Capturing the selection is only supported on macOS.".to_string())
}

/// Pastes `text` into the app with `target` bundle ID. With `activate`, Refine brings it forward
/// first (the panel is in front); without, the app must still be frontmost (quick actions).
#[cfg(target_os = "macos")]
pub fn paste_into_app(target: &str, activate: bool, text: &str) -> Result<(), String> {
    use crate::{native_mac, pasteboard};
    let timings = Timings::default();
    // Wait out a capture that is still watching for a late copy.
    let _guard = try_begin_flow(LATE_COPY_WAIT + Duration::from_millis(500), timings.poll)
        .ok_or_else(|| BUSY.to_string())?;
    let settle = settle_for(target);
    guarded_paste_with(
        PasteOps {
            modifiers_held: Box::new(pasteboard::modifiers_held),
            activate_target: Box::new(|| {
                if activate {
                    native_mac::activate_running_app(target)
                } else {
                    native_mac::is_app_running(target)
                }
            }),
            target_is_frontmost: Box::new(|| native_mac::get_frontmost_app_info().bundle_id == target),
            snapshot: Box::new(pasteboard::snapshot_general),
            write_text: Box::new(|t| {
                pasteboard::write_general_text_transient(t);
                Ok(())
            }),
            change_count: Box::new(pasteboard::general_change_count),
            send_paste: Box::new(|| {
                // Give the app a moment to finish coming forward.
                std::thread::sleep(Duration::from_millis(50));
                keystroke("v")
            }),
            settle: Box::new(move || std::thread::sleep(settle)),
            restore: Box::new(pasteboard::restore_general),
        },
        text,
        timings,
    )
}

/// Pastes `text` into the app that was frontmost before the panel opened.
#[cfg(target_os = "macos")]
pub fn paste_into_previous_app(text: &str) -> Result<(), String> {
    let target = crate::native_mac::previous_app_bundle_id().ok_or_else(|| APP_GONE.to_string())?;
    paste_into_app(&target, true, text)
}

#[cfg(not(target_os = "macos"))]
pub fn paste_into_app(_target: &str, _activate: bool, _text: &str) -> Result<(), String> {
    Err("Pasting is only supported on macOS.".to_string())
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
                Some(7)
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
            restore_if_late: Box::new(move |s, before| {
                assert_eq!((s, before), (7, 1));
                log.borrow_mut().push("late");
            }),
        }
    }

    /// Paste fakes: writing the result bumps the change count from 1 to 2.
    fn paste_ops<'a>(log: &'a RefCell<Vec<&'static str>>, frontmost: bool, written: &'a Cell<bool>) -> PasteOps<'a, u8> {
        PasteOps {
            modifiers_held: Box::new(|| false),
            activate_target: Box::new(move || {
                log.borrow_mut().push("activate");
                true
            }),
            target_is_frontmost: Box::new(move || frontmost),
            snapshot: Box::new(move || {
                log.borrow_mut().push("snapshot");
                Some(7)
            }),
            write_text: Box::new(move |t| {
                assert_eq!(t, "result");
                log.borrow_mut().push("write");
                written.set(true);
                Ok(())
            }),
            change_count: Box::new(move || if written.get() { 2 } else { 1 }),
            send_paste: Box::new(move || {
                log.borrow_mut().push("paste");
                Ok(())
            }),
            settle: Box::new(move || log.borrow_mut().push("settle")),
            restore: Box::new(move |s| {
                assert_eq!(*s, 7);
                log.borrow_mut().push("restore");
            }),
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
    fn only_one_flow_runs_at_a_time() {
        let first = try_begin_flow(Duration::ZERO, Duration::from_millis(1)).expect("free");
        assert!(try_begin_flow(Duration::from_millis(5), Duration::from_millis(1)).is_none());
        drop(first);
        assert!(try_begin_flow(Duration::ZERO, Duration::from_millis(1)).is_some());
    }

    #[test]
    fn capture_restores_the_clipboard_after_reading() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        assert_eq!(capture_with(capture_ops(&log, &copied), timings()), Ok("sel".to_string()));
        assert_eq!(*log.borrow(), ["snapshot", "copy", "read", "restore"]);
    }

    #[test]
    fn capture_hands_a_late_copy_to_the_late_restore() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = capture_ops(&log, &copied);
        ops.change_count = Box::new(|| 1);
        assert_eq!(capture_with(ops, timings()), Ok(String::new()));
        assert_eq!(*log.borrow(), ["snapshot", "copy", "late"]);
    }

    #[test]
    fn capture_keeps_a_newer_clipboard() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let reads = Cell::new(0);
        let mut ops = capture_ops(&log, &copied);
        // Something else writes the clipboard after the selection was copied.
        ops.change_count = Box::new(|| {
            reads.set(reads.get() + 1);
            // before ⌘C, change detected, copied, then a newer write
            match reads.get() {
                1 => 1,
                2 | 3 => 2,
                _ => 3,
            }
        });
        assert_eq!(capture_with(ops, timings()), Ok("sel".to_string()));
        assert!(!log.borrow().contains(&"restore"));
    }

    #[test]
    fn capture_refuses_when_the_clipboard_cannot_be_saved() {
        let (log, copied) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = capture_ops(&log, &copied);
        ops.snapshot = Box::new(|| None);
        assert_eq!(capture_with(ops, timings()), Err(CLIPBOARD_UNREADABLE.to_string()));
        assert!(!log.borrow().contains(&"copy"));
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
        let snapshot_at = log.iter().position(|e| *e == "snapshot").unwrap();
        assert_eq!(log[..snapshot_at].iter().filter(|e| **e == "mods").count(), 4);
    }

    #[test]
    fn paste_writes_pastes_then_restores() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        assert_eq!(guarded_paste_with(paste_ops(&log, true, &written), "result", timings()), Ok(()));
        assert_eq!(*log.borrow(), ["activate", "snapshot", "write", "paste", "settle", "restore"]);
    }

    #[test]
    fn paste_refused_when_target_not_frontmost() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        assert_eq!(
            guarded_paste_with(paste_ops(&log, false, &written), "result", timings()),
            Err(NOT_FRONTMOST.to_string())
        );
        // The clipboard is never touched.
        assert_eq!(*log.borrow(), ["activate"]);
    }

    #[test]
    fn paste_refused_when_target_app_is_gone() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = paste_ops(&log, true, &written);
        ops.activate_target = Box::new(|| false);
        assert_eq!(guarded_paste_with(ops, "result", timings()), Err(APP_GONE.to_string()));
        assert!(log.borrow().is_empty());
    }

    #[test]
    fn paste_refuses_when_the_clipboard_cannot_be_saved() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = paste_ops(&log, true, &written);
        ops.snapshot = Box::new(|| None);
        assert_eq!(guarded_paste_with(ops, "result", timings()), Err(CLIPBOARD_UNREADABLE.to_string()));
        assert!(!log.borrow().contains(&"write"));
    }

    #[test]
    fn paste_waits_for_modifier_release() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        let checks = Cell::new(0);
        let mut ops = paste_ops(&log, true, &written);
        ops.modifiers_held = Box::new(|| {
            checks.set(checks.get() + 1);
            log.borrow_mut().push("mods");
            checks.get() <= 3
        });
        assert_eq!(guarded_paste_with(ops, "result", timings()), Ok(()));
        let log = log.borrow();
        let paste_at = log.iter().position(|e| *e == "paste").unwrap();
        assert_eq!(log[..paste_at].iter().filter(|e| **e == "mods").count(), 4);
    }

    #[test]
    fn paste_keeps_a_newer_clipboard() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = paste_ops(&log, true, &written);
        let reads = Cell::new(0);
        // The target app (or the user) writes the clipboard after Refine's paste.
        ops.change_count = Box::new(|| {
            reads.set(reads.get() + 1);
            if reads.get() == 1 { 2 } else { 3 }
        });
        assert_eq!(guarded_paste_with(ops, "result", timings()), Ok(()));
        assert!(!log.borrow().contains(&"restore"));
    }

    #[test]
    fn paste_failure_still_restores() {
        let (log, written) = (RefCell::new(vec![]), Cell::new(false));
        let mut ops = paste_ops(&log, true, &written);
        ops.send_paste = Box::new(|| Err("denied".to_string()));
        assert_eq!(guarded_paste_with(ops, "result", timings()), Err("denied".to_string()));
        assert_eq!(log.borrow().last(), Some(&"restore"));
    }

    #[test]
    fn slow_apps_get_a_longer_settle() {
        assert_eq!(settle_for("com.apple.Notes"), Duration::from_millis(500));
        assert_eq!(settle_for("com.microsoft.Word"), Duration::from_millis(1500));
        assert_eq!(settle_for("com.jetbrains.intellij"), Duration::from_millis(1500));
        assert_eq!(settle_for("com.microsoft.rdc.macos"), Duration::from_millis(1500));
    }
}
