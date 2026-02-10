import api from './api';
import type { Gym, GymFilter, PagedResponse } from '../types';

// バックエンドから返される実際の形式
interface GymApiResponse {
  gyms: Array<{
    id: number;
    name: string;
    address: string;
    phone?: string;
    priceRange?: string | number; // バックエンドからはIntegerで返される
    openHours?: string;
    tags: Array<{ id: number; name: string }>;
    latitude?: number;
    longitude?: number;
  }>;
  count: number;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ジム検索（ページネーション）
export const searchGymsPaged = async (
  page: number = 0,
  size: number = 12,
  filter?: GymFilter
): Promise<PagedResponse<Gym>> => {
  const params: Record<string, unknown> = { page, size };
  
  if (filter?.keyword) {
    params.search = filter.keyword;
  }
  // 複数エリア対応（カンマ区切り）
  if (filter?.areas && filter.areas.length > 0) {
    params.areas = filter.areas.join(',');
  } else if (filter?.area) {
    params.areas = filter.area;
  }
  if (filter?.maxFee !== undefined) {
    params.maxPrice = filter.maxFee;
  }
  if (filter?.tags && filter.tags.length > 0) {
    params.tags = filter.tags.join(',');
  }
  
  const response = await api.get<GymApiResponse>('/api/gyms/search/paged', { params });
  const data = response.data;
  
  // バックエンドのレスポンスをフロントエンドの期待する形式に変換
  return {
    content: data.gyms.map((gym) => ({
      id: gym.id,
      name: gym.name,
      address: gym.address,
      area: '', // バックエンドにはエリアフィールドがないためデフォルト
      monthlyFee: gym.priceRange != null
        ? (typeof gym.priceRange === 'number' 
            ? gym.priceRange 
            : parseInt(String(gym.priceRange).replace(/[^0-9]/g, '')) || undefined)
        : undefined,
      openTime: gym.openHours?.split('-')[0]?.trim(),
      closeTime: gym.openHours?.split('-')[1]?.trim(),
      phone: gym.phone,
      features: [],
      tags: gym.tags.map((t) => t.name),
      latitude: gym.latitude,
      longitude: gym.longitude,
    })),
    number: data.page,
    size: data.size,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    last: !data.hasNext,
    first: !data.hasPrevious,
  };
};

// ジム用タグ一覧を取得
export interface GymTag {
  id: number;
  name: string;
  displayOrder: number;
}

export const getGymTags = async (): Promise<GymTag[]> => {
  const response = await api.get<GymTag[]>('/api/gyms/tags');
  return response.data;
};
