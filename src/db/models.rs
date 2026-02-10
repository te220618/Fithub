//! FithubFastのデータベースモデル
//! 元のSpring Bootアプリケーションの20個のMySQLテーブルに対応

#![allow(dead_code)]

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ============================================
// ユーザーと統計
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub login_id: String,
    pub password: Option<String>,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub gender: Option<String>,
    pub birthday: Option<NaiveDate>,
    pub profile_image_url: Option<String>,
    pub oauth_provider: String,
    pub oauth_id: Option<String>,
    pub role: String,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserStats {
    pub id: i64,
    pub user_id: i64,
    pub total_exp: i64,
    pub level: i32,
}

impl UserStats {
    /// 指定レベルに必要な累計EXPを計算
    /// 新計算式（2週間スピードラン用）: 40 × Level² + 100 × Level - 140
    /// Lv1: 0, Lv2: 220, Lv5: 1360, Lv10: 4860, Lv50: 104860, Lv100: 409860
    pub fn get_required_exp_for_level(level: i32) -> i64 {
        if level <= 1 {
            return 0;
        }
        let l = level as i64;
        40 * l * l + 100 * l - 140
    }

    /// 現在レベルから次レベルに必要なEXP
    /// 微分: 80 × Level + 140
    pub fn get_exp_to_next_level(level: i32) -> i32 {
        let next = Self::get_required_exp_for_level(level + 1);
        let current = Self::get_required_exp_for_level(level);
        (next - current) as i32
    }

