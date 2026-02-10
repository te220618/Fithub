//! 認証APIハンドラ
//! ログイン、ログアウト、登録、OAuth2フローを処理

use actix_session::Session;
use actix_web::{get, post, web, HttpResponse};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::{
    clear_current_user, clear_pending_registration, get_pending_registration, set_current_user,
    set_pending_registration, PendingRegistration, SessionUser,
};
use crate::config::AppConfig;
use crate::db::models::User;
use crate::error::AppError;

// ============================================
// ヘルパー関数
// ============================================

/// フロントエンドURLを考慮したリダイレクトURLを生成
fn get_redirect_url(config: &AppConfig, path: &str) -> String {
    if config.frontend_url.is_empty() {
        path.to_string()
    } else {
        format!("{}{}", config.frontend_url.trim_end_matches('/'), path)
    }
}

// ============================================
// 登録ステータス
// ============================================

#[derive(Serialize)]
struct RegistrationStatus {
    #[serde(rename = "hasPendingRegistration")]
    has_pending_registration: bool,
}

/// GET /api/auth/registration-status
#[get("/auth/registration-status")]
async fn registration_status(session: Session) -> impl actix_web::Responder {
    let has_pending = get_pending_registration(&session).is_some();
    HttpResponse::Ok().json(RegistrationStatus {
        has_pending_registration: has_pending,
    })
}

/// POST /api/auth/cancel-registration
#[post("/auth/cancel-registration")]
async fn cancel_registration(session: Session) -> impl actix_web::Responder {
    clear_pending_registration(&session);
    session.purge();
    HttpResponse::Ok().json(serde_json::json!({ "success": true }))
}

// ============================================
// ユーザー登録（ステップ1）
// ============================================

#[derive(Deserialize)]
struct RegisterRequest {
    #[serde(rename = "loginId")]
    login_id: String,
    password: String,
    #[serde(rename = "confirmPassword")]
    confirm_password: String,
}

/// POST /register - ステップ1: 資格情報をセッションに保存
#[post("/register")]
async fn register(
    pool: web::Data<MySqlPool>,
    session: Session,
    form: web::Form<RegisterRequest>,
) -> Result<HttpResponse, AppError> {
    // パスワードの一致を検証
    if form.password != form.confirm_password {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "パスワードが一致しません。"
        })));
    }

    // login_idの長さを検証
    if form.login_id.len() < 4 || form.login_id.len() > 20 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "ユーザーIDは4〜20文字で入力してください。"
        })));
    }

    // login_idが既に存在するか確認
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE login_id = ?")
        .bind(&form.login_id)
        .fetch_optional(pool.get_ref())
        .await?;

    if existing.is_some() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "このユーザーIDは既に使用されています。別のIDを選択してください。"
        })));
    }

    // パスワードをハッシュ化
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(form.password.as_bytes(), &salt)
        .map_err(|e| AppError::InternalError(format!("Password hashing failed: {}", e)))?
        .to_string();

    // セッションに保存（まだDBには保存しない）
    let pending = PendingRegistration {
        login_id: form.login_id.clone(),
        password_hash,
    };
    set_pending_registration(&session, pending)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "redirect": "/profile"
    })))
}

// ============================================
// プロフィール設定（ステップ2）
// ============================================

#[derive(Deserialize)]
struct ProfileRequest {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    gender: Option<String>,
    birthday: Option<String>,
}

