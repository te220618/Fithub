//! Session management

use actix_session::Session;
use serde::{Deserialize, Serialize};

use crate::db::models::User;

const USER_SESSION_KEY: &str = "user";
const PENDING_REGISTRATION_KEY: &str = "pending_registration";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUser {
    pub id: i64,
    pub login_id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub profile_image_url: Option<String>,
    pub oauth_provider: String,
    pub role: String,
}

impl From<User> for SessionUser {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            login_id: user.login_id,
            display_name: user.display_name,
            email: user.email,
            profile_image_url: user.profile_image_url,
            oauth_provider: user.oauth_provider,
            role: user.role,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingRegistration {
    pub login_id: String,
    pub password_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct PendingOAuthRegistration {
    pub provider: String,
    pub oauth_id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub profile_image_url: Option<String>,
}

/// Get current user from session
pub fn get_current_user(session: &Session) -> Result<SessionUser, crate::error::AppError> {
    session
        .get::<SessionUser>(USER_SESSION_KEY)
        .ok()
        .flatten()
        .ok_or_else(|| crate::error::AppError::Unauthorized("Not logged in".to_string()))
}

/// Get current user from session (optional version)
pub fn get_current_user_opt(session: &Session) -> Option<SessionUser> {
    session.get::<SessionUser>(USER_SESSION_KEY).ok().flatten()
}

/// Set current user in session
pub fn set_current_user(
    session: &Session,
    user: SessionUser,
) -> Result<(), actix_session::SessionInsertError> {
    session.insert(USER_SESSION_KEY, user)
}

/// Clear current user from session (logout)
pub fn clear_current_user(session: &Session) {
    session.remove(USER_SESSION_KEY);
}

/// Get pending registration from session
pub fn get_pending_registration(session: &Session) -> Option<PendingRegistration> {
    session
        .get::<PendingRegistration>(PENDING_REGISTRATION_KEY)
        .ok()
        .flatten()
}

/// Set pending registration in session
pub fn set_pending_registration(
    session: &Session,
    pending: PendingRegistration,
) -> Result<(), actix_session::SessionInsertError> {
    session.insert(PENDING_REGISTRATION_KEY, pending)
}

/// Clear pending registration from session
pub fn clear_pending_registration(session: &Session) {
    session.remove(PENDING_REGISTRATION_KEY);
}
