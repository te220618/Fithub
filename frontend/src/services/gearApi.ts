import api from './api';
import type { GearCategory, GearType } from '../types/gear';

// ギアカテゴリ一覧取得（typeCount付き）
export const getGearCategories = async (): Promise<GearCategory[]> => {
  const response = await api.get('/api/gear/categories');
  return response.data;
};

// カテゴリ別ギアタイプ取得
export const getGearTypesByCategory = async (
  categoryId: number
): Promise<GearType[]> => {
  const response = await api.get(`/api/gear/category/${categoryId}/types`);
  return response.data;
};
