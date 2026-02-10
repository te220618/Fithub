import api, { getCookie } from './api';
import type { User, UpdateDisplayNameRequest, UpdatePasswordRequest } from '../types';

// ユーザー情報取得
export const getUserInfo = async (): Promise<User> => {
  const response = await api.get('/api/user/info');
  const data = response.data;
  return {
    ...data,
    isOAuthUser: data?.oauthProvider ? data.oauthProvider !== 'LOCAL' : false,
  } as User;
};

// 表示名更新
export const updateDisplayName = async (data: UpdateDisplayNameRequest): Promise<void> => {
  await api.put('/api/user/display-name', data);
};

// パスワード更新
export const updatePassword = async (data: UpdatePasswordRequest): Promise<void> => {
  await api.put('/api/user/password', data);
};

// アカウント削除
export const deleteAccount = async (): Promise<void> => {
  await api.delete('/api/user/account');
};

// ログイン
export const login = async (username: string, password: string): Promise<void> => {
  // CSRFトークンを取得するために、まずCSRFエンドポイントを呼び出す
  // (/loginへのGETはSpring SecurityのログインページとしてThymeleafを期待するため使用しない)
  await api.get('/api/csrf');
  
  const csrfToken = getCookie('XSRF-TOKEN');
  
  // URLSearchParamsを使用してフォームデータを送信
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);
  
  await api.post('/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
    },
  });
};

// ログアウト
export const logout = async (): Promise<void> => {
  await api.post('/logout');
};

// 登録キャンセル
export const cancelRegistration = async (): Promise<void> => {
  await api.post('/api/auth/cancel-registration');
};

// 新規登録
export const register = async (
  loginId: string,
  password: string,
  confirmPassword: string
): Promise<void> => {
  // CSRFトークンを取得
  await api.get('/api/csrf');
  
  const csrfToken = getCookie('XSRF-TOKEN');
  
  // フォーム形式で送信
  const params = new URLSearchParams();
  params.append('loginId', loginId);
  params.append('password', password);
  params.append('confirmPassword', confirmPassword);
  
  await api.post('/register', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
    },
  });
};

// プロフィール保存
export const saveProfile = async (
  displayName: string,
  gender: string,
  birthday: string
): Promise<void> => {
  const csrfToken = getCookie('XSRF-TOKEN');
  
  const params = new URLSearchParams();
  params.append('displayName', displayName);
  if (gender) params.append('gender', gender);
  if (birthday) params.append('birthday', birthday);
  
  await api.post('/profile', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
    },
  });
};

// 登録状態チェック
export const checkRegistrationStatus = async (): Promise<{ hasPendingRegistration: boolean }> => {
  const response = await api.get('/api/auth/registration-status');
  return response.data;
};
