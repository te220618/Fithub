//! デイリーリワードAPIハンドラ
//! 14日連続ログインボーナスシステム

use actix_session::Session;
use actix_web::{get, post, web, HttpResponse};
use chrono::{NaiveDate, Utc};
use serde::Serialize;
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::UserStats;
use crate::error::AppError;

// ============================================
// 定数 - リワード設定
// ============================================

/// 各日（1-14）のリワード（EXPのみ）
/// 7日目: ビッグリワード
/// 14日目: スーパーリワード
const REWARDS: [i32; 14] = [
    200,  // Day 1
    200,  // Day 2
    200,  // Day 3
    200,  // Day 4
    200,  // Day 5
    200,  // Day 6
    500,  // Day 7 (Big reward)
    200,  // Day 8
    200,  // Day 9
    200,  // Day 10
    200,  // Day 11
    200,  // Day 12
    200,  // Day 13
    1000, // Day 14 (Super reward)
];

// ============================================
// レスポンス型
// ============================================

#[derive(Serialize)]
pub struct DailyRewardDay {
    pub day: i32,
    pub claimed: bool,
    #[serde(rename = "claimedDate")]
    pub claimed_date: Option<String>,
    pub exp: i32,
    #[serde(rename = "isBigReward")]
    pub is_big_reward: bool,
}

#[derive(Serialize)]
pub struct DailyRewardsResponse {
    #[serde(rename = "currentDay")]
    pub current_day: i32,
    #[serde(rename = "todayClaimed")]
    pub today_claimed: bool,
    pub days: Vec<DailyRewardDay>,
}

#[derive(Serialize)]
pub struct ClaimRewardResponse {
    pub success: bool,
    #[serde(rename = "alreadyClaimed")]
    pub already_claimed: bool,
    #[serde(rename = "rewardDay")]
    pub reward_day: i32,
    #[serde(rename = "expEarned")]
    pub exp_earned: i32,
    #[serde(rename = "totalExp")]
    pub total_exp: i64,
}

// ============================================
// データベース型
// ============================================

#[derive(sqlx::FromRow)]
struct LoginHistoryRow {
    pub login_date: NaiveDate,
    pub reward_day: i32,
    #[allow(dead_code)]
    pub bonus_claimed: bool,
}

// ============================================
// ヘルパー関数
// ============================================

