//! FithubFast - 高性能フィットネス記録APIサーバー
//!
//! Actix Webを使用したFithubバックエンドのRust実装。

use actix_cors::Cors;
use actix_files::Files;
use actix_session::{config::PersistentSession, storage::CookieSessionStore, SessionMiddleware};
use actix_web::{
    cookie::Key,
    middleware::{Compress, Logger},
    web, App, HttpResponse, HttpServer,
};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod auth;
mod config;
mod db;
mod error;
mod middleware;

use config::AppConfig;
use db::pool::create_pool;
use middleware::basic_auth::BasicAuth;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // .envファイルを読み込み
    dotenvy::dotenv().ok();

    // ロギングを初期化
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,fithub_fast=debug,sqlx=warn,actix_web=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 設定を読み込み
    let config = AppConfig::from_env();
    info!(
        "Starting FithubFast server on {}:{}",
        config.host, config.port
    );

    // データベースプールを作成
    let pool = create_pool().await.expect("Failed to create database pool");
    info!("Database connection established");

    // データベース接続をテスト
    let result = sqlx::query("SELECT 1").execute(&pool).await;

    match result {
        Ok(_) => info!("Database connection test successful"),
        Err(e) => {
            tracing::error!("Database connection test failed: {}", e);
            return Err(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                "Failed to connect to database",
            ));
        }
    }

    // セッションキー（64バイト以上が必要）
    let session_key = Key::from(config.session_secret.as_bytes());

    let host = config.host.clone();
    let port = config.port;

    // HTTPサーバーを開始
    HttpServer::new(move || {
        // CORS設定
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .supports_credentials()
            .max_age(3600);

        App::new()
            // ミドルウェア（順序重要: 最初に追加 = 最外層）
            .wrap(BasicAuth::new())
            .wrap(Compress::default())
            .wrap(Logger::default())
            .wrap(cors)
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), session_key.clone())
                    .cookie_secure(false) // 本番環境ではHTTPSでtrueに設定
                    .cookie_http_only(true)
                    .session_lifecycle(
                        PersistentSession::default()
                            .session_ttl(actix_web::cookie::time::Duration::hours(24)),
                    )
                    .build(),
            )
            // 共有ステート
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            // ルートレベル認証ルート（ログイン、ログアウト、登録、OAuth）
            .configure(api::auth::configure_root)
            // APIルート
            .configure(api::configure)
            // ヘルスチェック
            .route("/health", web::get().to(health_check))
            // ルートにindex.htmlを配信
            .route("/", web::get().to(serve_index))
            // 静的アセット（CSS、JS、画像）
            .service(Files::new("/.well-known", "./static/.well-known"))
            .service(Files::new("/assets", "./static/assets"))
            .service(Files::new("/images", "./static/images"))
            .route("/vite.svg", web::get().to(serve_vite_svg))
            // クライアントサイドルーティング用SPAフォールバック（React Router）
            .default_service(web::route().to(spa_fallback))
    })
    .bind((host, port))?
    .run()
    .await
}

/// ヘルスチェックエンドポイント
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "FithubFast",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// ルートパスにindex.htmlを配信
async fn serve_index() -> actix_web::Result<actix_files::NamedFile> {
    Ok(actix_files::NamedFile::open("./static/index.html")?)
}

/// vite.svgを配信
async fn serve_vite_svg() -> actix_web::Result<actix_files::NamedFile> {
    Ok(actix_files::NamedFile::open("./static/vite.svg")?)
}

/// SPAフォールバック - 全未マッチルートにindex.htmlを配信
async fn spa_fallback() -> actix_web::Result<actix_files::NamedFile> {
    Ok(actix_files::NamedFile::open("./static/index.html")?)
}
