// 認証関連の型定義
export interface User {
  id: number;
  displayName: string | null;
  loginId: string;
  isOAuthUser: boolean;
  profileImageUrl?: string | null;
  oauthProvider?: string;
  level?: number;
  currentExp?: number;
  expToNextLevel?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  loginId: string;
  password: string;
  displayName?: string;
}

export interface UpdateDisplayNameRequest {
  displayName: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}
