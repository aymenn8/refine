export type Theme = "dark" | "light";

/** A saved "light" or "dark" wins; anything else follows macOS. */
export function resolveTheme(saved: string | null | undefined, systemPrefersLight: boolean): Theme {
  const mode = (saved || "system").toLowerCase();
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersLight ? "light" : "dark";
}
