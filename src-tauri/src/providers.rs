use serde::{Deserialize, Serialize};

use crate::credentials::Provider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub models: Vec<ProviderModel>,
    pub requires_api_key: bool,
}

/// Get all available providers with their models
#[tauri::command]
pub fn get_provider_models() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            icon: "".to_string(),
            requires_api_key: true,
            models: vec![
                ProviderModel { id: "gpt-5.2".to_string(), name: "GPT-5.2".to_string() },
                ProviderModel { id: "gpt-5-turbo".to_string(), name: "GPT-5 Turbo".to_string() },
                ProviderModel { id: "o3".to_string(), name: "o3 (Reasoning)".to_string() },
                ProviderModel { id: "o3-mini".to_string(), name: "o3 Mini".to_string() },
                ProviderModel { id: "gpt-4o".to_string(), name: "GPT-4o (Legacy)".to_string() },
            ],
        },
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            icon: "".to_string(),
            requires_api_key: true,
            models: vec![
                ProviderModel { id: "claude-4-5-opus".to_string(), name: "Claude 4.5 Opus".to_string() },
                ProviderModel { id: "claude-4-5-sonnet".to_string(), name: "Claude 4.5 Sonnet".to_string() },
                ProviderModel { id: "claude-4-haiku".to_string(), name: "Claude 4 Haiku".to_string() },
            ],
        },
        ProviderInfo {
            id: "gemini".to_string(),
            name: "Google Gemini".to_string(),
            icon: "".to_string(),
            requires_api_key: true,
            models: vec![
                ProviderModel { id: "gemini-3-pro".to_string(), name: "Gemini 3.0 Pro".to_string() },
                ProviderModel { id: "gemini-3-flash".to_string(), name: "Gemini 3.0 Flash".to_string() },
                ProviderModel { id: "gemini-3-deepthink".to_string(), name: "Gemini 3 DeepThink".to_string() },
                ProviderModel { id: "gemini-1.5-pro".to_string(), name: "Gemini 1.5 Pro".to_string() },
            ],
        },
        ProviderInfo {
            id: "mistral".to_string(),
            name: "Mistral AI".to_string(),
            icon: "".to_string(),
            requires_api_key: true,
            models: vec![
                ProviderModel { id: "mistral-large-3".to_string(), name: "Mistral Large 3".to_string() },
                ProviderModel { id: "mistral-magistral".to_string(), name: "Mistral Magistral".to_string() },
                ProviderModel { id: "ministral-12b".to_string(), name: "Ministral 12B".to_string() },
                ProviderModel { id: "codestral-2".to_string(), name: "Codestral 2".to_string() },
            ],
        },
        ProviderInfo {
            id: "grok".to_string(),
            name: "xAI Grok".to_string(),
            icon: "".to_string(),
            requires_api_key: true,
            models: vec![
                ProviderModel { id: "grok-4-1".to_string(), name: "Grok 4.1".to_string() },
                ProviderModel { id: "grok-4-1-fast".to_string(), name: "Grok 4.1 Fast".to_string() },
                ProviderModel { id: "grok-3".to_string(), name: "Grok 3 (Legacy)".to_string() },
            ],
        }
    ]
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
        Provider::Gemini => call_gemini_api(model_id, api_key, system_prompt, user_prompt).await,
        Provider::Grok => call_grok_api(model_id, api_key, system_prompt, user_prompt).await,
        Provider::Mistral => call_mistral_api(model_id, api_key, system_prompt, user_prompt).await,
        Provider::Ollama => call_ollama_api(model_id, system_prompt, user_prompt).await,
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

/// Anthropic API call
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

/// Gemini API call
async fn call_gemini_api(
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct GeminiRequest {
        contents: Vec<GeminiContent>,
        system_instruction: GeminiSystemInstruction,
    }

    #[derive(Serialize)]
    struct GeminiSystemInstruction {
        parts: Vec<GeminiPart>,
    }

    #[derive(Serialize)]
    struct GeminiContent {
        parts: Vec<GeminiPart>,
    }

    #[derive(Serialize)]
    struct GeminiPart {
        text: String,
    }

    #[derive(Deserialize)]
    struct GeminiResponse {
        candidates: Vec<GeminiCandidate>,
    }

    #[derive(Deserialize)]
    struct GeminiCandidate {
        content: GeminiContentResponse,
    }

    #[derive(Deserialize)]
    struct GeminiContentResponse {
        parts: Vec<GeminiPartResponse>,
    }

    #[derive(Deserialize)]
    struct GeminiPartResponse {
        text: String,
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_id, api_key
    );

    let request = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart { text: user_prompt.to_string() }],
        }],
        system_instruction: GeminiSystemInstruction {
            parts: vec![GeminiPart { text: system_prompt.to_string() }],
        },
    };

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Gemini API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", error_text));
    }

    let data: GeminiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

    data.candidates
        .first()
        .and_then(|c| c.content.parts.first())
        .map(|p| p.text.clone())
        .ok_or_else(|| "No response from Gemini".to_string())
}

