//! サプリメントAPIハンドラ

use actix_session::Session;
use actix_web::{get, web, HttpResponse};
use serde::Serialize;
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::{Category, Effect, Supplement, SupplementLink};
use crate::error::AppError;

#[derive(Serialize)]
struct CategoryResponse {
    id: i32,
    code: String,
    name: String,
    description: Option<String>,
}

#[derive(Serialize)]
struct SupplementResponse {
    id: i32,
    name: String,
    tier: String,
    description: String,
    dosage: Option<String>,
    timing: Option<String>,
    advice: Option<String>,
    display_order: Option<i32>,
    effects: Vec<EffectResponse>,
    links: Vec<LinkResponse>,
}

#[derive(Serialize)]
struct EffectResponse {
    id: i32,
    effect_text: String,
    display_order: Option<i32>,
}

#[derive(Serialize)]
struct LinkResponse {
    id: i32,
    url: String,
    description: Option<String>,
    site_type: Option<String>,
    display_order: Option<i32>,
}

/// GET /api/supplements/categories
#[get("/supplements/categories")]
async fn get_categories(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let categories = sqlx::query_as::<_, Category>(
        r#"SELECT id, code, name, description FROM categories ORDER BY id ASC"#,
    )
    .fetch_all(pool.get_ref())
    .await?;

    let responses: Vec<CategoryResponse> = categories
        .into_iter()
        .map(|c| CategoryResponse {
            id: c.id,
            code: c.code,
            name: c.name,
            description: c.description,
        })
        .collect();

    Ok(HttpResponse::Ok().json(responses))
}

/// GET /api/supplements/category/{code}
#[get("/supplements/category/{code}")]
async fn get_supplements_by_category(
    session: Session,
    pool: web::Data<MySqlPool>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let code = path.into_inner();

    // "all"カテゴリの処理 - 全サプリメントを返す
    let supplements = if code == "all" {
        sqlx::query_as::<_, Supplement>(
            r#"SELECT id, category_id, name, tier, description, dosage, timing, advice, display_order, is_active 
               FROM supplements WHERE is_active = 1 
               ORDER BY CASE tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 ELSE 5 END ASC, display_order ASC, id ASC"#
        )
        .fetch_all(pool.get_ref())
        .await?
    } else {
        // まずカテゴリを検索
        let category = sqlx::query_as::<_, Category>(
            r#"SELECT id, code, name, description FROM categories WHERE code = ?"#,
        )
        .bind(&code)
        .fetch_optional(pool.get_ref())
        .await?;

        let category = match category {
            Some(c) => c,
            None => return Err(AppError::NotFound(format!("Category not found: {}", code))),
        };

        sqlx::query_as::<_, Supplement>(
            r#"SELECT id, category_id, name, tier, description, dosage, timing, advice, display_order, is_active 
               FROM supplements WHERE category_id = ? AND is_active = 1 
               ORDER BY CASE tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 ELSE 5 END ASC, display_order ASC, id ASC"#
        )
        .bind(category.id)
        .fetch_all(pool.get_ref())
        .await?
    };

    let mut responses: Vec<SupplementResponse> = Vec::new();

    for supp in supplements {
        let effects = sqlx::query_as::<_, Effect>(
            r#"SELECT id, supplement_id, effect_text, display_order 
               FROM effects WHERE supplement_id = ? ORDER BY display_order ASC, id ASC"#,
        )
        .bind(supp.id)
        .fetch_all(pool.get_ref())
        .await?;

        let effect_responses: Vec<EffectResponse> = effects
            .into_iter()
            .map(|e| EffectResponse {
                id: e.id,
                effect_text: e.effect_text,
                display_order: e.display_order,
            })
            .collect();

        let links = sqlx::query_as::<_, SupplementLink>(
            r#"SELECT id, supplement_id, url, description, site_type, display_order 
               FROM supplement_links WHERE supplement_id = ? ORDER BY display_order ASC, id ASC"#,
        )
        .bind(supp.id)
        .fetch_all(pool.get_ref())
        .await?;

        let link_responses: Vec<LinkResponse> = links
            .into_iter()
            .map(|l| LinkResponse {
                id: l.id,
                url: l.url,
                description: l.description,
                site_type: l.site_type,
                display_order: l.display_order,
            })
            .collect();

        responses.push(SupplementResponse {
            id: supp.id,
            name: supp.name,
            tier: supp.tier,
            description: supp.description,
            dosage: supp.dosage,
            timing: supp.timing,
            advice: supp.advice,
            display_order: supp.display_order,
            effects: effect_responses,
            links: link_responses,
        });
    }

    Ok(HttpResponse::Ok().json(responses))
}

/// GET /api/supplements/{id}
#[get("/supplements/{id}")]
async fn get_supplement_by_id(
    session: Session,
    pool: web::Data<MySqlPool>,
    path: web::Path<i32>,
) -> Result<HttpResponse, AppError> {
    // Require authentication
    let _user = get_current_user(&session)?;

    let id = path.into_inner();

    let supplement = sqlx::query_as::<_, Supplement>(
        r#"SELECT id, category_id, name, tier, description, dosage, timing, advice, display_order, is_active 
           FROM supplements WHERE id = ?"#
    )
    .bind(id)
    .fetch_optional(pool.get_ref())
    .await?;

    let supplement = match supplement {
        Some(s) => s,
        None => return Err(AppError::NotFound(format!("Supplement not found: {}", id))),
    };

    let effects = sqlx::query_as::<_, Effect>(
        r#"SELECT id, supplement_id, effect_text, display_order 
           FROM effects WHERE supplement_id = ? ORDER BY display_order ASC, id ASC"#,
    )
    .bind(id)
    .fetch_all(pool.get_ref())
    .await?;

    let effect_responses: Vec<EffectResponse> = effects
        .into_iter()
        .map(|e| EffectResponse {
            id: e.id,
            effect_text: e.effect_text,
            display_order: e.display_order,
        })
        .collect();

    let links = sqlx::query_as::<_, SupplementLink>(
        r#"SELECT id, supplement_id, url, description, site_type, display_order 
           FROM supplement_links WHERE supplement_id = ? ORDER BY display_order ASC, id ASC"#,
    )
    .bind(id)
    .fetch_all(pool.get_ref())
    .await?;

    let link_responses: Vec<LinkResponse> = links
        .into_iter()
        .map(|l| LinkResponse {
            id: l.id,
            url: l.url,
            description: l.description,
            site_type: l.site_type,
            display_order: l.display_order,
        })
        .collect();

    Ok(HttpResponse::Ok().json(SupplementResponse {
        id: supplement.id,
        name: supplement.name,
        tier: supplement.tier,
        description: supplement.description,
        dosage: supplement.dosage,
        timing: supplement.timing,
        advice: supplement.advice,
        display_order: supplement.display_order,
        effects: effect_responses,
        links: link_responses,
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_categories)
        .service(get_supplements_by_category)
        .service(get_supplement_by_id);
}
