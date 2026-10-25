// A rewrite comes back trimmed; pasting it over a selection that ended in a newline
// (triple-clicked paragraph) would join it to the next paragraph.

/** `result` wrapped in the selection's own leading and trailing whitespace. */
export function withSelectionWhitespace(selection: string, result: string): string {
  const leading = selection.match(/^\s*/)?.[0] ?? "";
  const trailing = selection.match(/\s*$/)?.[0] ?? "";
  return leading + result.trim() + trailing;
}
