//! Application configuration

use std::env;

/// EXP system configuration
/// Change these values to adjust the EXP system behavior
#[derive(Debug, Clone)]
pub struct ExpConfig {
    /// Daily EXP limit for current/recent records
    pub daily_limit: i32,
    /// Number of days after which records are considered "past"
    pub past_days_threshold: i64,
    /// EXP multiplier for past records (e.g., 0.25 = 25%)
    pub past_exp_multiplier: f64,
    /// Daily limit multiplier for past records (e.g., 0.5 = 50%)
    pub past_limit_multiplier: f64,
    /// Maximum EXP per single set (anti-cheat)
    pub max_exp_per_set: i32,
    /// EXP coefficient for set calculation (weight × reps × difficulty × coefficient)
    pub exp_coefficient: f64,
}

impl Default for ExpConfig {
    fn default() -> Self {
        Self {
            daily_limit: 50000, // 1日上限 50,000 EXP
            past_days_threshold: 2,
            past_exp_multiplier: 0.25,
            past_limit_multiplier: 0.5,
            max_exp_per_set: 2000, // 1セット上限 2,000 EXP
            exp_coefficient: 1.0,  // 係数 0.01 → 1.0
        }
    }
}

impl ExpConfig {
    /// Get the daily limit based on whether the record is a past record
    pub fn get_daily_limit(&self, is_past_record: bool) -> i32 {
        if is_past_record {
            (self.daily_limit as f64 * self.past_limit_multiplier) as i32
        } else {
            self.daily_limit
        }
    }

    /// Get the EXP multiplier based on whether the record is a past record
    pub fn get_exp_multiplier(&self, is_past_record: bool) -> f64 {
        if is_past_record {
            self.past_exp_multiplier
        } else {
            1.0
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub session_secret: String,
    pub google_maps_api_key: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_redirect_uri: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub github_redirect_uri: String,
    pub microsoft_client_id: String,
    pub microsoft_client_secret: String,
    pub microsoft_redirect_uri: String,
    pub frontend_url: String,
    pub discord_webhook_url: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            host: env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "5000".to_string())
                .parse()
                .unwrap_or(5000),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            session_secret: env::var("SESSION_SECRET").unwrap_or_else(|_| {
                "default-secret-key-change-in-production-64-chars-minimum".to_string()
            }),
            google_maps_api_key: env::var("GOOGLE_MAPS_API_KEY")
                .or_else(|_| env::var("VITE_GOOGLE_MAPS_API_KEY"))
                .unwrap_or_default(),
            google_client_id: env::var("GOOGLE_CLIENT_ID").unwrap_or_default(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default(),
            google_redirect_uri: env::var("GOOGLE_REDIRECT_URI")
                .unwrap_or_else(|_| "https://fithub.jp/login/oauth2/code/google".to_string()),
            github_client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
            github_redirect_uri: env::var("GITHUB_REDIRECT_URI")
                .unwrap_or_else(|_| "https://fithub.jp/login/oauth2/code/github".to_string()),
            microsoft_client_id: env::var("MICROSOFT_CLIENT_ID").unwrap_or_default(),
            microsoft_client_secret: env::var("MICROSOFT_CLIENT_SECRET").unwrap_or_default(),
            microsoft_redirect_uri: env::var("MICROSOFT_REDIRECT_URI")
                .unwrap_or_else(|_| "https://fithub.jp/login/oauth2/code/microsoft".to_string()),
            frontend_url: env::var("FRONTEND_URL").unwrap_or_default(),
            discord_webhook_url: env::var("DISCORD_WEBHOOK_URL").unwrap_or_default(),
        }
    }
}