/// Grok API call (xAI uses OpenAI-compatible API)
async fn call_grok_api(
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct GrokRequest {
        model: String,
        messages: Vec<GrokMessage>,
        max_tokens: u32,
    }

    #[derive(Serialize)]
    struct GrokMessage {
        role: String,
        content: String,
    }

    #[derive(Deserialize)]
    struct GrokResponse {
        choices: Vec<GrokChoice>,
    }

    #[derive(Deserialize)]
    struct GrokChoice {
        message: GrokMessageResponse,
    }

    #[derive(Deserialize)]
    struct GrokMessageResponse {
        content: String,
    }

    let client = reqwest::Client::new();
    let request = GrokRequest {
        model: model_id.to_string(),
        messages: vec![
            GrokMessage { role: "system".to_string(), content: system_prompt.to_string() },
            GrokMessage { role: "user".to_string(), content: user_prompt.to_string() },
        ],
        max_tokens: 2048,
    };

    let response = client
        .post("https://api.x.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Grok API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Grok API error: {}", error_text));
    }

    let data: GrokResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Grok response: {}", e))?;

    data.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from Grok".to_string())
}

/// Mistral API call
async fn call_mistral_api(
    model_id: &str,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    #[derive(Serialize)]
    struct MistralRequest {
        model: String,
        messages: Vec<MistralMessage>,
        max_tokens: u32,
    }

    #[derive(Serialize)]
    struct MistralMessage {
        role: String,
        content: String,
    }

    #[derive(Deserialize)]
    struct MistralResponse {
        choices: Vec<MistralChoice>,
    }

    #[derive(Deserialize)]
    struct MistralChoice {
        message: MistralMessageResponse,
    }

    #[derive(Deserialize)]
    struct MistralMessageResponse {
        content: String,
    }

    let client = reqwest::Client::new();
    let request = MistralRequest {
        model: model_id.to_string(),
        messages: vec![
            MistralMessage { role: "system".to_string(), content: system_prompt.to_string() },
            MistralMessage { role: "user".to_string(), content: user_prompt.to_string() },
        ],
        max_tokens: 2048,
    };

    let response = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Mistral API request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Mistral API error: {}", error_text));
    }

    let data: MistralResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Mistral response: {}", e))?;

    data.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "No response from Mistral".to_string())
}

/// Test if an API key is valid by making a minimal API call
#[tauri::command]
pub async fn test_api_key(provider: String, api_key: String) -> Result<(), String> {
    use crate::credentials::Provider;

    let provider_enum = match provider.as_str() {
        "openai" => Provider::OpenAI,
        "anthropic" => Provider::Anthropic,
        "gemini" => Provider::Gemini,
        "grok" => Provider::Grok,
        "mistral" => Provider::Mistral,
        "ollama" => return Ok(()), // Ollama doesn't need API key
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    // Make a minimal test request to verify the API key
    match provider_enum {
        Provider::OpenAI => test_openai_key(&api_key).await,
        Provider::Anthropic => test_anthropic_key(&api_key).await,
        Provider::Gemini => test_gemini_key(&api_key).await,
        Provider::Grok => test_grok_key(&api_key).await,
        Provider::Mistral => test_mistral_key(&api_key).await,
        Provider::Ollama => Ok(()),
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

/// Test Anthropic API key
async fn test_anthropic_key(api_key: &str) -> Result<(), String> {
    #[derive(Serialize)]
    struct TestRequest {
        model: String,
        max_tokens: u32,
        messages: Vec<TestMessage>,
    }

    #[derive(Serialize)]
    struct TestMessage {
        role: String,
        content: String,
    }

    let client = reqwest::Client::new();
    let request = TestRequest {
        model: "claude-3-haiku-20240307".to_string(),
        max_tokens: 1,
        messages: vec![TestMessage {
            role: "user".to_string(),
            content: "Hi".to_string(),
        }],
    };

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&request)
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

/// Test Gemini API key
async fn test_gemini_key(api_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status().as_u16() == 400 || response.status().as_u16() == 403 {
        Err("Invalid API key".to_string())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("API error: {}", error_text))
    }
}

/// Test Grok (xAI) API key
async fn test_grok_key(api_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.x.ai/v1/models")
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

/// Test Mistral API key
async fn test_mistral_key(api_key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.mistral.ai/v1/models")
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

/// Ollama API call (local)
async fn call_ollama_api(
    model_id: &str,
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

    let response = client
        .post("http://localhost:11434/api/generate")
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
