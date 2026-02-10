import api from './api';

// ペット種類の型定義
export interface PetType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  imageEgg: string | null;
  imageChild: string | null;
  imageAdult: string | null;
  backgroundImage: string | null;
  unlockType: string | null;
  unlockLevel: number | null;
  unlockPetCode: string | null;
  isStarter: boolean | null;
}

// ペット情報の型定義
export interface PetData {
  id: number;
  name: string;
  petTypeId: number;
  petTypeCode: string | null;
  petType: PetType | null;
  stage: number;
  stageName: string;
  level: number;
  totalExp: number;
  expToNextLevel: number;
  levelProgress: number;
  moodScore: number;
  moodLabel: string;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string | null;
}

// ペット状態レスポンス
export interface PetStatusResponse {
  hasPet: boolean;
  pet: PetData | null;
}

// 未解放ペット種類
export interface LockedPetType {
  id: number;
  name: string;
  code: string;
  description: string | null;
  imageEgg: string | null;
  backgroundImage: string | null;
  unlockType: string | null;
  unlockLevel: number | null;
  unlockPetCode: string | null;
  unlockProgress: string;
}

// 小屋レスポンス
export interface BarnResponse {
  activePet: PetData | null;
  ownedPets: PetData[];
  unlockedTypes: PetType[];
  lockedTypes: LockedPetType[];
}

export interface CreatePetRequest {
  petTypeId: number;
  name?: string;
}

export interface UpdatePetRequest {
  name?: string;
}

const petApi = {
  /**
   * 選択可能なペット種類一覧を取得
   */
  getPetTypes: async (): Promise<PetType[]> => {
    const response = await api.get<PetType[]>('/api/pet-types');
    return response.data;
  },

  /**
   * ペット情報を取得（未作成時は hasPet: false）
   */
  getPet: async (): Promise<PetStatusResponse> => {
    const response = await api.get<PetStatusResponse>('/api/pet');
    return response.data;
  },

  /**
   * 小屋情報を取得（全所持ペット + 解放状況）
   */
  getBarn: async (): Promise<BarnResponse> => {
    const response = await api.get<BarnResponse>('/api/pet/barn');
    return response.data;
  },

  /**
   * ペットを作成（種類を選択して作成）
   */
  createPet: async (data: CreatePetRequest): Promise<PetStatusResponse> => {
    const response = await api.post<PetStatusResponse>('/api/pet', data);
    return response.data;
  },

  /**
   * 指定ペットをアクティブにする
   */
  activatePet: async (petId: number): Promise<PetStatusResponse> => {
    const response = await api.put<PetStatusResponse>(`/api/pet/${petId}/activate`);
    return response.data;
  },

  /**
   * 特定ペットの情報を更新（名前変更など）
   */
  updatePetById: async (petId: number, data: UpdatePetRequest): Promise<PetStatusResponse> => {
    const response = await api.put<PetStatusResponse>(`/api/pet/${petId}`, data);
    return response.data;
  },

  /**
   * アクティブペット情報を更新（名前変更など）- 旧API互換
   */
  updatePet: async (data: UpdatePetRequest): Promise<PetStatusResponse> => {
    const response = await api.put<PetStatusResponse>('/api/pet', data);
    return response.data;
  },

  /**
   * アクティブペットを小屋に戻す（削除ではない）
   */
  deletePet: async (): Promise<PetStatusResponse> => {
    const response = await api.delete<PetStatusResponse>('/api/pet');
    return response.data;
  },
};

export default petApi;
