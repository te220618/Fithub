// ワークアウト関連の型定義
export interface TrainingRecord {
  id: number;
  date: string;
  memo?: string;
  exercises: TrainingRecordExercise[];
  // 経験値関連（POST時のレスポンスに含まれる）
  expGained?: number;
  newLevel?: number;
  totalExp?: number;
  currentLevel?: number;
  levelProgress?: number;
}

export interface TrainingRecordExercise {
  id: number;
  name: string;
  muscle: string;
  custom: boolean;
  sets: TrainingSet[];
  tags?: Tag[];
  defaultTags?: string[];
}

export interface TrainingSet {
  id: number;
  setNumber: number;
  weight: number;
  reps: number;
}

export interface Tag {
  id: number;
  name: string;
  color?: string;
}

export interface MuscleGroup {
  id: number;
  name: string;
  displayName: string;
}

export interface WorkoutExercise {
  id: number;
  name: string;
  muscle: string;              // バックエンドから返される部位名
  custom: boolean;             // バックエンドから返されるカスタム種目フラグ
  defaultTags?: string[];      // 種目マスターのデフォルトタグ（緑色）
  userAddedDefaultTags?: string[];  // ユーザーが追加したデフォルトタグ（紫色）
  tags?: Tag[];                // カスタムタグ
  // 互換性のためのエイリアス（既存コード用）
  muscleGroupId?: number;
  muscleGroupName?: string;
  isCustom?: boolean;
}

export interface SaveWorkoutRequest {
  date: string;
  memo?: string;
  exercises: SaveWorkoutExercise[];
}

export interface SaveWorkoutExercise {
  exerciseId: number;
  sets: SaveWorkoutSet[];
}

export interface SaveWorkoutSet {
  weight: number;
  reps: number;
}

export interface CustomExerciseRequest {
  name: string;
  muscle: string;
}

export interface HeatmapData {
  [date: string]: number;
}

export interface VolumeData {
  [date: string]: number;
}

// バックエンドから返されるヒートマップレスポンス
export interface HeatmapResponse {
  heatmapData: HeatmapData;
  volumeData: VolumeData;
  heatmapStart: string;
  heatmapEnd: string;
  year: number;
}

export interface UserStats {
  level: number;
  currentExp: number;
  expToNextLevel: number;
  totalWorkouts: number;
  totalVolume: number;
  currentStreak: number;
  longestStreak: number;
  // Dashboard用の追加フィールド
  weeklyWorkouts?: number;
  weeklyWorkoutsChange?: number;
  weeklyVolumeChangePercent?: number;
  bestRecordsCount?: number;
  recentRecords?: {
    date: string;
    exerciseCount: number;
    totalVolume: number;
    setCount: number;
    primaryMuscles: string[];
    expEarned: number;
  }[];
  weeklyVolumeHistory?: {
    date: string;
    volume: number;
  }[];
  muscleStatuses?: {
    muscleName: string;
    lastTrained: string | null;
    daysSinceLastTrained: number;
    status: 'recovering' | 'ready' | 'stale';
  }[];
}
