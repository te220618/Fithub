import { create } from 'zustand';
import type { User } from '../types';
import { getUserInfo } from '../services/authApi';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  
  // アクション
  fetchUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  
  fetchUser: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await getUserInfo();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
  
  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },
  
  clearUser: () => {
    set({ user: null, isAuthenticated: false });
  },
}));
