use actix_multipart::Multipart;
use actix_session::Session;
use actix_web::{post, web, HttpResponse};
use chrono::Utc;
use futures::StreamExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;

use crate::auth::session::get_current_user;
use crate::config::AppConfig;
use crate::error::AppError;

/// 禁止ワード設定
#[derive(Deserialize, Clone)]
struct BannedWordsConfig {
    words: Vec<String>,
    #[serde(default)]
    case_sensitive: bool,
}

/// 禁止ワードリストをファイルから読み込み（起動時に一度だけ）
static BANNED_WORDS: Lazy<BannedWordsConfig> = Lazy::new(|| {
    let config_path = "config/banned_words.json";
    match fs::read_to_string(config_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
            eprintln!("禁止ワード設定の解析に失敗: {}", e);
            BannedWordsConfig {
                words: vec![],
                case_sensitive: false,
            }
        }),
        Err(_) => {
            eprintln!("禁止ワード設定ファイルが見つかりません: {}", config_path);
            BannedWordsConfig {
                words: vec![],
                case_sensitive: false,
            }
        }
    }
});

/// 禁止ワードエラーレスポンス
#[derive(Serialize)]
struct BannedWordErrorResponse {
    success: bool,
    message: String,
    field: String,
}

/// テキストに禁止ワードが含まれているかチェック
fn contains_banned_word(text: &str) -> bool {
    let config = &*BANNED_WORDS;
    if config.words.is_empty() {
        return false;
    }

    let check_text = if config.case_sensitive {
        text.to_string()
    } else {
        text.to_lowercase()
    };

    for word in &config.words {
        let check_word: String = if config.case_sensitive {
            word.clone()
        } else {
            word.to_lowercase()
        };
        if check_text.contains(&check_word) {
            return true;
        }
    }
    false
}

const MAX_IMAGE_SIZE: usize = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE_COUNT: usize = 4;
const ALLOWED_MIMES: [&str; 4] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

#[derive(Deserialize)]
struct ContactRequest {
    kind: String,
    summary: String,
    detail: String,
    reproduction: Option<String>,
    #[serde(rename = "contactOk")]
    contact_ok: bool,
    email: Option<String>,
    #[serde(rename = "pagePath")]
    page_path: String,
    #[serde(rename = "userAgent")]
    user_agent: String,
    #[serde(rename = "screenWidth")]
    screen_width: Option<i32>,
    #[serde(rename = "screenHeight")]
    screen_height: Option<i32>,
}

#[derive(Serialize)]
struct DiscordField {
    name: String,
    value: String,
    inline: bool,
}

#[derive(Serialize)]
struct DiscordEmbed {
    title: String,
    color: u32,
    fields: Vec<DiscordField>,
    timestamp: String,
}

#[derive(Serialize)]
struct DiscordPayload {
    username: String,
    embeds: Vec<DiscordEmbed>,
}

struct ImageData {
    filename: String,
    content_type: String,
    data: Vec<u8>,
}

fn validate_required(text: &str, min: usize, max: usize, label: &str) -> Result<String, AppError> {
    let trimmed = text.trim();
    if trimmed.len() < min || trimmed.len() > max {
        return Err(AppError::BadRequest(format!(
            "{}は{}文字以上{}文字以下で入力してください",
            label, min, max
        )));
    }
    Ok(trimmed.to_string())
}

fn validate_optional(text: Option<String>, max: usize) -> Result<Option<String>, AppError> {
    match text {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else if trimmed.len() > max {
                Err(AppError::BadRequest(format!(
                    "入力は{}文字以下で入力してください",
                    max
                )))
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        None => Ok(None),
    }
}

fn validate_email(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 5 || trimmed.len() > 200 {
        return false;
    }
    let parts: Vec<&str> = trimmed.split('@').collect();
    if parts.len() != 2 {
        return false;
    }
    let domain = parts[1];
    if domain.is_empty() || !domain.contains('.') {
        return false;
    }
    true
}

fn truncate(value: &str, max: usize) -> String {
    let count = value.chars().count();
    if count <= max {
        return value.to_string();
    }
    let mut truncated = value.chars().take(max.saturating_sub(1)).collect::<String>();
    truncated.push('…');
    truncated
}

fn kind_label(kind: &str) -> Option<&'static str> {
    match kind {
        "bug" => Some("バグ"),
        "request" => Some("要望"),
        "other" => Some("その他"),
        _ => None,
    }
}

