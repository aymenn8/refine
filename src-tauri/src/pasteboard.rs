//! Snapshot and restore of the macOS general pasteboard (every item, every type),
//! so capturing a selection or pasting a result never loses what the user had copied.

#![allow(deprecated)]

use cocoa::base::{id, nil};
use objc::rc::autoreleasepool;
use objc::{class, msg_send, sel, sel_impl};

/// Marks a clipboard write as temporary, so clipboard managers (e.g. Paste) skip it.
pub const TRANSIENT_TYPE: &str = "org.nspasteboard.TransientType";
const PLAIN_TEXT_TYPE: &str = "public.utf8-plain-text";

/// Per pasteboard item, its (type, data) pairs in order.
#[derive(Clone, PartialEq)]
pub struct PasteboardSnapshot(Vec<Vec<(String, Vec<u8>)>>);

// Contents are user data and must never be printed.
impl std::fmt::Debug for PasteboardSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "PasteboardSnapshot({} items)", self.0.len())
    }
}

unsafe fn general() -> id {
    msg_send![class!(NSPasteboard), generalPasteboard]
}

/// Autoreleased NSString.
unsafe fn ns_string(s: &str) -> id {
    let obj: id = msg_send![class!(NSString), alloc];
    let obj: id = msg_send![obj, initWithBytes: s.as_ptr() length: s.len() encoding: 4usize]; // UTF-8
    msg_send![obj, autorelease]
}

/// Autoreleased NSData.
unsafe fn ns_data(bytes: &[u8]) -> id {
    msg_send![class!(NSData), dataWithBytes: bytes.as_ptr() length: bytes.len()]
}

unsafe fn to_string(ns: id) -> String {
    if ns == nil {
        return String::new();
    }
    let utf8: *const std::os::raw::c_char = msg_send![ns, UTF8String];
    if utf8.is_null() {
        return String::new();
    }
    std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned()
}

unsafe fn to_bytes(data: id) -> Vec<u8> {
    let len: usize = msg_send![data, length];
    let ptr: *const u8 = msg_send![data, bytes];
    if len == 0 || ptr.is_null() {
        return Vec::new();
    }
    std::slice::from_raw_parts(ptr, len).to_vec()
}

unsafe fn array_items(array: id) -> Vec<id> {
    if array == nil {
        return Vec::new();
    }
    let count: usize = msg_send![array, count];
    (0..count).map(|i| msg_send![array, objectAtIndex: i]).collect()
}

unsafe fn snapshot(pb: id) -> PasteboardSnapshot {
    let items: id = msg_send![pb, pasteboardItems];
    let mut saved = Vec::new();
    for item in array_items(items) {
        let types: id = msg_send![item, types];
        let mut pairs = Vec::new();
        for kind in array_items(types) {
            let data: id = msg_send![item, dataForType: kind];
            if data != nil {
                pairs.push((to_string(kind), to_bytes(data)));
            }
        }
        saved.push(pairs);
    }
    PasteboardSnapshot(saved)
}

/// Replaces the pasteboard with `items`; the first item also gets the transient marker.
unsafe fn write(pb: id, items: &[Vec<(String, Vec<u8>)>]) {
    let _: isize = msg_send![pb, clearContents];
    if items.is_empty() {
        return;
    }
    let array: id = msg_send![class!(NSMutableArray), array];
    for (index, pairs) in items.iter().enumerate() {
        let item: id = msg_send![class!(NSPasteboardItem), new];
        for (kind, bytes) in pairs {
            let _: bool = msg_send![item, setData: ns_data(bytes) forType: ns_string(kind)];
        }
        if index == 0 && !pairs.iter().any(|(kind, _)| kind == TRANSIENT_TYPE) {
            let _: bool = msg_send![item, setData: ns_data(&[]) forType: ns_string(TRANSIENT_TYPE)];
        }
        let _: () = msg_send![array, addObject: item];
        let _: () = msg_send![item, release];
    }
    let _: bool = msg_send![pb, writeObjects: array];
}

unsafe fn restore(pb: id, snapshot: &PasteboardSnapshot) {
    write(pb, &snapshot.0);
}

unsafe fn write_text_transient(pb: id, text: &str) {
    write(pb, &[vec![(PLAIN_TEXT_TYPE.to_string(), text.as_bytes().to_vec())]]);
}

pub fn snapshot_general() -> PasteboardSnapshot {
    autoreleasepool(|| unsafe { snapshot(general()) })
}

pub fn restore_general(snapshot: &PasteboardSnapshot) {
    autoreleasepool(|| unsafe { restore(general(), snapshot) })
}

pub fn write_general_text_transient(text: &str) {
    autoreleasepool(|| unsafe { write_text_transient(general(), text) })
}

pub fn general_change_count() -> i64 {
    autoreleasepool(|| unsafe {
        let count: isize = msg_send![general(), changeCount];
        count as i64
    })
}

