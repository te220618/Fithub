//! ダッシュボードAPIハンドラ

use actix_session::Session;
use actix_web::{get, web, HttpResponse};
use chrono::{Datelike, Days, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;
use std::collections::HashMap;

use crate::auth::session::get_current_user;
use crate::error::AppError;

#[derive(Serialize)]
struct HeatmapResponse {
    #[serde(rename = "heatmapData")]
    heatmap_data: HashMap<String, i32>,
    #[serde(rename = "volumeData")]
    volume_data: HashMap<String, f64>,
    #[serde(rename = "startDate")]
    start_date: String,
    #[serde(rename = "endDate")]
    end_date: String,
    year: i32,
}

#[derive(Deserialize)]
struct HeatmapQuery {
    year: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct DailyVolume {
    record_date: NaiveDate,
    volume: f64,
}

/// GET /api/dashboard/heatmap
#[get("/dashboard/heatmap")]
async fn get_heatmap(
    pool: web::Data<MySqlPool>,
    session: Session,
    query: web::Query<HeatmapQuery>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let year = query.year.unwrap_or_else(|| chrono::Utc::now().year());
    let start_date = NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let end_date = NaiveDate::from_ymd_opt(year, 12, 31).unwrap();

    // ユーザーの日別ボリューム（重量 × 回数）を取得
    let daily_volumes: Vec<DailyVolume> = sqlx::query_as(
        r#"
        SELECT 
            tr.record_date,
            COALESCE(SUM(ts.weight * ts.reps), 0) as volume
        FROM training_records tr
        INNER JOIN training_record_exercises tre ON tre.record_id = tr.id
        INNER JOIN training_sets ts ON ts.record_exercise_id = tre.id
        WHERE tr.user_id = ? 
          AND tr.record_date >= ?
          AND tr.record_date <= ?
        GROUP BY tr.record_date
        ORDER BY tr.record_date
        "#,
    )
    .bind(session_user.id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(pool.get_ref())
    .await?;

    // 日付 -> ボリュームのマップを作成
    let volume_by_date: HashMap<NaiveDate, f64> = daily_volumes
        .into_iter()
        .map(|dv| (dv.record_date, dv.volume))
        .collect();

    // 1年分のヒートマップデータを構築
    let mut heatmap_data: HashMap<String, i32> = HashMap::new();
    let mut volume_data: HashMap<String, f64> = HashMap::new();

    let mut current_date = start_date;
    while current_date <= end_date {
        let date_str = current_date.format("%Y-%m-%d").to_string();
        let volume = volume_by_date.get(&current_date).copied().unwrap_or(0.0);
        let level = calculate_activity_level(volume);

        heatmap_data.insert(date_str.clone(), level);
        volume_data.insert(date_str, volume);

        current_date = current_date.succ_opt().unwrap_or(current_date);
    }

    Ok(HttpResponse::Ok().json(HeatmapResponse {
        heatmap_data,
        volume_data,
        start_date: start_date.format("%Y-%m-%d").to_string(),
        end_date: end_date.format("%Y-%m-%d").to_string(),
        year,
    }))
}

/// ボリュームからアクティビティレベル（0-4）を計算
/// - 0: 0kg（休息日）
/// - 1: 1〜1,000kg（軽い日）
/// - 2: 1,000〜2,500kg（標準トレーニング）
/// - 3: 2,500〜5,000kg（しっかりトレーニング）
/// - 4: 5,000kg+（ハードな日）
fn calculate_activity_level(volume: f64) -> i32 {
    if volume == 0.0 {
        0
    } else if volume < 1000.0 {
        1
    } else if volume < 2500.0 {
        2
    } else if volume < 5000.0 {
        3
    } else {
        4
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_heatmap);
    cfg.service(get_muscle_heatmap);
}

// ============================================
// 筋肉グループ別ヒートマップ
// ============================================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MuscleHeatmapItem {
    muscle: String,
    last_trained_date: Option<String>,
    days_since_last_training: Option<i64>,
    heat_level: f32,
    training_count_7days: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MuscleHeatmapResponse {
    muscles: Vec<MuscleHeatmapItem>,
}

#[derive(sqlx::FromRow)]
struct MuscleTrainingRecord {
    record_date: NaiveDate,
    muscle: Option<String>,
}

/// GET /api/dashboard/muscle-heatmap
#[get("/dashboard/muscle-heatmap")]
async fn get_muscle_heatmap(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let today = Utc::now().date_naive();
    let thirty_days_ago = today.checked_sub_days(Days::new(30)).unwrap_or(today);
    let seven_days_ago = today.checked_sub_days(Days::new(7)).unwrap_or(today);

    // 過去30日間のトレーニング記録を取得（筋肉グループ別）
    let records: Vec<MuscleTrainingRecord> = sqlx::query_as(
        r#"
        SELECT DISTINCT
            tr.record_date,
            CAST(COALESCE(e.muscle, uce.muscle) AS CHAR) as muscle
        FROM training_records tr
        INNER JOIN training_record_exercises tre ON tre.record_id = tr.id
        LEFT JOIN exercises e ON e.id = tre.exercise_id
        LEFT JOIN user_custom_exercises uce ON uce.id = tre.custom_exercise_id
        WHERE tr.user_id = ? 
          AND tr.record_date >= ?
          AND (e.muscle IS NOT NULL OR uce.muscle IS NOT NULL)
        ORDER BY tr.record_date DESC
        "#,
    )
    .bind(session_user.id)
    .bind(thirty_days_ago)
    .fetch_all(pool.get_ref())
    .await?;

    // 筋肉グループの定義
    let muscle_groups = vec!["胸", "背中", "肩", "腕", "脚", "腹"];

    // 筋肉グループごとに集計
    let mut muscle_data: HashMap<&str, (Option<NaiveDate>, i32)> = HashMap::new();
    for mg in &muscle_groups {
        muscle_data.insert(mg, (None, 0));
    }

    for record in &records {
        // 筋肉名をグループにマッピング
        if let Some(ref muscle_name) = record.muscle {
            let group = map_muscle_to_group(muscle_name);
            if let Some(g) = group {
                if let Some((last_date, count)) = muscle_data.get_mut(g) {
                    // 最終トレーニング日を更新
                    if last_date.is_none() || record.record_date > last_date.unwrap() {
                        *last_date = Some(record.record_date);
                    }
                    // 7日以内ならカウント
                    if record.record_date >= seven_days_ago {
                        *count += 1;
                    }
                }
            }
        }
    }

    // レスポンス構築
    let muscles: Vec<MuscleHeatmapItem> = muscle_groups
        .iter()
        .map(|&mg| {
            let (last_date, count_7days) = muscle_data.get(mg).copied().unwrap_or((None, 0));
            let days_since = last_date.map(|d| (today - d).num_days());
            let heat_level = calculate_heat_level(days_since);

            MuscleHeatmapItem {
                muscle: mg.to_string(),
                last_trained_date: last_date.map(|d| d.format("%Y-%m-%d").to_string()),
                days_since_last_training: days_since,
                heat_level,
                training_count_7days: count_7days,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(MuscleHeatmapResponse { muscles }))
}

/// 筋肉名をグループにマッピング
fn map_muscle_to_group(muscle: &str) -> Option<&'static str> {
    match muscle {
        "胸" | "大胸筋" => Some("胸"),
        "背中" | "広背筋" | "僧帽筋" | "脊柱起立筋" => Some("背中"),
        "肩" | "三角筋" => Some("肩"),
        "腕" | "上腕二頭筋" | "上腕三頭筋" | "前腕" => Some("腕"),
        "脚" | "大腿四頭筋" | "ハムストリングス" | "ふくらはぎ" | "臀部" => Some("脚"),
        "腹" | "腹直筋" | "腹斜筋" => Some("腹"),
        _ => None,
    }
}

/// 日数から熱度レベル (0.0-1.0) を計算
fn calculate_heat_level(days_since: Option<i64>) -> f32 {
    match days_since {
        None => 0.0,
        Some(d) if d <= 1 => 1.0,
        Some(d) if d <= 3 => 0.8,
        Some(d) if d <= 7 => 0.6,
        Some(d) if d <= 14 => 0.4,
        Some(d) if d <= 30 => 0.2,
        Some(_) => 0.0,
    }
}