fn get_extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}

#[post("/contact")]
async fn submit_contact(
    config: web::Data<AppConfig>,
    session: Session,
    mut payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let session_user = get_current_user(&session)?;

    if config.discord_webhook_url.trim().is_empty() {
        return Err(AppError::InternalError(
            "通知設定が未完了です".to_string(),
        ));
    }

    let mut json_data: Option<String> = None;
    let mut images: Vec<ImageData> = Vec::new();

    // Parse multipart form
    while let Some(item) = payload.next().await {
        let mut field = item.map_err(|e| {
            AppError::BadRequest(format!("マルチパートの解析に失敗しました: {}", e))
        })?;

        let content_disposition = field.content_disposition();
        let field_name = content_disposition
            .and_then(|cd| cd.get_name())
            .unwrap_or("");

        if field_name == "data" {
            // JSON data field
            let mut data = Vec::new();
            while let Some(chunk) = field.next().await {
                let chunk = chunk.map_err(|e| {
                    AppError::BadRequest(format!("データの読み取りに失敗しました: {}", e))
                })?;
                data.extend_from_slice(&chunk);
            }
            json_data = Some(String::from_utf8(data).map_err(|_| {
                AppError::BadRequest("無効なUTF-8データです".to_string())
            })?);
        } else if field_name == "images" {
            // Image file
            if images.len() >= MAX_IMAGE_COUNT {
                return Err(AppError::BadRequest(format!(
                    "画像は最大{}枚までです",
                    MAX_IMAGE_COUNT
                )));
            }

            let content_type = field
                .content_type()
                .map(|m| m.to_string())
                .unwrap_or_default();

            if !ALLOWED_MIMES.contains(&content_type.as_str()) {
                return Err(AppError::BadRequest(
                    "画像はJPEG、PNG、GIF、WebP形式のみ対応しています".to_string(),
                ));
            }

            let filename = content_disposition
                .and_then(|cd| cd.get_filename())
                .map(|s: &str| s.to_string())
                .unwrap_or_else(|| {
                    format!(
                        "image_{}.{}",
                        images.len() + 1,
                        get_extension_from_mime(&content_type)
                    )
                });

            let mut data = Vec::new();
            while let Some(chunk) = field.next().await {
                let chunk = chunk.map_err(|e| {
                    AppError::BadRequest(format!("画像の読み取りに失敗しました: {}", e))
                })?;
                data.extend_from_slice(&chunk);

                if data.len() > MAX_IMAGE_SIZE {
                    return Err(AppError::BadRequest(format!(
                        "画像サイズは{}MB以下にしてください",
                        MAX_IMAGE_SIZE / 1024 / 1024
                    )));
                }
            }

            images.push(ImageData {
                filename,
                content_type,
                data,
            });
        }
    }

    // Parse JSON data
    let json_str = json_data.ok_or_else(|| {
        AppError::BadRequest("リクエストデータが不足しています".to_string())
    })?;

    let body: ContactRequest = serde_json::from_str(&json_str).map_err(|e| {
        AppError::BadRequest(format!("JSONの解析に失敗しました: {}", e))
    })?;

    // Validate fields
    let kind = body.kind.trim();
    let kind_display = kind_label(kind).ok_or_else(|| {
        AppError::BadRequest("種別はバグ/要望/その他から選択してください".to_string())
    })?;

    let summary = validate_required(&body.summary, 3, 120, "概要")?;
    let detail = validate_required(&body.detail, 5, 3000, "詳細")?;
    let reproduction = validate_optional(body.reproduction.clone(), 3000)?;
    let email = validate_optional(body.email.clone(), 200)?;

    // 禁止ワードチェック
    if contains_banned_word(&summary) {
        return Ok(HttpResponse::BadRequest().json(BannedWordErrorResponse {
            success: false,
            message: "不適切な内容が含まれています".to_string(),
            field: "summary".to_string(),
        }));
    }
    if contains_banned_word(&detail) {
        return Ok(HttpResponse::BadRequest().json(BannedWordErrorResponse {
            success: false,
            message: "不適切な内容が含まれています".to_string(),
            field: "detail".to_string(),
        }));
    }
    if let Some(ref repro) = reproduction {
        if contains_banned_word(repro) {
            return Ok(HttpResponse::BadRequest().json(BannedWordErrorResponse {
                success: false,
                message: "不適切な内容が含まれています".to_string(),
                field: "reproduction".to_string(),
            }));
        }
    }

    if body.contact_ok {
        let email_value = email.as_deref().unwrap_or("");
        if !validate_email(email_value) {
            return Err(AppError::BadRequest(
                "返信用メールアドレスを正しい形式で入力してください".to_string(),
            ));
        }
    }

    let page_path = body.page_path.trim();
    let user_agent = body.user_agent.trim();
    let screen_size = match (body.screen_width, body.screen_height) {
        (Some(w), Some(h)) => format!("{}x{}", w, h),
        _ => "不明".to_string(),
    };

    // Build Discord embed fields
    let mut fields = vec![
        DiscordField {
            name: "種別".to_string(),
            value: truncate(kind_display, 64),
            inline: true,
        },
        DiscordField {
            name: "連絡可否".to_string(),
            value: if body.contact_ok {
                "連絡してOK".to_string()
            } else {
                "連絡なし".to_string()
            },
            inline: true,
        },
        DiscordField {
            name: "メール".to_string(),
            value: email
                .as_ref()
                .map(|value| truncate(value, 200))
                .unwrap_or_else(|| "(未記入)".to_string()),
            inline: false,
        },
        DiscordField {
            name: "概要".to_string(),
            value: truncate(&summary, 256),
            inline: false,
        },
        DiscordField {
            name: "詳細".to_string(),
            value: truncate(&detail, 900),
            inline: false,
        },
        DiscordField {
            name: "再現手順".to_string(),
            value: truncate(reproduction.as_deref().unwrap_or("(未記入)"), 900),
            inline: false,
        },
    ];

    // Add image count info if images are attached
    if !images.is_empty() {
        fields.push(DiscordField {
            name: "添付画像".to_string(),
            value: format!("{}枚の画像が添付されています", images.len()),
            inline: false,
        });
    }

    fields.push(DiscordField {
        name: "ユーザー".to_string(),
        value: format!(
            "id: {}\nlogin_id: {}\nname: {}",
            session_user.id,
            session_user.login_id,
            session_user
                .display_name
                .clone()
                .unwrap_or_else(|| "-".to_string())
        ),
        inline: false,
    });

    fields.push(DiscordField {
        name: "環境".to_string(),
        value: format!(
            "path: {}\nua: {}\nsize: {}",
            truncate(page_path, 200),
            truncate(user_agent, 200),
            screen_size
        ),
        inline: false,
    });

    let discord_payload = DiscordPayload {
        username: "FithubFast".to_string(),
        embeds: vec![DiscordEmbed {
            title: "お問い合わせ".to_string(),
            color: 0xFFD700,
            fields,
            timestamp: Utc::now().to_rfc3339(),
        }],
    };

    let client = reqwest::Client::new();

    // Send to Discord
    if images.is_empty() {
        // No images - send as JSON
        let response = client
            .post(&config.discord_webhook_url)
            .json(&discord_payload)
            .send()
            .await
            .map_err(|_| AppError::InternalError("送信に失敗しました".to_string()))?;

        if !response.status().is_success() {
            return Err(AppError::InternalError(
                "送信に失敗しました".to_string(),
            ));
        }
    } else {
        // With images - send as multipart
        let payload_json = serde_json::to_string(&discord_payload).map_err(|_| {
            AppError::InternalError("送信データの準備に失敗しました".to_string())
        })?;

        let mut form = reqwest::multipart::Form::new().text("payload_json", payload_json);

        for (i, image) in images.into_iter().enumerate() {
            let part = reqwest::multipart::Part::bytes(image.data)
                .file_name(image.filename)
                .mime_str(&image.content_type)
                .map_err(|_| {
                    AppError::InternalError("画像の準備に失敗しました".to_string())
                })?;

            form = form.part(format!("file{}", i), part);
        }

        let response = client
            .post(&config.discord_webhook_url)
            .multipart(form)
            .send()
            .await
            .map_err(|_| AppError::InternalError("送信に失敗しました".to_string()))?;

        if !response.status().is_success() {
            return Err(AppError::InternalError(
                "送信に失敗しました".to_string(),
            ));
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(submit_contact);
}
