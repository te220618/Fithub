//! ユーザーAPIハンドラ

use actix_session::Session;
use actix_web::{delete, get, put, web, HttpResponse};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::{clear_current_user, get_current_user, set_current_user, SessionUser};
use crate::db::models::{User, UserStats};
use crate::error::AppError;

#[derive(Serialize)]
struct UserInfoResponse {
    id: i64,
    #[serde(rename = "loginId")]
    login_id: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    email: Option<String>,
    #[serde(rename = "profileImageUrl")]
    profile_image_url: Option<String>,
    #[serde(rename = "oauthProvider")]
    oauth_provider: String,
    role: String,
    // ダッシュボード用のレベル情報
    level: i32,
    #[serde(rename = "currentExp")]
    current_exp: i64,
    #[serde(rename = "expToNextLevel")]
    exp_to_next_level: i32,
}

#[derive(Serialize)]
struct UserStatsResponse {
    level: i32,
    #[serde(rename = "totalExp")]
    total_exp: i64,
    #[serde(rename = "dailyExp")]
    daily_exp: i32,
    #[serde(rename = "dailyLimit")]
    daily_limit: i32,
    #[serde(rename = "expInCurrentLevel")]
    exp_in_current_level: i64,
    #[serde(rename = "expToNextLevel")]
    exp_to_next_level: i32,
    #[serde(rename = "levelProgress")]
    level_progress: f64,
    // ダッシュボード統計
    #[serde(rename = "weeklyWorkouts")]
    weekly_workouts: i32,
    #[serde(rename = "weeklyWorkoutsChange")]
    weekly_workouts_change: i32,
    #[serde(rename = "totalVolume")]
    total_volume: f64,
    #[serde(rename = "weeklyVolumeChangePercent")]
    weekly_volume_change_percent: f64,
    #[serde(rename = "currentStreak")]
    current_streak: i32,
    #[serde(rename = "bestRecordsCount")]
    best_records_count: i32,
    #[serde(rename = "recentRecords")]
    recent_records: Vec<RecentRecordDto>,
    #[serde(rename = "weeklyVolumeHistory")]
    weekly_volume_history: Vec<DailyVolumeDto>,
    #[serde(rename = "muscleStatuses")]
    muscle_statuses: Vec<MuscleStatusDto>,
}

#[derive(Serialize)]
struct RecentRecordDto {
    date: String,
    #[serde(rename = "exerciseCount")]
    exercise_count: i32,
    #[serde(rename = "totalVolume")]
    total_volume: f64,
    #[serde(rename = "setCount")]
    set_count: i32,
    #[serde(rename = "primaryMuscles")]
    primary_muscles: Vec<String>,
    #[serde(rename = "expEarned")]
    exp_earned: i32,
}

#[derive(Serialize)]
struct DailyVolumeDto {
    date: String,
    volume: f64,
}

#[derive(Serialize, Clone)]
struct MuscleStatusDto {
    #[serde(rename = "muscleName")]
    muscle_name: String,
    #[serde(rename = "lastTrained")]
    last_trained: Option<String>,
    #[serde(rename = "daysSinceLastTrained")]
    days_since_last_trained: i32,
    status: String, // "recovering", "ready", "stale"
}

/// GET /api/user/info
#[get("/user/info")]
async fn get_user_info(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    // DBから最新のユーザーデータを取得
    let user: Option<User> = sqlx::query_as(
        r#"SELECT id, login_id, password, email, display_name, gender, birthday,
           profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at
           FROM users WHERE id = ?"#,
    )
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    let user = user.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // レベル情報用のユーザー統計を取得
    let stats: Option<UserStats> = sqlx::query_as(
        r#"SELECT id, user_id, total_exp, level
           FROM user_stats WHERE user_id = ?"#,
    )
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    let (level, current_exp, exp_to_next_level) = match stats {
        Some(s) => {
            let current_level_exp = UserStats::get_required_exp_for_level(s.level);
            let exp_in_level = s.total_exp - current_level_exp;
            (
                s.level,
                exp_in_level,
                UserStats::get_exp_to_next_level(s.level),
            )
        }
        None => (1, 0, 1000),
    };

    Ok(HttpResponse::Ok().json(UserInfoResponse {
        id: user.id,
        login_id: user.login_id,
        display_name: user.display_name,
        email: user.email,
        profile_image_url: user.profile_image_url,
        oauth_provider: user.oauth_provider,
        role: user.role,
        level,
        current_exp,
        exp_to_next_level,
    }))
}

