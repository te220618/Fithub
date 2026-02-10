//! Basic認証ミドルウェア
//!
//! 開発中にHTTP Basic認証でアプリケーションを保護する。
//! BASIC_AUTH_ENABLED=true環境変数で有効化。

use actix_web::{
    body::EitherBody,
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    http::header,
    Error, HttpResponse,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures::future::{ok, Ready};
use std::{
    env,
    future::Future,
    pin::Pin,
    rc::Rc,
    task::{Context, Poll},
};

/// Basic認証をバイパスするパス
const EXCLUDED_PATHS: &[&str] = &[
    "/health",
    "/api/auth/github",
    "/api/auth/google",
    "/login/oauth2/code/github",
    "/login/oauth2/code/google",
];

/// Basic認証の資格情報（簡略化のためハードコード）
const BASIC_AUTH_USER: &str = "fithub";
const BASIC_AUTH_PASS: &str = "timpo";

/// 環境変数でBasic認証が有効かチェック
pub fn is_basic_auth_enabled() -> bool {
    env::var("BASIC_AUTH_ENABLED")
        .map(|v| v.to_lowercase() == "true" || v == "1")
        .unwrap_or(false)
}

/// Basic認証ミドルウェアファクトリ
pub struct BasicAuth;

impl BasicAuth {
    pub fn new() -> Self {
        BasicAuth
    }
}

impl Default for BasicAuth {
    fn default() -> Self {
        Self::new()
    }
}

impl<S, B> Transform<S, ServiceRequest> for BasicAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = BasicAuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(BasicAuthMiddleware {
            service: Rc::new(service),
            enabled: is_basic_auth_enabled(),
        })
    }
}

pub struct BasicAuthMiddleware<S> {
    service: Rc<S>,
    enabled: bool,
}

impl<S, B> Service<ServiceRequest> for BasicAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, ctx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(ctx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);
        let enabled = self.enabled;

        Box::pin(async move {
            // Basic認証が無効なら処理をスキップ
            if !enabled {
                let res = service.call(req).await?;
                return Ok(res.map_into_left_body());
            }

            // 除外パスかチェック
            let path = req.path();
            let is_excluded = EXCLUDED_PATHS.iter().any(|p| path.starts_with(p));

            if is_excluded {
                let res = service.call(req).await?;
                return Ok(res.map_into_left_body());
            }

            // Basic認証ヘッダーを検証
            if let Some(auth_header) = req.headers().get(header::AUTHORIZATION) {
                if let Ok(auth_str) = auth_header.to_str() {
                    if auth_str.starts_with("Basic ") {
                        let encoded = &auth_str[6..];
                        if let Ok(decoded) = STANDARD.decode(encoded) {
                            if let Ok(credentials) = String::from_utf8(decoded) {
                                if let Some((user, pass)) = credentials.split_once(':') {
                                    if user == BASIC_AUTH_USER && pass == BASIC_AUTH_PASS {
                                        let res = service.call(req).await?;
                                        return Ok(res.map_into_left_body());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // WWW-Authenticateヘッダー付きで401 Unauthorizedを返す
            let response = HttpResponse::Unauthorized()
                .insert_header((header::WWW_AUTHENTICATE, "Basic realm=\"FithubFast\""))
                .body("Unauthorized")
                .map_into_right_body();

            Ok(req.into_response(response))
        })
    }
}
