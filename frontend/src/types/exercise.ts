// 種目関連の型定義
export interface Exercise {
  id: number;
  name: string;
  description?: string;
  difficulty: number;
  videoPath?: string;
  muscleGroups: ExerciseMuscleGroup[];
  targetMuscles?: TargetMuscle[];
}

export interface ExerciseMuscleGroup {
  id: number;
  name: string;
  displayName: string;
}

export interface TargetMuscle {
  id: number;
  name: string;
}

export interface ExerciseFilter {
  muscleGroupId?: number;
  difficulty?: number;
  keyword?: string;
  targetMuscles?: string[];  // 複数ターゲット筋肉でのフィルタリング
}

// バックエンドの実際のレスポンス構造に合わせた型
export interface PagedResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
  last: boolean;
  first?: boolean;
}

// バックエンドから返される実際の形式（Exercises）
export interface ExercisePagedResponse {
  exercises: Exercise[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

// バックエンドから返される実際の形式（Gyms）
export interface GymPagedResponse {
  gyms: Gym[];
  count: number;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Gym型をインポートするための前方宣言（循環参照回避）
import type { Gym } from './gym';
