//! 公開設定API

use actix_web::{get, web, HttpResponse};
use serde::Serialize;

use crate::config::AppConfig;

#[derive(Serialize)]
struct PublicConfigResponse {
    #[serde(rename = "googleMapsApiKey")]
    google_maps_api_key: String,
}

/// GET /api/public-config - フロント向け公開設定
#[get("/public-config")]
async fn get_public_config(config: web::Data<AppConfig>) -> HttpResponse {
    HttpResponse::Ok().json(PublicConfigResponse {
        google_maps_api_key: config.google_maps_api_key.clone(),
    })
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_public_config);
}