/// POST /profile - ステップ2: プロフィールで登録を完了
#[post("/profile")]
async fn save_profile(
    pool: web::Data<MySqlPool>,
    session: Session,
    form: web::Form<ProfileRequest>,
) -> Result<HttpResponse, AppError> {
    // セッションから保留中の登録情報を取得
    let pending = match get_pending_registration(&session) {
        Some(p) => p,
        None => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "登録セッションが期限切れです。最初からやり直してください。",
                "redirect": "/register"
            })));
        }
    };

    // バリデーション
    let mut errors = Vec::new();

    if form.display_name.as_deref().unwrap_or("").trim().is_empty() {
        errors.push("ユーザー名を入力してください".to_string());
    }

    if form.gender.as_deref().unwrap_or("").is_empty() {
        errors.push("性別を選択してください".to_string());
    }

    if form.birthday.as_deref().unwrap_or("").is_empty() {
        errors.push("生年月日を入力してください".to_string());
    }

    if !errors.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": errors.join("\n")
        })));
    }

    // 誕生日をパース（指定されている場合）
    let birthday: Option<chrono::NaiveDate> = form
        .birthday
        .as_ref()
        .and_then(|b| chrono::NaiveDate::parse_from_str(b, "%Y-%m-%d").ok());

    // ユーザーをデータベースに挿入
    let result = sqlx::query(
        r#"INSERT INTO users (login_id, password, display_name, gender, birthday, oauth_provider, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'LOCAL', 'USER', NOW(), NOW())"#,
    )
    .bind(&pending.login_id)
    .bind(&pending.password_hash)
    .bind(&form.display_name)
    .bind(&form.gender)
    .bind(&birthday)
    .execute(pool.get_ref())
    .await?;

    let user_id = result.last_insert_id() as i64;

    // 保留中の登録情報をクリア
    clear_pending_registration(&session);

    // ユーザー統計を作成
    let _ = sqlx::query(
        r#"INSERT INTO user_stats (user_id, total_exp, level, created_at, updated_at)
           VALUES (?, 0, 1, NOW(), NOW())"#,
    )
    .bind(user_id)
    .execute(pool.get_ref())
    .await;

    // セッションユーザーを設定
    let session_user = SessionUser {
        id: user_id,
        login_id: pending.login_id.clone(),
        display_name: form.display_name.clone(),
        email: None,
        profile_image_url: None,
        oauth_provider: "LOCAL".to_string(),
        role: "USER".to_string(),
    };
    set_current_user(&session, session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "redirect": "/dashboard"
    })))
}

// ============================================
// フォームログイン
// ============================================

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

/// POST /login - フォームベースログイン
#[post("/login")]
async fn login(
    pool: web::Data<MySqlPool>,
    session: Session,
    form: web::Form<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    // login_idでユーザーを検索
    let user: Option<User> = sqlx::query_as(
        r#"SELECT id, login_id, password, email, display_name, gender, birthday,
           profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at
           FROM users WHERE login_id = ?"#,
    )
    .bind(&form.username)
    .fetch_optional(pool.get_ref())
    .await?;

    let user = match user {
        Some(u) => u,
        None => {
            return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "ユーザーIDまたはパスワードが正しくありません。"
            })));
        }
    };

    // ユーザーがパスワードを持っているか確認（OAuth専用ではない）
    let stored_hash = match &user.password {
        Some(h) if !h.is_empty() => h,
        _ => {
            return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "このアカウントはソーシャルログインで登録されています。"
            })));
        }
    };

    // パスワードを検証（bcryptとargon2の両方をサポート）
    let is_valid = if stored_hash.starts_with("$2a$")
        || stored_hash.starts_with("$2b$")
        || stored_hash.starts_with("$2y$")
    {
        // bcryptハッシュ（Spring Bootから）
        bcrypt::verify(&form.password, stored_hash).unwrap_or(false)
    } else {
        // Argon2ハッシュ（新規登録）
        let parsed_hash = match PasswordHash::new(stored_hash) {
            Ok(h) => h,
            Err(e) => {
                tracing::error!("Invalid password hash format: {}", e);
                return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "ユーザーIDまたはパスワードが正しくありません。"
                })));
            }
        };
        Argon2::default()
            .verify_password(form.password.as_bytes(), &parsed_hash)
            .is_ok()
    };

    if !is_valid {
        return Ok(HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "ユーザーIDまたはパスワードが正しくありません。"
        })));
    }

    // セッションを作成
    let session_user = SessionUser {
        id: user.id,
        login_id: user.login_id.clone(),
        display_name: user.display_name.clone(),
        email: user.email.clone(),
        profile_image_url: user.profile_image_url.clone(),
        oauth_provider: user.oauth_provider.clone(),
        role: user.role.clone(),
    };
    set_current_user(&session, session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "redirect": "/dashboard"
    })))
}

// ============================================
// ログアウト
// ============================================

/// POST /logout
#[post("/logout")]
async fn logout(session: Session) -> impl actix_web::Responder {
    clear_current_user(&session);
    session.purge();
    HttpResponse::Found()
        .append_header(("Location", "/login"))
        .finish()
}

// ============================================
// OAuth2開始
// ============================================

