import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { getFilteredNavItems, calculateLevelProgress, getAvatarInitial, navItems } from '../../config/navItems';
import FithubIcon from '../common/FithubIcon';

export default function Sidebar() {
  const { user } = useAuthStore();
  const { openModal, navOrder, hiddenNavItems } = useUIStore();
  const [avatarImageError, setAvatarImageError] = useState(false);

  // 1. 全アイテムを取得
  const allItems = getFilteredNavItems(user?.displayName, user?.loginId);

  // 2. カスタム順序の適用
  const displayItems = (() => {
    // navOrderがない（初回）または項目が増減した場合の対応
    // navOrderにあるパスの順序を優先し、ないものは後ろに追加
    const sortedOrder = [...navOrder];

    // 足りないものを追加
    allItems.forEach(item => {
      if (!sortedOrder.includes(item.to)) {
        sortedOrder.push(item.to);
      }
    });

    return sortedOrder
      .map(path => allItems.find(item => item.to === path))
      .filter((item): item is typeof navItems[0] =>
        item !== undefined && !hiddenNavItems.includes(item.to)
      );
  })();


  const levelProgress = calculateLevelProgress(user?.currentExp, user?.expToNextLevel);
  const avatarInitial = getAvatarInitial(user?.displayName);
  const avatarImageUrl = user?.profileImageUrl;

  useEffect(() => {
    setAvatarImageError(false);
  }, [avatarImageUrl]);

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-header">
        <FithubIcon
          size={56}
          level={user?.level || 1}
          className="sidebar-logo"
        />
        <span className="sidebar-title">Fithub</span>
      </div>

      <nav className="sidebar-nav">
        {displayItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {item.icon ? (
              <span className="nav-link-icon">{item.icon}</span>
            ) : (
              <img className="nav-link-icon" src={item.iconSrc} alt={item.label} />
            )}
            <span className="nav-link-text">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user ? (
          <a
            href="#"
            className="sidebar-user user-btn"
            onClick={(e) => {
              e.preventDefault();
              openModal('user-settings');
            }}
          >
            <div className="sidebar-user-avatar">
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
            <div className="sidebar-user-info">
              <div className="sidebar-user-level">
                <span className="level-badge">Lv.{user.level || 1}</span>
                <div className="level-progress-bar">
                  <div
                    className="level-progress-fill"
                    style={{ width: `${levelProgress}%` }}
                  ></div>
                </div>
              </div>
              <div className="sidebar-user-name">{user.displayName}</div>
              <div className="sidebar-user-role">メンバー</div>
            </div>
          </a>
        ) : null}
      </div>
    </aside>
  );
}
