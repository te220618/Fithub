import type { ReactNode } from 'react';

// 開発者アカウント（displayName）- 開発機能の表示制限用
const DEVELOPER_ACCOUNTS = ['220618'];

// 特別管理者アカウント（login_id）- レベル管理機能用
const SPECIAL_ADMIN_LOGIN_ID = ['220618'];

// 開発者かどうかを判定
export const isDeveloper = (displayName?: string | null): boolean => {
  return displayName ? DEVELOPER_ACCOUNTS.includes(displayName) : false;
};

// 特別管理者かどうかを判定（login_idで判定）
export const isSpecialAdmin = (loginId?: string | null): boolean => {
  return loginId ? SPECIAL_ADMIN_LOGIN_ID.includes(loginId) : false;
};

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  iconSrc?: string;
  icon?: ReactNode;
  devOnly?: boolean; // 開発者のみ表示
  adminOnly?: boolean; // 特別管理者のみ表示
}

// 共通ナビゲーションアイテム
// サイドバー/モバイルメニュー用のlabelとボトムナビ用のshortLabelを持つ
export const navItems: NavItem[] = [
  {
    to: '/dashboard',
    label: 'ダッシュボード',
    shortLabel: 'ホーム',
    iconSrc: '/images/Home.webp'
  },
  { to: '/gyms', label: 'ジム検索', shortLabel: 'ジム', iconSrc: '/images/mapicon.webp' },
  { to: '/supplements', label: 'サプリメント', shortLabel: 'サプリ', iconSrc: '/images/supplementicon.webp' },
  { to: '/gear', label: 'ギア紹介', shortLabel: 'ギア', iconSrc: '/images/gearicon.webp' },
  { to: '/exercises', label: '種目紹介', shortLabel: '種目', iconSrc: '/images/dumbbellicon.webp' },
  { to: '/records', label: '記録', shortLabel: '記録', iconSrc: '/images/memoicon.webp' },
  { to: '/pet', label: 'パートナー', shortLabel: 'ペット', iconSrc: '/images/pet.webp' },
  { to: '/settings', label: '設定', shortLabel: '設定', iconSrc: '/images/setting.webp' }, // アイコンは仮でギアを使用
  { to: '/help', label: 'ヘルプ', shortLabel: 'ヘルプ', iconSrc: '/images/help.webp' },
  { to: '/admin/levels', label: '管理', shortLabel: '管理', iconSrc: '/images/setting.webp', adminOnly: true },
];

// 開発者フィルタを適用したナビゲーションアイテムを取得
export const getFilteredNavItems = (displayName?: string | null, loginId?: string | null): NavItem[] => {
  const isDev = isDeveloper(displayName);
  const isAdmin = isSpecialAdmin(loginId);
  return navItems.filter(item => {
    if (item.devOnly && !isDev) return false;
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });
};

// レベル進捗率の計算
export const calculateLevelProgress = (currentExp?: number, expToNextLevel?: number): number => {
  if (!expToNextLevel) return 0;
  return Math.round((currentExp || 0) / expToNextLevel * 100);
};

// アバターの頭文字を取得
export const getAvatarInitial = (displayName?: string | null): string => {
  return displayName?.charAt(0).toUpperCase() || 'U';
};
