import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { useUIStore } from './stores/uiStore';
import Layout from './components/layout/Layout';
import LevelUpCelebration from './components/records/LevelUpCelebration';

// ページコンポーネント（遅延読み込み）
import { lazy, Suspense } from 'react';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pet = lazy(() => import('./pages/Pet'));
const Records = lazy(() => import('./pages/Records'));
const Exercises = lazy(() => import('./pages/Exercises'));
const GymSearch = lazy(() => import('./pages/GymSearch'));
const Supplements = lazy(() => import('./pages/Supplements'));
const Gear = lazy(() => import('./pages/Gear'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Contact = lazy(() => import('./pages/Contact'));
const Help = lazy(() => import('./pages/Help'));
const AdminLevels = lazy(() => import('./pages/AdminLevels'));

// React Query クライアント
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分
      retry: 1,
    },
  },
});

// ローディングコンポーネント
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="app-loading-spinner" style={{ margin: '0 auto' }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>読み込み中...</p>
      </div>
    </div>
  );
}

// 認証が必要なルートのラッパー
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// 認証済みユーザーをリダイレクトするラッパー
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { fetchUser } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <Routes>
      {/* 公開ルート */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Suspense fallback={<LoadingScreen />}>
              <Login />
            </Suspense>
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Suspense fallback={<LoadingScreen />}>
              <Register />
            </Suspense>
          </PublicRoute>
        }
      />

      {/* プロフィール登録（登録フロー中・認証なし・Layoutなし） */}
      {/* Profile.tsx内で登録状態をチェックし、未登録ならregisterにリダイレクト */}
      <Route
        path="/profile"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <Profile />
          </Suspense>
        }
      />

      {/* 認証が必要なルート */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
<Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="pet"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Pet />
            </Suspense>
          }
        />
        <Route
          path="records"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Records />
            </Suspense>
          }
        />
        <Route
          path="exercises"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Exercises />
            </Suspense>
          }
        />
        <Route
          path="gyms"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <GymSearch />
            </Suspense>
          }
        />
        <Route
          path="supplements"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Supplements />
            </Suspense>
          }
        />
        <Route
          path="gear"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Gear />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Settings />
            </Suspense>
          }
        />
        <Route
          path="contact"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Contact />
            </Suspense>
          }
        />
        <Route
          path="help"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <Help />
            </Suspense>
          }
        />
        <Route
          path="admin/levels"
          element={
            <Suspense fallback={<LoadingScreen />}>
              <AdminLevels />
            </Suspense>
          }
        />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const { levelUpData, hideLevelUp } = useUIStore();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        {/* レベルアップ演出（グローバル） */}
        {levelUpData ? (
          <LevelUpCelebration
            newLevel={levelUpData.newLevel}
            expGained={levelUpData.expGained}
            onClose={hideLevelUp}
          />
        ) : null}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
