import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventMatchesShortcut,
  formatShortcut,
  modifierPrefix,
  normalizeShortcut,
  reservedShortcutHint,
  shortcutProblem,
  shortcutFromKeyEvent,
  type KeyInput,
} from "./shortcut.ts";

const key = (code: string, mods: Partial<Omit<KeyInput, "code">>): KeyInput => ({
  code,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

test("records Control+Space", () => {
  assert.equal(shortcutFromKeyEvent(key("Space", { ctrlKey: true })), "Control+Space");
});

test("keeps Command and Control distinct", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", { metaKey: true, shiftKey: true })), "Command+Shift+R");
  assert.equal(shortcutFromKeyEvent(key("KeyR", { ctrlKey: true, shiftKey: true })), "Control+Shift+R");
  assert.equal(shortcutFromKeyEvent(key("KeyR", { metaKey: true, ctrlKey: true })), "Command+Control+R");
});

test("uses the physical key for Option and Shift+digit", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", { altKey: true })), "Alt+R");
  assert.equal(shortcutFromKeyEvent(key("Digit1", { shiftKey: true })), "Shift+1");
});

test("needs a modifier and a supported key", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", {})), null);
  assert.equal(shortcutFromKeyEvent(key("ControlLeft", { ctrlKey: true })), null);
  assert.equal(shortcutFromKeyEvent(key("F5", { ctrlKey: true })), null);
});

test("shows held modifiers while recording", () => {
  assert.equal(modifierPrefix(key("ControlLeft", { ctrlKey: true, shiftKey: true })), "Control+Shift");
});

test("legacy_command_or_control_matches_command", () => {
  assert.equal(normalizeShortcut("CommandOrControl+Shift+R"), "Command+Shift+R");
  assert.equal(eventMatchesShortcut(key("KeyV", { metaKey: true, shiftKey: true }), "CommandOrControl+Shift+V"), true);
  assert.equal(eventMatchesShortcut(key("KeyV", { ctrlKey: true, shiftKey: true }), "CommandOrControl+Shift+V"), false);
  assert.equal(eventMatchesShortcut(key("Space", { ctrlKey: true }), "Control+Space"), true);
});

test("explains macOS-reserved shortcuts", () => {
  assert.match(reservedShortcutHint("Control+Space") ?? "", /Input Sources/);
  assert.match(reservedShortcutHint("Command+Space") ?? "", /Spotlight/);
  assert.equal(reservedShortcutHint("Control+Shift+Space"), null);
});

test("refuses shortcuts that would fire while typing or break copy and paste", () => {
  assert.match(shortcutProblem("Shift+A") ?? "", /⌘ or ⌃/);
  assert.match(shortcutProblem("Alt+R") ?? "", /⌘ or ⌃/);
  assert.match(shortcutProblem("Command+V") ?? "", /copy and paste/);
  assert.match(shortcutProblem("CommandOrControl+C") ?? "", /copy and paste/);
  assert.match(shortcutProblem("Command+X") ?? "", /copy and paste/);
  assert.equal(shortcutProblem("Control+Space"), null);
  assert.equal(shortcutProblem("Command+Shift+R"), null);
});

test("formats shortcuts with macOS key symbols", () => {
  assert.equal(formatShortcut("Control+Space"), "⌃ Space");
  assert.equal(formatShortcut("CommandOrControl+Shift+R"), "⌘ ⇧ R");
  assert.equal(formatShortcut("Alt+Command+K"), "⌥ ⌘ K");
});