/// GET /api/user/stats
#[get("/user/stats")]
async fn get_user_stats(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    // DBからユーザー統計を取得
    let stats: Option<UserStats> = sqlx::query_as(
        r#"SELECT id, user_id, total_exp, level
           FROM user_stats WHERE user_id = ?"#,
    )
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    let stats = match stats {
        Some(s) => s,
        None => {
            // 存在しない場合はデフォルト統計を作成
            let _ = sqlx::query(
                r#"INSERT INTO user_stats (user_id, total_exp, level, created_at, updated_at)
                   VALUES (?, 0, 1, NOW(), NOW())"#,
            )
            .bind(session_user.id)
            .execute(pool.get_ref())
            .await;

            UserStats {
                id: 0,
                user_id: session_user.id,
                total_exp: 0,
                level: 1,
            }
        }
    };

    // レベル進捗を計算
    let current_level_exp = UserStats::get_required_exp_for_level(stats.level);
    let next_level_exp = UserStats::get_required_exp_for_level(stats.level + 1);
    let exp_in_current_level = stats.total_exp - current_level_exp;
    let exp_needed = next_level_exp - current_level_exp;
    let level_progress = if exp_needed > 0 {
        exp_in_current_level as f64 / exp_needed as f64
    } else {
        1.0
    };

    // ダッシュボード統計を計算
    let today = Utc::now().date_naive();

    // 今日のデイリーEXPをtraining_records.exp_earnedから計算
    use crate::config::ExpConfig;
    let exp_config = ExpConfig::default();
    let daily_limit = exp_config.daily_limit;

    let today_exp: (i64,) = sqlx::query_as(
        "SELECT CAST(COALESCE(SUM(exp_earned), 0) AS SIGNED) FROM training_records WHERE user_id = ? AND record_date = ?",
    )
    .bind(session_user.id)
    .bind(today)
    .fetch_one(pool.get_ref())
    .await?;
    let daily_exp = today_exp.0 as i32;

    // 今週の開始（月曜日）を取得
    let days_since_monday = today.weekday().num_days_from_monday() as i64;
    let current_week_start = today - Duration::days(days_since_monday);
    let current_week_end = current_week_start + Duration::days(6);

    // 先週の開始を取得
    let prev_week_start = current_week_start - Duration::days(7);
    let prev_week_end = current_week_start - Duration::days(1);

    // 今週のワークアウト数
    let current_week_workouts: (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT record_date) FROM training_records WHERE user_id = ? AND record_date >= ? AND record_date <= ?",
    )
    .bind(session_user.id)
    .bind(current_week_start)
    .bind(current_week_end)
    .fetch_one(pool.get_ref())
    .await?;

    // 先週のワークアウト数
    let prev_week_workouts: (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT record_date) FROM training_records WHERE user_id = ? AND record_date >= ? AND record_date <= ?",
    )
    .bind(session_user.id)
    .bind(prev_week_start)
    .bind(prev_week_end)
    .fetch_one(pool.get_ref())
    .await?;

    let weekly_workouts = current_week_workouts.0 as i32;
    let weekly_workouts_change = weekly_workouts - prev_week_workouts.0 as i32;

    // 今週のボリューム
    let current_week_volume: (Option<f64>,) = sqlx::query_as(
        r#"SELECT SUM(ts.weight * ts.reps) FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE tr.user_id = ? AND tr.record_date >= ? AND tr.record_date <= ?"#,
    )
    .bind(session_user.id)
    .bind(current_week_start)
    .bind(current_week_end)
    .fetch_one(pool.get_ref())
    .await?;

    // 累計ボリューム（過去すべて）
    let all_time_volume: (Option<f64>,) = sqlx::query_as(
        r#"SELECT SUM(ts.weight * ts.reps) FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE tr.user_id = ?"#,
    )
    .bind(session_user.id)
    .fetch_one(pool.get_ref())
    .await?;

    // 先週のボリューム
    let prev_week_volume: (Option<f64>,) = sqlx::query_as(
        r#"SELECT SUM(ts.weight * ts.reps) FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE tr.user_id = ? AND tr.record_date >= ? AND tr.record_date <= ?"#,
    )
    .bind(session_user.id)
    .bind(prev_week_start)
    .bind(prev_week_end)
    .fetch_one(pool.get_ref())
    .await?;

    let total_volume = all_time_volume.0.unwrap_or(0.0);
    let prev_volume = prev_week_volume.0.unwrap_or(0.0);
    let weekly_current_volume = current_week_volume.0.unwrap_or(0.0);
    let weekly_volume_change_percent = if prev_volume > 0.0 {
        ((weekly_current_volume - prev_volume) / prev_volume * 100.0).round()
    } else if weekly_current_volume > 0.0 {
        100.0
    } else {
        0.0
    };

    // grace_days設定を取得
    let grace_days: i32 = sqlx::query_as::<_, (i32,)>(
        "SELECT COALESCE(grace_days_allowed, 2) FROM user_settings WHERE user_id = ?",
    )
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?
    .map(|r| r.0)
    .unwrap_or(2);

    // 現在のストリークを計算（grace_days対応）
    let training_dates: Vec<(NaiveDate,)> = sqlx::query_as(
        "SELECT DISTINCT record_date FROM training_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 30",
    )
    .bind(session_user.id)
    .fetch_all(pool.get_ref())
    .await?;

    let current_streak = if training_dates.is_empty() {
        0
    } else {
        let most_recent = training_dates[0].0;
        let days_since_last = (today - most_recent).num_days();
        
        // ストリーク失効チェック（今日から最新記録までの日数がgrace_days+1を超えたら失効）
        if days_since_last > (grace_days as i64 + 1) {
            0
        } else {
            // 連続日数をカウント（grace_days考慮）
            let mut streak = 1;
            for i in 1..training_dates.len() {
                let prev_date = training_dates[i - 1].0;
                let curr_date = training_dates[i].0;
                let gap = (prev_date - curr_date).num_days();
                
                if gap <= (grace_days as i64 + 1) {
                    streak += 1;
                } else {
                    break;
                }
            }
            streak
        }
    };

    // 最近の記録（最後の7トレーニング日）- 詳細情報付き
    let recent_dates: Vec<(NaiveDate,)> = sqlx::query_as(
        "SELECT DISTINCT record_date FROM training_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 7",
    )
    .bind(session_user.id)
    .fetch_all(pool.get_ref())
    .await?;

    let mut recent_records: Vec<RecentRecordDto> = Vec::new();
    for (date,) in recent_dates {
        // 種目数を取得
        let exercise_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(DISTINCT tre.exercise_id) FROM training_record_exercises tre INNER JOIN training_records tr ON tre.record_id = tr.id WHERE tr.user_id = ? AND tr.record_date = ?",
        )
        .bind(session_user.id)
        .bind(date)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or((0,));

        // セット数を取得
        let set_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM training_sets ts INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id INNER JOIN training_records tr ON tre.record_id = tr.id WHERE tr.user_id = ? AND tr.record_date = ?",
        )
        .bind(session_user.id)
        .bind(date)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or((0,));

        // ボリュームを取得
        let total_vol: (Option<f64>,) = sqlx::query_as(
            "SELECT SUM(ts.weight * ts.reps) FROM training_sets ts INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id INNER JOIN training_records tr ON tre.record_id = tr.id WHERE tr.user_id = ? AND tr.record_date = ?",
        )
        .bind(session_user.id)
        .bind(date)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or((None,));

        // EXPを取得
        let exp_earned: (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(exp_earned), 0) FROM training_records WHERE user_id = ? AND record_date = ?",
        )
        .bind(session_user.id)
        .bind(date)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or((0,));

        // 主要部位を取得（最大3つ）
        let muscles: Vec<(String,)> = sqlx::query_as(
            r#"SELECT DISTINCT e.muscle
               FROM training_record_exercises tre
               INNER JOIN training_records tr ON tre.record_id = tr.id
               INNER JOIN exercises e ON tre.exercise_id = e.id
               WHERE tr.user_id = ? AND tr.record_date = ? AND e.muscle IS NOT NULL
               LIMIT 3"#,
        )
        .bind(session_user.id)
        .bind(date)
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default();

        let primary_muscles: Vec<String> = muscles.into_iter().map(|(m,)| m).collect();

        recent_records.push(RecentRecordDto {
            date: date.format("%Y-%m-%d").to_string(),
            exercise_count: exercise_count.0 as i32,
            set_count: set_count.0 as i32,
            total_volume: total_vol.0.unwrap_or(0.0),
            primary_muscles,
            exp_earned: exp_earned.0 as i32,
        });
    }

    // 週間ボリューム履歴（過去7日間）- シンプルなクエリ
    let week_start = today - Duration::days(6);
    let mut weekly_volume_history: Vec<DailyVolumeDto> = Vec::new();

    for i in 0..7 {
        let check_date = week_start + Duration::days(i);
        let volume_result: Option<(Option<f64>,)> = sqlx::query_as(
            r#"SELECT SUM(ts.weight * ts.reps)
               FROM training_sets ts
               INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
               INNER JOIN training_records tr ON tre.record_id = tr.id
               WHERE tr.user_id = ? AND tr.record_date = ?"#,
        )
        .bind(session_user.id)
        .bind(check_date)
        .fetch_optional(pool.get_ref())
        .await?;
        let vol = volume_result.and_then(|(v,)| v).unwrap_or(0.0);
        weekly_volume_history.push(DailyVolumeDto {
            date: check_date.format("%Y-%m-%d").to_string(),
            volume: vol,
        });
    }

    // 部位別コンディション（最終トレーニング日からの経過日数で判定）
    let target_muscles = vec!["胸", "背中", "脚", "肩", "腕"];
    let mut muscle_statuses: Vec<MuscleStatusDto> = Vec::new();

    for muscle in target_muscles {
        let last_trained_result: Option<(NaiveDate,)> = sqlx::query_as(
            r#"SELECT MAX(tr.record_date)
               FROM training_records tr
               INNER JOIN training_record_exercises tre ON tre.record_id = tr.id
               INNER JOIN exercises e ON tre.exercise_id = e.id
               WHERE tr.user_id = ? AND e.muscle = ?"#,
        )
        .bind(session_user.id)
        .bind(muscle)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        let (last_trained, days_since) = match last_trained_result {
            Some((date,)) => {
                let days = (today - date).num_days() as i32;
                (Some(date.format("%Y-%m-%d").to_string()), days)
            }
            None => (None, 999), // トレーニング記録なし
        };

        let status = if days_since <= 2 {
            "recovering".to_string()
        } else if days_since <= 6 {
            "ready".to_string()
        } else {
            "stale".to_string()
        };

        muscle_statuses.push(MuscleStatusDto {
            muscle_name: muscle.to_string(),
            last_trained,
            days_since_last_trained: days_since,
            status,
        });
    }

    Ok(HttpResponse::Ok().json(UserStatsResponse {
        level: stats.level,
        total_exp: stats.total_exp,
        daily_exp,
        daily_limit,
        exp_in_current_level,
        exp_to_next_level: UserStats::get_exp_to_next_level(stats.level),
        level_progress,
        weekly_workouts,
        weekly_workouts_change,
        total_volume,
        weekly_volume_change_percent,
        current_streak,
        best_records_count: 0, // TODO: PRトラッキングを実装
        recent_records,
        weekly_volume_history,
        muscle_statuses,
    }))
}

