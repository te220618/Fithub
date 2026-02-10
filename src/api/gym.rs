//! ジムAPIハンドラ

use actix_session::Session;
use actix_web::{get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;

use crate::auth::session::get_current_user;
use crate::db::models::Tag;
use crate::error::AppError;

// ============================================
// DTOs
// ============================================

#[derive(Deserialize)]
pub struct GymSearchQuery {
    tags: Option<String>, // カンマ区切りのタグ名
    #[serde(rename = "maxPrice")]
    max_price: Option<i32>,
    search: Option<String>,
    areas: Option<String>, // カンマ区切りのエリア
    page: Option<i32>,
    size: Option<i32>,
}

#[derive(Serialize)]
struct GymDto {
    id: i64,
    name: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    #[serde(rename = "priceRange")]
    price_range: Option<i32>,
    #[serde(rename = "openHours")]
    open_hours: Option<String>,
    area: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    tags: Vec<TagDto>,
}

#[derive(Serialize, Clone)]
struct TagDto {
    id: i64,
    name: Option<String>,
}

#[derive(Serialize)]
struct GymPagedResponse {
    gyms: Vec<GymDto>,
    count: i32,
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

#[derive(Serialize)]
struct TagListDto {
    id: i64,
    name: Option<String>,
    #[serde(rename = "displayOrder")]
    display_order: Option<i32>,
}

// ============================================
// データベース行型
// ============================================

#[derive(sqlx::FromRow)]
struct GymRow {
    id: i64,
    name: Option<String>,
    address: Option<String>,
    phone: Option<String>,
    price_range: Option<i32>,
    open_hours: Option<String>,
    area: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct GymTagRow {
    gym_id: i64,
    tag_id: i64,
    tag_name: Option<String>,
}

// ============================================
// ハンドラ
// ============================================

/// GET /api/gyms/search/paged - フィルタリング付きページネーションジム検索
#[get("/gyms/search/paged")]
async fn search_gyms_paged(
    session: Session,
    pool: web::Data<MySqlPool>,
    query: web::Query<GymSearchQuery>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let page = query.page.unwrap_or(0);
    let size = query.size.unwrap_or(24);
    let offset = page * size;

    // フィルターパラメータをパース
    let tag_names: Vec<String> = query
        .tags
        .as_ref()
        .map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let area_list: Vec<String> = query
        .areas
        .as_ref()
        .map(|a| {
            a.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let search_query = query
        .search
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("%{}%", s.trim().to_lowercase()));

    let max_price = query.max_price;
    let tag_count = tag_names.len() as i64;

    // ジムID用の動的クエリを構築
    // このアプローチはSpring Data JPAのタグAND条件クエリを模倣
    let gym_ids: Vec<(i64,)> = if tag_names.is_empty()
        && area_list.is_empty()
        && search_query.is_none()
        && max_price.is_none()
    {
        // フィルターなし - シンプルなページネーション
        sqlx::query_as(r#"SELECT id FROM gyms ORDER BY id ASC LIMIT ? OFFSET ?"#)
            .bind(size)
            .bind(offset)
            .fetch_all(pool.get_ref())
            .await?
    } else {
        // 動的クエリを構築
        let mut conditions = Vec::new();
        let mut query_str = String::from(
            r#"SELECT g.id FROM gyms g
               LEFT JOIN gym_tags gt ON g.id = gt.gym_id
               LEFT JOIN tags t ON gt.tag_id = t.id
               WHERE 1=1"#,
        );

        if max_price.is_some() {
            conditions.push("max_price");
            query_str.push_str(" AND (g.price_range IS NULL OR g.price_range <= ?)");
        }

        if search_query.is_some() {
            conditions.push("search");
            query_str.push_str(" AND (LOWER(g.name) LIKE ? OR LOWER(g.address) LIKE ?)");
        }

        if !area_list.is_empty() {
            query_str.push_str(&format!(
                " AND g.area IN ({})",
                area_list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
        }

        query_str.push_str(" GROUP BY g.id");

        if !tag_names.is_empty() {
            // タグAND条件: ジムは指定された全てのタグを持つ必要がある
            query_str.push_str(&format!(
                " HAVING COUNT(DISTINCT CASE WHEN t.name IN ({}) THEN t.name END) = ?",
                tag_names.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
        }

        query_str.push_str(" ORDER BY g.id ASC LIMIT ? OFFSET ?");

        // 動的クエリを構築して実行
        let mut q = sqlx::query_as::<_, (i64,)>(&query_str);

        if let Some(mp) = max_price {
            q = q.bind(mp);
        }

        if let Some(ref sq) = search_query {
            q = q.bind(sq);
            q = q.bind(sq);
        }

        for area in &area_list {
            q = q.bind(area);
        }

        for tag in &tag_names {
            q = q.bind(tag);
        }

        if !tag_names.is_empty() {
            q = q.bind(tag_count);
        }

        q = q.bind(size);
        q = q.bind(offset);

        q.fetch_all(pool.get_ref()).await?
    };

    // ページネーション用の合計数を取得
    let total: (i64,) = if tag_names.is_empty()
        && area_list.is_empty()
        && search_query.is_none()
        && max_price.is_none()
    {
        sqlx::query_as("SELECT COUNT(*) FROM gyms")
            .fetch_one(pool.get_ref())
            .await?
    } else {
        // 同じ条件でカウントクエリを構築
        let mut count_query = String::from(
            r#"SELECT COUNT(DISTINCT g.id) FROM gyms g
               LEFT JOIN gym_tags gt ON g.id = gt.gym_id
               LEFT JOIN tags t ON gt.tag_id = t.id
               WHERE 1=1"#,
        );

        if max_price.is_some() {
            count_query.push_str(" AND (g.price_range IS NULL OR g.price_range <= ?)");
        }

        if search_query.is_some() {
            count_query.push_str(" AND (LOWER(g.name) LIKE ? OR LOWER(g.address) LIKE ?)");
        }

        if !area_list.is_empty() {
            count_query.push_str(&format!(
                " AND g.area IN ({})",
                area_list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
            ));
        }

        if !tag_names.is_empty() {
            // タグフィルター付きのカウントはサブクエリを使用
            let tag_placeholders = tag_names.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            count_query = format!(
                r#"SELECT COUNT(*) FROM (
                    SELECT g.id FROM gyms g
                    LEFT JOIN gym_tags gt ON g.id = gt.gym_id
                    LEFT JOIN tags t ON gt.tag_id = t.id
                    WHERE 1=1
                    {} {} {}
                    GROUP BY g.id
                    HAVING COUNT(DISTINCT CASE WHEN t.name IN ({}) THEN t.name END) = ?
                ) AS filtered"#,
                if max_price.is_some() {
                    "AND (g.price_range IS NULL OR g.price_range <= ?)"
                } else {
                    ""
                },
                if search_query.is_some() {
                    "AND (LOWER(g.name) LIKE ? OR LOWER(g.address) LIKE ?)"
                } else {
                    ""
                },
                if !area_list.is_empty() {
                    format!(
                        "AND g.area IN ({})",
                        area_list.iter().map(|_| "?").collect::<Vec<_>>().join(",")
                    )
                } else {
                    String::new()
                },
                tag_placeholders
            );
        }

        let mut cq = sqlx::query_as::<_, (i64,)>(&count_query);

        if let Some(mp) = max_price {
            cq = cq.bind(mp);
        }

        if let Some(ref sq) = search_query {
            cq = cq.bind(sq);
            cq = cq.bind(sq);
        }

        for area in &area_list {
            cq = cq.bind(area);
        }

        for tag in &tag_names {
            cq = cq.bind(tag);
        }

        if !tag_names.is_empty() {
            cq = cq.bind(tag_count);
        }

        cq.fetch_one(pool.get_ref()).await?
    };

    if gym_ids.is_empty() {
        return Ok(HttpResponse::Ok().json(GymPagedResponse {
            gyms: vec![],
            count: 0,
            page,
            size,
            total_elements: 0,
            total_pages: 0,
            has_next: false,
            has_previous: page > 0,
        }));
    }

    // ジム詳細を取得
    let id_list: Vec<i64> = gym_ids.iter().map(|(id,)| *id).collect();
    let placeholders = id_list.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let gym_query = format!(
        "SELECT id, name, address, phone, price_range, open_hours, area, latitude, longitude FROM gyms WHERE id IN ({}) ORDER BY id",
        placeholders
    );

    let mut gq = sqlx::query_as::<_, GymRow>(&gym_query);
    for id in &id_list {
        gq = gq.bind(id);
    }
    let gyms: Vec<GymRow> = gq.fetch_all(pool.get_ref()).await?;

    // これらのジムのタグを取得
    let tag_query = format!(
        r#"SELECT gt.gym_id, t.id AS tag_id, t.name AS tag_name
           FROM gym_tags gt
           JOIN tags t ON gt.tag_id = t.id
           WHERE gt.gym_id IN ({})
           ORDER BY t.display_order ASC, t.id ASC"#,
        placeholders
    );

    let mut tq = sqlx::query_as::<_, GymTagRow>(&tag_query);
    for id in &id_list {
        tq = tq.bind(id);
    }
    let gym_tags: Vec<GymTagRow> = tq.fetch_all(pool.get_ref()).await?;

    // タグをgym_idでグループ化
    let mut tags_by_gym: std::collections::HashMap<i64, Vec<TagDto>> =
        std::collections::HashMap::new();
    for gt in gym_tags {
        tags_by_gym.entry(gt.gym_id).or_default().push(TagDto {
            id: gt.tag_id,
            name: gt.tag_name,
        });
    }

    // 順序を保持してレスポンスを構築
    let gym_dtos: Vec<GymDto> = gyms
        .into_iter()
        .map(|g| GymDto {
            id: g.id,
            name: g.name,
            address: g.address,
            phone: g.phone,
            price_range: g.price_range,
            open_hours: g.open_hours,
            area: g.area,
            latitude: g.latitude,
            longitude: g.longitude,
            tags: tags_by_gym.get(&g.id).cloned().unwrap_or_default(),
        })
        .collect();

    let total_pages = ((total.0 as f64) / (size as f64)).ceil() as i32;
    let count = gym_dtos.len() as i32;

    Ok(HttpResponse::Ok().json(GymPagedResponse {
        gyms: gym_dtos,
        count,
        page,
        size,
        total_elements: total.0,
        total_pages,
        has_next: page < total_pages - 1,
        has_previous: page > 0,
    }))
}

/// GET /api/gyms/tags - 全ジム設備タグを取得
#[get("/gyms/tags")]
async fn get_gym_tags(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let tags = sqlx::query_as::<_, Tag>(r#"SELECT * FROM tags ORDER BY display_order ASC, id ASC"#)
        .fetch_all(pool.get_ref())
        .await?;

    let tag_dtos: Vec<TagListDto> = tags
        .into_iter()
        .map(|t| TagListDto {
            id: t.id,
            name: t.name,
            display_order: t.display_order,
        })
        .collect();

    Ok(HttpResponse::Ok().json(tag_dtos))
}

/// POST /api/cache/clear - キャッシュクリア（管理者のみ、Rust版では何もしない）
#[post("/cache/clear")]
async fn clear_cache(session: Session) -> Result<HttpResponse, AppError> {
    // 認証必須
    let user = get_current_user(&session)?;

    // 管理者権限をチェック
    if user.role != "ADMIN" {
        return Err(AppError::Unauthorized("Admin access required".to_string()));
    }

    // Rust版ではキャッシュを使用していない（まだ）
    // このエンドポイントはAPI互換性のために存在
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

/// GET /api/gyms/areas - フィルタリング用のユニークエリアを取得
#[get("/gyms/areas")]
async fn get_gym_areas(
    session: Session,
    pool: web::Data<MySqlPool>,
) -> Result<HttpResponse, AppError> {
    // 認証必須
    let _user = get_current_user(&session)?;

    let areas: Vec<(Option<String>,)> = sqlx::query_as(
        r#"SELECT DISTINCT area FROM gyms WHERE area IS NOT NULL AND area != '' ORDER BY area"#,
    )
    .fetch_all(pool.get_ref())
    .await?;

    let area_list: Vec<String> = areas.into_iter().filter_map(|(a,)| a).collect();

    Ok(HttpResponse::Ok().json(area_list))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(search_gyms_paged)
        .service(get_gym_tags)
        .service(get_gym_areas)
        .service(clear_cache);
}
