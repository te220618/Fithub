import api from './api';
import type { Supplement } from '../types';

// カテゴリ別サプリメント取得
export const getSupplementsByCategory = async (
  categoryCode: string
): Promise<Supplement[]> => {
  const response = await api.get(`/api/supplements/category/${categoryCode}`);
  return response.data;
};
