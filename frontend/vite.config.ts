import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // API エンドポイント
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // 認証関連エンドポイント（全てバックエンドにプロキシ）
      '/login': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // GETリクエストはReactのルーティングで処理、POST/その他はバックエンドへ
        bypass: (req) => {
          if (req.method === 'GET') {
            return '/index.html'; // Reactアプリにフォールバック
          }
          // POST等はundefinedを返してプロキシを実行
          return undefined;
        },
      },
      '/logout': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/oauth2': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // OAuth2コールバック
      '/login/oauth2': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/register': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET') {
            return '/index.html';
          }
          return undefined;
        },
      },
      '/profile': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET') {
            return '/index.html';
          }
          return undefined;
        },
      },
    },
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // コード分割設定（初期バンドルサイズ削減）
        manualChunks: {
          // React関連ライブラリ
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // データフェッチ関連
          'query': ['@tanstack/react-query'],
          // 日付処理
          'date-fns': ['date-fns'],
          // アイコン（大きなライブラリなので分離）
          'icons': ['lucide-react'],
          // 状態管理
          'zustand': ['zustand'],
        },
      },
    },
  },
})
