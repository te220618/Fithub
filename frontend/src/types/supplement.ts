// サプリメント関連の型定義
export interface SupplementEffect {
  id: number;
  effect_text: string;
  display_order: number;
}

export interface SupplementLink {
  id: number;
  url: string;
  description?: string;
  site_type?: string;
  display_order?: number;
}

export interface Supplement {
  id: number;
  name: string;
  description?: string;
  tier: string;
  dosage?: string;
  timing?: string;
  advice?: string;
  categoryCode?: string;
  categoryName?: string;
  effects: SupplementEffect[];
  links: SupplementLink[];
  imageUrl?: string;
}

export interface SupplementCategory {
  code: string;
  name: string;
  description?: string;
}
