use serde::{Deserialize, Serialize};

use crate::credentials::Provider;

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
            let base_url = if api_key.is_empty() {
                "http://localhost:11434".to_string()
            } else {
                api_key.trim_end_matches('/').to_string()
            };
            call_ollama_api(model_id, &base_url, system_prompt, user_prompt).await
        }
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
