#!/usr/bin/env node
// Builds THIRD_PARTY_NOTICES.txt from the code that ships inside Recast.app:
// Rust crates linked on both Mac targets, production npm packages, Tailwind's
// compiled CSS, and llama.cpp with the libraries it compiles in.
//
//   node scripts/third-party-notices.mjs          write the file
//   node scripts/third-party-notices.mjs --check  fail if the file is out of date

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const notices = join(root, "scripts", "notices");
const output = join(root, "THIRD_PARTY_NOTICES.txt");
const targets = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
const licenseFile = /^(LICEN[CS]E|COPYING|NOTICE|UNLICENSE)/i;

// Packages that ship no license file and offer no MIT option: give each one its exact text.
const overrides = {
  "alloc-stdlib": "alloc-stdlib-LICENSE", // same author's alloc-no-stdlib text (Dropbox, BSD-3-Clause)
  selectors: "MPL-2.0.txt", // Servo, MPL-2.0; source: https://github.com/servo/stylo
};

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const clean = (text) => text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
const mit = (holder) =>
  `MIT License\n\nCopyright (c) ${holder}\n\n` +
  readFileSync(join(notices, "MIT-body.txt"), "utf8");

function licenseTexts(dir) {
  return readdirSync(dir)
    .filter((f) => licenseFile.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => clean(readFileSync(join(dir, f), "utf8")));
}

function entry(name, version, license, dir, holder) {
  let texts = dir ? licenseTexts(dir) : [];
  if (texts.length === 0 && overrides[name]) {
    texts = [clean(readFileSync(join(notices, overrides[name]), "utf8"))];
  }
  if (texts.length === 0 && /\bMIT\b/.test(license ?? "")) texts = [clean(mit(holder))];
  if (texts.length === 0) {
    throw new Error(`${name} ${version} (${license}) ships no license file: add it to overrides`);
  }
  return { label: `${name} ${version}`, license, texts };
}

function rustCrates() {
  const tauriDir = join(root, "src-tauri");
  const shipped = new Set();
  for (const target of targets) {
    const tree = run("cargo", ["tree", "-e", "normal", "--prefix", "none", "--locked", "--target", target], tauriDir);
    for (const line of tree.split("\n")) {
      const [name, version] = line.split(" ");
      if (version?.startsWith("v")) shipped.add(`${name} ${version.slice(1)}`);
    }
  }
  const meta = JSON.parse(run("cargo", ["metadata", "--format-version", "1", "--locked"], tauriDir));
  return meta.packages
    .filter((p) => p.source !== null && shipped.has(`${p.name} ${p.version}`))
    .map((p) => {
      const e = entry(p.name, p.version, p.license, dirname(p.manifest_path), p.authors.join(", ") || `the ${p.name} authors`);
      // MPL-2.0 asks binary copies to say where the source is.
      if (/MPL/.test(p.license ?? "")) e.label += ` - source: https://crates.io/crates/${p.name}/${p.version}`;
      return e;
    });
}

function npmPackages() {
  const byLicense = JSON.parse(run("pnpm", ["licenses", "list", "--prod", "--json"]));
  const list = Object.values(byLicense)
    .flat()
    .flatMap((p) => p.versions.map((v, i) => entry(p.name, v, p.license, p.paths[i], p.author || `the ${p.name} authors`)));
  // Tailwind is a build tool, but its base styles are compiled into the app's CSS.
  const tw = join(root, "node_modules", "tailwindcss");
  const twPkg = JSON.parse(readFileSync(join(tw, "package.json"), "utf8"));
  list.push(entry("tailwindcss", twPkg.version, twPkg.license, tw, "Tailwind Labs, Inc."));
  return list;
}

function nativeLibraries() {
  const meta = JSON.parse(run("cargo", ["metadata", "--format-version", "1", "--locked"], join(root, "src-tauri")));
  const sys = meta.packages.find((p) => p.name === "llama-cpp-sys-2");
  const vendor = join(dirname(sys.manifest_path), "llama.cpp", "vendor");
  const fixed = (label, text) => ({ label, license: "MIT", texts: [clean(text)] });
  // Compiled with LLAMA_BUILD_COMMON on and mtmd off: common pulls in httplib, json and minja.
  return [
    fixed(`llama.cpp / ggml (via llama-cpp-sys-2 ${sys.version})`, readFileSync(join(notices, "llama.cpp-LICENSE"), "utf8")),
    fixed("cpp-httplib (bundled with llama.cpp)", readFileSync(join(vendor, "cpp-httplib", "LICENSE"), "utf8")),
    fixed("nlohmann/json (bundled with llama.cpp)", mit("2013-2025 Niels Lohmann")),
    fixed("minja (bundled with llama.cpp)", mit("2024 Google LLC")),
  ];
}

function section(title, entries) {
  // One block per distinct license text, listing every package that ships it.
  const groups = new Map();
  for (const e of entries.sort((a, b) => a.label.localeCompare(b.label))) {
    for (const text of e.texts) {
      const group = groups.get(text) ?? [];
      group.push(e);
      groups.set(text, group);
    }
  }
  const blocks = [...groups].map(([text, group]) => {
    const names = group.map((e) => `  ${e.label}${e.license ? ` (${e.license})` : ""}`).join("\n");
    return `${"-".repeat(72)}\n${names}\n${"-".repeat(72)}\n\n${text}`;
  });
  return `${"=".repeat(72)}\n${title}\n${"=".repeat(72)}\n\n${blocks.join("\n\n")}`;
}

const text =
  [
    "Third-party notices for Recast",
    "",
    "Recast includes the open-source software listed below. Each group of",
    "packages is followed by the license text that applies to it.",
    "Generated by scripts/third-party-notices.mjs. Do not edit by hand.",
    "",
    section("Native libraries", nativeLibraries()),
    section("Rust crates", rustCrates()),
    section("JavaScript packages", npmPackages()),
  ].join("\n") + "\n";

if (process.argv.includes("--check")) {
  if (!existsSync(output) || readFileSync(output, "utf8") !== text) {
    console.error("THIRD_PARTY_NOTICES.txt is out of date. Run: node scripts/third-party-notices.mjs");
    process.exit(1);
  }
  console.log("THIRD_PARTY_NOTICES.txt is up to date.");
} else {
  writeFileSync(output, text);
  console.log(`Wrote ${output}`);
}
