//! Google OAuth2 implementation

use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;

use crate::config::AppConfig;

#[derive(Debug, Deserialize)]
pub struct GoogleUserInfo {
    pub sub: String, // Google user ID
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    #[allow(dead_code)]
    pub email_verified: Option<bool>,
}

pub fn create_oauth_client(config: &AppConfig) -> BasicClient {
    BasicClient::new(
        ClientId::new(config.google_client_id.clone()),
        Some(ClientSecret::new(config.google_client_secret.clone())),
        AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())
            .expect("Invalid auth URL"),
        Some(
            TokenUrl::new("https://oauth2.googleapis.com/token".to_string())
                .expect("Invalid token URL"),
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(config.google_redirect_uri.clone()).expect("Invalid redirect URL"),
    )
}

/// Generate authorization URL for Google OAuth
pub fn get_authorize_url(client: &BasicClient) -> (String, CsrfToken) {
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();

    (auth_url.to_string(), csrf_token)
}

/// Exchange authorization code for access token and fetch user info
pub async fn exchange_code_for_user_info(
    client: &BasicClient,
    code: String,
) -> Result<GoogleUserInfo, String> {
    // Exchange code for token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| {
            tracing::error!("Google OAuth token exchange failed: {:?}", e);
            format!("Token exchange failed: {}", e)
        })?;

    let access_token = token_result.access_token().secret();

    // Fetch user info
    let http_client = reqwest::Client::new();
    let user_info: GoogleUserInfo = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    Ok(user_info)
}