#[derive(Deserialize)]
struct UpdateDisplayNameRequest {
    #[serde(rename = "displayName")]
    display_name: String,
}

/// PUT /api/user/display-name
#[put("/user/display-name")]
async fn update_display_name(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<UpdateDisplayNameRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    // 表示名を検証
    if body.display_name.is_empty() || body.display_name.len() > 20 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Display name must be 1-20 characters"
        })));
    }

    // データベースを更新
    sqlx::query(r#"UPDATE users SET display_name = ?, updated_at = NOW() WHERE id = ?"#)
        .bind(&body.display_name)
        .bind(session_user.id)
        .execute(pool.get_ref())
        .await?;

    // セッションを更新
    let updated_session_user = SessionUser {
        display_name: Some(body.display_name.clone()),
        ..session_user
    };
    set_current_user(&session, updated_session_user)
        .map_err(|e| AppError::InternalError(format!("Session error: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "displayName": body.display_name
    })))
}

#[derive(Deserialize)]
struct UpdatePasswordRequest {
    #[serde(rename = "currentPassword")]
    current_password: String,
    #[serde(rename = "newPassword")]
    new_password: String,
}

/// PUT /api/user/password
#[put("/user/password")]
async fn update_password(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<UpdatePasswordRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    // OAuthユーザーはパスワードを変更できない
    if session_user.oauth_provider != "LOCAL" {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Social login accounts cannot change password"
        })));
    }

    // 現在のパスワードハッシュを取得
    let user: Option<User> = sqlx::query_as(
        r#"SELECT id, login_id, password, email, display_name, gender, birthday,
           profile_image_url, oauth_provider, oauth_id, role, created_at, updated_at
           FROM users WHERE id = ?"#,
    )
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    let user = user.ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let stored_hash = user
        .password
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("No password set".to_string()))?;

    // 現在のパスワードを検証
    let parsed_hash = PasswordHash::new(stored_hash)
        .map_err(|e| AppError::InternalError(format!("Invalid password hash: {}", e)))?;

    let is_valid = Argon2::default()
        .verify_password(body.current_password.as_bytes(), &parsed_hash)
        .is_ok();

    if !is_valid {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Current password is incorrect"
        })));
    }

    // 新しいパスワードを検証
    if body.new_password.len() < 6 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "New password must be at least 6 characters"
        })));
    }

    // 新しいパスワードをハッシュ化
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let new_hash = argon2
        .hash_password(body.new_password.as_bytes(), &salt)
        .map_err(|e| AppError::InternalError(format!("Password hashing failed: {}", e)))?
        .to_string();

    // データベースを更新
    sqlx::query(r#"UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?"#)
        .bind(&new_hash)
        .bind(session_user.id)
        .execute(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true
    })))
}

