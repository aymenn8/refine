import { test } from "node:test";
import assert from "node:assert/strict";
import { withSelectionWhitespace } from "./whitespace.ts";

test("keeps the selection's trailing newline", () => {
  assert.equal(withSelectionWhitespace("Hello world\n", "Hi world"), "Hi world\n");
});

test("keeps the selection's leading spaces", () => {
  assert.equal(withSelectionWhitespace("  - item one", "- item 1"), "  - item 1");
});

test("doesn't double whitespace the result already has", () => {
  assert.equal(withSelectionWhitespace("para\n\n", "rewritten\n"), "rewritten\n\n");
});

test("leaves a result alone when the selection had no outer whitespace", () => {
  assert.equal(withSelectionWhitespace("a", "b"), "b");
});
