//! ストリークとログインボーナスAPIハンドラ

use actix_session::Session;
use actix_web::{get, post, web, HttpResponse};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::{UserLoginHistory, UserSettings, UserStreak};
use crate::error::AppError;

// ============================================
// レスポンス型
// ============================================

#[derive(Serialize)]
pub struct StreakResponse {
    pub training_streak: StreakInfo,
    pub login_streak: StreakInfo,
    #[serde(rename = "trainingMultiplier")]
    pub training_multiplier: f64,
    #[serde(rename = "loginMultiplier")]
    pub login_multiplier: f64,
    #[serde(rename = "combinedMultiplier")]
    pub combined_multiplier: f64,
}

#[derive(Serialize)]
pub struct StreakInfo {
    pub current: i32,
    pub best: i32,
    #[serde(rename = "lastActiveDate")]
    pub last_active_date: Option<String>,
    #[serde(rename = "graceDaysUsed")]
    pub grace_days_used: i32,
    #[serde(rename = "graceDaysAllowed")]
    pub grace_days_allowed: i32,
}

#[derive(Serialize)]
pub struct LoginBonusResponse {
    pub success: bool,
    #[serde(rename = "alreadyClaimed")]
    pub already_claimed: bool,
    #[serde(rename = "expEarned")]
    pub exp_earned: i32,
    #[serde(rename = "currentLoginStreak")]
    pub current_login_streak: i32,
    #[serde(rename = "totalExp")]
    pub total_exp: i64,
}

#[derive(Serialize)]
pub struct SettingsResponse {
    #[serde(rename = "graceDaysAllowed")]
    pub grace_days_allowed: i32,
}

#[derive(Deserialize)]
pub struct UpdateSettingsRequest {
    #[serde(rename = "graceDaysAllowed")]
    pub grace_days_allowed: i32,
}

// ============================================
// ヘルパー関数
// ============================================

/// ユーザー設定を取得または作成
async fn get_or_create_settings(pool: &MySqlPool, user_id: i64) -> Result<UserSettings, AppError> {
    let settings: Option<UserSettings> = sqlx::query_as(
        "SELECT id, user_id, grace_days_allowed, created_at, updated_at FROM user_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    match settings {
        Some(s) => Ok(s),
        None => {
            // デフォルト設定を作成
            sqlx::query(
                "INSERT INTO user_settings (user_id, grace_days_allowed, created_at, updated_at) VALUES (?, 1, NOW(), NOW())",
            )
            .bind(user_id)
            .execute(pool)
            .await?;

            Ok(UserSettings {
                id: 0,
                user_id,
                grace_days_allowed: 1,
                created_at: None,
                updated_at: None,
            })
        }
    }
}

// ============================================
// 倍率計算（他モジュールから公開）
// ============================================

/// トレーニングストリーク倍率を計算: 1日あたり+14%、最大+100%
pub fn calculate_training_multiplier(streak: i32) -> f64 {
    (streak as f64 * 0.14).min(1.0)
}

/// ログインストリーク倍率を計算: 1日あたり+7%、最大+50%
pub fn calculate_login_multiplier(streak: i32) -> f64 {
    (streak as f64 * 0.07).min(0.5)
}

/// 合計倍率を計算: 1 + トレーニング + ログイン（最大2.5）
#[allow(dead_code)]
pub fn calculate_combined_multiplier(training_streak: i32, login_streak: i32) -> f64 {
    1.0 + calculate_training_multiplier(training_streak) + calculate_login_multiplier(login_streak)
}

/// ユーザーの倍率を取得（DBからストリークを取得）
pub async fn get_user_multipliers(
    pool: &MySqlPool,
    user_id: i64,
) -> Result<(f64, f64, f64), AppError> {
    let training_streak = get_or_create_streak(pool, user_id, "training").await?;
    let login_streak = get_or_create_streak(pool, user_id, "login").await?;

    let training_mult = calculate_training_multiplier(training_streak.current_streak);
    let login_mult = calculate_login_multiplier(login_streak.current_streak);
    let combined = 1.0 + training_mult + login_mult;

    Ok((training_mult, login_mult, combined))
}