/// DELETE /api/user/account
#[delete("/user/account")]
async fn delete_account(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let user_id = session_user.id;

    // 関連する全てのデータを順番に削除（外部キー制約のため）
    // 1. トレーニングセット（training_record_exercises経由）
    sqlx::query(
        r#"DELETE ts FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE tr.user_id = ?"#,
    )
    .bind(user_id)
    .execute(pool.get_ref())
    .await?;

    // 2. トレーニングレコード種目
    sqlx::query(
        r#"DELETE tre FROM training_record_exercises tre
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE tr.user_id = ?"#,
    )
    .bind(user_id)
    .execute(pool.get_ref())
    .await?;

    // 3. トレーニングレコード
    sqlx::query("DELETE FROM training_records WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 4. トレーニング種目タグ
    sqlx::query("DELETE FROM training_exercise_tags WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 5. トレーニングタグ
    sqlx::query("DELETE FROM training_tags WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 6. ユーザー種目デフォルトタグ
    sqlx::query("DELETE FROM user_exercise_default_tags WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 7. ユーザーカスタム種目
    sqlx::query("DELETE FROM user_custom_exercises WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 8. ユーザー統計
    sqlx::query("DELETE FROM user_stats WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 9. 最後にユーザーを削除
    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // セッションをクリア
    clear_current_user(&session);
    session.purge();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_user_info)
        .service(get_user_stats)
        .service(update_display_name)
        .service(update_password)
        .service(delete_account);
}
