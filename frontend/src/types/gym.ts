// ジム関連の型定義
export interface Gym {
  id: number;
  name: string;
  address: string;
  area: string;
  monthlyFee?: number;
  openTime?: string;
  closeTime?: string;
  phone?: string;
  features: string[];
  tags: string[];
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
}

export interface GymFilter {
  keyword?: string;
  area?: string;
  areas?: string[];  // 複数エリア対応
  minFee?: number;
  maxFee?: number;
  tags?: string[];
}