/// ストリークレコードを取得または作成
pub async fn get_or_create_streak(
    pool: &MySqlPool,
    user_id: i64,
    streak_type: &str,
) -> Result<UserStreak, AppError> {
    let streak: Option<UserStreak> = sqlx::query_as(
        "SELECT id, user_id, streak_type, current_streak, best_streak, last_active_date, grace_days_used, created_at, updated_at 
         FROM user_streaks WHERE user_id = ? AND streak_type = ?",
    )
    .bind(user_id)
    .bind(streak_type)
    .fetch_optional(pool)
    .await?;

    match streak {
        Some(s) => Ok(s),
        None => {
            sqlx::query(
                "INSERT INTO user_streaks (user_id, streak_type, current_streak, best_streak, last_active_date, grace_days_used, created_at, updated_at) 
                 VALUES (?, ?, 0, 0, NULL, 0, NOW(), NOW())",
            )
            .bind(user_id)
            .bind(streak_type)
            .execute(pool)
            .await?;

            Ok(UserStreak {
                id: 0,
                user_id,
                streak_type: streak_type.to_string(),
                current_streak: 0,
                best_streak: 0,
                last_active_date: None,
                grace_days_used: 0,
                created_at: None,
                updated_at: None,
            })
        }
    }
}

/// Calculate login bonus EXP based on streak
fn calculate_login_bonus_exp(streak: i32) -> i32 {
    // Base: 100 EXP
    // Streak bonus: +10 EXP per day (max +100 at 10 days)
    // Weekly bonus: +50 EXP every 7 days
    let base = 100;
    let streak_bonus = std::cmp::min(streak * 10, 100);
    let weekly_bonus = (streak / 7) * 50;
    base + streak_bonus + weekly_bonus
}

/// Update streak based on activity
async fn update_streak(
    pool: &MySqlPool,
    user_id: i64,
    streak_type: &str,
    activity_date: NaiveDate,
    grace_days_allowed: i32,
) -> Result<UserStreak, AppError> {
    let mut streak = get_or_create_streak(pool, user_id, streak_type).await?;

    match streak.last_active_date {
        None => {
            // First activity ever
            streak.current_streak = 1;
            streak.best_streak = 1;
            streak.last_active_date = Some(activity_date);
            streak.grace_days_used = 0;
        }
        Some(last_date) => {
            if activity_date == last_date {
                // Already recorded today, no change
                return Ok(streak);
            }

            let days_since_last = (activity_date - last_date).num_days();

            if days_since_last == 1 {
                // Consecutive day
                streak.current_streak += 1;
                streak.grace_days_used = 0;
            } else if days_since_last <= (grace_days_allowed as i64 + 1) {
                // Within grace period (中休み許容)
                let grace_used = (days_since_last - 1) as i32;
                streak.current_streak += 1;
                streak.grace_days_used = grace_used;
            } else {
                // Streak broken - reset to 1 (counting today's activity)
                streak.current_streak = 1;
                streak.grace_days_used = 0;
            }

            streak.last_active_date = Some(activity_date);

            // Update best streak
            if streak.current_streak > streak.best_streak {
                streak.best_streak = streak.current_streak;
            }
        }
    }

    // Save to DB
    sqlx::query(
        "UPDATE user_streaks SET current_streak = ?, best_streak = ?, last_active_date = ?, grace_days_used = ?, updated_at = NOW() 
         WHERE user_id = ? AND streak_type = ?",
    )
    .bind(streak.current_streak)
    .bind(streak.best_streak)
    .bind(streak.last_active_date)
    .bind(streak.grace_days_used)
    .bind(user_id)
    .bind(streak_type)
    .execute(pool)
    .await?;

    Ok(streak)
}

// ============================================
// API Handlers
// ============================================

