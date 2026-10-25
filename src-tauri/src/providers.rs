use serde::{Deserialize, Serialize};

use crate::credentials::Provider;

fn normalize_ollama_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let candidate = if trimmed.is_empty() {
        "http://localhost:11434".to_string()
    } else {
        trimmed.to_string()
    };

    let with_scheme = if candidate.contains("://") {
        candidate
    } else {
        format!("http://{}", candidate)
    };

    let parsed = reqwest::Url::parse(&with_scheme)
        .map_err(|e| format!("Invalid Ollama URL: {}", e))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Ollama URL must use http or https".to_string());
    }

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Ollama URL must not contain credentials".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Ollama URL must include a host".to_string())?;

    let is_loopback_host = host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1";
    if scheme == "http" && !is_loopback_host {
        return Err("Remote Ollama endpoints must use https".to_string());
    }

    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

/// Validates the base URL of an OpenAI-compatible endpoint and returns it without a
/// trailing slash. Plain http is only allowed for loopback hosts. Errors never echo the input.
pub fn normalize_custom_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Enter the endpoint's base URL".to_string());
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    let parsed = reqwest::Url::parse(&with_scheme)
        .map_err(|_| "The endpoint URL isn't a valid URL".to_string())?;

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("The endpoint URL must not contain a username or password".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("The endpoint URL must not contain ? or # parts".to_string());
    }
    let host = parsed
        .host_str()
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "The endpoint URL must include a host".to_string())?;
    // IPv6 hosts come back bracketed ("[::1]"), so strip the brackets before parsing.
    let is_loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<std::net::IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false);
    match parsed.scheme() {
        "https" => {}
        "http" if is_loopback => {}
        "http" => return Err("Remote endpoints must use https".to_string()),
        _ => return Err("The endpoint URL must use https".to_string()),
    }

    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

/// What the Keychain stores for an OpenAI-compatible credential: the endpoint the key
/// was entered with, and the key. Kept together so settings.json can't redirect the key.
#[derive(Serialize, Deserialize)]
pub struct CustomEndpointSecret {
    pub base_url: String,
    pub api_key: String,
}

impl CustomEndpointSecret {
    pub fn to_keychain(&self) -> String {
        serde_json::to_string(self).expect("two strings always serialize")
    }

    pub fn from_keychain(stored: &str) -> Result<Self, String> {
        serde_json::from_str(stored)
            .map_err(|_| "The saved endpoint details are unreadable; remove and re-add this model".to_string())
    }
}

/// Run inference using a cloud provider API
pub async fn run_cloud_inference(
    provider: Provider,
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    match provider {
        Provider::OpenAI => call_openai_api(model_id, api_key, system_prompt, user_prompt).await,
        Provider::Anthropic => call_anthropic_api(model_id, api_key, system_prompt, user_prompt).await,
        Provider::Ollama => {
            // For Ollama, api_key holds the base URL
            let base_url = normalize_ollama_base_url(api_key)?;
            call_ollama_api(model_id, &base_url, system_prompt, user_prompt).await
        }
        Provider::OpenAICompatible => Err("OpenAI-compatible provider not wired yet".into()),
    }
}

/// OpenAI API call
async fn call_openai_api(
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct OpenAIRequest {
        model: String,
        messages: Vec<OpenAIMessage>,
        max_tokens: u32,
    }

    #[derive(Serialize)]
    struct OpenAIMessage {
        role: String,
        content: String,
    }

    #[derive(Deserialize)]
    struct OpenAIResponse {
        choices: Vec<OpenAIChoice>,
    }

    #[derive(Deserialize)]
    struct OpenAIChoice {
        message: OpenAIMessageResponse,
    }

    #[derive(Deserialize)]
    struct OpenAIMessageResponse {
        content: String,
    }

    let client = reqwest::Client::new();
    let request = OpenAIRequest {
        model: model_id.to_string(),
        messages: vec![
            OpenAIMessage { role: "system".to_string(), content: system_prompt.to_string() },
            OpenAIMessage { role: "user".to_string(), content: user_prompt.to_string() },
        ],
        max_tokens: 2048,
    };

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("OpenAI API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error: {}", error_text));
    }

    let data: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    data.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from OpenAI".to_string())
}

/// Test if an API key is valid by making a minimal API call
#[tauri::command]
pub async fn test_api_key(provider: String, api_key: String) -> Result<(), String> {
    match provider.as_str() {
        "openai" => test_openai_key(&api_key).await,
        "anthropic" => test_anthropic_key(&api_key).await,
        "ollama" => Ok(()),
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Test OpenAI API key
async fn test_openai_key(api_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status().as_u16() == 401 {
        Err("Invalid API key".to_string())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("API error: {}", error_text))
    }
}

/// Anthropic Messages API call
async fn call_anthropic_api(
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct AnthropicRequest {
        model: String,
        max_tokens: u32,
        system: String,
        messages: Vec<AnthropicMessage>,
    }

    #[derive(Serialize)]
    struct AnthropicMessage {
        role: String,
        content: String,
    }

    #[derive(Deserialize)]
    struct AnthropicResponse {
        content: Vec<AnthropicContent>,
    }

    #[derive(Deserialize)]
    struct AnthropicContent {
        text: String,
    }

    let client = reqwest::Client::new();
    let request = AnthropicRequest {
        model: model_id.to_string(),
        max_tokens: 2048,
        system: system_prompt.to_string(),
        messages: vec![
            AnthropicMessage { role: "user".to_string(), content: user_prompt.to_string() },
        ],
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Anthropic API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error: {}", error_text));
    }

    let data: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

    data.content
        .first()
        .map(|c| c.text.clone())
        .ok_or_else(|| "No response from Anthropic".to_string())
}

/// Test Anthropic API key
async fn test_anthropic_key(api_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();

    // Send a minimal request to validate the key
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}]
        }))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status().as_u16() == 401 {
        Err("Invalid API key".to_string())
    } else {
        // 400 (bad request) with valid key is still a valid key
        let status = response.status().as_u16();
        if status == 400 {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(format!("API error: {}", error_text))
        }
    }
}

/// Ollama API call (local or remote)
async fn call_ollama_api(
    model_id: &str,
    base_url: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct OllamaRequest {
        model: String,
        prompt: String,
        system: String,
        stream: bool,
    }

    #[derive(Deserialize)]
    struct OllamaResponse {
        response: String,
    }

    let client = reqwest::Client::new();
    let request = OllamaRequest {
        model: model_id.to_string(),
        prompt: user_prompt.to_string(),
        system: system_prompt.to_string(),
        stream: false,
    };

    let url = format!("{}/api/generate", base_url);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Ollama API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama API error: {}", error_text));
    }

    let data: OllamaResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    Ok(data.response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
        // No unwrap_err(): that needs Debug, and the secret type deliberately has none (it holds a key).
        let Err(err) = CustomEndpointSecret::from_keychain("sk-plain-key-not-json") else {
            panic!("a non-JSON secret must be rejected");
        };
        assert!(!err.contains("sk-plain-key-not-json"));
    }

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
        for bad in [
            "https://user:pw@example.com",
            "https://example.com?a=1",
            "https://example.com#f",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ftp://example.com",
            "",
        ] {
            assert!(normalize_custom_base_url(bad).is_err(), "{bad}");
        }
    }
}
