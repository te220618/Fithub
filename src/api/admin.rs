//! 管理者専用API
//! login_id = "220618" のユーザーのみアクセス可能

use actix_session::Session;
use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::UserStats;
use crate::error::AppError;

/// 特別管理者のログインID
const SPECIAL_ADMIN_LOGIN_ID: [&str; 1] = ["220618"];

/// 特別管理者かどうかをチェック
fn is_special_admin(login_id: &str) -> bool {
    SPECIAL_ADMIN_LOGIN_ID.contains(&login_id)
}

/// 管理者ユーザー一覧のレスポンス
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserResponse {
    pub id: i64,
    pub login_id: String,
    pub display_name: Option<String>,
    pub level: i32,
    pub total_exp: i64,
}

/// レベル更新リクエスト
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLevelRequest {
    pub level: i32,
}

/// レベル更新レスポンス
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLevelResponse {
    pub id: i64,
    pub level: i32,
    pub total_exp: i64,
    pub message: String,
}

/// ユーザー一覧を取得（レベル情報付き）
/// GET /api/admin/users
async fn get_users(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証チェック
    let current_user = get_current_user(&session)?;
    
    // 特別管理者チェック
    if !is_special_admin(&current_user.login_id) {
        return Err(AppError::Forbidden("アクセス権限がありません".to_string()));
    }

    // ユーザー一覧を取得（user_statsと結合）
    let users = sqlx::query_as::<_, (i64, String, Option<String>, i32, i64)>(
        r#"
        SELECT 
            u.id,
            u.login_id,
            u.display_name,
            COALESCE(us.level, 1) as level,
            COALESCE(us.total_exp, 0) as total_exp
        FROM users u
        LEFT JOIN user_stats us ON u.id = us.user_id
        ORDER BY u.id ASC
        "#,
    )
    .fetch_all(pool.get_ref())
    .await?;

    let response: Vec<AdminUserResponse> = users
        .into_iter()
        .map(|(id, login_id, display_name, level, total_exp)| AdminUserResponse {
            id,
            login_id,
            display_name,
            level,
            total_exp,
        })
        .collect();

    Ok(HttpResponse::Ok().json(response))
}

/// ユーザーのレベルを更新
/// PUT /api/admin/users/{user_id}/level
async fn update_user_level(
    session: Session,
    pool: web::Data<MySqlPool>,
    path: web::Path<i64>,
    body: web::Json<UpdateLevelRequest>,
) -> Result<HttpResponse, AppError> {
    // 認証チェック
    let current_user = get_current_user(&session)?;
    
    // 特別管理者チェック
    if !is_special_admin(&current_user.login_id) {
        return Err(AppError::Forbidden("アクセス権限がありません".to_string()));
    }

    let user_id = path.into_inner();
    let new_level = body.level;

    // レベルのバリデーション
    if new_level < 1 || new_level > 1000 {
        return Err(AppError::BadRequest(
            "レベルは1〜1000の範囲で指定してください".to_string(),
        ));
    }

    // 新しいレベルに対応する累計EXPを計算
    let new_total_exp = UserStats::get_required_exp_for_level(new_level);

    // ユーザーの存在確認
    let user_exists = sqlx::query_scalar::<_, i64>("SELECT id FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool.get_ref())
        .await?;

    if user_exists.is_none() {
        return Err(AppError::NotFound("ユーザーが見つかりません".to_string()));
    }

    // user_statsを更新（存在しない場合は作成）
    let existing_stats =
        sqlx::query_scalar::<_, i64>("SELECT id FROM user_stats WHERE user_id = ?")
            .bind(user_id)
            .fetch_optional(pool.get_ref())
            .await?;

    if existing_stats.is_some() {
        // 既存レコードを更新
        sqlx::query("UPDATE user_stats SET level = ?, total_exp = ? WHERE user_id = ?")
            .bind(new_level)
            .bind(new_total_exp)
            .bind(user_id)
            .execute(pool.get_ref())
            .await?;
    } else {
        // 新規レコードを作成
        sqlx::query("INSERT INTO user_stats (user_id, level, total_exp) VALUES (?, ?, ?)")
            .bind(user_id)
            .bind(new_level)
            .bind(new_total_exp)
            .execute(pool.get_ref())
            .await?;
    }

    // レベル変更に伴うペット解放条件をチェック
    use crate::api::pet::check_and_unlock_pet_types;
    let _ = check_and_unlock_pet_types(pool.get_ref(), user_id).await;

    let response = UpdateLevelResponse {
        id: user_id,
        level: new_level,
        total_exp: new_total_exp,
        message: format!("レベルを{}に更新しました（累計EXP: {}）", new_level, new_total_exp),
    };

    Ok(HttpResponse::Ok().json(response))
}

/// 管理者APIルートを設定
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/admin")
            .route("/users", web::get().to(get_users))
            .route("/users/{user_id}/level", web::put().to(update_user_level)),
    );
}
