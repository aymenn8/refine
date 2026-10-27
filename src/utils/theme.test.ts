import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme } from "./theme.ts";

test("follows macOS when nothing is saved", () => {
  assert.equal(resolveTheme(undefined, true), "light");
  assert.equal(resolveTheme(undefined, false), "dark");
});

test("follows macOS for the system setting", () => {
  assert.equal(resolveTheme("System", true), "light");
  assert.equal(resolveTheme("system", false), "dark");
});

test("a saved light or dark choice wins over macOS", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("Dark", true), "dark");
});
