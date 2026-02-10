import api from './api';
import type { AdminUser, UpdateLevelResponse } from '../types/admin';

/**
 * 管理者用ユーザー一覧を取得
 */
export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await api.get('/api/admin/users');
  return response.data;
};

/**
 * ユーザーのレベルを更新
 * @param userId ユーザーID
 * @param level 新しいレベル
 */
export const updateUserLevel = async (
  userId: number,
  level: number
): Promise<UpdateLevelResponse> => {
  const response = await api.put(`/api/admin/users/${userId}/level`, { level });
  return response.data;
};