/// GET /api/streak
/// Get current streak information for both training and login
#[get("/streak")]
pub async fn get_streaks(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    let settings = get_or_create_settings(pool.get_ref(), user_id).await?;
    let training_streak = get_or_create_streak(pool.get_ref(), user_id, "training").await?;
    let login_streak = get_or_create_streak(pool.get_ref(), user_id, "login").await?;

    // Calculate multipliers
    let training_multiplier = calculate_training_multiplier(training_streak.current_streak);
    let login_multiplier = calculate_login_multiplier(login_streak.current_streak);
    let combined_multiplier = 1.0 + training_multiplier + login_multiplier;

    Ok(HttpResponse::Ok().json(StreakResponse {
        training_streak: StreakInfo {
            current: training_streak.current_streak,
            best: training_streak.best_streak,
            last_active_date: training_streak
                .last_active_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            grace_days_used: training_streak.grace_days_used,
            grace_days_allowed: settings.grace_days_allowed,
        },
        login_streak: StreakInfo {
            current: login_streak.current_streak,
            best: login_streak.best_streak,
            last_active_date: login_streak
                .last_active_date
                .map(|d| d.format("%Y-%m-%d").to_string()),
            grace_days_used: login_streak.grace_days_used,
            grace_days_allowed: settings.grace_days_allowed,
        },
        training_multiplier,
        login_multiplier,
        combined_multiplier,
    }))
}

/// POST /api/streak/login-bonus
/// Claim daily login bonus
#[post("/streak/login-bonus")]
pub async fn claim_login_bonus(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;
    let today = Utc::now().date_naive();

    // Check if already claimed today
    let existing: Option<UserLoginHistory> = sqlx::query_as(
        "SELECT id, user_id, login_date, bonus_claimed, exp_earned, created_at 
         FROM user_login_history WHERE user_id = ? AND login_date = ?",
    )
    .bind(user_id)
    .bind(today)
    .fetch_optional(pool.get_ref())
    .await?;

    if let Some(ref history) = existing {
        if history.bonus_claimed {
            // Already claimed
            let login_streak = get_or_create_streak(pool.get_ref(), user_id, "login").await?;

            // Get current total exp
            let stats: (i64,) =
                sqlx::query_as("SELECT COALESCE(total_exp, 0) FROM user_stats WHERE user_id = ?")
                    .bind(user_id)
                    .fetch_one(pool.get_ref())
                    .await
                    .unwrap_or((0,));

            return Ok(HttpResponse::Ok().json(LoginBonusResponse {
                success: true,
                already_claimed: true,
                exp_earned: 0,
                current_login_streak: login_streak.current_streak,
                total_exp: stats.0,
            }));
        }
    }

    // Get settings for grace days
    let settings = get_or_create_settings(pool.get_ref(), user_id).await?;

    // Update login streak
    let login_streak = update_streak(
        pool.get_ref(),
        user_id,
        "login",
        today,
        settings.grace_days_allowed,
    )
    .await?;

    // Calculate bonus EXP
    let exp_earned = calculate_login_bonus_exp(login_streak.current_streak);

    // Record login history
    if existing.is_some() {
        sqlx::query(
            "UPDATE user_login_history SET bonus_claimed = TRUE, exp_earned = ? WHERE user_id = ? AND login_date = ?",
        )
        .bind(exp_earned)
        .bind(user_id)
        .bind(today)
        .execute(pool.get_ref())
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO user_login_history (user_id, login_date, bonus_claimed, exp_earned, created_at) VALUES (?, ?, TRUE, ?, NOW())",
        )
        .bind(user_id)
        .bind(today)
        .bind(exp_earned)
        .execute(pool.get_ref())
        .await?;
    }

    // Add EXP to user_stats
    sqlx::query(
        "UPDATE user_stats SET total_exp = total_exp + ?, updated_at = NOW() WHERE user_id = ?",
    )
    .bind(exp_earned)
    .bind(user_id)
    .execute(pool.get_ref())
    .await?;

    // Recalculate level
    use crate::db::models::UserStats;
    let stats: (i64,) =
        sqlx::query_as("SELECT COALESCE(total_exp, 0) FROM user_stats WHERE user_id = ?")
            .bind(user_id)
            .fetch_one(pool.get_ref())
            .await?;

    let new_level = UserStats::calculate_level(stats.0);
    sqlx::query("UPDATE user_stats SET level = ? WHERE user_id = ?")
        .bind(new_level)
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(LoginBonusResponse {
        success: true,
        already_claimed: false,
        exp_earned,
        current_login_streak: login_streak.current_streak,
        total_exp: stats.0,
    }))
}

