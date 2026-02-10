//! ペット（トレーニングパートナー）小屋システム APIハンドラ

use actix_session::Session;
use actix_web::{delete, get, post, put, web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::api::streak::get_or_create_streak;
use crate::auth::session::get_current_user;
use crate::db::models::{Pet, PetType, UserStats, UserPetUnlock};
use crate::error::AppError;

// ============================================
// レスポンス型
// ============================================

#[derive(Serialize)]
pub struct PetTypeResponse {
    pub id: i32,
    pub name: String,
    pub code: String,
    pub description: Option<String>,
    #[serde(rename = "imageEgg")]
    pub image_egg: Option<String>,
    #[serde(rename = "imageChild")]
    pub image_child: Option<String>,
    #[serde(rename = "imageAdult")]
    pub image_adult: Option<String>,
    #[serde(rename = "backgroundImage")]
    pub background_image: Option<String>,
    #[serde(rename = "unlockType")]
    pub unlock_type: Option<String>,
    #[serde(rename = "unlockLevel")]
    pub unlock_level: Option<i32>,
    #[serde(rename = "unlockPetCode")]
    pub unlock_pet_code: Option<String>,
    #[serde(rename = "isStarter")]
    pub is_starter: Option<bool>,
}

#[derive(Serialize)]
pub struct PetResponse {
    pub id: i64,
    pub name: String,
    #[serde(rename = "petTypeId")]
    pub pet_type_id: i32,
    #[serde(rename = "petTypeCode")]
    pub pet_type_code: Option<String>,
    #[serde(rename = "petType")]
    pub pet_type: Option<PetTypeResponse>,
    pub stage: i32,
    #[serde(rename = "stageName")]
    pub stage_name: String,
    pub level: i32,
    #[serde(rename = "totalExp")]
    pub total_exp: i64,
    #[serde(rename = "expToNextLevel")]
    pub exp_to_next_level: i32,
    #[serde(rename = "levelProgress")]
    pub level_progress: f64,
    #[serde(rename = "moodScore")]
    pub mood_score: i32,
    #[serde(rename = "moodLabel")]
    pub mood_label: String,
    #[serde(rename = "imageUrl")]
    pub image_url: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

/// 旧APIとの互換性用
#[derive(Serialize)]
pub struct PetStatusResponse {
    #[serde(rename = "hasPet")]
    pub has_pet: bool,
    pub pet: Option<PetResponse>,
}

/// 小屋情報レスポンス
#[derive(Serialize)]
pub struct BarnResponse {
    #[serde(rename = "activePet")]
    pub active_pet: Option<PetResponse>,
    #[serde(rename = "ownedPets")]
    pub owned_pets: Vec<PetResponse>,
    #[serde(rename = "unlockedTypes")]
    pub unlocked_types: Vec<PetTypeResponse>,
    #[serde(rename = "lockedTypes")]
    pub locked_types: Vec<LockedPetTypeResponse>,
}

#[derive(Serialize)]
pub struct LockedPetTypeResponse {
    pub id: i32,
    pub name: String,
    pub code: String,
    pub description: Option<String>,
    #[serde(rename = "imageEgg")]
    pub image_egg: Option<String>,
    #[serde(rename = "backgroundImage")]
    pub background_image: Option<String>,
    #[serde(rename = "unlockType")]
    pub unlock_type: Option<String>,
    #[serde(rename = "unlockLevel")]
    pub unlock_level: Option<i32>,
    #[serde(rename = "unlockPetCode")]
    pub unlock_pet_code: Option<String>,
    #[serde(rename = "unlockProgress")]
    pub unlock_progress: String,
}

#[derive(Deserialize)]
pub struct CreatePetRequest {
    #[serde(rename = "petTypeId")]
    pub pet_type_id: i32,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdatePetRequest {
    pub name: Option<String>,
}

// ============================================
// ヘルパー関数
// ============================================

/// ペット種類を取得（解放条件含む）
async fn get_pet_type(pool: &MySqlPool, pet_type_id: i32) -> Result<Option<PetType>, AppError> {
    let pet_type: Option<PetType> = sqlx::query_as(
        "SELECT id, name, code, description, image_egg, image_child, image_adult, background_image,
                display_order, is_active, unlock_type, unlock_level, unlock_pet_code, is_starter,
                created_at, updated_at 
         FROM pet_types WHERE id = ? AND is_active = TRUE",
    )
    .bind(pet_type_id)
    .fetch_optional(pool)
    .await?;
    Ok(pet_type)
}

/// 有効なペット種類を全て取得
async fn get_all_pet_types(pool: &MySqlPool) -> Result<Vec<PetType>, AppError> {
    let pet_types: Vec<PetType> = sqlx::query_as(
        "SELECT id, name, code, description, image_egg, image_child, image_adult, background_image,
                display_order, is_active, unlock_type, unlock_level, unlock_pet_code, is_starter,
                created_at, updated_at 
         FROM pet_types 
         WHERE is_active = TRUE 
         ORDER BY display_order ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(pet_types)
}

/// ユーザーのアクティブペットを取得
async fn find_active_pet(pool: &MySqlPool, user_id: i64) -> Result<Option<Pet>, AppError> {
    let pet: Option<Pet> = sqlx::query_as(
        "SELECT id, user_id, pet_type_id, name, stage, mood_score, total_exp, level, is_active, created_at, updated_at 
         FROM pets WHERE user_id = ? AND is_active = TRUE",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(pet)
}

/// ユーザーの全ペットを取得
async fn find_all_pets_by_user(pool: &MySqlPool, user_id: i64) -> Result<Vec<Pet>, AppError> {
    let pets: Vec<Pet> = sqlx::query_as(
        "SELECT id, user_id, pet_type_id, name, stage, mood_score, total_exp, level, is_active, created_at, updated_at 
         FROM pets WHERE user_id = ? ORDER BY is_active DESC, created_at ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(pets)
}

/// 特定のペットを取得
async fn find_pet_by_id(pool: &MySqlPool, pet_id: i64, user_id: i64) -> Result<Option<Pet>, AppError> {
    let pet: Option<Pet> = sqlx::query_as(
        "SELECT id, user_id, pet_type_id, name, stage, mood_score, total_exp, level, is_active, created_at, updated_at 
         FROM pets WHERE id = ? AND user_id = ?",
    )
    .bind(pet_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(pet)
}

/// ユーザーの解放済みペット種類を取得
async fn get_user_unlocks(pool: &MySqlPool, user_id: i64) -> Result<Vec<UserPetUnlock>, AppError> {
    let unlocks: Vec<UserPetUnlock> = sqlx::query_as(
        "SELECT id, user_id, pet_type_id, unlocked_at FROM user_pet_unlocks WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(unlocks)
}

/// ペットのステージとムードを更新
async fn update_pet_state(
    pool: &MySqlPool,
    pet_id: i64,
    new_stage: i32,
    new_mood: i32,
    new_level: i32,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE pets SET stage = ?, mood_score = ?, level = ?, updated_at = NOW() WHERE id = ?",
    )
    .bind(new_stage)
    .bind(new_mood)
    .bind(new_level)
    .bind(pet_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// ステージに応じた画像URLを取得
fn get_image_for_stage(pet_type: &PetType, stage: i32) -> Option<String> {
    match stage {
        1 => pet_type.image_egg.clone(),
        2 => pet_type.image_child.clone(),
        3 => pet_type.image_adult.clone(),
        _ => None,
    }
}

/// PetTypeをレスポンス用に変換
fn to_pet_type_response(pt: &PetType) -> PetTypeResponse {
    PetTypeResponse {
        id: pt.id,
        name: pt.name.clone(),
        code: pt.code.clone(),
        description: pt.description.clone(),
        image_egg: pt.image_egg.clone(),
        image_child: pt.image_child.clone(),
        image_adult: pt.image_adult.clone(),
        background_image: pt.background_image.clone(),
        unlock_type: pt.unlock_type.clone(),
        unlock_level: pt.unlock_level,
        unlock_pet_code: pt.unlock_pet_code.clone(),
        is_starter: pt.is_starter,
    }
}

/// ペット情報を取得する内部ロジック（ペット独自レベル版）
async fn build_pet_response(
    pool: &MySqlPool,
    pet: Pet,
) -> Result<PetResponse, AppError> {
    // UserStreak から最終アクティブ日取得
    let streak = get_or_create_streak(pool, pet.user_id, "training").await?;

    // ムード再計算（オンデマンド）
    let new_mood = Pet::calculate_mood(streak.last_active_date);

    // ペットのレベルから新ステージを計算
    let new_level = Pet::calculate_level(pet.total_exp);
    let new_stage = Pet::calculate_stage(new_level);

    // 変更があれば更新
    if pet.stage != new_stage || pet.mood_score != new_mood || pet.level != new_level {
        update_pet_state(pool, pet.id, new_stage, new_mood, new_level).await?;
    }

    // レベル進捗計算（ペット独自EXP）
    let current_level_exp = UserStats::get_required_exp_for_level(new_level);
    let next_level_exp = UserStats::get_required_exp_for_level(new_level + 1);
    let exp_in_current_level = pet.total_exp - current_level_exp;
    let exp_needed = next_level_exp - current_level_exp;
    let level_progress = if exp_needed > 0 {
        exp_in_current_level as f64 / exp_needed as f64
    } else {
        1.0
    };
    let exp_to_next = UserStats::get_exp_to_next_level(new_level);

    // ペット種類情報取得
    let pet_type = get_pet_type(pool, pet.pet_type_id).await?;
    let image_url = pet_type.as_ref().and_then(|pt| get_image_for_stage(pt, new_stage));
    let pet_type_code = pet_type.as_ref().map(|pt| pt.code.clone());

    Ok(PetResponse {
        id: pet.id,
        name: pet.name,
        pet_type_id: pet.pet_type_id,
        pet_type_code,
        pet_type: pet_type.as_ref().map(to_pet_type_response),
        stage: new_stage,
        stage_name: Pet::get_stage_name(new_stage).to_string(),
        level: new_level,
        total_exp: pet.total_exp,
        exp_to_next_level: exp_to_next,
        level_progress,
        mood_score: new_mood,
        mood_label: Pet::get_mood_label(new_mood).to_string(),
        image_url,
        is_active: pet.is_active,
        created_at: pet.created_at.map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string()),
    })
}

/// 解放条件の進捗テキストを生成
fn get_unlock_progress(pt: &PetType, user_level: i32, adult_pet_codes: &[String]) -> String {
    let unlock_type = pt.unlock_type.as_deref().unwrap_or("default");
    match unlock_type {
        "user_level" => {
            let required = pt.unlock_level.unwrap_or(1);
            if user_level >= required {
                "解放可能".to_string()
            } else {
                format!("ユーザーLv.{}で解放 (現在Lv.{})", required, user_level)
            }
        }
        "pet_growth" => {
            let required_code = pt.unlock_pet_code.as_deref().unwrap_or("");
            if adult_pet_codes.contains(&required_code.to_string()) {
                "解放可能".to_string()
            } else {
                format!("{}を成熟期(Lv.31+)まで育てると解放", required_code)
            }
        }
        _ => "解放可能".to_string(),
    }
}

// ============================================
// API Handlers
// ============================================

/// GET /api/pet-types
/// 選択可能なペット種類一覧を取得（解放条件含む）
#[get("/pet-types")]
pub async fn get_pet_types(
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    let pet_types = get_all_pet_types(pool.get_ref()).await?;
    let response: Vec<PetTypeResponse> = pet_types.iter().map(to_pet_type_response).collect();
    Ok(HttpResponse::Ok().json(response))
}

/// GET /api/pet
/// アクティブペット情報を取得（旧API互換）
#[get("/pet")]
pub async fn get_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    
    let pet = find_active_pet(pool.get_ref(), session_user.id).await?;
    
    match pet {
        Some(p) => {
            let response = build_pet_response(pool.get_ref(), p).await?;
            Ok(HttpResponse::Ok().json(PetStatusResponse {
                has_pet: true,
                pet: Some(response),
            }))
        }
        None => {
            Ok(HttpResponse::Ok().json(PetStatusResponse {
                has_pet: false,
                pet: None,
            }))
        }
    }
}

/// GET /api/pet/barn
/// 小屋情報を取得（全所持ペット + 解放状況）
#[get("/pet/barn")]
pub async fn get_barn(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    // ユーザーのレベル取得
    let stats: Option<(i64, i32)> = sqlx::query_as(
        "SELECT total_exp, level FROM user_stats WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool.get_ref())
    .await?;
    let user_level = stats.map(|(_, l)| l).unwrap_or(1);

    // 全ペット取得
    let pets = find_all_pets_by_user(pool.get_ref(), user_id).await?;
    
    // アクティブペットを探す
    let active_pet = pets.iter().find(|p| p.is_active);
    let active_pet_response = match active_pet {
        Some(p) => Some(build_pet_response(pool.get_ref(), p.clone()).await?),
        None => None,
    };

    // 所持ペット一覧
    let mut owned_pets = Vec::new();
    for p in &pets {
        owned_pets.push(build_pet_response(pool.get_ref(), p.clone()).await?);
    }

    // 成熟済みペットのコード一覧（解放条件判定用）
    let adult_pet_codes: Vec<String> = pets
        .iter()
        .filter(|p| p.stage >= 3 || Pet::calculate_stage(Pet::calculate_level(p.total_exp)) >= 3)
        .filter_map(|p| {
            // pet_type_idからcodeを取得する必要があるが、ここでは別途処理
            None::<String>
        })
        .collect();
    
    // 成熟済みペットのコードを実際に取得
    let mut adult_codes: Vec<String> = Vec::new();
    for p in &pets {
        let level = Pet::calculate_level(p.total_exp);
        if Pet::calculate_stage(level) >= 3 {
            if let Some(pt) = get_pet_type(pool.get_ref(), p.pet_type_id).await? {
                adult_codes.push(pt.code);
            }
        }
    }

    // 全ペット種類取得
    let all_types = get_all_pet_types(pool.get_ref()).await?;
    
    // ユーザーの解放済みペット種類ID
    let unlocks = get_user_unlocks(pool.get_ref(), user_id).await?;
    let unlocked_type_ids: Vec<i32> = unlocks.iter().map(|u| u.pet_type_id).collect();
    
    // 所持済みペット種類ID
    let owned_type_ids: Vec<i32> = pets.iter().map(|p| p.pet_type_id).collect();

    // 解放済み（未所持含む）と未解放を分類
    let mut unlocked_types = Vec::new();
    let mut locked_types = Vec::new();

    for pt in &all_types {
        let is_unlocked = unlocked_type_ids.contains(&pt.id) 
            || pt.is_starter.unwrap_or(false)
            || pt.unlock_type.as_deref() == Some("default");
        
        if is_unlocked {
            // 解放済み（未所持のものだけ表示）
            if !owned_type_ids.contains(&pt.id) {
                unlocked_types.push(to_pet_type_response(pt));
            }
        } else {
            // 未解放
            let progress = get_unlock_progress(pt, user_level, &adult_codes);
            locked_types.push(LockedPetTypeResponse {
                id: pt.id,
                name: pt.name.clone(),
                code: pt.code.clone(),
                description: pt.description.clone(),
                image_egg: pt.image_egg.clone(),
                background_image: pt.background_image.clone(),
                unlock_type: pt.unlock_type.clone(),
                unlock_level: pt.unlock_level,
                unlock_pet_code: pt.unlock_pet_code.clone(),
                unlock_progress: progress,
            });
        }
    }

    Ok(HttpResponse::Ok().json(BarnResponse {
        active_pet: active_pet_response,
        owned_pets,
        unlocked_types,
        locked_types,
    }))
}

/// POST /api/pet
/// ペットを作成（新しい卵を入手）
#[post("/pet")]
pub async fn create_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<CreatePetRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    // ペット種類の存在確認
    let pet_type = get_pet_type(pool.get_ref(), body.pet_type_id).await?
        .ok_or_else(|| AppError::BadRequest("無効なペット種類です".to_string()))?;

    // 解放済みかチェック
    let unlocks = get_user_unlocks(pool.get_ref(), user_id).await?;
    let is_unlocked = unlocks.iter().any(|u| u.pet_type_id == body.pet_type_id)
        || pet_type.is_starter.unwrap_or(false)
        || pet_type.unlock_type.as_deref() == Some("default");

    if !is_unlocked {
        return Err(AppError::BadRequest("このペット種類はまだ解放されていません".to_string()));
    }

    // 同じ種類のペットを既に所持していないかチェック
    let pets = find_all_pets_by_user(pool.get_ref(), user_id).await?;
    if pets.iter().any(|p| p.pet_type_id == body.pet_type_id) {
        return Err(AppError::BadRequest("このペット種類は既に所持しています".to_string()));
    }

    // 名前のバリデーション
    let name = match &body.name {
        Some(n) => {
            let trimmed = n.trim();
            if trimmed.is_empty() || trimmed.len() > 50 {
                return Err(AppError::BadRequest("名前は1〜50文字で入力してください".to_string()));
            }
            trimmed.to_string()
        }
        None => "パートナー".to_string(),
    };

    // 既存のアクティブペットがあれば解除
    sqlx::query("UPDATE pets SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 新ペット作成（レベル1、EXP0、アクティブ）
    sqlx::query(
        "INSERT INTO pets (user_id, pet_type_id, name, stage, mood_score, total_exp, level, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, 1, 100, 0, 1, TRUE, NOW(), NOW())",
    )
    .bind(user_id)
    .bind(body.pet_type_id)
    .bind(&name)
    .execute(pool.get_ref())
    .await?;

    // 作成したペットを取得して返す
    let pet = find_active_pet(pool.get_ref(), user_id).await?
        .ok_or_else(|| AppError::InternalError("ペットの作成に失敗しました".to_string()))?;
    
    let response = build_pet_response(pool.get_ref(), pet).await?;
    Ok(HttpResponse::Created().json(PetStatusResponse {
        has_pet: true,
        pet: Some(response),
    }))
}

/// PUT /api/pet/{id}/activate
/// 指定ペットをアクティブにする
#[put("/pet/{id}/activate")]
pub async fn activate_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;
    let pet_id = path.into_inner();

    // 対象ペットが存在するか確認
    let pet = find_pet_by_id(pool.get_ref(), pet_id, user_id).await?
        .ok_or_else(|| AppError::BadRequest("パートナーが見つかりません".to_string()))?;

    // 全ペットのis_activeをFALSEに
    sqlx::query("UPDATE pets SET is_active = FALSE WHERE user_id = ?")
        .bind(user_id)
        .execute(pool.get_ref())
        .await?;

    // 対象ペットをアクティブに
    sqlx::query("UPDATE pets SET is_active = TRUE, updated_at = NOW() WHERE id = ?")
        .bind(pet_id)
        .execute(pool.get_ref())
        .await?;

    tracing::info!("[PUT /pet/{}/activate] user_id={}", pet_id, user_id);

    // 更新後のペット情報を返す
    let updated_pet = find_pet_by_id(pool.get_ref(), pet_id, user_id).await?
        .ok_or_else(|| AppError::InternalError("ペットの取得に失敗しました".to_string()))?;
    
    let response = build_pet_response(pool.get_ref(), updated_pet).await?;
    Ok(HttpResponse::Ok().json(PetStatusResponse {
        has_pet: true,
        pet: Some(response),
    }))
}

/// PUT /api/pet/{id}
/// ペット情報を更新（名前変更など）
#[put("/pet/{id}")]
pub async fn update_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
    path: web::Path<i64>,
    body: web::Json<UpdatePetRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;
    let pet_id = path.into_inner();

    // ペット取得
    let pet = find_pet_by_id(pool.get_ref(), pet_id, user_id).await?
        .ok_or_else(|| AppError::BadRequest("パートナーが見つかりません".to_string()))?;

    // 名前更新
    if let Some(ref new_name) = body.name {
        let trimmed = new_name.trim();
        if trimmed.is_empty() || trimmed.len() > 50 {
            return Err(AppError::BadRequest("名前は1〜50文字で入力してください".to_string()));
        }

        sqlx::query("UPDATE pets SET name = ?, updated_at = NOW() WHERE id = ?")
            .bind(trimmed)
            .bind(pet.id)
            .execute(pool.get_ref())
            .await?;
    }

    // 更新後のペット情報を返す
    let updated_pet = find_pet_by_id(pool.get_ref(), pet_id, user_id).await?
        .ok_or_else(|| AppError::InternalError("ペットの取得に失敗しました".to_string()))?;
    
    let response = build_pet_response(pool.get_ref(), updated_pet).await?;
    Ok(HttpResponse::Ok().json(PetStatusResponse {
        has_pet: true,
        pet: Some(response),
    }))
}

/// PUT /api/pet (旧API互換 - アクティブペットの名前変更)
#[put("/pet")]
pub async fn update_active_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
    body: web::Json<UpdatePetRequest>,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    // アクティブペット取得
    let pet = find_active_pet(pool.get_ref(), user_id).await?
        .ok_or_else(|| AppError::BadRequest("アクティブなパートナーがいません".to_string()))?;

    // 名前更新
    if let Some(ref new_name) = body.name {
        let trimmed = new_name.trim();
        if trimmed.is_empty() || trimmed.len() > 50 {
            return Err(AppError::BadRequest("名前は1〜50文字で入力してください".to_string()));
        }

        sqlx::query("UPDATE pets SET name = ?, updated_at = NOW() WHERE id = ?")
            .bind(trimmed)
            .bind(pet.id)
            .execute(pool.get_ref())
            .await?;
    }

    // 更新後のペット情報を返す
    let updated_pet = find_active_pet(pool.get_ref(), user_id).await?
        .ok_or_else(|| AppError::InternalError("ペットの取得に失敗しました".to_string()))?;
    
    let response = build_pet_response(pool.get_ref(), updated_pet).await?;
    Ok(HttpResponse::Ok().json(PetStatusResponse {
        has_pet: true,
        pet: Some(response),
    }))
}

/// DELETE /api/pet
/// アクティブペットを小屋に戻す（削除ではない）
#[delete("/pet")]
pub async fn deactivate_pet(
    pool: web::Data<MySqlPool>,
    session: Session,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;
    let user_id = session_user.id;

    // アクティブペット取得
    let pet = find_active_pet(pool.get_ref(), user_id).await?
        .ok_or_else(|| AppError::BadRequest("アクティブなパートナーがいません".to_string()))?;

    // アクティブを解除（小屋に戻す）
    sqlx::query("UPDATE pets SET is_active = FALSE, updated_at = NOW() WHERE id = ?")
        .bind(pet.id)
        .execute(pool.get_ref())
        .await?;

    tracing::info!("[DELETE /pet] user_id={} deactivated pet_id={}", user_id, pet.id);

    Ok(HttpResponse::Ok().json(PetStatusResponse {
        has_pet: false,
        pet: None,
    }))
}

/// アクティブペットに経験値を付与し、レベルアップを処理する
/// 戻り値: (新レベル, レベルアップしたか, 成熟したか)
pub async fn add_exp_to_active_pet(
    pool: &MySqlPool,
    user_id: i64,
    exp_amount: i64,
) -> Result<Option<(i32, bool, bool)>, AppError> {
    if exp_amount <= 0 {
        return Ok(None);
    }

    // アクティブペット取得
    let pet = find_active_pet(pool, user_id).await?;
    let pet = match pet {
        Some(p) => p,
        None => return Ok(None), // アクティブペットがいない場合はスキップ
    };

    // 経験値を加算
    let new_total_exp = pet.total_exp + exp_amount;
    let old_level = Pet::calculate_level(pet.total_exp);
    let new_level = Pet::calculate_level(new_total_exp);
    let old_stage = Pet::calculate_stage(old_level);
    let new_stage = Pet::calculate_stage(new_level);
    
    let level_up = new_level > old_level;
    let matured = new_stage >= 3 && old_stage < 3; // 成熟期に到達

    // ペットを更新
    sqlx::query(
        "UPDATE pets SET total_exp = ?, level = ?, stage = ?, updated_at = NOW() WHERE id = ?"
    )
    .bind(new_total_exp)
    .bind(new_level)
    .bind(new_stage)
    .bind(pet.id)
    .execute(pool)
    .await?;

    tracing::debug!(
        "[PET EXP] user_id={} pet_id={} +{} exp, level {} -> {}, stage {} -> {}",
        user_id, pet.id, exp_amount, old_level, new_level, old_stage, new_stage
    );

    Ok(Some((new_level, level_up, matured)))
}

/// POST /api/pet/unlock-check
/// 解放条件をチェックして新規解放があれば追加
pub async fn check_and_unlock_pet_types(
    pool: &MySqlPool,
    user_id: i64,
) -> Result<Vec<String>, AppError> {
    let mut newly_unlocked = Vec::new();

    // ユーザーのレベル取得
    let stats: Option<(i64, i32)> = sqlx::query_as(
        "SELECT total_exp, level FROM user_stats WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let user_level = stats.map(|(_, l)| l).unwrap_or(1);

    // 成熟済みペットのコード取得
    let pets = find_all_pets_by_user(pool, user_id).await?;
    let mut adult_codes: Vec<String> = Vec::new();
    for p in &pets {
        let level = Pet::calculate_level(p.total_exp);
        if Pet::calculate_stage(level) >= 3 {
            if let Some(pt) = get_pet_type(pool, p.pet_type_id).await? {
                adult_codes.push(pt.code);
            }
        }
    }

    // 既存の解放済み
    let unlocks = get_user_unlocks(pool, user_id).await?;
    let unlocked_ids: Vec<i32> = unlocks.iter().map(|u| u.pet_type_id).collect();

    // 全ペット種類チェック
    let all_types = get_all_pet_types(pool).await?;
    for pt in &all_types {
        if unlocked_ids.contains(&pt.id) || pt.is_starter.unwrap_or(false) {
            continue;
        }

        let unlock_type = pt.unlock_type.as_deref().unwrap_or("default");
        let should_unlock = match unlock_type {
            "user_level" => {
                let required = pt.unlock_level.unwrap_or(1);
                user_level >= required
            }
            "pet_growth" => {
                let required_code = pt.unlock_pet_code.as_deref().unwrap_or("");
                adult_codes.contains(&required_code.to_string())
            }
            "default" => true,
            _ => false,
        };

        if should_unlock {
            // 解放を追加
            sqlx::query(
                "INSERT IGNORE INTO user_pet_unlocks (user_id, pet_type_id, unlocked_at) VALUES (?, ?, NOW())"
            )
            .bind(user_id)
            .bind(pt.id)
            .execute(pool)
            .await?;

            newly_unlocked.push(pt.name.clone());
            tracing::info!("[UNLOCK] user_id={} unlocked pet_type: {}", user_id, pt.name);
        }
    }

    Ok(newly_unlocked)
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_pet_types)
        .service(get_pet)
        .service(get_barn)
        .service(create_pet)
        .service(activate_pet)
        .service(update_pet)
        .service(update_active_pet)
        .service(deactivate_pet);
}