/// 履歴に基づいてユーザーの現在のリワード日（1-14）を取得
async fn get_current_reward_day(pool: &MySqlPool, user_id: i64) -> Result<i32, AppError> {
    // 最後に受け取ったリワード日を取得
    let last_claimed: Option<(i32,)> = sqlx::query_as(
        "SELECT reward_day FROM user_login_history 
         WHERE user_id = ? AND bonus_claimed = TRUE 
         ORDER BY login_date DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    match last_claimed {
        Some((day,)) => {
            // 14日目が受け取られた場合、1日目に戻る
            if day >= 14 {
                Ok(1)
            } else {
                Ok(day + 1)
            }
        }
        None => Ok(1), // 初回は1日目から
    }
}

/// 現在のサイクルで受け取った全ての日を取得
async fn get_claimed_days(
    pool: &MySqlPool,
    user_id: i64,
) -> Result<Vec<LoginHistoryRow>, AppError> {
    // 最後の14日目受取を取得してサイクル開始を決定
    let cycle_start: Option<(NaiveDate,)> = sqlx::query_as(
        "SELECT login_date FROM user_login_history 
         WHERE user_id = ? AND reward_day = 14 AND bonus_claimed = TRUE 
         ORDER BY login_date DESC LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let history: Vec<LoginHistoryRow> = match cycle_start {
        Some((start_date,)) => {
            // 最後のサイクルリセット後に受け取った日を取得
            sqlx::query_as(
                "SELECT login_date, reward_day, bonus_claimed FROM user_login_history 
                 WHERE user_id = ? AND login_date > ? AND bonus_claimed = TRUE
                 ORDER BY reward_day ASC",
            )
            .bind(user_id)
            .bind(start_date)
            .fetch_all(pool)
            .await?
        }
        None => {
            // まだサイクルリセットなし、全ての受取日を取得
            sqlx::query_as(
                "SELECT login_date, reward_day, bonus_claimed FROM user_login_history 
                 WHERE user_id = ? AND bonus_claimed = TRUE
                 ORDER BY reward_day ASC",
            )
            .bind(user_id)
            .fetch_all(pool)
            .await?
        }
    };

    Ok(history)
}

/// 今日のリワードが既に受け取られたか確認
async fn is_today_claimed(pool: &MySqlPool, user_id: i64) -> Result<bool, AppError> {
    let today = Utc::now().date_naive();
    let existing: Option<(bool,)> = sqlx::query_as(
        "SELECT bonus_claimed FROM user_login_history WHERE user_id = ? AND login_date = ?",
    )
    .bind(user_id)
    .bind(today)
    .fetch_optional(pool)
    .await?;

    Ok(existing.map(|(claimed,)| claimed).unwrap_or(false))
}

// ============================================
// APIハンドラ
// ============================================

/// GET /api/daily-rewards
/// 14日間のリワードステータスを取得
#[get("/daily-rewards")]
pub async fn get_daily_rewards(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    let current_day = get_current_reward_day(pool.get_ref(), user_id).await?;
    let claimed_history = get_claimed_days(pool.get_ref(), user_id).await?;
    let today_claimed = is_today_claimed(pool.get_ref(), user_id).await?;

    // 14日分のレスポンスを構築
    let days: Vec<DailyRewardDay> = (1..=14)
        .map(|day| {
            let claimed_info = claimed_history.iter().find(|h| h.reward_day == day);

            DailyRewardDay {
                day,
                claimed: claimed_info.is_some(),
                claimed_date: claimed_info.map(|h| h.login_date.format("%Y-%m-%d").to_string()),
                exp: REWARDS[(day - 1) as usize],
                is_big_reward: day == 7 || day == 14,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(DailyRewardsResponse {
        current_day,
        today_claimed,
        days,
    }))
}

/// POST /api/daily-rewards/claim
/// 今日のリワードを受け取る
#[post("/daily-rewards/claim")]
pub async fn claim_daily_reward(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;
    let today = Utc::now().date_naive();

    // 今日既に受け取ったか確認
    if is_today_claimed(pool.get_ref(), user_id).await? {
        // 現在のステータスを取得して返す
        let stats: Option<(i64,)> = sqlx::query_as(
            "SELECT COALESCE(total_exp, 0) FROM user_stats WHERE user_id = ?",
        )
        .bind(user_id)
        .fetch_optional(pool.get_ref())
        .await?;

        let (total_exp,) = stats.unwrap_or((0,));

        return Ok(HttpResponse::Ok().json(ClaimRewardResponse {
            success: true,
            already_claimed: true,
            reward_day: 0,
            exp_earned: 0,
            total_exp,
        }));
    }

    // 現在の日を取得
    let current_day = get_current_reward_day(pool.get_ref(), user_id).await?;
    let base_exp_reward = REWARDS[(current_day - 1) as usize];

    // EXPにストリーク倍率を適用
    let (training_mult, login_mult, _) =
        crate::api::streak::get_user_multipliers(pool.get_ref(), user_id).await?;
    let streak_multiplier = 1.0 + training_mult + login_mult;
    let exp_reward = (base_exp_reward as f64 * streak_multiplier).round() as i32;

    // 受取を記録（ブーストEXPを保存）
    sqlx::query(
        "INSERT INTO user_login_history (user_id, login_date, bonus_claimed, exp_earned, reward_day, created_at)
         VALUES (?, ?, TRUE, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE bonus_claimed = TRUE, exp_earned = ?, reward_day = ?",
    )
    .bind(user_id)
    .bind(today)
    .bind(exp_reward)
    .bind(current_day)
    .bind(exp_reward)
    .bind(current_day)
    .execute(pool.get_ref())
    .await?;

    // user_statsにEXPを追加
    if exp_reward > 0 {
        sqlx::query(
            "UPDATE user_stats SET total_exp = total_exp + ?, updated_at = NOW() WHERE user_id = ?",
        )
        .bind(exp_reward)
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

        // レベルを再計算
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
    }

    // アクティブペットにも同量の経験値を付与
    if exp_reward > 0 {
        use crate::api::pet::{add_exp_to_active_pet, check_and_unlock_pet_types};
        if let Ok(Some((_pet_level, _level_up, matured))) = 
            add_exp_to_active_pet(pool.get_ref(), user_id, exp_reward as i64).await 
        {
            // ペットが成熟したら解放条件をチェック
            if matured {
                let _ = check_and_unlock_pet_types(pool.get_ref(), user_id).await;
            }
        }
    }

    // 更新後のステータスを取得
    let stats: Option<(i64,)> = sqlx::query_as(
        "SELECT COALESCE(total_exp, 0) FROM user_stats WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool.get_ref())
    .await?;

    let (total_exp,) = stats.unwrap_or((0,));

    Ok(HttpResponse::Ok().json(ClaimRewardResponse {
        success: true,
        already_claimed: false,
        reward_day: current_day,
        exp_earned: exp_reward,
        total_exp,
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_daily_rewards).service(claim_daily_reward);
}
