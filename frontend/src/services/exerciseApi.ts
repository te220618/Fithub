import api from './api';
import type { Exercise, ExerciseFilter, PagedResponse } from '../types';

// バックエンドから返される実際の形式
interface ExerciseApiResponse {
  exercises: Array<{
    id: number;
    name: string;
    muscle: string;
    difficulty: number;
    description?: string;
    targetMuscles?: string[] | string; // バックエンドからはカンマ区切り文字列で返される場合あり
    videoPath?: string;
  }>;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

// targetMusclesをパースするヘルパー関数
const parseTargetMuscles = (targetMuscles?: string[] | string): { id: number; name: string }[] | undefined => {
  if (!targetMuscles) return undefined;
  
  // 文字列の場合はカンマで分割して配列に変換
  const musclesArray = typeof targetMuscles === 'string'
    ? targetMuscles.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    : targetMuscles;
  
  return musclesArray.map((name, idx) => ({ id: idx, name }));
};

// 種目一覧取得（ページネーション）
export const getExercisesPaged = async (
  page: number = 0,
  size: number = 12,
  filter?: ExerciseFilter
): Promise<PagedResponse<Exercise>> => {
  const params: Record<string, unknown> = { page, size };
  
  if (filter?.muscleGroupId) {
    params.muscles = String(filter.muscleGroupId);
  }
  if (filter?.difficulty) {
    params.difficulties = String(filter.difficulty);
  }
  if (filter?.targetMuscles && filter.targetMuscles.length > 0) {
    params.targetMuscles = filter.targetMuscles.join(',');
  }
  
  const response = await api.get<ExerciseApiResponse>('/api/exercises/paged', { params });
  const data = response.data;
  
  // バックエンドのレスポンスをフロントエンドの期待する形式に変換
  return {
    content: data.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      description: ex.description,
      difficulty: ex.difficulty,
      videoPath: ex.videoPath,
      muscleGroups: [{ id: 0, name: ex.muscle, displayName: ex.muscle }],
      targetMuscles: parseTargetMuscles(ex.targetMuscles),
    })),
    number: data.page,
    size: data.size,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
    last: !data.hasNext,
    first: data.page === 0,
  };
};

// ターゲット筋肉一覧を取得
export const getTargetMuscles = async (): Promise<string[]> => {
  const response = await api.get<string[]>('/api/exercises/target-muscles');
  return response.data;
};
