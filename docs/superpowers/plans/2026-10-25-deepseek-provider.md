# DeepSeek / OpenAI-Compatible Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "OpenAI-compatible" cloud provider with a one-click DeepSeek preset, whose API key is only ever sent to the endpoint the user entered with it, and restore saved-list entries from their `<key>Backup` copy when the current build can read them again.

**Architecture:** A new `Provider::OpenAICompatible` variant. Its Keychain secret holds both the endpoint and the key as JSON (`{"base_url","api_key"}`), the same way the Ollama provider already keeps its URL in Keychain, so nothing in `settings.json` can redirect the key. All network code for the new provider lives in `providers.rs` and takes a `reqwest::Client` parameter (no redirects, fixed timeouts) so tests can drive it against a local one-shot HTTP server. Existing OpenAI, Anthropic and Ollama code paths stay untouched.

**Tech Stack:** Rust (Tauri 2, reqwest 0.12, serde, keyring, tokio), React 19 + TypeScript.

**Spec:** `CLAUDE.md` → "Technical requirements" (provider, URL validation, Keychain, key-leak rules); Phase 1 audit findings in this conversation (providers.rs:112/151 hardcoded OpenAI URLs; ModelsLibraryTab.tsx:184 labels unknown providers "OpenAI"); DeepSeek docs verified 2026-10-25: base `https://api.deepseek.com`, `POST /chat/completions`, `GET /models`, `Authorization: Bearer <key>`, models `deepseek-flash`, `deepseek-v4-pro`.

## Global Constraints

- No new dependencies (Cargo.toml and package.json unchanged; tests use tokio, already a dependency).
- Never print, log, return in an error, or write to `settings.json` an API key.
- DeepSeek preset values exactly: base URL `https://api.deepseek.com`, default model `deepseek-flash`, alternative `deepseek-v4-pro`, display name `DeepSeek`.
- Serialized provider id for the new variant: `openai_compatible`. Existing ids `openai`, `anthropic`, `ollama` unchanged.
- Keychain service stays `com.refine`; account format stays `api_key_{uuid}`.
- Do not change the behavior of `call_openai_api`, `call_anthropic_api`, `call_ollama_api`, `test_openai_key`, `test_anthropic_key`.
- Before editing any existing function, run GitNexus `impact` on it (repo CLAUDE.md); run `detect_changes` before each commit.
- Commits go on branch `feat/deepseek-provider` (created from `main`), never `main`.

## Review Focus

1. Base URL typed with a trailing slash, no scheme, or a `/v1` path → normalized once; chat goes to `{base}/chat/completions`, key test to `{base}/models` (Task 1 + Task 3 tests).
2. Endpoint answers with a 3xx redirect → not followed, key never sent to the redirect target, clear error (Task 3 test `redirect_is_not_followed`).
3. Endpoint error body echoes the key or other text → never shown; fixed message by status (Task 3 test `error_body_is_not_echoed`).
4. Reasoning model returns `"content": null` or empty choices → clear "empty reply" error, not a parse failure or blank result (Task 3 test `null_content_is_an_error`).
5. Endpoint accepts the connection and hangs → times out with a clear message (Task 3 test `hanging_endpoint_times_out`, using a short-timeout client).

---

### Task 1: Custom endpoint URL validation

**Files:**
- Modify: `src-tauri/src/providers.rs` (new function + `#[cfg(test)] mod tests` at end of file)

**Interfaces:**
- Produces: `pub fn normalize_custom_base_url(raw: &str) -> Result<String, String>` — returns the URL with no trailing `/`.

- [ ] **Step 1: Write the failing tests** in `providers.rs` `mod tests`:

```rust
#[test]
fn custom_url_accepts_https_and_trims_trailing_slash() {
    assert_eq!(normalize_custom_base_url("https://api.deepseek.com/").unwrap(), "https://api.deepseek.com");
    assert_eq!(normalize_custom_base_url("  https://example.com/v1/ ").unwrap(), "https://example.com/v1");
}
#[test]
fn custom_url_adds_https_when_scheme_missing() {
    assert_eq!(normalize_custom_base_url("api.deepseek.com").unwrap(), "https://api.deepseek.com");
}
#[test]
fn custom_url_allows_http_only_for_loopback() {
    for ok in ["http://localhost:8080", "http://127.0.0.1:1234", "http://[::1]:8080"] {
        assert!(normalize_custom_base_url(ok).is_ok(), "{ok}");
    }
    assert!(normalize_custom_base_url("http://api.deepseek.com").is_err());
}
#[test]
fn custom_url_rejects_credentials_query_fragment_and_other_schemes() {
    for bad in ["https://user:pw@example.com", "https://example.com?a=1", "https://example.com#f",
                "file:///etc/passwd", "javascript:alert(1)", "ftp://example.com", ""] {
        assert!(normalize_custom_base_url(bad).is_err(), "{bad}");
    }
}
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test custom_url)` — Expected: compile error / FAIL (function missing).
- [ ] **Step 3: Implement** `normalize_custom_base_url`. Parse with `reqwest::Url`; prepend `https://` when the trimmed input has no `://`; allow `https`, or `http` only when `url.host()` is `Domain("localhost")`, an IPv4 loopback or an IPv6 loopback (use `Host::Ipv6(ip).is_loopback()`, not string compare — the Ollama check's `"::1"` string compare never matches); reject username/password, query, fragment, missing host, empty input. Error strings are fixed text and never include the input.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test custom_url)` — Expected: 4 passed.
- [ ] **Step 5: Commit** `git add src-tauri/src/providers.rs && git commit -m "feat: validate OpenAI-compatible endpoint URLs"`

### Task 2: Provider variant, Keychain secret, save path

**Files:**
- Modify: `src-tauri/src/credentials.rs:11-17` (enum), `:102-129` (`save_api_credential`)
- Modify: `src-tauri/src/providers.rs` (secret type + tests)
- Modify: `src/settings/ModesTab.tsx:4` (type union only)

**Interfaces:**
- Consumes: `normalize_custom_base_url` (Task 1).
- Produces:
  - `Provider::OpenAICompatible`, serialized `"openai_compatible"` via `#[serde(rename = "openai_compatible")]`.
  - In `providers.rs`: `#[derive(Serialize, Deserialize)] pub struct CustomEndpointSecret { pub base_url: String, pub api_key: String }` with `pub fn to_keychain(&self) -> String` (JSON) and `pub fn from_keychain(stored: &str) -> Result<Self, String>`.
  - `save_api_credential(app, provider, model_id, display_name, api_key, base_url: Option<String>)` — Tauri arg `baseUrl`, optional. For `OpenAICompatible` it requires `base_url`, normalizes it, and stores `CustomEndpointSecret{..}.to_keychain()` as the Keychain password. Other providers ignore `base_url` and behave exactly as today.

- [ ] **Step 1: Write the failing tests** (in `providers.rs` tests):

```rust
#[test]
fn compatible_provider_serializes_as_openai_compatible() {
    assert_eq!(serde_json::to_value(Provider::OpenAICompatible).unwrap(), json!("openai_compatible"));
    assert_eq!(serde_json::to_value(Provider::OpenAI).unwrap(), json!("openai"));
}
#[test]
fn keychain_secret_round_trips() {
    let s = CustomEndpointSecret { base_url: "https://api.deepseek.com".into(), api_key: "sk-test".into() };
    let back = CustomEndpointSecret::from_keychain(&s.to_keychain()).unwrap();
    assert_eq!((back.base_url.as_str(), back.api_key.as_str()), ("https://api.deepseek.com", "sk-test"));
}
#[test]
fn unreadable_keychain_secret_error_does_not_echo_it() {
    let err = CustomEndpointSecret::from_keychain("sk-plain-key-not-json").unwrap_err();
    assert!(!err.contains("sk-plain-key-not-json"));
}
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test -- compatible_provider keychain_secret unreadable_keychain)` — Expected: FAIL (missing items).
- [ ] **Step 3: Implement** the enum variant, `CustomEndpointSecret`, and the `save_api_credential` change. Add the `| "openai_compatible"` member to the `Provider` union in `ModesTab.tsx:4`. To satisfy the existing exhaustive `match` in `run_cloud_inference`, add an `OpenAICompatible` arm returning `Err("OpenAI-compatible provider not wired yet".into())` — Task 3 replaces it.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test)` and `pnpm build` — Expected: all pass, build exit 0.
- [ ] **Step 5: Commit** `git add src-tauri/src/credentials.rs src-tauri/src/providers.rs src/settings/ModesTab.tsx && git commit -m "feat: add OpenAI-compatible provider with endpoint bound to its key"`

### Task 3: Requests to the compatible endpoint

**Files:**
- Modify: `src-tauri/src/providers.rs` — `run_cloud_inference` (the `OpenAICompatible` arm), `test_api_key` (signature + new arm), new functions, tests.

**Interfaces:**
- Consumes: `normalize_custom_base_url` (Task 1), `CustomEndpointSecret` (Task 2).
- Produces:
  - `const CUSTOM_CHAT_TIMEOUT: Duration = 60s; const CUSTOM_KEY_TEST_TIMEOUT: Duration = 10s;`
  - `fn custom_endpoint_client_builder(timeout: Duration) -> reqwest::ClientBuilder` — `redirect(Policy::none())` and the given timeout; production calls `.build()` on it (map the build error to `"Couldn't connect to the endpoint"`).
  - `async fn call_openai_compatible(client: &reqwest::Client, base_url: &str, api_key: &str, model_id: &str, system_prompt: &str, user_prompt: &str) -> Result<String, String>` — normalizes `base_url` again, `POST {base}/chat/completions`, body `{model, messages:[system,user], max_tokens: 2048}`, `Authorization: Bearer {key}`; response `choices[0].message.content` as `Option<String>`.
  - `async fn test_openai_compatible_key(client: &reqwest::Client, base_url: &str, api_key: &str) -> Result<(), String>` — `GET {base}/models`.
  - `run_cloud_inference` arm: `CustomEndpointSecret::from_keychain(api_key)?` then `call_openai_compatible(&<built client from custom_endpoint_client_builder(CUSTOM_CHAT_TIMEOUT)>, …)`; the `"openai_compatible"` arm of `test_api_key` does the same with `CUSTOM_KEY_TEST_TIMEOUT`.
  - `test_api_key(provider: String, api_key: String, base_url: Option<String>)` — new arm `"openai_compatible"` requires `base_url`; other arms unchanged (they ignore it).
  - Fixed error messages (exact text; no response body, no reqwest error text):
    - 401/403 → `"The endpoint rejected the API key"`
    - 404 → `"Endpoint or model not found — check the base URL and model ID"`
    - 429 → `"The endpoint is rate limiting requests — try again shortly"`
    - other 3xx → `"The endpoint tried to redirect — use its final URL"`
    - other non-2xx → `format!("The endpoint returned HTTP {status}")`
    - timeout → `"The endpoint didn't respond in time"`
    - any other send error → `"Couldn't connect to the endpoint"`
    - unparsable body → `"The endpoint's reply wasn't chat-completions JSON"`
    - no choices / null or empty content → `"The endpoint returned an empty reply"`

- [ ] **Step 1: Write a test helper** in the tests module: `async fn one_shot_server(response: &'static str) -> (String, tokio::task::JoinHandle<String>)` — binds `127.0.0.1:0`, returns `http://127.0.0.1:{port}` and a handle resolving to the raw request text (headers + body, read until `Content-Length` is satisfied), after writing `response` verbatim. Plus `fn test_client(timeout_ms: u64) -> reqwest::Client` = `custom_endpoint_client_builder(Duration::from_millis(timeout_ms)).no_proxy().build().unwrap()` — same redirect policy as production; tests don't depend on proxy env.

- [ ] **Step 2: Write the failing tests** (`#[tokio::test]`):

```rust
// chat_sends_key_and_model_to_configured_endpoint:
//   server 200 `{"choices":[{"message":{"content":"hi"}}]}`; base = format!("{url}/v1/")
//   result == "hi"; request starts with "POST /v1/chat/completions ";
//   request contains "authorization: Bearer test-key" (case-insensitive header name); body contains "\"model\":\"deepseek-flash\""
// key_test_hits_models_endpoint: 200 → Ok(()), request starts "GET /models "
// key_test_reports_rejected_key: 401 → Err == "The endpoint rejected the API key"
// error_body_is_not_echoed: 500 with body "sk-secret-echo" → err contains "HTTP 500" and !contains("sk-secret-echo")
// redirect_is_not_followed: 302 with "Location: https://evil.example/" → Err == "The endpoint tried to redirect — use its final URL"
// null_content_is_an_error: 200 `{"choices":[{"message":{"content":null}}]}` → Err == "The endpoint returned an empty reply"
// hanging_endpoint_times_out: server accepts and never writes; test_client(200) → Err == "The endpoint didn't respond in time"
// routes_compatible_provider_to_its_own_endpoint: run_cloud_inference(Provider::OpenAICompatible, "deepseek-flash",
//   &CustomEndpointSecret{base_url: url, api_key:"k"}.to_keychain(), "s", "u") → Ok("hi") and the local server got the request
```

  (The routing test uses the production client; it talks to `127.0.0.1`, which reqwest does not proxy by default. If it fails only because of proxy env vars on the machine, report that rather than changing production code.)

- [ ] **Step 3: Run** `(cd src-tauri && cargo test providers)` — Expected: new tests FAIL.
- [ ] **Step 4: Implement** the Interfaces above. Run GitNexus `impact` on `run_cloud_inference` and `test_api_key` first and report the risk.
- [ ] **Step 5: Run** `(cd src-tauri && cargo test)` — Expected: all pass. `cargo check` clean.
- [ ] **Step 6: Commit** `git add src-tauri/src/providers.rs && git commit -m "feat: send OpenAI-compatible requests only to the key's own endpoint"`

### Task 4: Settings UI — provider option and DeepSeek preset

**Files:**
- Modify: `src/settings/ModelsLibraryTab.tsx` — `Provider` type (:7), `PROVIDERS` (:106-130), credential sub-label (:178-184), `handleAddModel` (:377-406).

**Interfaces:**
- Consumes: Tauri commands `test_api_key({provider, apiKey, baseUrl})`, `save_api_credential({provider, modelId, displayName, apiKey, baseUrl})` (Tasks 2–3).

- [ ] **Step 1: Implement:**
  - `Provider` union adds `"openai_compatible"`.
  - `PROVIDERS` entry: `{ id: "openai_compatible", name: "OpenAI-compatible (DeepSeek…)", requiresApiKey: true, requiresUrl: true, defaultUrl: "https://api.deepseek.com", modelPlaceholder: "e.g. deepseek-flash, deepseek-v4-pro" }`.
  - When `formProvider === "openai_compatible"`, show a small "Use DeepSeek preset" button above Row 2 that sets URL `https://api.deepseek.com`, model `deepseek-flash`, and display name `DeepSeek` (name only if empty).
  - `handleAddModel`: for `openai_compatible`, call `test_api_key` with `baseUrl: formUrl || defaultUrl`, and `save_api_credential` with `apiKey: formApiKey` and the same `baseUrl`. Other providers unchanged.
  - Sub-label: `openai_compatible` → `` `Compatible · ${c.model_id}` `` (no longer falls through to "OpenAI").
- [ ] **Step 2: Verify** `pnpm build` exit 0 and `(cd src-tauri && cargo test)` still green.
- [ ] **Step 3: Manual check (user):** `pnpm tauri dev` → Settings → Models Library → choose OpenAI-compatible → "Use DeepSeek preset" → paste own DeepSeek key → Add Model → it appears as "DeepSeek / Compatible · deepseek-flash" → make it default → rewrite some text. The key is typed only into the app, never into chat.
- [ ] **Step 4: Commit** `git add src/settings/ModelsLibraryTab.tsx && git commit -m "feat: add OpenAI-compatible provider and DeepSeek preset to settings"`

### Task 5: Restore readable entries from `<key>Backup`

**Files:**
- Modify: `src-tauri/src/stored_list.rs` (replace `split_readable`/`with_backup` and their tests).

**Interfaces:**
- Produces (internal): `struct Reconciled<T> { items: Vec<T>, list_to_save: Option<Value>, backup_to_save: Option<Value> }` and `fn reconcile<T: DeserializeOwned>(raw: &Value, backup: Option<&Value>) -> Reconciled<T>`. `load_list` keeps its signature; it calls `reconcile`, then sets `backup_to_save` (if Some) **before** `list_to_save` (if Some), then returns `items`.
- Rules (backup becomes a flat array of individual entries):
  - Old backup format (array of whole-list arrays) is flattened one level when read.
  - Current entries that can't be read are added to the backup once each (dedupe by value) and left out of `items`.
  - A backup entry that is readable now and whose `"id"` is not among the current readable entries' ids (or already restored) is restored: appended to `items` and to `list_to_save` (= current readable raw entries + restored raw entries), and removed from the backup.
  - A backup entry that is readable now and whose id is already present is removed from the backup (so deleting an item later can't resurrect it).
  - Entries with no string `"id"`, or still unreadable, stay in the backup.
  - `backup_to_save` is `Some` only when the backup changed; `list_to_save` is `Some` only when something was restored.

- [ ] **Step 1: Write the failing tests** (replace the five phase-2 tests; keep their intent):

```rust
// keeps_readable_entries_and_backs_up_the_unreadable_one: raw [cred a openai, cred b "bogus"], no backup
//   → items ids ["a"]; backup_to_save == Some([cred b]); list_to_save == None
// does_not_touch_storage_when_everything_reads: raw [a, c] → backup_to_save None, list_to_save None
// treats_a_non_list_value_as_one_unreadable_entry: raw {"not":"a list"} → items empty; backup_to_save == Some([raw])
// does_not_back_up_the_same_entry_twice: raw [a, b-bogus], backup [b-bogus] → backup_to_save None
// restores_a_backup_entry_that_reads_now: raw [a], backup [d openai] → items ids ["a","d"];
//   list_to_save == Some([a, d]); backup_to_save == Some([])
// drops_backup_entries_already_in_the_list: raw [a], backup [a] → items ["a"]; backup_to_save == Some([]); list_to_save None
// flattens_the_old_backup_format: raw [a], backup [[a, b-bogus]] → backup_to_save == Some([b-bogus]); list_to_save None
// keeps_unreadable_backup_entries: raw [a], backup [b-bogus] → backup_to_save None
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test stored_list)` — Expected: FAIL.
- [ ] **Step 3: Implement** `reconcile` and update `load_list`. Keep the one-line `eprintln!` warning (key name only) when entries were dropped or restored.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test)` — Expected: all pass.
- [ ] **Step 5: Manual check:** seed the dev `settings.json` (back it up first) with `processingModesBackup: [<a valid custom mode with an id not in processingModes>]`, launch `pnpm tauri dev`, confirm the mode appears and the backup becomes `[]`; restore the original file.
- [ ] **Step 6: Commit** `git add src-tauri/src/stored_list.rs && git commit -m "feat: restore saved entries from backup once they read again"`

### Task 6: Branch verification and review

- [ ] `(cd src-tauri && cargo test && cargo check)`, `pnpm build`, `pnpm install --frozen-lockfile`, `git diff --check main...` — all exit 0.
- [ ] GitNexus `detect_changes({scope: "compare", base_ref: "main"})` — report risk.
- [ ] Dispatch the project's `deepseek-provider-reviewer` (read-only) on the branch; apply findings through superpowers:receiving-code-review.
- [ ] superpowers:finishing-a-development-branch.
