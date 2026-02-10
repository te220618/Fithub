import api from './api';

// 型定義
export interface StreakInfo {
  current: number;
  best: number;
  lastActiveDate: string | null;
  graceDaysUsed: number;
  graceDaysAllowed: number;
}

export interface StreakResponse {
  training_streak: StreakInfo;
  login_streak: StreakInfo;
  trainingMultiplier: number;
  loginMultiplier: number;
  combinedMultiplier: number;
}

export interface LoginBonusResponse {
  success: boolean;
  alreadyClaimed: boolean;
  expEarned: number;
  currentLoginStreak: number;
  totalExp: number;
}

export interface SettingsResponse {
  graceDaysAllowed: number;
}

// API関数
export const streakApi = {
  // 現在のストリーク情報を取得
  getStreaks: async (): Promise<StreakResponse> => {
    const response = await api.get('/api/streak');
    return response.data;
  },

  // デイリーログインボーナスを受取
  claimLoginBonus: async (): Promise<LoginBonusResponse> => {
    const response = await api.post('/api/streak/login-bonus');
    return response.data;
  },

  // デイリーログインを記録（ストリークのみ、ボーナスなし）
  recordLogin: async (): Promise<{ success: boolean; currentLoginStreak: number }> => {
    const response = await api.post('/api/streak/record-login');
    return response.data;
  },

  // ユーザー設定を取得
  getSettings: async (): Promise<SettingsResponse> => {
    const response = await api.get('/api/settings');
    return response.data;
  },

  // ユーザー設定を更新
  updateSettings: async (graceDaysAllowed: number): Promise<SettingsResponse> => {
    const response = await api.post('/api/settings', { graceDaysAllowed });
    return response.data;
  },
};

export default streakApi;
