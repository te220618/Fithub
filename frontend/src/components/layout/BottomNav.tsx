import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { getFilteredNavItems } from '../../config/navItems';
import { useScrollDirection } from '../../hooks';

export default function BottomNav() {
  const { isMobileMenuOpen, navOrder, hiddenNavItems } = useUIStore();
  const { user } = useAuthStore();
  const scrollDirection = useScrollDirection();

  // 1. 全アイテムを取得
  const allItems = getFilteredNavItems(user?.displayName, user?.loginId);

  // 2. カスタム順序の適用
  const displayItems = (() => {
    const sortedOrder = [...navOrder];

    allItems.forEach(item => {
      if (!sortedOrder.includes(item.to)) {
        sortedOrder.push(item.to);
      }
    });

    return sortedOrder
      .map(path => allItems.find(item => item.to === path))
      .filter((item): item is typeof allItems[0] =>
        item !== undefined && !hiddenNavItems.includes(item.to)
      );
  })();

  // 7個以上の場合は2段表示
  const isMultiline = displayItems.length >= 7;

  return (
    <nav 
      className={`nav-bar ${isMobileMenuOpen ? 'hidden' : ''} ${scrollDirection === 'down' ? 'scroll-hidden' : ''} ${isMultiline ? 'multiline' : ''}`} 
      id="bottomNav"
    >
      {displayItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
        >
          {item.icon ? (
            item.icon
          ) : (
            <img src={item.iconSrc} alt={item.shortLabel} width="24" height="24" />
          )}
          <span>{item.shortLabel}</span>
        </NavLink>
      ))}
    </nav>
  );
}
