//! GitHub OAuth2 implementation

use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;

use crate::config::AppConfig;

#[derive(Debug, Deserialize)]
pub struct GitHubUserInfo {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

pub fn create_oauth_client(config: &AppConfig) -> BasicClient {
    BasicClient::new(
        ClientId::new(config.github_client_id.clone()),
        Some(ClientSecret::new(config.github_client_secret.clone())),
        AuthUrl::new("https://github.com/login/oauth/authorize".to_string())
            .expect("Invalid auth URL"),
        Some(
            TokenUrl::new("https://github.com/login/oauth/access_token".to_string())
                .expect("Invalid token URL"),
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(config.github_redirect_uri.clone()).expect("Invalid redirect URL"),
    )
}

/// Generate authorization URL for GitHub OAuth
pub fn get_authorize_url(client: &BasicClient) -> (String, CsrfToken) {
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("user:email".to_string()))
        .add_scope(Scope::new("read:user".to_string()))
        .url();

    (auth_url.to_string(), csrf_token)
}

/// Exchange authorization code for access token and fetch user info
pub async fn exchange_code_for_user_info(
    client: &BasicClient,
    code: String,
) -> Result<GitHubUserInfo, String> {
    // Exchange code for token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let access_token = token_result.access_token().secret();

    // Fetch user info
    let http_client = reqwest::Client::new();
    let user_info: GitHubUserInfo = http_client
        .get("https://api.github.com/user")
        .header("User-Agent", "FithubFast")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    Ok(user_info)
}
