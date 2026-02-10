import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import FithubIcon from '../common/FithubIcon';

export default function MobileHeader() {
  const { toggleMobileMenu, openModal } = useUIStore();
  const { user } = useAuthStore();
  const [avatarImageError, setAvatarImageError] = useState(false);

  // アバターの頭文字
  const avatarInitial = user?.displayName?.charAt(0).toUpperCase() || 'U';
  const avatarImageUrl = user?.profileImageUrl;

  useEffect(() => {
    setAvatarImageError(false);
  }, [avatarImageUrl]);

  return (
    <header className="mobile-header">
      <div className="mobile-header-left">
        <div className="mobile-brand-wrapper">
          <FithubIcon
            size={44}
            level={user?.level || 1}
            className="mobile-logo"
          />
          <span className="mobile-app-name">Fithub</span>
        </div>
        {/* ハンバーガーメニューボタン */}
        <button
          className="hamburger-btn"
          id="hamburgerBtn"
          aria-label="メニューを開く"
          onClick={toggleMobileMenu}
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
      </div>
      <div className="mobile-header-right">
        {/* レベル表示（モバイル） */}
        {user?.level ? (
          <div className="mobile-level-display">
            <span className="mobile-level-badge">Lv.{user.level}</span>
          </div>
        ) : null}
        {user ? (
          <a
            href="#"
            className="mobile-user user-btn"
            id="mobileUserBtn"
            onClick={(e) => {
              e.preventDefault();
              openModal('user-settings');
            }}
          >
            <div className="mobile-user-avatar">
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
            <span className="mobile-user-name">{user.displayName}</span>
          </a>
        ) : null}
      </div>
    </header>
  );
}
