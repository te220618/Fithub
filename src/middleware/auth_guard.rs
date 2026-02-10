//! 認証ガードミドルウェア

use actix_session::Session;

use crate::auth::session::{get_current_user_opt, SessionUser};

/// リクエストから認証済みユーザーを抽出
/// 未認証の場合はNoneを返す
#[allow(dead_code)]
pub fn extract_user(session: &Session) -> Option<SessionUser> {
    get_current_user_opt(session)
}

/// ユーザーが管理者権限を持つかチェック
#[allow(dead_code)]
pub fn is_admin(user: &SessionUser) -> bool {
    user.role == "ADMIN"
}

/// ハンドラで認証を必須にするマクロ
/// 使用法: let user = require_auth!(session);
#[macro_export]
macro_rules! require_auth {
    ($session:expr) => {
        match $crate::middleware::auth_guard::extract_user(&$session) {
            Some(user) => user,
            None => {
                return Err($crate::error::AppError::Unauthorized(
                    "Not authenticated".to_string(),
                ))
            }
        }
    };
}

/// ハンドラで管理者権限を必須にするマクロ
/// 使用法: let user = require_admin!(session);
#[macro_export]
macro_rules! require_admin {
    ($session:expr) => {
        match $crate::middleware::auth_guard::extract_user(&$session) {
            Some(user) if $crate::middleware::auth_guard::is_admin(&user) => user,
            Some(_) => {
                return Err($crate::error::AppError::Forbidden(
                    "Admin access required".to_string(),
                ))
            }
            None => {
                return Err($crate::error::AppError::Unauthorized(
                    "Not authenticated".to_string(),
                ))
            }
        }
    };
}