    /// Calculate level from total EXP using binary search for efficiency
    pub fn calculate_level(total_exp: i64) -> i32 {
        if total_exp <= 0 {
            return 1;
        }
        // Binary search for level (1 to 1000)
        let mut low = 1;
        let mut high = 1000;
        while low < high {
            let mid = (low + high + 1) / 2;
            if Self::get_required_exp_for_level(mid) <= total_exp {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        low
    }

    /// 現在レベル内の進行度（0.0〜1.0）
    pub fn get_level_progress(&self) -> f64 {
        let current_level_exp = Self::get_required_exp_for_level(self.level);
        let next_level_exp = Self::get_required_exp_for_level(self.level + 1);
        let exp_in_current_level = self.total_exp - current_level_exp;
        let exp_needed = next_level_exp - current_level_exp;
        if exp_needed <= 0 {
            return 1.0;
        }
        exp_in_current_level as f64 / exp_needed as f64
    }
}

// ============================================
// 種目とマスターデータ
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Exercise {
    pub id: i64,
    pub name: String,
    pub muscle: String,
    pub muscle_group_id: Option<i32>,
    pub difficulty: String,
    pub difficulty_level_id: Option<i32>,
    pub description: Option<String>,
    pub target_muscles: Option<String>,
    pub video_path: Option<String>,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MuscleGroup {
    pub id: i64,
    pub name: String,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DifficultyLevel {
    pub id: i32,
    pub name: String,
    pub display_order: Option<i32>,
    pub created_at: Option<NaiveDateTime>,
}

// ============================================
// トレーニング記録
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TrainingRecord {
    pub id: i64,
    pub user_id: i64,
    pub record_date: NaiveDate,
    pub note: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TrainingRecordExercise {
    pub id: i64,
    pub record_id: i64,
    pub exercise_id: Option<i64>,
    pub custom_exercise_id: Option<i64>,
    pub order_index: Option<i32>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TrainingSet {
    pub id: i64,
    pub record_exercise_id: i64,
    pub set_number: i32,
    pub weight: f64,
    pub reps: i32,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserCustomExercise {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub muscle: String,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

// ============================================
// トレーニングタグ
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TrainingTag {
    pub id: i64,
    pub user_id: Option<i64>,
    pub name: String,
    pub color: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TrainingExerciseTag {
    pub id: i64,
    pub exercise_id: i64,
    pub tag_id: i64,
    pub user_id: i64,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserExerciseDefaultTag {
    pub id: i64,
    pub user_id: i64,
    pub exercise_id: i64,
    pub tag_name: String,
    pub created_at: Option<NaiveDateTime>,
}

// ============================================
// ジムとタグ
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Gym {
    pub id: i64,
    pub name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub price_range: Option<i32>,
    pub open_hours: Option<String>,
    pub area: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: Option<String>,
    pub display_order: Option<i32>,
}

/// gym_tagsの中間テーブル（多対多）
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GymTag {
    pub gym_id: i64,
    pub tag_id: i64,
}

// ============================================
// サプリメント
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Category {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "VARCHAR")]
#[sqlx(rename_all = "UPPERCASE")]
pub enum Tier {
    S,
    A,
    B,
    C,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Supplement {
    pub id: i32,
    pub category_id: i32,
    pub name: String,
    pub tier: String, // S, A, B, C
    pub description: String,
    pub dosage: Option<String>,
    pub timing: Option<String>,
    pub advice: Option<String>,
    pub display_order: Option<i32>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct SupplementLink {
    pub id: i32,
    pub supplement_id: i32,
    pub url: String,
    pub description: Option<String>,
    pub site_type: Option<String>,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Effect {
    pub id: i32,
    pub supplement_id: i32,
    pub effect_text: String,
    pub display_order: Option<i32>,
}

// ============================================
// ギア
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GearCategory {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub icon_svg: Option<String>,
    pub icon_path: Option<String>,
    pub icon_color: Option<String>,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GearType {
    pub id: i32,
    pub category_id: i32,
    pub name: String,
    pub price_range: Option<String>,
    pub display_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "VARCHAR")]
#[sqlx(rename_all = "lowercase")]
pub enum FeatureType {
    Merit,
    Demerit,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GearFeature {
    pub id: i32,
    pub gear_type_id: i32,
    pub feature_type: String, // "merit" or "demerit"
    pub description: String,
    pub display_order: Option<i32>,
}

// ============================================
// ストリークとログインボーナス
// ============================================

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserStreak {
    pub id: i64,
    pub user_id: i64,
    pub streak_type: String, // "training" or "login"
    pub current_streak: i32,
    pub best_streak: i32,
    pub last_active_date: Option<NaiveDate>,
    pub grace_days_used: i32, // 中休み使用日数
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserLoginHistory {
    pub id: i64,
    pub user_id: i64,
    pub login_date: NaiveDate,
    pub bonus_claimed: bool,
    pub exp_earned: i32,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserSettings {
    pub id: i64,
    pub user_id: i64,
    pub grace_days_allowed: i32, // 中休み許容日数 (default: 1)
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

// ============================================
// ペット（トレーニングパートナー）
// ============================================

/// ペット種類マスタ（管理者画面から登録）
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PetType {
    pub id: i32,
    pub name: String,
    pub code: String,
    pub description: Option<String>,
    pub image_egg: Option<String>,
    pub image_child: Option<String>,
    pub image_adult: Option<String>,
    pub background_image: Option<String>,
    pub display_order: Option<i32>,
    pub is_active: Option<bool>,
    // 解放条件
    pub unlock_type: Option<String>, // 'default', 'user_level', 'pet_growth'
    pub unlock_level: Option<i32>,   // user_level時の必要レベル
    pub unlock_pet_code: Option<String>, // pet_growth時の対象ペットcode
    pub is_starter: Option<bool>,    // 初期3種類
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

/// ユーザーのペット
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Pet {
    pub id: i64,
    pub user_id: i64,
    pub pet_type_id: i32,
    pub name: String,
    pub stage: i32,      // 1: Egg, 2: Child, 3: Adult
    pub mood_score: i32, // 0-100
    pub total_exp: i64,  // ペット専用累計経験値
    pub level: i32,      // ペット専用レベル
    pub is_active: bool, // アクティブペットフラグ
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

/// ユーザーのペット種類解放状況
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserPetUnlock {
    pub id: i64,
    pub user_id: i64,
    pub pet_type_id: i32,
    pub unlocked_at: Option<NaiveDateTime>,
}

impl Pet {
    /// ペットレベルからステージを計算（新閾値）
    pub fn calculate_stage(level: i32) -> i32 {
        match level {
            1..=10 => 1,  // Egg
            11..=30 => 2, // Child
            _ => 3,       // Adult
        }
    }

    /// 累計EXPからペットレベルを計算（ユーザーと同じ計算式）
    pub fn calculate_level(total_exp: i64) -> i32 {
        UserStats::calculate_level(total_exp)
    }

    /// ステージ名を取得
    pub fn get_stage_name(stage: i32) -> &'static str {
        match stage {
            1 => "卵",
            2 => "成長期",
            3 => "覚醒",
            _ => "Unknown",
        }
    }

    /// 最終トレーニング日からムードスコアを計算
    pub fn calculate_mood(last_active_date: Option<NaiveDate>) -> i32 {
        let Some(last) = last_active_date else {
            return 50; // トレーニング記録なし
        };

        let today = chrono::Local::now().date_naive();
        let days_elapsed = (today - last).num_days();

        match days_elapsed {
            0..=1 => 100, // 絶好調
            2 => 80,      // 元気
            3 => 60,      // 普通
            4..=7 => 40,  // 寂しい
            _ => 20,      // 弱っている
        }
    }

    /// ムードラベルを取得
    pub fn get_mood_label(mood_score: i32) -> &'static str {
        match mood_score {
            100 => "絶好調",
            80 => "元気",
            60 => "普通",
            40 => "寂しい",
            50 => "眠そう",
            _ => "弱っている",
        }
    }
}
