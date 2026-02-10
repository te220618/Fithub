//! Microsoft OAuth2 implementation

use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    ClientSecret, CsrfToken, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;

use crate::config::AppConfig;

#[derive(Debug, Deserialize)]
pub struct MicrosoftUserInfo {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub mail: Option<String>,
    #[serde(rename = "userPrincipalName")]
    pub user_principal_name: Option<String>,
}

pub fn create_oauth_client(config: &AppConfig) -> BasicClient {
    BasicClient::new(
        ClientId::new(config.microsoft_client_id.clone()),
        Some(ClientSecret::new(config.microsoft_client_secret.clone())),
        AuthUrl::new("https://login.microsoftonline.com/common/oauth2/v2.0/authorize".to_string())
            .expect("Invalid auth URL"),
        Some(
            TokenUrl::new("https://login.microsoftonline.com/common/oauth2/v2.0/token".to_string())
                .expect("Invalid token URL"),
        ),
    )
    .set_redirect_uri(
        RedirectUrl::new(config.microsoft_redirect_uri.clone()).expect("Invalid redirect URL"),
    )
}

/// Generate authorization URL for Microsoft OAuth
pub fn get_authorize_url(client: &BasicClient) -> (String, CsrfToken) {
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("User.Read".to_string()))
        .url();

    (auth_url.to_string(), csrf_token)
}

/// Exchange authorization code for access token and fetch user info
pub async fn exchange_code_for_user_info(
    client: &BasicClient,
    code: String,
) -> Result<MicrosoftUserInfo, String> {
    // Exchange code for token
    let token_result = client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| {
            tracing::error!("Microsoft OAuth token exchange failed: {:?}", e);
            format!("Token exchange failed: {}", e)
        })?;

    let access_token = token_result.access_token().secret();

    // Fetch user info from Microsoft Graph API
    let http_client = reqwest::Client::new();
    let user_info: MicrosoftUserInfo = http_client
        .get("https://graph.microsoft.com/v1.0/me")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    Ok(user_info)
}
