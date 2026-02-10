pub mod admin;
pub mod auth;
pub mod contact;
pub mod daily_reward;
pub mod dashboard;
pub mod exercise;
pub mod gear;
pub mod gym;
pub mod pet;
pub mod streak;
pub mod supplement;
pub mod user;
pub mod workout;
pub mod public_config;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .configure(auth::configure)
            .configure(contact::configure)
            .configure(user::configure)
            .configure(workout::configure)
            .configure(dashboard::configure)
            .configure(gym::configure)
            .configure(exercise::configure)
            .configure(gear::configure)
            .configure(supplement::configure)
            .configure(streak::configure)
            .configure(daily_reward::configure)
            .configure(public_config::configure)
            .configure(pet::configure)
            .configure(admin::configure),
    );
}
