// 管理者機能の型定義

/** 管理者用ユーザー情報 */
export interface AdminUser {
  id: number;
  loginId: string;
  displayName: string | null;
  level: number;
  totalExp: number;
}

/** レベル更新リクエスト */
export interface UpdateLevelRequest {
  level: number;
}

/** レベル更新レスポンス */
export interface UpdateLevelResponse {
  id: number;
  level: number;
  totalExp: number;
  message: string;
}
