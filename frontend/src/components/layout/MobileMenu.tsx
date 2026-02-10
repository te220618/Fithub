import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { navItems, calculateLevelProgress, getAvatarInitial } from '../../config/navItems';
import FithubIcon from '../common/FithubIcon';

export default function MobileMenu() {
  const { isMobileMenuOpen, closeMobileMenu, openModal } = useUIStore();
  const { user } = useAuthStore();
  const [avatarImageError, setAvatarImageError] = useState(false);

  const levelProgress = calculateLevelProgress(user?.currentExp, user?.expToNextLevel);
  const avatarInitial = getAvatarInitial(user?.displayName);
  const avatarImageUrl = user?.profileImageUrl;

  useEffect(() => {
    setAvatarImageError(false);
  }, [avatarImageUrl]);

  return (
    <div 
      className={`mobile-menu-overlay ${isMobileMenuOpen ? 'active' : ''}`} 
      id="mobileMenuOverlay"
      onClick={closeMobileMenu}
    >
      <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-menu-header">
          <FithubIcon
            size={40}
            level={user?.level || 1}
            showParticles={false}
            className="mobile-menu-logo"
          />
          <span className="mobile-menu-title">Fithub</span>
          <button 
            className="mobile-menu-close" 
            id="mobileMenuClose" 
            aria-label="メニューを閉じる"
            onClick={closeMobileMenu}
          >
            ×
          </button>
        </div>

        <nav className="mobile-menu-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="mobile-menu-link"
              onClick={closeMobileMenu}
            >
              {item.icon ? (
                item.icon
              ) : (
                <img src={item.iconSrc} alt={item.label} width="22" height="22" />
              )}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mobile-menu-footer">
          {user ? (
            <a
              href="#"
              className="mobile-menu-user user-btn"
              onClick={(e) => {
                e.preventDefault();
                closeMobileMenu();
                openModal('user-settings');
              }}
            >
              <div className="mobile-menu-user-avatar">
                {avatarImageUrl && !avatarImageError ? (
                  <img
                    src={avatarImageUrl}
                    alt={user?.displayName || 'ユーザー'}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarImageError(true)}
                  />
                ) : (
                  <span>{avatarInitial}</span>
                )}
              </div>
              <div className="mobile-menu-user-info">
                <div className="mobile-menu-user-level">
                  <span className="level-badge">Lv.{user.level || 1}</span>
                  <div className="level-progress-bar small">
                    <div 
                      className="level-progress-fill" 
                      style={{ width: `${levelProgress}%` }}
                    ></div>
                  </div>
                </div>
                <div className="mobile-menu-user-name">{user.displayName}</div>
                <div className="mobile-menu-user-role">メンバー</div>
              </div>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
