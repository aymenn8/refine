// Turns keyboard events into stored shortcut strings ("Control+Space", "Command+Shift+R")
// using the physical key, so Control and Command stay distinct and Option/Shift
// don't change the recorded letter or digit.

export type KeyInput = {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

const MODIFIER_ORDER = ["Command", "Control", "Shift", "Alt"];

const MODIFIER_NAMES: Record<string, string> = {
  commandorcontrol: "Command", // legacy recordings; means Command on macOS
  command: "Command",
  cmd: "Command",
  super: "Command",
  control: "Control",
  ctrl: "Control",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
};

const INPUT_SOURCES_HINT =
  "macOS uses this to switch input sources. If it doesn't open the panel, turn it off in System Settings → Keyboard → Keyboard Shortcuts… → Input Sources.";
const SPOTLIGHT_HINT =
  "macOS uses this for Spotlight. If it doesn't open the panel, turn it off in System Settings → Keyboard → Keyboard Shortcuts… → Spotlight.";

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === "Space") return "Space";
  return null;
}

/** Held modifiers only, e.g. "Control+Shift" — for showing progress while recording. */
export function modifierPrefix(e: KeyInput): string {
  return [
    e.metaKey && "Command",
    e.ctrlKey && "Control",
    e.shiftKey && "Shift",
    e.altKey && "Alt",
  ]
    .filter(Boolean)
    .join("+");
}

/** The shortcut for this key press, or null until a modifier plus a supported key is pressed. */
export function shortcutFromKeyEvent(e: KeyInput): string | null {
  const prefix = modifierPrefix(e);
  const key = keyFromCode(e.code);
  return prefix && key ? `${prefix}+${key}` : null;
}

/** Canonical form, so legacy and new spellings of the same shortcut compare equal. */
export function normalizeShortcut(shortcut: string): string {
  const modifiers = new Set<string>();
  let key = "";
  for (const raw of shortcut.split("+")) {
    const part = raw.trim();
    const modifier = MODIFIER_NAMES[part.toLowerCase()];
    if (modifier) modifiers.add(modifier);
    else key = part.toLowerCase() === "space" ? "Space" : part.toUpperCase();
  }
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join("+");
}

export function eventMatchesShortcut(e: KeyInput, shortcut: string): boolean {
  const pressed = shortcutFromKeyEvent(e);
  return pressed !== null && normalizeShortcut(pressed) === normalizeShortcut(shortcut);
}

/** A note for shortcuts macOS uses itself, or null. */
export function reservedShortcutHint(shortcut: string): string | null {
  switch (normalizeShortcut(shortcut)) {
    case "Control+Space":
    case "Control+Alt+Space":
      return INPUT_SOURCES_HINT;
    case "Command+Space":
    case "Command+Alt+Space":
      return SPOTLIGHT_HINT;
    default:
      return null;
  }
}

/** Why a shortcut can't be used as a global hotkey, or null if it can. */
export function shortcutProblem(shortcut: string): string | null {
  const normalized = normalizeShortcut(shortcut);
  const modifiers = normalized.split("+").slice(0, -1);
  if (!modifiers.includes("Command") && !modifiers.includes("Control")) {
    return "Use ⌘ or ⌃ in the shortcut, so it doesn't fire while you type.";
  }
  // The app sends these itself to capture and paste your text.
  if (["Command+C", "Command+V", "Command+X"].includes(normalized)) {
    return "⌘C, ⌘V and ⌘X are used to copy and paste your text — pick another shortcut.";
  }
  return null;
}
