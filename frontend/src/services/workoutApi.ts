import api from './api';
import type {
  TrainingRecord,
  WorkoutExercise,
  Tag,
  MuscleGroup,
  SaveWorkoutRequest,
  CustomExerciseRequest,
  HeatmapResponse,
  UserStats,
} from '../types';

// ワークアウト記録取得
export const getWorkoutRecords = async (): Promise<TrainingRecord[]> => {
  const response = await api.get('/api/workout/records');
  return response.data;
};

// ワークアウト記録取得（ページネーション）
export const getWorkoutRecordsPaged = async (
  page: number = 0,
  size: number = 20
): Promise<{ content: TrainingRecord[]; totalPages: number; last: boolean; hasNext?: boolean }> => {
  const response = await api.get('/api/workout/records/paged', {
    params: { page, size },
  });
  const data = response.data;
  
  // バックエンドのhasNextをフロントエンドのlastに変換
  return {
    content: data.content,
    totalPages: data.totalPages,
    last: data.last !== undefined ? data.last : !data.hasNext,
    hasNext: data.hasNext,
  };
};

// ワークアウト記録保存
export const saveWorkoutRecord = async (data: SaveWorkoutRequest): Promise<TrainingRecord> => {
  const response = await api.post('/api/workout/records', data);
  return response.data;
};

// ワークアウト記録削除
export const deleteWorkoutRecord = async (id: number): Promise<void> => {
  await api.delete(`/api/workout/records/${id}`);
};

// セット削除
export const deleteWorkoutSet = async (id: number): Promise<void> => {
  await api.delete(`/api/workout/sets/${id}`);
};

// 種目一覧取得
export const getWorkoutExercises = async (): Promise<WorkoutExercise[]> => {
  const response = await api.get('/api/workout/exercises');
  return response.data;
};

// カスタム種目作成
export const createCustomExercise = async (
  data: CustomExerciseRequest
): Promise<WorkoutExercise> => {
  const response = await api.post('/api/workout/custom-exercises', data);
  return response.data;
};

// カスタム種目削除
export const deleteCustomExercise = async (id: number): Promise<void> => {
  await api.delete(`/api/workout/custom-exercises/${id}`);
};

// タグ一覧取得
export const getTags = async (): Promise<Tag[]> => {
  const response = await api.get('/api/workout/tags');
  return response.data;
};

// タグ作成
export const createTag = async (name: string, color?: string): Promise<Tag> => {
  const response = await api.post('/api/workout/tags', { name, color });
  return response.data;
};

// タグ削除
export const deleteTag = async (id: number): Promise<void> => {
  await api.delete(`/api/workout/tags/${id}`);
};

// 種目にタグを付与
export const updateExerciseTags = async (
  exerciseId: number,
  tagIds: number[],
  defaultTags?: string[]
): Promise<void> => {
  await api.post(`/api/workout/exercises/${exerciseId}/tags`, { tagIds, defaultTags });
};

// 部位一覧取得
export const getMuscleGroups = async (): Promise<MuscleGroup[]> => {
  const response = await api.get('/api/workout/muscle-groups');
  return response.data;
};

// デフォルトタグ取得
export const getDefaultTags = async (): Promise<string[]> => {
  const response = await api.get('/api/workout/default-tags');
  return response.data;
};

// ヒートマップデータ取得
export const getHeatmapData = async (year: number): Promise<HeatmapResponse> => {
  const response = await api.get('/api/dashboard/heatmap', {
    params: { year },
  });
  return response.data;
};

// ユーザー統計取得
export const getUserStats = async (): Promise<UserStats> => {
  const response = await api.get('/api/user/stats');
  return response.data;
};

// 特定種目の前回記録を取得（フロントエンドで既存データから検索）
export const findPreviousRecordForExercise = (
  records: TrainingRecord[],
  exerciseId: number,
  currentDate: string
): { weight: number; reps: number }[] | null => {
  // 日付降順でソート
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (const record of sortedRecords) {
    // 現在の日付と同じ記録はスキップ
    if (record.date === currentDate) continue;

    // 該当する種目を検索
    const exercise = record.exercises?.find((ex) => ex.id === exerciseId);
    if (exercise && exercise.sets && exercise.sets.length > 0) {
      return exercise.sets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
      }));
    }
  }

  return null;
};

// ==========================================
// PR（Personal Record）計算
// ==========================================
// PR判定ロジック:
// - PR: その種目で過去最高の重量を挙げた記録
// - repPR: 最高重量での過去最高回数を挙げた記録
// - 重量を優先し、同じ重量なら回数が多い方を優先
// ==========================================

export interface PRInfo {
  maxWeightPR?: boolean;
  repPR?: boolean;
  isCurrentMaxPR?: boolean;
  isCurrentRepPR?: boolean;
  date: string;
  exercise: string;
  weight: number;
  reps: number;
  setIndex: number;
}

export interface PRData {
  [key: string]: PRInfo;
}

export interface PRCalculationResult {
  prData: PRData;
  maxWeightByExercise: { [exerciseName: string]: number };
  maxRepsAtMaxWeight: { [exerciseName: string]: number };
}

