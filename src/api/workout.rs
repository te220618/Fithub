//! ワークアウトAPIハンドラ

use actix_session::Session;
use actix_web::{delete, get, post, web, HttpResponse};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::*;
use crate::error::AppError;

// ============================================
// DTOs
// ============================================

#[derive(Serialize, Clone)]
struct WorkoutExerciseDto {
    id: i64,
    name: String,
    muscle: String,
    #[serde(rename = "isCustom")]
    is_custom: bool,
    #[serde(rename = "defaultTags")]
    default_tags: Vec<String>,
    #[serde(rename = "userAddedDefaultTags")]
    user_added_default_tags: Vec<String>,
    tags: Vec<WorkoutTagDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sets: Option<Vec<WorkoutSetDto>>,
}

#[derive(Serialize, Clone)]
struct WorkoutTagDto {
    id: i64,
    name: String,
    color: Option<String>,
}

#[derive(Serialize, Clone)]
struct WorkoutSetDto {
    id: i64,
    #[serde(rename = "setNumber")]
    set_number: i32,
    weight: f64,
    reps: i32,
}

#[derive(Serialize)]
struct WorkoutRecordDto {
    id: i64,
    date: String,
    exercises: Vec<WorkoutExerciseDto>,
    #[serde(rename = "expGained", skip_serializing_if = "Option::is_none")]
    exp_gained: Option<i32>,
    #[serde(rename = "newLevel", skip_serializing_if = "Option::is_none")]
    new_level: Option<i32>,
    #[serde(rename = "totalExp", skip_serializing_if = "Option::is_none")]
    total_exp: Option<i64>,
    #[serde(rename = "currentLevel", skip_serializing_if = "Option::is_none")]
    current_level: Option<i32>,
    #[serde(rename = "levelProgress", skip_serializing_if = "Option::is_none")]
    level_progress: Option<f64>,
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
struct PagedResponse<T> {
    content: Vec<T>,
    page: i32,
    size: i32,
    #[serde(rename = "totalElements")]
    total_elements: i64,
    #[serde(rename = "totalPages")]
    total_pages: i32,
    #[serde(rename = "hasNext")]
    has_next: bool,
    #[serde(rename = "hasPrevious")]
    has_previous: bool,
}

// ============================================
// リクエストDTO
// ============================================

#[derive(Deserialize)]
struct CreateCustomExerciseRequest {
    name: String,
    muscle: Option<String>,
}

#[derive(Deserialize)]
struct PagedRequest {
    page: Option<i32>,
    size: Option<i32>,
}

#[derive(Deserialize)]
struct SaveWorkoutRequest {
    date: String,
    exercises: Vec<SaveWorkoutExerciseDto>,
}

#[derive(Deserialize)]
struct SaveWorkoutExerciseDto {
    #[serde(rename = "exerciseId")]
    exercise_id: i64,
    sets: Vec<SaveSetDto>,
}

#[derive(Deserialize)]
struct SaveSetDto {
    weight: f64,
    reps: i32,
}

#[derive(Deserialize)]
struct CreateTagRequest {
    name: String,
    color: Option<String>,
}

#[derive(Deserialize)]
struct UpdateExerciseTagsRequest {
    #[serde(rename = "tagIds")]
    tag_ids: Vec<i64>,
    #[serde(rename = "defaultTags")]
    default_tags: Option<Vec<String>>,
}

// ============================================
// 種目
// ============================================

/// GET /api/workout/exercises
#[get("/workout/exercises")]
async fn get_exercises(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    // 1. デフォルト種目を取得
    let default_exercises: Vec<Exercise> = sqlx::query_as(
        r#"SELECT id, name, muscle, muscle_group_id, difficulty, difficulty_level_id, 
           description, target_muscles, video_path, display_order 
           FROM exercises ORDER BY display_order ASC, id ASC"#,
    )
    .fetch_all(pool.get_ref())
    .await?;

    // 2. ユーザーのカスタム種目を取得
    let custom_exercises: Vec<UserCustomExercise> =
        sqlx::query_as(r#"SELECT * FROM user_custom_exercises WHERE user_id = ? ORDER BY id ASC"#)
            .bind(session_user.id)
            .fetch_all(pool.get_ref())
            .await?;

    // 3. 種目のユーザーデフォルトタグを取得
    let user_default_tags: Vec<UserExerciseDefaultTag> =
        sqlx::query_as(r#"SELECT * FROM user_exercise_default_tags WHERE user_id = ?"#)
            .bind(session_user.id)
            .fetch_all(pool.get_ref())
            .await?;

    let mut user_tags_by_exercise: std::collections::HashMap<i64, Vec<String>> =
        std::collections::HashMap::new();
    for tag in user_default_tags {
        user_tags_by_exercise
            .entry(tag.exercise_id)
            .or_default()
            .push(tag.tag_name);
    }

    // 4. 種目のカスタムタグを取得
    #[derive(sqlx::FromRow)]
    struct ExerciseTagRow {
        exercise_id: i64,
        tag_id: i64,
        tag_name: String,
        tag_color: Option<String>,
    }
    let exercise_tags: Vec<ExerciseTagRow> = sqlx::query_as(
        r#"SELECT tet.exercise_id, t.id as tag_id, t.name as tag_name, t.color as tag_color
           FROM training_exercise_tags tet
           INNER JOIN training_tags t ON t.id = tet.tag_id
           WHERE tet.user_id = ?"#,
    )
    .bind(session_user.id)
    .fetch_all(pool.get_ref())
    .await?;

    let mut custom_tags_by_exercise: std::collections::HashMap<i64, Vec<WorkoutTagDto>> =
        std::collections::HashMap::new();
    for row in exercise_tags {
        custom_tags_by_exercise
            .entry(row.exercise_id)
            .or_default()
            .push(WorkoutTagDto {
                id: row.tag_id,
                name: row.tag_name,
                color: row.tag_color,
            });
    }

    // 5. レスポンスを構築
    let mut result: Vec<WorkoutExerciseDto> = Vec::new();

    // デフォルト種目
    for ex in default_exercises {
        let master_tags: Vec<String> = ex
            .target_muscles
            .as_ref()
            .map(|t| {
                t.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let user_tags = user_tags_by_exercise
            .get(&ex.id)
            .cloned()
            .unwrap_or_default();
        let user_added_tags: Vec<String> = user_tags
            .iter()
            .filter(|t| !master_tags.contains(t))
            .cloned()
            .collect();

        let tags = custom_tags_by_exercise
            .get(&ex.id)
            .cloned()
            .unwrap_or_default();

        result.push(WorkoutExerciseDto {
            id: ex.id,
            name: ex.name,
            muscle: ex.muscle,
            is_custom: false,
            default_tags: master_tags,
            user_added_default_tags: user_added_tags,
            tags,
            sets: None,
        });
    }

    // カスタム種目
    for ex in custom_exercises {
        let tags = custom_tags_by_exercise
            .get(&ex.id)
            .cloned()
            .unwrap_or_default();

        result.push(WorkoutExerciseDto {
            id: ex.id,
            name: ex.name.clone(),
            muscle: ex.muscle.clone(),
            is_custom: true,
            default_tags: vec![],
            user_added_default_tags: vec![],
            tags,
            sets: None,
        });
    }

    Ok(HttpResponse::Ok().json(result))
}

/// POST /api/workout/custom-exercises
#[post("/workout/custom-exercises")]
async fn create_custom_exercise(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<CreateCustomExerciseRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let muscle = body.muscle.as_deref().unwrap_or("other");

    let result = sqlx::query(
        r#"INSERT INTO user_custom_exercises (user_id, name, muscle, created_at, updated_at)
           VALUES (?, ?, ?, NOW(), NOW())"#,
    )
    .bind(session_user.id)
    .bind(&body.name)
    .bind(muscle)
    .execute(pool.get_ref())
    .await?;

    let id = result.last_insert_id() as i64;

    Ok(HttpResponse::Ok().json(WorkoutExerciseDto {
        id,
        name: body.name.clone(),
        muscle: muscle.to_string(),
        is_custom: true,
        default_tags: vec![],
        user_added_default_tags: vec![],
        tags: vec![],
        sets: None,
    }))
}

/// DELETE /api/workout/custom-exercises/{id}
#[delete("/workout/custom-exercises/{id}")]
async fn delete_custom_exercise(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let exercise_id = path.into_inner();

    // Verify ownership
    let exercise: Option<UserCustomExercise> =
        sqlx::query_as("SELECT * FROM user_custom_exercises WHERE id = ? AND user_id = ?")
            .bind(exercise_id)
            .bind(session_user.id)
            .fetch_optional(pool.get_ref())
            .await?;

    let _exercise = exercise.ok_or_else(|| AppError::NotFound("Custom exercise not found".to_string()))?;

    // Delete exercise-tag associations first
    sqlx::query("DELETE FROM training_exercise_tags WHERE exercise_id = ?")
        .bind(exercise_id)
        .execute(pool.get_ref())
        .await?;

    // Delete custom exercise
    sqlx::query("DELETE FROM user_custom_exercises WHERE id = ?")
        .bind(exercise_id)
        .execute(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

// ============================================
// 記録
// ============================================

/// GET /api/workout/records
#[get("/workout/records")]
async fn get_records(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let records = fetch_records_for_user(pool.get_ref(), session_user.id, None, None).await?;
    Ok(HttpResponse::Ok().json(records))
}

/// GET /api/workout/records/paged
#[get("/workout/records/paged")]
async fn get_records_paged(
    pool: web::Data<MySqlPool>,
    session: Session,
    query: web::Query<PagedRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let page = query.page.unwrap_or(0);
    let size = query.size.unwrap_or(20);

    // 合計数を取得
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM training_records WHERE user_id = ?")
        .bind(session_user.id)
        .fetch_one(pool.get_ref())
        .await?;

    let records =
        fetch_records_for_user(pool.get_ref(), session_user.id, Some(page), Some(size)).await?;
    let total_pages = ((total.0 as f64) / (size as f64)).ceil() as i32;

    Ok(HttpResponse::Ok().json(PagedResponse {
        content: records,
        page,
        size,
        total_elements: total.0,
        total_pages,
        has_next: page < total_pages - 1,
        has_previous: page > 0,
    }))
}

async fn fetch_records_for_user(
    pool: &MySqlPool,
    user_id: i64,
    page: Option<i32>,
    size: Option<i32>,
) -> Result<Vec<WorkoutRecordDto>, AppError> {
    #[derive(sqlx::FromRow)]
    struct RecordRow {
        id: i64,
        record_date: NaiveDate,
    }

    let records: Vec<RecordRow> = if let (Some(p), Some(s)) = (page, size) {
        sqlx::query_as(
            r#"SELECT id, record_date FROM training_records
               WHERE user_id = ?
               ORDER BY record_date DESC, id DESC
               LIMIT ? OFFSET ?"#,
        )
        .bind(user_id)
        .bind(s)
        .bind(p * s)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as(
            r#"SELECT id, record_date FROM training_records
               WHERE user_id = ?
               ORDER BY record_date DESC, id DESC"#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?
    };

    if records.is_empty() {
        return Ok(vec![]);
    }

    let record_ids: Vec<i64> = records.iter().map(|r| r.id).collect();
    let placeholders = record_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // 記録の種目を取得
    #[derive(sqlx::FromRow)]
    struct RecordExerciseRow {
        id: i64,
        record_id: i64,
        exercise_id: Option<i64>,
        custom_exercise_id: Option<i64>,
        exercise_name: String,
        muscle: String,
    }

    let query = format!(
        r#"SELECT tre.id, tre.record_id, tre.exercise_id, tre.custom_exercise_id,
           CAST(COALESCE(e.name, uce.name, 'Unknown') AS CHAR) as exercise_name,
           CAST(COALESCE(e.muscle, uce.muscle, 'other') AS CHAR) as muscle
           FROM training_record_exercises tre
           LEFT JOIN exercises e ON e.id = tre.exercise_id
           LEFT JOIN user_custom_exercises uce ON uce.id = tre.custom_exercise_id
           WHERE tre.record_id IN ({})
           ORDER BY tre.order_index ASC, tre.id ASC"#,
        placeholders
    );

    let mut q = sqlx::query_as::<_, RecordExerciseRow>(&query);
    for id in &record_ids {
        q = q.bind(id);
    }
    let record_exercises: Vec<RecordExerciseRow> = q.fetch_all(pool).await?;

    // セットを取得
    let re_ids: Vec<i64> = record_exercises.iter().map(|re| re.id).collect();
    if re_ids.is_empty() {
        let result: Vec<WorkoutRecordDto> = records
            .into_iter()
            .map(|r| WorkoutRecordDto {
                id: r.id,
                date: r.record_date.format("%Y-%m-%d").to_string(),
                exercises: vec![],
                exp_gained: None,
                new_level: None,
                total_exp: None,
                current_level: None,
                level_progress: None,
            })
            .collect();
        return Ok(result);
    }

    #[derive(sqlx::FromRow)]
    struct SetRow {
        id: i64,
        record_exercise_id: i64,
        set_number: i32,
        weight: f64,
        reps: i32,
    }

    let set_placeholders = re_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let set_query = format!(
        r#"SELECT id, record_exercise_id, set_number, weight, reps
           FROM training_sets
           WHERE record_exercise_id IN ({})
           ORDER BY set_number ASC"#,
        set_placeholders
    );

    let mut sq = sqlx::query_as::<_, SetRow>(&set_query);
    for id in &re_ids {
        sq = sq.bind(id);
    }
    let sets: Vec<SetRow> = sq.fetch_all(pool).await?;

    // セットをrecord_exercise_idでグループ化
    let mut sets_by_re: std::collections::HashMap<i64, Vec<WorkoutSetDto>> =
        std::collections::HashMap::new();
    for s in sets {
        sets_by_re
            .entry(s.record_exercise_id)
            .or_default()
            .push(WorkoutSetDto {
                id: s.id,
                set_number: s.set_number,
                weight: s.weight,
                reps: s.reps,
            });
    }

    // 種目をrecord_idでグループ化
    let mut exercises_by_record: std::collections::HashMap<i64, Vec<WorkoutExerciseDto>> =
        std::collections::HashMap::new();
    for re in record_exercises {
        let sets = sets_by_re.get(&re.id).cloned().unwrap_or_default();
        let is_custom = re.custom_exercise_id.is_some();
        let exercise_id = re.custom_exercise_id.or(re.exercise_id).unwrap_or(0);
        exercises_by_record
            .entry(re.record_id)
            .or_default()
            .push(WorkoutExerciseDto {
                id: exercise_id,
                name: re.exercise_name,
                muscle: re.muscle,
                is_custom,
                default_tags: vec![],
                user_added_default_tags: vec![],
                tags: vec![],
                sets: Some(sets),
            });
    }

    // 結果を構築
    let result: Vec<WorkoutRecordDto> = records
        .into_iter()
        .map(|r| WorkoutRecordDto {
            id: r.id,
            date: r.record_date.format("%Y-%m-%d").to_string(),
            exercises: exercises_by_record.get(&r.id).cloned().unwrap_or_default(),
            exp_gained: None,
            new_level: None,
            total_exp: None,
            current_level: None,
            level_progress: None,
        })
        .collect();

    Ok(result)
}

/// POST /api/workout/records
#[post("/workout/records")]
async fn save_record(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<SaveWorkoutRequest>,
) -> Result<HttpResponse, AppError> {
    use crate::api::streak::get_user_multipliers;
    use crate::config::ExpConfig;
    use chrono::{FixedOffset, Utc};

    let session_user = get_current_user(&session)?;
    let exp_config = ExpConfig::default();

    // Get streak multipliers for EXP bonus
    let (training_mult, login_mult, _) =
        get_user_multipliers(pool.get_ref(), session_user.id).await?;
    let streak_multiplier = 1.0 + training_mult + login_mult; // Combined multiplier

    // Use JST (UTC+9) with 4:00 AM reset
    // If current time is before 4:00 AM JST, consider it as previous day
    let jst = FixedOffset::east_opt(9 * 3600).unwrap();
    let now_jst = Utc::now().with_timezone(&jst);
    let today = now_jst.date_naive();

    let record_date = NaiveDate::parse_from_str(&body.date, "%Y-%m-%d")
        .map_err(|_| AppError::BadRequest("Invalid date format".to_string()))?;

    // Reject future dates
    if record_date > today {
        return Err(AppError::BadRequest(
            "未来の日付は登録できません".to_string(),
        ));
    }

    // Determine if this is a "past record" (2+ days ago from today)
    let days_ago = (today - record_date).num_days();
    let is_past_record = days_ago >= exp_config.past_days_threshold;
    let exp_multiplier = exp_config.get_exp_multiplier(is_past_record);
    let daily_limit = exp_config.get_daily_limit(is_past_record);

    // Find existing record or create new one (APPEND mode like Spring Boot)
    let existing_record: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, COALESCE(exp_earned, 0) FROM training_records WHERE user_id = ? AND record_date = ?",
    )
    .bind(session_user.id)
    .bind(record_date)
    .fetch_optional(pool.get_ref())
    .await?;

    let old_exp_earned = existing_record.as_ref().map(|(_, exp)| *exp).unwrap_or(0);

    let record_id = if let Some((id, _)) = existing_record {
        // Update existing record's timestamp (NO DELETE - APPEND mode)
        sqlx::query("UPDATE training_records SET updated_at = NOW() WHERE id = ?")
            .bind(id)
            .execute(pool.get_ref())
            .await?;
        id
    } else {
        // Create new record
        let result = sqlx::query(
            r#"INSERT INTO training_records (user_id, record_date, exp_earned, created_at, updated_at)
               VALUES (?, ?, 0, NOW(), NOW())"#,
        )
        .bind(session_user.id)
        .bind(record_date)
        .execute(pool.get_ref())
        .await?;
        result.last_insert_id() as i64
    };

    // Get current max order_index for this record
    let max_order: Option<(Option<i32>,)> = sqlx::query_as(
        "SELECT MAX(order_index) FROM training_record_exercises WHERE record_id = ?",
    )
    .bind(record_id)
    .fetch_optional(pool.get_ref())
    .await?;
    let mut next_order_index = max_order.and_then(|o| o.0).map(|v| v + 1).unwrap_or(0);

    // Calculate EXP per set with difficulty coefficient
    // Formula: difficulty_coef × weight × reps × 0.01 × multiplier
    // Difficulty: 上級=30, 中級=20, 初級=10, custom=15
    let mut total_exp_earned = 0i32;

    for ex in body.exercises.iter() {
        // Check if exercise is custom and get difficulty
        let is_custom: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM user_custom_exercises WHERE id = ? AND user_id = ?",
        )
        .bind(ex.exercise_id)
        .bind(session_user.id)
        .fetch_one(pool.get_ref())
        .await?;
        let is_custom = is_custom.0 > 0;

        // Get difficulty coefficient
        let difficulty_coef: i32 = if is_custom {
            15 // カスタム種目のデフォルト
        } else {
            let diff: Option<(String,)> =
                sqlx::query_as("SELECT difficulty FROM exercises WHERE id = ?")
                    .bind(ex.exercise_id)
                    .fetch_optional(pool.get_ref())
                    .await?;

            match diff.as_ref().map(|(d,)| d.as_str()) {
                Some("上級") | Some("hard") => 30,
                Some("中級") | Some("medium") => 20,
                Some("初級") | Some("easy") => 10,
                _ => 15,
            }
        };

        // Check if this exercise already exists in this record (APPEND mode)
        let existing_record_exercise: Option<(i64,)> = if is_custom {
            sqlx::query_as(
                "SELECT id FROM training_record_exercises WHERE record_id = ? AND custom_exercise_id = ?",
            )
            .bind(record_id)
            .bind(ex.exercise_id)
            .fetch_optional(pool.get_ref())
            .await?
        } else {
            sqlx::query_as(
                "SELECT id FROM training_record_exercises WHERE record_id = ? AND exercise_id = ?",
            )
            .bind(record_id)
            .bind(ex.exercise_id)
            .fetch_optional(pool.get_ref())
            .await?
        };

        let record_exercise_id = if let Some((id,)) = existing_record_exercise {
            // Use existing record exercise
            id
        } else {
            // Create new record exercise
            let re_result = if is_custom {
                sqlx::query(
                    r#"INSERT INTO training_record_exercises (record_id, custom_exercise_id, order_index)
                       VALUES (?, ?, ?)"#,
                )
                .bind(record_id)
                .bind(ex.exercise_id)
                .bind(next_order_index)
                .execute(pool.get_ref())
                .await?
            } else {
                sqlx::query(
                    r#"INSERT INTO training_record_exercises (record_id, exercise_id, order_index)
                       VALUES (?, ?, ?)"#,
                )
                .bind(record_id)
                .bind(ex.exercise_id)
                .bind(next_order_index)
                .execute(pool.get_ref())
                .await?
            };
            next_order_index += 1;
            re_result.last_insert_id() as i64
        };

        // Get max set_number for this record_exercise
        let max_set: Option<(Option<i32>,)> = sqlx::query_as(
            "SELECT MAX(set_number) FROM training_sets WHERE record_exercise_id = ?",
        )
        .bind(record_exercise_id)
        .fetch_optional(pool.get_ref())
        .await?;
        let mut next_set_number = max_set.and_then(|s| s.0).map(|v| v + 1).unwrap_or(1);

        // Insert sets and calculate EXP
        for set in ex.sets.iter() {
            // バリデーション: 重量は0〜500kgの範囲
            if set.weight < 0.0 || set.weight > 500.0 {
                return Err(AppError::BadRequest(
                    "重量は0〜500kgの範囲で入力してください".into(),
                ));
            }
            // バリデーション: 回数は0〜20の範囲
            if set.reps < 0 || set.reps > 20 {
                return Err(AppError::BadRequest(
                    "回数は0〜20の範囲で入力してください".into(),
                ));
            }

            sqlx::query(
                r#"INSERT INTO training_sets (record_exercise_id, set_number, weight, reps)
                   VALUES (?, ?, ?, ?)"#,
            )
            .bind(record_exercise_id)
            .bind(next_set_number)
            .bind(set.weight)
            .bind(set.reps)
            .execute(pool.get_ref())
            .await?;

            // EXP = difficulty_coef × weight × reps × coefficient × multiplier
            // Apply per-set cap (max_exp_per_set) to prevent abuse
            let raw_set_exp = (difficulty_coef as f64
                * set.weight
                * set.reps as f64
                * exp_config.exp_coefficient
                * exp_multiplier)
                .round() as i32;
            let set_exp = std::cmp::min(raw_set_exp, exp_config.max_exp_per_set);
            total_exp_earned += std::cmp::max(1, set_exp);
            next_set_number += 1;
        }
    }

    // Get current user level for level multiplier
    let current_stats: Option<UserStats> =
        sqlx::query_as("SELECT id, user_id, total_exp, level FROM user_stats WHERE user_id = ?")
            .bind(session_user.id)
            .fetch_optional(pool.get_ref())
            .await?;
    let current_level = current_stats.as_ref().map(|s| s.level).unwrap_or(1);
    let level_multiplier = 1.0 + (current_level as f64 / 100.0); // +1% per level, max +100% at Lv100

    // Apply level multiplier and streak multiplier to total EXP
    // Formula: base_exp × level_mult × streak_mult
    let boosted_exp =
        (total_exp_earned as f64 * level_multiplier * streak_multiplier).round() as i32;
    let total_exp_earned = boosted_exp;

    // Calculate daily EXP already earned for this date (including current record's old exp)
    let existing_daily_exp: (i64,) = sqlx::query_as(
        "SELECT CAST(COALESCE(SUM(exp_earned), 0) AS SIGNED) FROM training_records WHERE user_id = ? AND record_date = ?",
    )
    .bind(session_user.id)
    .bind(record_date)
    .fetch_one(pool.get_ref())
    .await?;
    let existing_daily_exp = existing_daily_exp.0 as i32;

    // Apply daily limit for this specific date
    let remaining_daily = daily_limit - existing_daily_exp;
    let actual_exp = std::cmp::min(total_exp_earned, std::cmp::max(remaining_daily, 0));

    // Update exp_earned (add to existing)
    let new_record_exp = old_exp_earned + actual_exp;
    sqlx::query("UPDATE training_records SET exp_earned = ? WHERE id = ?")
        .bind(new_record_exp)
        .bind(record_id)
        .execute(pool.get_ref())
        .await?;

    // Update user stats (reuse current_stats from earlier)
    let (new_total_exp, old_level, new_level) = match current_stats {
        Some(s) => {
            // Add new exp to total
            let new_total = s.total_exp + actual_exp as i64;
            let new_total = std::cmp::max(0, new_total);
            let new_lvl = UserStats::calculate_level(new_total);

            sqlx::query(
                r#"UPDATE user_stats SET total_exp = ?, level = ?, updated_at = NOW() WHERE user_id = ?"#,
            )
            .bind(new_total)
            .bind(new_lvl)
            .bind(session_user.id)
            .execute(pool.get_ref())
            .await?;
            (new_total, s.level, new_lvl)
        }
        None => {
            let new_lvl = UserStats::calculate_level(actual_exp as i64);
            sqlx::query(
                r#"INSERT INTO user_stats (user_id, total_exp, level, created_at, updated_at)
                   VALUES (?, ?, ?, NOW(), NOW())"#,
            )
            .bind(session_user.id)
            .bind(actual_exp as i64)
            .bind(new_lvl)
            .execute(pool.get_ref())
            .await?;
            (actual_exp as i64, 1, new_lvl)
        }
    };

    let level_up = if new_level > old_level {
        Some(new_level)
    } else {
        None
    };
    let level_progress = {
        let current_exp = UserStats::get_required_exp_for_level(new_level);
        let next_exp = UserStats::get_required_exp_for_level(new_level + 1);
        let exp_in_level = new_total_exp - current_exp;
        let exp_needed = next_exp - current_exp;
        if exp_needed > 0 {
            exp_in_level as f64 / exp_needed as f64
        } else {
            1.0
        }
    };

    // Update training streak
    use crate::api::streak::record_training_activity;
    let _ = record_training_activity(pool.get_ref(), session_user.id, record_date).await;

    // アクティブペットにも同量の経験値を付与
    if actual_exp > 0 {
        use crate::api::pet::{add_exp_to_active_pet, check_and_unlock_pet_types};
        if let Ok(Some((_pet_level, _level_up, matured))) = 
            add_exp_to_active_pet(pool.get_ref(), session_user.id, actual_exp as i64).await 
        {
            // ペットが成熟したら解放条件をチェック
            if matured {
                let _ = check_and_unlock_pet_types(pool.get_ref(), session_user.id).await;
            }
        }
        // ユーザーがレベルアップした場合も解放条件をチェック
        if level_up.is_some() {
            use crate::api::pet::check_and_unlock_pet_types;
            let _ = check_and_unlock_pet_types(pool.get_ref(), session_user.id).await;
        }
    }

    Ok(HttpResponse::Ok().json(WorkoutRecordDto {
        id: record_id,
        date: body.date.clone(),
        exercises: vec![],
        exp_gained: Some(actual_exp),
        new_level: level_up,
        total_exp: Some(new_total_exp),
        current_level: Some(new_level),
        level_progress: Some(level_progress),
    }))
}

/// DELETE /api/workout/records/{id}
#[delete("/workout/records/{id}")]
async fn delete_record(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let record_id = path.into_inner();

    // Verify ownership and get exp_earned
    let record: Option<(i64, i32)> = sqlx::query_as(
        "SELECT id, COALESCE(exp_earned, 0) FROM training_records WHERE id = ? AND user_id = ?",
    )
    .bind(record_id)
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    let exp_to_deduct = match record {
        Some((_, exp)) => exp,
        None => return Err(AppError::NotFound("Record not found".to_string())),
    };

    // Delete sets first
    sqlx::query(
        r#"DELETE ts FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           WHERE tre.record_id = ?"#,
    )
    .bind(record_id)
    .execute(pool.get_ref())
    .await?;

    // Delete record exercises
    sqlx::query("DELETE FROM training_record_exercises WHERE record_id = ?")
        .bind(record_id)
        .execute(pool.get_ref())
        .await?;

    // Delete record
    sqlx::query("DELETE FROM training_records WHERE id = ?")
        .bind(record_id)
        .execute(pool.get_ref())
        .await?;

    // Deduct EXP from user stats
    let stats: Option<UserStats> =
        sqlx::query_as("SELECT id, user_id, total_exp, level FROM user_stats WHERE user_id = ?")
            .bind(session_user.id)
            .fetch_optional(pool.get_ref())
            .await?;

    if let Some(s) = stats {
        let new_total = std::cmp::max(0, s.total_exp - exp_to_deduct as i64);
        let new_level = UserStats::calculate_level(new_total);
        sqlx::query(
            r#"UPDATE user_stats SET total_exp = ?, level = ?, updated_at = NOW() WHERE user_id = ?"#,
        )
        .bind(new_total)
        .bind(new_level)
        .bind(session_user.id)
        .execute(pool.get_ref())
        .await?;
    }

    // Deduct EXP from active pet
    let active_pet: Option<Pet> =
        sqlx::query_as("SELECT * FROM pets WHERE user_id = ? AND is_active = true")
            .bind(session_user.id)
            .fetch_optional(pool.get_ref())
            .await?;

    if let Some(pet) = active_pet {
        let new_total = std::cmp::max(0, pet.total_exp - exp_to_deduct as i64);
        let new_level = Pet::calculate_level(new_total);
        let new_stage = Pet::calculate_stage(new_level);

        sqlx::query(
            r#"UPDATE pets SET total_exp = ?, level = ?, stage = ?, updated_at = NOW() WHERE id = ?"#,
        )
        .bind(new_total)
        .bind(new_level)
        .bind(new_stage)
        .bind(pet.id)
        .execute(pool.get_ref())
        .await?;
    }

    // Recalculate training streak after deletion
    {
        use crate::api::streak::recalculate_training_streak;
        let _ = recalculate_training_streak(pool.get_ref(), session_user.id).await;
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

/// DELETE /api/workout/sets/{id}
#[delete("/workout/sets/{id}")]
async fn delete_set(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let set_id = path.into_inner();

    // Verify ownership
    let ownership: Option<(i64,)> = sqlx::query_as(
        r#"SELECT ts.id FROM training_sets ts
           INNER JOIN training_record_exercises tre ON ts.record_exercise_id = tre.id
           INNER JOIN training_records tr ON tre.record_id = tr.id
           WHERE ts.id = ? AND tr.user_id = ?"#,
    )
    .bind(set_id)
    .bind(session_user.id)
    .fetch_optional(pool.get_ref())
    .await?;

    if ownership.is_none() {
        return Err(AppError::NotFound("Set not found".to_string()));
    }

    sqlx::query("DELETE FROM training_sets WHERE id = ?")
        .bind(set_id)
        .execute(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

// ============================================
// Tags
// ============================================

/// GET /api/workout/tags
#[get("/workout/tags")]
async fn get_tags(pool: web::Data<MySqlPool>, session: Session) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let tags: Vec<TrainingTag> =
        sqlx::query_as("SELECT * FROM training_tags WHERE user_id = ? ORDER BY id ASC")
            .bind(session_user.id)
            .fetch_all(pool.get_ref())
            .await?;

    let result: Vec<WorkoutTagDto> = tags
        .into_iter()
        .map(|t| WorkoutTagDto {
            id: t.id,
            name: t.name,
            color: t.color,
        })
        .collect();

    Ok(HttpResponse::Ok().json(result))
}

/// POST /api/workout/tags
#[post("/workout/tags")]
async fn create_tag(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<CreateTagRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    let result = sqlx::query(
        r#"INSERT INTO training_tags (user_id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, NOW(), NOW())"#,
    )
    .bind(session_user.id)
    .bind(&body.name)
    .bind(&body.color)
    .execute(pool.get_ref())
    .await?;

    let id = result.last_insert_id() as i64;

    Ok(HttpResponse::Ok().json(WorkoutTagDto {
        id,
        name: body.name.clone(),
        color: body.color.clone(),
    }))
}

/// DELETE /api/workout/tags/{id}
#[delete("/workout/tags/{id}")]
async fn delete_tag(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let tag_id = path.into_inner();

    // Verify ownership
    let tag: Option<TrainingTag> =
        sqlx::query_as("SELECT * FROM training_tags WHERE id = ? AND user_id = ?")
            .bind(tag_id)
            .bind(session_user.id)
            .fetch_optional(pool.get_ref())
            .await?;

    let _tag = tag.ok_or_else(|| AppError::NotFound("Tag not found".to_string()))?;

    // Delete tag associations first
    sqlx::query("DELETE FROM training_exercise_tags WHERE tag_id = ?")
        .bind(tag_id)
        .execute(pool.get_ref())
        .await?;

    // Delete tag
    sqlx::query("DELETE FROM training_tags WHERE id = ?")
        .bind(tag_id)
        .execute(pool.get_ref())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

/// POST /api/workout/exercises/{id}/tags
#[post("/workout/exercises/{id}/tags")]
async fn update_exercise_tags(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
    body: web::Json<UpdateExerciseTagsRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let exercise_id = path.into_inner();

    // Verify exercise exists
    let exists: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM (
            SELECT id FROM exercises WHERE id = ?
            UNION ALL
            SELECT id FROM user_custom_exercises WHERE id = ? AND user_id = ?
        ) AS combined"#,
    )
    .bind(exercise_id)
    .bind(exercise_id)
    .bind(session_user.id)
    .fetch_one(pool.get_ref())
    .await?;

    if exists.0 == 0 {
        return Err(AppError::NotFound("Exercise not found".to_string()));
    }

    // Clear existing tags
    sqlx::query("DELETE FROM training_exercise_tags WHERE user_id = ? AND exercise_id = ?")
        .bind(session_user.id)
        .bind(exercise_id)
        .execute(pool.get_ref())
        .await?;

    // Insert new tags
    for tag_id in &body.tag_ids {
        sqlx::query(
            r#"INSERT INTO training_exercise_tags (user_id, exercise_id, tag_id)
               VALUES (?, ?, ?)"#,
        )
        .bind(session_user.id)
        .bind(exercise_id)
        .bind(tag_id)
        .execute(pool.get_ref())
        .await?;
    }

    // Update user default tags if provided
    if let Some(ref default_tags) = body.default_tags {
        sqlx::query("DELETE FROM user_exercise_default_tags WHERE user_id = ? AND exercise_id = ?")
            .bind(session_user.id)
            .bind(exercise_id)
            .execute(pool.get_ref())
            .await?;

        for tag_name in default_tags {
            sqlx::query(
                r#"INSERT INTO user_exercise_default_tags (user_id, exercise_id, tag_name)
                   VALUES (?, ?, ?)"#,
            )
            .bind(session_user.id)
            .bind(exercise_id)
            .bind(tag_name)
            .execute(pool.get_ref())
            .await?;
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

// ============================================
// Public endpoints
// ============================================

/// GET /api/workout/muscle-groups
#[get("/workout/muscle-groups")]
async fn get_muscle_groups(pool: web::Data<MySqlPool>) -> Result<HttpResponse, AppError> {
    let groups: Vec<MuscleGroup> = sqlx::query_as(
        "SELECT id, name, display_order FROM muscle_groups ORDER BY display_order ASC, id ASC",
    )
    .fetch_all(pool.get_ref())
    .await?;

    let result: Vec<MuscleGroupDto> = groups
        .into_iter()
        .map(|g| MuscleGroupDto {
            id: g.id,
            name: g.name.clone(),
            display_name: g.name,
            display_order: g.display_order,
        })
        .collect();

    Ok(HttpResponse::Ok().json(result))
}

/// GET /api/workout/default-tags
#[get("/workout/default-tags")]
async fn get_default_tags(pool: web::Data<MySqlPool>) -> Result<HttpResponse, AppError> {
    let rows: Vec<(Option<String>,)> =
        sqlx::query_as("SELECT target_muscles FROM exercises WHERE target_muscles IS NOT NULL")
            .fetch_all(pool.get_ref())
            .await?;

    let mut tags: Vec<String> = rows
        .into_iter()
        .filter_map(|(tm,)| tm)
        .flat_map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .collect::<Vec<_>>()
        })
        .filter(|s| !s.is_empty())
        .collect();

    tags.sort();
    tags.dedup();

    Ok(HttpResponse::Ok().json(tags))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_exercises)
        .service(create_custom_exercise)
        .service(delete_custom_exercise)
        .service(get_records)
        .service(get_records_paged)
        .service(save_record)
        .service(delete_record)
        .service(delete_set)
        .service(get_tags)
        .service(create_tag)
        .service(delete_tag)
        .service(update_exercise_tags)
        .service(get_muscle_groups)
        .service(get_default_tags);
}
