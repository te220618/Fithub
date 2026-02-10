import { lazy, Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import streakApi from '../../services/streakApi';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import Footer from './Footer';
import { useUIStore } from '../../stores/uiStore';
import { useSwipe } from '../../hooks';

// 遅延読み込み（初期バンドルサイズ削減）
const Sidebar = lazy(() => import('./Sidebar'));
const MobileMenu = lazy(() => import('./MobileMenu'));
const UserSettingsModal = lazy(() => import('./UserSettingsModal'));

// 軽量なローディングプレースホルダー
function SidebarSkeleton() {
  return (
    <aside className="sidebar" style={{ opacity: 0.5 }}>
      <div className="sidebar-header">
        <div style={{ width: 32, height: 32, background: 'var(--border)', borderRadius: '50%' }} />
      </div>
    </aside>
  );
}

export default function Layout() {
  const { toasts, removeToast, activeModal, openMobileMenu, closeMobileMenu } = useUIStore();
  const queryClient = useQueryClient();

  const swipeHandlers = useSwipe({
    onSwipeRight: () => openMobileMenu(),
    onSwipeLeft: () => closeMobileMenu(),
    minSwipeDistance: 80, // 少し長めに設定して誤爆防止
    maxSwipeDistanceY: 60,
  });

  // ログイン記録（1日1回）
  useEffect(() => {
    const recordLogin = async () => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const lastLogin = localStorage.getItem('lastLoginRecorded');

      if (lastLogin !== today) {
        try {
          await streakApi.recordLogin();
          localStorage.setItem('lastLoginRecorded', today);
          // ストリーク情報を更新
          queryClient.invalidateQueries({ queryKey: ['streaks'] });
        } catch (error) {
          console.error('Failed to record login streak:', error);
        }
      }
    };

    recordLogin();
  }, [queryClient]);

  return (
    <div className="app-layout" {...swipeHandlers}>
      {/* サイドバー（PC） */}
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>

      {/* モバイルヘッダー */}
      <MobileHeader />

      {/* モバイルメニュー（遅延読み込み） */}
      <Suspense fallback={null}>
        <MobileMenu />
      </Suspense>

      {/* メインコンテンツ */}
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1, width: '100%' }}>
          <Outlet />
        </div>
        <Footer />
      </main>

      {/* ボトムナビ（モバイル） */}
      <BottomNav />

      {/* ユーザー設定モーダル（開いた時のみ読み込み） */}
      {activeModal === 'user-settings' ? (
        <Suspense fallback={null}>
          <UserSettingsModal />
        </Suspense>
      ) : null}

      {/* Toast通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// Toast Container Component
function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 24,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="status-message visible"
          onClick={() => onRemove(toast.id)}
          style={{
            position: 'relative',
            opacity: 1,
            pointerEvents: 'auto',
            cursor: 'pointer',
            borderColor: toast.type === 'error' ? '#f87171' : 'var(--gold)',
            color: toast.type === 'error' ? '#f87171' : 'var(--gold)',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '⚠️ ' : ''}
          {toast.message}
        </div>
      ))}
    </div>
  );
}
