import axios from 'axios';
import { useUIStore } from '../stores/uiStore';

/**
 * Cookieからトークンを取得するユーティリティ
 * CSRFトークンの取得などに使用
 */
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

// Axiosインスタンス作成
// Viteプロキシが/api, /login等を自動的にSpring Boot(localhost:5000)に転送するため、baseURLは空のまま
const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター（CSRF対応）
api.interceptors.request.use(
  (config) => {
    const token = getCookie('XSRF-TOKEN');
    if (token) {
      // Spring SecurityのCookieCsrfTokenRepositoryはURLエンコードされたトークンを返すため、デコードが必要
      config.headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// レスポンスインターセプター（エラーハンドリング + Toast通知）
api.interceptors.response.use(
  (response) => {
    // APIレスポンスがHTML（ログイン画面など）の場合はセッション切れとみなしてリダイレクト
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        window.location.href = '/login';
      }
      return Promise.reject(new Error('Session expired or unauthorized redirect'));
    }
    return response;
  },
  (error) => {
    const showToast = useUIStore.getState().showToast;

    if (error.response?.status === 401) {
      // 未認証の場合、ログイン/登録/プロフィールページ以外ならリダイレクト
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/profile') {
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      showToast('アクセスが拒否されました', 'error');
    } else if (error.response?.status === 404) {
      showToast('リソースが見つかりませんでした', 'error');
    } else if (error.response?.status >= 500) {
      showToast('サーバーエラーが発生しました', 'error');
    } else if (error.code === 'ERR_NETWORK') {
      showToast('ネットワークエラーが発生しました', 'error');
    }

    return Promise.reject(error);
  }
);

export default api;