/// GET /oauth2/authorization/google
#[get("/oauth2/authorization/google")]
async fn google_oauth_start(
    config: web::Data<AppConfig>,
    session: Session,
) -> impl actix_web::Responder {
    let client = crate::auth::oauth_google::create_oauth_client(&config);
    let (auth_url, csrf_token) = crate::auth::oauth_google::get_authorize_url(&client);

    // CSRFトークンをセッションに保存
    let _ = session.insert("oauth_csrf", csrf_token.secret().clone());

    HttpResponse::Found()
        .append_header(("Location", auth_url))
        .finish()
}

/// GET /oauth2/authorization/github
#[get("/oauth2/authorization/github")]
async fn github_oauth_start(
    config: web::Data<AppConfig>,
    session: Session,
) -> impl actix_web::Responder {
    let client = crate::auth::oauth_github::create_oauth_client(&config);
    let (auth_url, csrf_token) = crate::auth::oauth_github::get_authorize_url(&client);

    // CSRFトークンをセッションに保存
    let _ = session.insert("oauth_csrf", csrf_token.secret().clone());

    HttpResponse::Found()
        .append_header(("Location", auth_url))
        .finish()
}

/// GET /oauth2/authorization/microsoft
#[get("/oauth2/authorization/microsoft")]
async fn microsoft_oauth_start(
    config: web::Data<AppConfig>,
    session: Session,
) -> impl actix_web::Responder {
    let client = crate::auth::oauth_microsoft::create_oauth_client(&config);
    let (auth_url, csrf_token) = crate::auth::oauth_microsoft::get_authorize_url(&client);

    // CSRFトークンをセッションに保存
    let _ = session.insert("oauth_csrf", csrf_token.secret().clone());

    HttpResponse::Found()
        .append_header(("Location", auth_url))
        .finish()
}

// ============================================
// OAuth2コールバック
// ============================================

#[derive(Deserialize)]
struct OAuthCallback {
    code: String,
    #[allow(dead_code)]
    state: Option<String>,
}

