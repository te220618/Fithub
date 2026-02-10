// ギア関連の型定義
export interface GearCategory {
  id: number;
  name: string;
  description?: string;
  iconPath?: string;
  iconColor?: string;
  typeCount?: number;
}

export interface GearType {
  id: number;
  name: string;
  priceRange?: string;
  categoryId: number;
  merits: string[];
  demerits: string[];
}
