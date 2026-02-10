//! 種目APIハンドラ

use actix_session::Session;
use actix_web::{get, web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::error::AppError;

// ============================================
// DTOs
// ============================================

#[derive(Deserialize)]
pub struct ExercisePagedQuery {
    muscles: Option<String>,      // カンマ区切りの筋肉グループID
    difficulties: Option<String>, // カンマ区切りの難易度レベルID
    #[serde(rename = "targetMuscles")]
    target_muscles: Option<String>, // カンマ区切りのターゲット筋肉名
    page: Option<i32>,
    size: Option<i32>,
}

#[derive(Serialize)]
struct ExerciseDto {
    id: i64,
    name: Option<String>,
    muscle: Option<String>,
    difficulty: Option<i32>,
    description: Option<String>,
    #[serde(rename = "targetMuscles")]
    target_muscles: Option<String>,
    #[serde(rename = "videoPath")]
    video_path: Option<String>,
}

#[derive(Serialize)]
struct ExercisePagedResponse {
    exercises: Vec<ExerciseDto>,
    page: i32,
    size: i32,
    #[serde(rename = "totalElements")]
    total_elements: i64,
    #[serde(rename = "totalPages")]
    total_pages: i32,
    #[serde(rename = "hasNext")]
    has_next: bool,
}

#[derive(Serialize)]
struct MuscleGroupDto {
    id: i64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "displayOrder")]
    display_order: Option<i32>,
}

#[derive(Serialize)]
struct DifficultyLevelDto {
    id: i32,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "displayOrder")]
    display_order: Option<i32>,
}

// ============================================
// データベース行型
// ============================================

#[derive(sqlx::FromRow)]
struct ExerciseRow {
    id: i64,
    name: Option<String>,
    muscle: Option<String>,
    difficulty_level_id: Option<i32>,
    description: Option<String>,
    target_muscles: Option<String>,
    video_path: Option<String>,
    #[allow(dead_code)]
    muscle_group_id: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct MuscleGroupRow {
    id: i64,
    name: String,
    display_name: String,
    display_order: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct DifficultyLevelRow {
    id: i32,
    name: String,
    display_name: String,
    display_order: Option<i32>,
}

// ============================================
// 動画URL設定
// ============================================

fn build_video_url(video_path: Option<String>) -> Option<String> {
    video_path
        .filter(|path| !path.trim().is_empty()) // 空文字は None として扱う
        .map(|path| {
            if path.starts_with("http://") || path.starts_with("https://") {
                path
            } else {
                // デフォルトはS3バケットURL（環境変数で設定可能）
                let base_url = std::env::var("VIDEO_BASE_URL").unwrap_or_else(|_| {
                    "https://kintore-videos.s3.ap-northeast-1.amazonaws.com".to_string()
                });
                format!("{}/{}", base_url, path.trim_start_matches('/'))
            }
        })
}

// ============================================
// ハンドラ
// ============================================

/// GET /api/exercises/paged - フィルタリング付きページネーション種目検索
#[get("/exercises/paged")]
async fn get_exercises_paged(
    session: Session,
    pool: web::Data<MySqlPool>,
    query: web::Query<ExercisePagedQuery>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let page = query.page.unwrap_or(0);
    let size = query.size.unwrap_or(16);

    // フィルターパラメータをパース
    let muscle_ids: Vec<i32> = query
        .muscles
        .as_ref()
        .map(|m| {
            m.split(',')
                .filter_map(|s| s.trim().parse::<i32>().ok())
                .collect()
        })
        .unwrap_or_default();

    let difficulty_ids: Vec<i32> = query
        .difficulties
        .as_ref()
        .map(|d| {
            d.split(',')
                .filter_map(|s| s.trim().parse::<i32>().ok())
                .collect()
        })
        .unwrap_or_default();

    let target_muscles: Vec<String> = query
        .target_muscles
        .as_ref()
        .map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let has_muscle_filter = !muscle_ids.is_empty();
    let has_difficulty_filter = !difficulty_ids.is_empty();
    let has_target_muscle_filter = !target_muscles.is_empty();

    // フィルターに基づいてクエリを構築
    // 注: target_musclesフィルターはRustで適用（複雑なLIKE条件）
    let exercises: Vec<ExerciseRow> = if !has_muscle_filter && !has_difficulty_filter {
        // DBフィルターなし
        sqlx::query_as(
            r#"SELECT id, name, muscle, difficulty_level_id, description, target_muscles, video_path, muscle_group_id
               FROM exercises
               ORDER BY display_order ASC, id ASC"#
        )
        .fetch_all(pool.get_ref())
        .await?
    } else if has_muscle_filter && has_difficulty_filter {
        // 両方のフィルター
        let muscle_placeholders = muscle_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let difficulty_placeholders = difficulty_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");

        let query_str = format!(
            r#"SELECT id, name, muscle, difficulty_level_id, description, target_muscles, video_path, muscle_group_id
               FROM exercises
               WHERE muscle_group_id IN ({}) AND difficulty_level_id IN ({})
               ORDER BY display_order ASC, id ASC"#,
            muscle_placeholders, difficulty_placeholders
        );

        let mut q = sqlx::query_as::<_, ExerciseRow>(&query_str);
        for id in &muscle_ids {
            q = q.bind(id);
        }
        for id in &difficulty_ids {
            q = q.bind(id);
        }
        q.fetch_all(pool.get_ref()).await?
    } else if has_muscle_filter {
        // 筋肉フィルターのみ
        let placeholders = muscle_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query_str = format!(
            r#"SELECT id, name, muscle, difficulty_level_id, description, target_muscles, video_path, muscle_group_id
               FROM exercises
               WHERE muscle_group_id IN ({})
               ORDER BY display_order ASC, id ASC"#,
            placeholders
        );

        let mut q = sqlx::query_as::<_, ExerciseRow>(&query_str);
        for id in &muscle_ids {
            q = q.bind(id);
        }
        q.fetch_all(pool.get_ref()).await?
    } else {
        // 難易度フィルターのみ
        let placeholders = difficulty_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let query_str = format!(
            r#"SELECT id, name, muscle, difficulty_level_id, description, target_muscles, video_path, muscle_group_id
               FROM exercises
               WHERE difficulty_level_id IN ({})
               ORDER BY display_order ASC, id ASC"#,
            placeholders
        );

        let mut q = sqlx::query_as::<_, ExerciseRow>(&query_str);
        for id in &difficulty_ids {
            q = q.bind(id);
        }
        q.fetch_all(pool.get_ref()).await?
    };

    // Rustでtarget_musclesフィルターを適用（複雑なLIKE OR条件）
    let filtered_exercises: Vec<ExerciseRow> = if has_target_muscle_filter {
        exercises
            .into_iter()
            .filter(|e| {
                if let Some(ref tm) = e.target_muscles {
                    let exercise_targets: Vec<&str> = tm.split(',').map(|s| s.trim()).collect();
                    // OR条件: 選択したターゲット筋肉のいずれかが種目のターゲット筋肉に含まれていれば一致
                    target_muscles
                        .iter()
                        .any(|selected| exercise_targets.contains(&selected.as_str()))
                } else {
                    false
                }
            })
            .collect()
    } else {
        exercises
    };

    // 手動ページネーション
    let total_elements = filtered_exercises.len() as i64;
    let total_pages = ((total_elements as f64) / (size as f64)).ceil() as i32;
    let from_index = (page * size) as usize;
    let to_index = std::cmp::min(from_index + size as usize, filtered_exercises.len());

    let paged_exercises: Vec<ExerciseDto> = if from_index < filtered_exercises.len() {
        filtered_exercises[from_index..to_index]
            .iter()
            .map(|e| ExerciseDto {
                id: e.id,
                name: e.name.clone(),
                muscle: e.muscle.clone(),
                difficulty: e.difficulty_level_id,
                description: e.description.clone(),
                target_muscles: e.target_muscles.clone(),
                video_path: build_video_url(e.video_path.clone()),
            })
            .collect()
    } else {
        vec![]
    };

    Ok(HttpResponse::Ok().json(ExercisePagedResponse {
        exercises: paged_exercises,
        page,
        size,
        total_elements,
        total_pages,
        has_next: page < total_pages - 1,
    }))
}

/// GET /api/exercises/target-muscles - ユニークなターゲット筋肉リストを取得
#[get("/exercises/target-muscles")]
async fn get_target_muscles(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let rows: Vec<(Option<String>,)> = sqlx::query_as(
        r#"SELECT DISTINCT target_muscles FROM exercises WHERE target_muscles IS NOT NULL AND target_muscles != ''"#
    )
    .fetch_all(pool.get_ref())
    .await?;

    // カンマ区切り値をパースして重複を削除
    let mut muscles: Vec<String> = rows
        .into_iter()
        .filter_map(|(tm,)| tm)
        .flat_map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .collect::<Vec<_>>()
        })
        .filter(|s| !s.is_empty())
        .collect();