// PRキーを生成（セットインデックス付き）
export const getPRKey = (date: string, exerciseName: string, setIndex: number): string => {
  return `${date}_${exerciseName}_${setIndex}`;
};

// 日付にPRがあるか確認
export const dateHasPR = (prData: PRData, dateStr: string): boolean => {
  return Object.keys(prData).some((key) => key.startsWith(dateStr + '_'));
};

// 日付に現在PRがあるか確認
export const dateHasCurrentPR = (prData: PRData, dateStr: string): boolean => {
  return Object.keys(prData).some((key) => {
    if (!key.startsWith(dateStr + '_')) return false;
    const pr = prData[key];
    return pr.isCurrentMaxPR || pr.isCurrentRepPR;
  });
};

// PRデータを計算
export const calculatePRs = (records: TrainingRecord[]): PRCalculationResult => {
  const prData: PRData = {};

  // 日付昇順でソート（古い順に処理）
  const sortedRecords = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // 種目ごとの最高記録を追跡
  const maxWeightByExercise: { [exerciseName: string]: number } = {};
  const maxRepsAtMaxWeight: { [exerciseName: string]: number } = {};

  // 各記録を走査してPRを判定
  sortedRecords.forEach((record) => {
    record.exercises?.forEach((ex) => {
      const exerciseName = ex.name;

      if (!maxWeightByExercise[exerciseName]) {
        maxWeightByExercise[exerciseName] = 0;
        maxRepsAtMaxWeight[exerciseName] = 0;
      }

      ex.sets?.forEach((set, setIndex) => {
        // セットごとにユニークなキーを生成（インデックス付き）
        const key = getPRKey(record.date, exerciseName, setIndex);

        // ==============================
        // PR判定（最大重量記録）
        // ==============================
        if (set.weight > maxWeightByExercise[exerciseName]) {
          maxWeightByExercise[exerciseName] = set.weight;
          maxRepsAtMaxWeight[exerciseName] = set.reps; // 新しい最高重量なのでrepsもリセット

          prData[key] = {
            maxWeightPR: true,
            repPR: true, // 新しい最高重量は同時にrepPRでもある
            date: record.date,
            exercise: exerciseName,
            weight: set.weight,
            reps: set.reps,
            setIndex: setIndex,
          };
        }
        // ==============================
        // repPR判定（最高重量での最高回数）
        // ==============================
        else if (
          set.weight === maxWeightByExercise[exerciseName] &&
          set.reps > maxRepsAtMaxWeight[exerciseName]
        ) {
          maxRepsAtMaxWeight[exerciseName] = set.reps;

          prData[key] = {
            repPR: true,
            date: record.date,
            exercise: exerciseName,
            weight: set.weight,
            reps: set.reps,
            setIndex: setIndex,
          };
        }
      });
    });
  });

  // 現在のPR（NOW PR / NOW repPR）を特定
  Object.keys(prData).forEach((key) => {
    const pr = prData[key];
    if (!pr.exercise) return;

    // MAX重量PRがまだ破られていないか確認
    if (pr.maxWeightPR && pr.weight === maxWeightByExercise[pr.exercise]) {
      pr.isCurrentMaxPR = true;
    }

    // repPRがまだ破られていないか確認
    // 最高重量での最高回数である必要がある
    if (
      pr.repPR &&
      pr.weight === maxWeightByExercise[pr.exercise] &&
      pr.reps === maxRepsAtMaxWeight[pr.exercise]
    ) {
      pr.isCurrentRepPR = true;
    }
  });

  return { prData, maxWeightByExercise, maxRepsAtMaxWeight };
};

// 記録カード用のPRサマリーを取得
export interface PRSummaryItem {
  exercise: string;
  weight: number;
  reps: number;
  isMaxWeightPR: boolean;
  isRepPR: boolean;
  isCurrentMaxPR: boolean;
  isCurrentRepPR: boolean;
}

export const getPRSummaryForRecord = (
  record: TrainingRecord,
  prData: PRData
): { hasPR: boolean; hasNowPR: boolean; prSummary: PRSummaryItem[] } => {
  let hasPR = false;
  let hasNowPR = false;
  const prSummary: PRSummaryItem[] = [];

  record.exercises?.forEach((ex) => {
    ex.sets?.forEach((s, setIndex) => {
      const prKey = getPRKey(record.date, ex.name, setIndex);
      const pr = prData[prKey];

      if (pr) {
        hasPR = true;

        // NOW PR / NOW repPR の判定
        if (pr.isCurrentMaxPR || pr.isCurrentRepPR) {
          hasNowPR = true;
        }

        // PRサマリーに追加
        if (pr.maxWeightPR || pr.repPR) {
          prSummary.push({
            exercise: ex.name,
            weight: s.weight,
            reps: s.reps,
            isMaxWeightPR: pr.maxWeightPR || false,
            isRepPR: pr.repPR || false,
            isCurrentMaxPR: pr.isCurrentMaxPR || false,
            isCurrentRepPR: pr.isCurrentRepPR || false,
          });
        }
      }
    });
  });

  return { hasPR, hasNowPR, prSummary };
};