/// GET /login/oauth2/code/google - OAuth2コールバック（Spring Boot互換）
#[get("/login/oauth2/code/google")]
async fn google_oauth_callback(
    pool: web::Data<MySqlPool>,
    config: web::Data<AppConfig>,
    session: Session,
    query: web::Query<OAuthCallback>,
) -> Result<HttpResponse, AppError> {
    let client = crate::auth::oauth_google::create_oauth_client(&config);

    // コードをユーザー情報に交換
    let user_info =
        crate::auth::oauth_google::exchange_code_for_user_info(&client, query.code.clone())
            .await
            .map_err(|e| AppError::InternalError(e))?;

    // ユーザーを検索または作成
    let user = find_or_create_oauth_user(
        pool.get_ref(),
        "GOOGLE",
        &user_info.sub,
        user_info.email.as_deref(),
        user_info.name.as_deref(),
        user_info.picture.as_deref(),
    )
    .await?;

    // セッションを設定
    let session_user = SessionUser {
        id: user.id,
        login_id: user.login_id.clone(),
        display_name: user.display_name.clone(),
        email: user.email.clone(),
        profile_image_url: user.profile_image_url.clone(),
        oauth_provider: user.oauth_provider.clone(),
        role: user.role.clone(),
    };
    set_current_user(&session, session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    let redirect_url = get_redirect_url(&config, "/dashboard");
    Ok(HttpResponse::Found()
        .append_header(("Location", redirect_url))
        .finish())
}

/// GET /login/oauth2/code/github - OAuth2コールバック（Spring Boot互換）
#[get("/login/oauth2/code/github")]
async fn github_oauth_callback(
    pool: web::Data<MySqlPool>,
    config: web::Data<AppConfig>,
    session: Session,
    query: web::Query<OAuthCallback>,
) -> Result<HttpResponse, AppError> {
    let client = crate::auth::oauth_github::create_oauth_client(&config);

    // コードをユーザー情報に交換
    let user_info =
        crate::auth::oauth_github::exchange_code_for_user_info(&client, query.code.clone())
            .await
            .map_err(|e| AppError::InternalError(e))?;

    // ユーザーを検索または作成
    let user = find_or_create_oauth_user(
        pool.get_ref(),
        "GITHUB",
        &user_info.id.to_string(),
        user_info.email.as_deref(),
        user_info.name.as_deref().or(Some(&user_info.login)),
        user_info.avatar_url.as_deref(),
    )
    .await?;

    // セッションを設定
    let session_user = SessionUser {
        id: user.id,
        login_id: user.login_id.clone(),
        display_name: user.display_name.clone(),
        email: user.email.clone(),
        profile_image_url: user.profile_image_url.clone(),
        oauth_provider: user.oauth_provider.clone(),
        role: user.role.clone(),
    };
    set_current_user(&session, session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    let redirect_url = get_redirect_url(&config, "/dashboard");
    Ok(HttpResponse::Found()
        .append_header(("Location", redirect_url))
        .finish())
}

/// GET /login/oauth2/code/microsoft - OAuth2コールバック
#[get("/login/oauth2/code/microsoft")]
async fn microsoft_oauth_callback(
    pool: web::Data<MySqlPool>,
    config: web::Data<AppConfig>,
    session: Session,
    query: web::Query<OAuthCallback>,
) -> Result<HttpResponse, AppError> {
    let client = crate::auth::oauth_microsoft::create_oauth_client(&config);

    // コードをユーザー情報に交換
    let user_info =
        crate::auth::oauth_microsoft::exchange_code_for_user_info(&client, query.code.clone())
            .await
            .map_err(|e| AppError::InternalError(e))?;

    // ユーザーを検索または作成
    let user = find_or_create_oauth_user(
        pool.get_ref(),
        "MICROSOFT",
        &user_info.id,
        user_info.mail.as_deref().or(user_info.user_principal_name.as_deref()),
        user_info.display_name.as_deref(),
        None, // Microsoft Graph APIでは画像取得は別エンドポイントが必要なため、一旦None
    )
    .await?;

    // セッションを設定
    let session_user = SessionUser {
        id: user.id,
        login_id: user.login_id.clone(),
        display_name: user.display_name.clone(),
        email: user.email.clone(),
        profile_image_url: user.profile_image_url.clone(),
        oauth_provider: user.oauth_provider.clone(),
        role: user.role.clone(),
    };
    set_current_user(&session, session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    let redirect_url = get_redirect_url(&config, "/dashboard");
    Ok(HttpResponse::Found()
        .append_header(("Location", redirect_url))
        .finish())
}

// ============================================
// CSRFトークン
// ============================================

/// GET /api/csrf - SPA用のCSRFトークンを取得
#[get("/csrf")]
async fn get_csrf_token() -> impl actix_web::Responder {
    // actix-webのCookieセッションでは、CSRFは通常異なる方法で処理される
    // 現時点ではシンプルなトークンを返す
    HttpResponse::Ok().json(serde_json::json!({
        "token": "csrf-not-required-for-same-origin"
    }))
}

// ============================================
// ヘルパー関数
// ============================================

async fn find_or_create_oauth_user(
    pool: &MySqlPool,
    provider: &str,
    oauth_id: &str,
    email: Option<&str>,
    name: Option<&str>,
    image_url: Option<&str>,
) -> Result<User, AppError> {
    // oauth_providerとoauth_idで検索
    let existing: Option<User> = sqlx::query_as(
        r#"SELECT id, login_id, password, email, display_name, gender, birthday,
           profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at
           FROM users WHERE oauth_provider = ? AND oauth_id = ?"#,
    )
    .bind(provider)
    .bind(oauth_id)
    .fetch_optional(pool)
    .await?;

    if let Some(mut user) = existing {
        // ユーザー情報が変更された場合は更新
        let mut updated = false;
        if email.is_some() && user.email.as_deref() != email {
            user.email = email.map(|s| s.to_string());
            updated = true;
        }
        if name.is_some() && user.display_name.as_deref() != name {
            user.display_name = name.map(|s| s.to_string());
            updated = true;
        }
        if image_url.is_some() && user.profile_image_url.as_deref() != image_url {
            user.profile_image_url = image_url.map(|s| s.to_string());
            updated = true;
        }

        if updated {
            sqlx::query(
                r#"UPDATE users SET email = ?, display_name = ?, profile_image_url = ?, updated_at = NOW()
                   WHERE id = ?"#,
            )
            .bind(&user.email)
            .bind(&user.display_name)
            .bind(&user.profile_image_url)
            .bind(user.id)
            .execute(pool)
            .await?;
        }

        return Ok(user);
    }

    // メールで検索
    if let Some(email_str) = email {
        let existing_by_email: Option<User> = sqlx::query_as(
            r#"SELECT id, login_id, password, email, display_name, gender, birthday,
               profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at
               FROM users WHERE email = ?"#,
        )
        .bind(email_str)
        .fetch_optional(pool)
        .await?;

        if let Some(mut user) = existing_by_email {
            // OAuthを既存アカウントにリンク
            sqlx::query(
                r#"UPDATE users SET oauth_provider = ?, oauth_id = ?, profile_image_url = COALESCE(?, profile_image_url), updated_at = NOW()
                   WHERE id = ?"#,
            )
            .bind(provider)
            .bind(oauth_id)
            .bind(image_url)
            .bind(user.id)
            .execute(pool)
            .await?;

            user.oauth_provider = provider.to_string();
            user.oauth_id = Some(oauth_id.to_string());
            return Ok(user);
        }
    }

    // 新規ユーザーを作成
    let login_id = generate_unique_login_id(pool, provider, oauth_id, email).await?;

    let result = sqlx::query(
        r#"INSERT INTO users (login_id, email, display_name, profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'USER', NOW(), NOW())"#,
    )
    .bind(&login_id)
    .bind(email)
    .bind(name)
    .bind(image_url)
    .bind(provider)
    .bind(oauth_id)
    .execute(pool)
    .await?;

    let user_id = result.last_insert_id() as i64;

    // ユーザー統計を作成
    let _ = sqlx::query(
        r#"INSERT INTO user_stats (user_id, total_exp, level, created_at, updated_at)
           VALUES (?, 0, 1, NOW(), NOW())"#,
    )
    .bind(user_id)
    .execute(pool)
    .await;

    Ok(User {
        id: user_id,
        login_id,
        password: None,
        email: email.map(|s| s.to_string()),
        display_name: name.map(|s| s.to_string()),
        gender: None,
        birthday: None,
        profile_image_url: image_url.map(|s| s.to_string()),
        oauth_provider: provider.to_string(),
        oauth_id: Some(oauth_id.to_string()),
        role: "USER".to_string(),
        created_at: None,
        updated_at: None,
    })
}

fn generate_login_id(provider: &str, oauth_id: &str, email: Option<&str>) -> String {
    if let Some(email_str) = email {
        if !email_str.is_empty() {
            let local_part: &str = email_str.split('@').next().unwrap_or("");
            if local_part.len() >= 6 {
                return local_part.to_string();
            }
            return format!("{:0<6}", local_part);
        }
    }

    let base: String = format!("{}{}", provider, oauth_id)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();

    if base.len() < 6 {
        format!("{:0<6}", base)
    } else {
        base.chars().take(20).collect()
    }
}

/// 一意なlogin_idを生成する（重複時はサフィックスを追加）
async fn generate_unique_login_id(
    pool: &MySqlPool,
    provider: &str,
    oauth_id: &str,
    email: Option<&str>,
) -> Result<String, AppError> {
    let base_login_id = generate_login_id(provider, oauth_id, email);
    
    // まず基本のlogin_idが使用可能か確認
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE login_id = ?")
        .bind(&base_login_id)
        .fetch_optional(pool)
        .await?;
    
    if existing.is_none() {
        return Ok(base_login_id);
    }
    
    // 重複している場合、サフィックスを追加して一意にする
    for i in 1..1000 {
        let candidate = format!("{}_{}", base_login_id, i);
        let exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE login_id = ?")
            .bind(&candidate)
            .fetch_optional(pool)
            .await?;
        
        if exists.is_none() {
            return Ok(candidate);
        }
    }
    
    // 1000回試しても見つからない場合はUUIDの一部を使用
    let uuid_suffix = uuid::Uuid::new_v4().to_string()[..8].to_string();
    Ok(format!("{}_{}", base_login_id, uuid_suffix))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(registration_status)
        .service(cancel_registration)
        .service(get_csrf_token);
}

/// ルートレベルの認証ルートを設定（/api配下ではない）
pub fn configure_root(cfg: &mut web::ServiceConfig) {
    cfg.service(register)
        .service(save_profile)
        .service(login)
        .service(logout)
        .service(google_oauth_start)
        .service(github_oauth_start)
        .service(microsoft_oauth_start)
        .service(google_oauth_callback)
        .service(github_oauth_callback)
        .service(microsoft_oauth_callback);
}