    muscles.sort();
    muscles.dedup();

    Ok(HttpResponse::Ok().json(muscles))
}

/// GET /api/exercises/muscle-groups - 全筋肉グループを取得
#[get("/exercises/muscle-groups")]
async fn get_muscle_groups(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let rows = sqlx::query_as::<_, MuscleGroupRow>(
        r#"SELECT id, name, display_name, display_order FROM muscle_groups ORDER BY display_order ASC, id ASC"#
    )
    .fetch_all(pool.get_ref())
    .await?;

    let dtos: Vec<MuscleGroupDto> = rows
        .into_iter()
        .map(|r| MuscleGroupDto {
            id: r.id,
            name: r.name,
            display_name: r.display_name,
            display_order: r.display_order,
        })
        .collect();

    Ok(HttpResponse::Ok().json(dtos))
}

/// GET /api/exercises/difficulty-levels - 全難易度レベルを取得
#[get("/exercises/difficulty-levels")]
async fn get_difficulty_levels(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let rows = sqlx::query_as::<_, DifficultyLevelRow>(
        r#"SELECT id, name, display_name, display_order FROM difficulty_levels ORDER BY display_order ASC, id ASC"#
    )
    .fetch_all(pool.get_ref())
    .await?;

    let dtos: Vec<DifficultyLevelDto> = rows
        .into_iter()
        .map(|r| DifficultyLevelDto {
            id: r.id,
            name: r.name,
            display_name: r.display_name,
            display_order: r.display_order,
        })
        .collect();

    Ok(HttpResponse::Ok().json(dtos))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_exercises_paged)
        .service(get_target_muscles)
        .service(get_muscle_groups)
        .service(get_difficulty_levels);
}
