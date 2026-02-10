//! FithubFast API Integration Tests
//!
//! 本番環境に対する統合テスト。
//! 実行前に本番サーバーが起動していることを確認。
//!
//! テスト実行:
//! ```bash
//! cargo test --test api_integration_test -- --test-threads=1
//! ```

use reqwest::{Client, StatusCode};
use serde_json::Value;

const BASE_URL: &str = "http://fithub-fast-env.eba-hampmb2a.ap-northeast-1.elasticbeanstalk.com";

/// テスト用HTTPクライアント（Cookie保持）
fn create_client() -> Client {
    Client::builder()
        .cookie_store(true)
        .build()
        .expect("Failed to create HTTP client")
}

// =============================================================================
// 認証不要エンドポイント
// =============================================================================

#[tokio::test]
async fn test_health_check() {
    let client = create_client();
    let res = client
        .get(format!("{}/", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    // SPAなのでindex.htmlが返る
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_get_muscle_groups_no_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/workout/muscle-groups", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::OK);
    let body: Value = res.json().await.expect("Failed to parse JSON");
    assert!(body.is_array(), "Expected array of muscle groups");
}

#[tokio::test]
async fn test_get_default_tags_no_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/workout/default-tags", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::OK);
    let body: Value = res.json().await.expect("Failed to parse JSON");
    assert!(body.is_array(), "Expected array of default tags");
}

#[tokio::test]
async fn test_registration_status_no_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/auth/registration-status", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    // 認証なしでもエラーにならない (falseが返る)
    assert_eq!(res.status(), StatusCode::OK);
}

// =============================================================================
// 認証必要エンドポイント (未認証でのアクセス確認)
// =============================================================================

#[tokio::test]
async fn test_user_info_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/user/info", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_workout_records_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/workout/records", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_dashboard_heatmap_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/dashboard/heatmap", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_exercises_paged_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/exercises/paged?page=0&size=10", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_gyms_search_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/gyms/search/paged?page=0&size=10", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_gear_categories_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/gear/categories", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_supplements_category_requires_auth() {
    let client = create_client();
    let res = client
        .get(format!("{}/api/supplements/category/PROTEIN", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

// =============================================================================
// ログインフロー
// =============================================================================

#[tokio::test]
async fn test_login_with_invalid_credentials() {
    let client = create_client();
    let res = client
        .post(format!("{}/login", BASE_URL))
        .form(&[
            ("username", "nonexistent@test.com"),
            ("password", "wrongpassword"),
        ])
        .send()
        .await
        .expect("Failed to send request");

    // 失敗時は401
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

// =============================================================================
// 静的ファイル配信
// =============================================================================

#[tokio::test]
async fn test_static_assets_served() {
    let client = create_client();

    // index.html
    let res = client
        .get(format!("{}/", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");
    assert_eq!(res.status(), StatusCode::OK);
    let content_type = res.headers().get("content-type");
    assert!(content_type.is_some());

    // vite.svg
    let res = client
        .get(format!("{}/vite.svg", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_spa_fallback() {
    let client = create_client();

    // SPAルート（/dashboard, /records等）はindex.htmlにフォールバック
    let routes = [
        "/dashboard",
        "/records",
        "/exercises",
        "/gyms",
        "/supplements",
        "/gear",
    ];

    for route in routes {
        let res = client
            .get(format!("{}{}", BASE_URL, route))
            .send()
            .await
            .expect("Failed to send request");

        assert_eq!(
            res.status(),
            StatusCode::OK,
            "Route {} should return 200",
            route
        );
    }
}

// =============================================================================
// レスポンスタイム計測
// =============================================================================

#[tokio::test]
async fn test_response_time_muscle_groups() {
    let client = create_client();

    let start = std::time::Instant::now();
    let res = client
        .get(format!("{}/api/workout/muscle-groups", BASE_URL))
        .send()
        .await
        .expect("Failed to send request");
    let duration = start.elapsed();

    assert_eq!(res.status(), StatusCode::OK);

    // 200ms以内に応答すべき
    assert!(
        duration.as_millis() < 200,
        "Response took {}ms, expected < 200ms",
        duration.as_millis()
    );

    println!("Response time: {}ms", duration.as_millis());
}
