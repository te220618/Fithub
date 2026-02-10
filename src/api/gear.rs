//! ギアAPIハンドラ

use actix_session::Session;
use actix_web::{get, post, web, HttpResponse};
use serde::Serialize;
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::{GearCategory, GearFeature, GearType};
use crate::error::AppError;

#[derive(Serialize)]
struct GearCategoryResponse {
    id: i32,
    name: String,
    description: Option<String>,
    #[serde(rename = "iconPath")]
    icon_path: Option<String>,
    #[serde(rename = "iconColor")]
    icon_color: Option<String>,
    #[serde(rename = "typeCount")]
    type_count: i64,
}

#[derive(Serialize)]
struct GearTypeResponse {
    id: i32,
    name: String,
    #[serde(rename = "priceRange")]
    price_range: Option<String>,
    #[serde(rename = "categoryId")]
    category_id: i32,
    merits: Vec<String>,
    demerits: Vec<String>,
}

/// GET /api/gear/categories
#[get("/gear/categories")]
async fn get_categories(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let categories = sqlx::query_as::<_, GearCategory>(
        r#"SELECT id, name, description, icon_svg, icon_path, icon_color, display_order 
           FROM gear_categories ORDER BY display_order ASC, id ASC"#,
    )
    .fetch_all(pool.get_ref())
    .await?;

    let mut responses: Vec<GearCategoryResponse> = Vec::new();

    for c in categories {
        let type_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM gear_types WHERE category_id = ?")
                .bind(c.id)
                .fetch_one(pool.get_ref())
                .await
                .unwrap_or((0,));

        responses.push(GearCategoryResponse {
            id: c.id,
            name: c.name,
            description: c.description,
            icon_path: c.icon_path,
            icon_color: c.icon_color,
            type_count: type_count.0,
        });
    }

    Ok(HttpResponse::Ok().json(responses))
}

/// GET /api/gear/category/{id}/types
#[get("/gear/category/{id}/types")]
async fn get_types_by_category(
    session: Session,
    pool: web::Data<MySqlPool>,
    path: web::Path<i32>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let category_id = path.into_inner();

    let types = sqlx::query_as::<_, GearType>(
        r#"SELECT id, category_id, name, price_range, display_order 
           FROM gear_types WHERE category_id = ? ORDER BY display_order ASC, id ASC"#,
    )
    .bind(category_id)
    .fetch_all(pool.get_ref())
    .await?;

    let mut responses: Vec<GearTypeResponse> = Vec::new();

    for gear_type in types {
        let features = sqlx::query_as::<_, GearFeature>(
            r#"SELECT id, gear_type_id, feature_type, description, display_order 
               FROM gear_features WHERE gear_type_id = ? ORDER BY display_order ASC, id ASC"#,
        )
        .bind(gear_type.id)
        .fetch_all(pool.get_ref())
        .await?;

        let merits: Vec<String> = features
            .iter()
            .filter(|f| f.feature_type.to_lowercase() == "merit")
            .map(|f| f.description.clone())
            .collect();

        let demerits: Vec<String> = features
            .iter()
            .filter(|f| f.feature_type.to_lowercase() == "demerit")
            .map(|f| f.description.clone())
            .collect();

        responses.push(GearTypeResponse {
            id: gear_type.id,
            name: gear_type.name,
            price_range: gear_type.price_range,
            category_id: gear_type.category_id,
            merits,
            demerits,
        });
    }

    Ok(HttpResponse::Ok().json(responses))
}

/// POST /api/gear/clear-cache - 管理者のみ
#[post("/gear/clear-cache")]
async fn clear_cache() -> Result<HttpResponse, AppError> {
    // TODO: 管理者権限をチェック
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_categories)
        .service(get_types_by_category)
        .service(clear_cache);
}