/// The clipboard's plain text, or empty if it has none.
pub fn read_general_text() -> String {
    autoreleasepool(|| unsafe {
        let text: id = msg_send![general(), stringForType: ns_string(PLAIN_TEXT_TYPE)];
        to_string(text)
    })
}

/// Types on the clipboard's first item.
pub fn general_types() -> Vec<String> {
    autoreleasepool(|| unsafe {
        let items: id = msg_send![general(), pasteboardItems];
        match array_items(items).first() {
            Some(&item) => {
                let types: id = msg_send![item, types];
                array_items(types).into_iter().map(|t| to_string(t)).collect()
            }
            None => Vec::new(),
        }
    })
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceFlagsState(state_id: i32) -> u64;
}

/// True while Command, Control, Option or Shift is physically held.
pub fn modifiers_held() -> bool {
    const HID_SYSTEM_STATE: i32 = 1;
    const MODIFIERS: u64 = 0x0002_0000 | 0x0004_0000 | 0x0008_0000 | 0x0010_0000; // Shift, Control, Option, Command
    unsafe { CGEventSourceFlagsState(HID_SYSTEM_STATE) & MODIFIERS != 0 }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use cocoa::base::id;
    use objc::{class, msg_send, sel, sel_impl};

    /// Writes one pasteboard item per entry of `items`, each with the given (type, data) pairs.
    unsafe fn write_items(pb: id, items: &[&[(&str, &[u8])]]) {
        let _: isize = msg_send![pb, clearContents];
        let array: id = msg_send![class!(NSMutableArray), array];
        for pairs in items {
            let item: id = msg_send![class!(NSPasteboardItem), new];
            for (kind, bytes) in *pairs {
                let _: bool = msg_send![item, setData: ns_data(bytes) forType: ns_string(kind)];
            }
            let _: () = msg_send![array, addObject: item];
            let _: () = msg_send![item, release];
        }
        let _: bool = msg_send![pb, writeObjects: array];
    }

    /// Runs `f` on a private pasteboard, never the user's clipboard.
    fn with_private_pasteboard(f: impl FnOnce(id)) {
        unsafe {
            let pb: id = msg_send![class!(NSPasteboard), pasteboardWithUniqueName];
            f(pb);
            let _: () = msg_send![pb, releaseGlobally];
        }
    }

    fn pairs(snapshot: &PasteboardSnapshot, item: usize) -> Vec<(String, Vec<u8>)> {
        snapshot.0[item].clone()
    }

    #[test]
    fn round_trips_every_item_and_type() {
        with_private_pasteboard(|pb| unsafe {
            let custom: &[u8] = &[0, 159, 146, 150];
            write_items(pb, &[&[
                ("public.utf8-plain-text", b"hello"),
                ("public.rtf", b"{\\rtf1 hello}"),
                ("com.example.custom", custom),
            ]]);
            let original = snapshot(pb);
            let _: isize = msg_send![pb, clearContents];
            restore(pb, &original);
            let restored = snapshot(pb);
            assert_eq!(restored.0.len(), 1);
            let got = pairs(&restored, 0);
            for (kind, bytes) in pairs(&original, 0) {
                assert!(got.contains(&(kind.clone(), bytes.clone())), "missing {kind}");
            }
            assert!(got.contains(&(TRANSIENT_TYPE.to_string(), Vec::new())));
            // Restoring again must not add a second marker.
            restore(pb, &restored);
            let again = pairs(&snapshot(pb), 0);
            assert_eq!(again.iter().filter(|(k, _)| k == TRANSIENT_TYPE).count(), 1);
        });
    }

    #[test]
    fn round_trips_multiple_items() {
        with_private_pasteboard(|pb| unsafe {
            write_items(pb, &[&[("public.utf8-plain-text", b"one")], &[("public.utf8-plain-text", b"two")]]);
            let original = snapshot(pb);
            restore(pb, &original);
            let restored = snapshot(pb);
            assert_eq!(restored.0.len(), 2);
            assert!(pairs(&restored, 0).contains(&("public.utf8-plain-text".to_string(), b"one".to_vec())));
            assert!(pairs(&restored, 1).contains(&("public.utf8-plain-text".to_string(), b"two".to_vec())));
        });
    }

    #[test]
    fn restoring_an_empty_snapshot_leaves_the_pasteboard_empty() {
        with_private_pasteboard(|pb| unsafe {
            let _: isize = msg_send![pb, clearContents];
            let empty = snapshot(pb);
            write_items(pb, &[&[("public.utf8-plain-text", b"x")]]);
            restore(pb, &empty);
            assert_eq!(snapshot(pb).0.len(), 0);
        });
    }

    #[test]
    fn transient_text_write_is_marked() {
        with_private_pasteboard(|pb| unsafe {
            write_text_transient(pb, "result");
            let got = pairs(&snapshot(pb), 0);
            assert!(got.contains(&("public.utf8-plain-text".to_string(), b"result".to_vec())));
            assert!(got.iter().any(|(k, _)| k == TRANSIENT_TYPE));
        });
    }
}