/// POST /api/streak/record-login
/// Record daily login (update streak without bonus EXP)
#[post("/streak/record-login")]
pub async fn record_login(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let today = Utc::now().date_naive();
    let settings = get_or_create_settings(pool.get_ref(), session_user.id).await?;

    // Update login streak only (no EXP)
    let login_streak = update_streak(
        pool.get_ref(),
        session_user.id,
        "login",
        today,
        settings.grace_days_allowed,
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "currentLoginStreak": login_streak.current_streak
    })))
}

/// GET /api/settings
#[get("/settings")]
pub async fn get_settings(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let settings = get_or_create_settings(pool.get_ref(), session_user.id).await?;

    Ok(HttpResponse::Ok().json(SettingsResponse {
        grace_days_allowed: settings.grace_days_allowed,
    }))
}

/// POST /api/settings
#[post("/settings")]
pub async fn update_settings(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<UpdateSettingsRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    // Validate grace days (0-3)
    let grace_days = body.grace_days_allowed.clamp(0, 3);

    // Ensure settings exist
    let _ = get_or_create_settings(pool.get_ref(), user_id).await?;

    // Update
    sqlx::query(
        "UPDATE user_settings SET grace_days_allowed = ?, updated_at = NOW() WHERE user_id = ?",
    )
    .bind(grace_days)
    .bind(user_id)
    .execute(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(SettingsResponse {
        grace_days_allowed: grace_days,
    }))
}

/// Public function to update training streak (called from workout API)
pub async fn record_training_activity(
    pool: &MySqlPool,
    user_id: i64,
    training_date: NaiveDate,
) -> Result<(), AppError> {
    let settings = get_or_create_settings(pool, user_id).await?;
    let _ = update_streak(
        pool,
        user_id,
        "training",
        training_date,
        settings.grace_days_allowed,
    )
    .await?;
    Ok(())
}

/// Recalculate training streak based on actual training records
/// Called when a training record is deleted
pub async fn recalculate_training_streak(
    pool: &MySqlPool,
    user_id: i64,
) -> Result<(), AppError> {
    let settings = get_or_create_settings(pool, user_id).await?;
    let grace_days = settings.grace_days_allowed;

    // Get all training dates for this user, ordered descending
    let training_dates: Vec<(NaiveDate,)> = sqlx::query_as(
        "SELECT DISTINCT DATE(record_date) as d FROM training_records 
         WHERE user_id = ? ORDER BY d DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let (current_streak, last_active_date) = if training_dates.is_empty() {
        // No training records - reset streak to 0
        (0, None)
    } else {
        let today = chrono::Local::now().date_naive();
        let most_recent = training_dates[0].0;
        
        // Check if streak is still valid from today's perspective
        let days_since_last = (today - most_recent).num_days();
        if days_since_last > (grace_days as i64 + 1) {
            // Streak has expired
            (0, Some(most_recent))
        } else {
            // Count consecutive days (with grace period consideration)
            let mut streak = 1;
            let mut prev_date = most_recent;
            
            for i in 1..training_dates.len() {
                let curr_date = training_dates[i].0;
                let gap = (prev_date - curr_date).num_days();
                
                if gap <= (grace_days as i64 + 1) {
                    streak += 1;
                    prev_date = curr_date;
                } else {
                    break;
                }
            }
            (streak, Some(most_recent))
        }
    };

    // Update streak in database
    sqlx::query(
        "UPDATE user_streaks SET current_streak = ?, last_active_date = ?, updated_at = NOW() 
         WHERE user_id = ? AND streak_type = 'training'",
    )
    .bind(current_streak)
    .bind(last_active_date)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_streaks)
        .service(claim_login_bonus)
        .service(record_login)
        .service(get_settings)
        .service(update_settings);
}
