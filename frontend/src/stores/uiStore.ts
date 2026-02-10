import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface LevelUpData {
  newLevel: number;
  expGained: number;
}

interface UIState {
  // モバイルメニュー
  isMobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;

  // モーダル
  activeModal: string | null;
  modalData: unknown;
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: () => void;

  // Toast通知
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // レベルアップ演出
  levelUpData: LevelUpData | null;
  showLevelUp: (newLevel: number, expGained: number) => void;
  hideLevelUp: () => void;

  // ナビゲーション設定
  navOrder: string[];
  hiddenNavItems: string[];
  setNavOrder: (order: string[]) => void;
  toggleNavVisibility: (path: string) => void;
  resetNavSettings: () => void;

  // パフォーマンス設定
  iconAnimation: boolean;
  toggleIconAnimation: () => void;
  petAnimation: boolean;
  togglePetAnimation: () => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  // モバイルメニュー
  isMobileMenuOpen: false,
  toggleMobileMenu: () => {
    set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen }));
  },
  openMobileMenu: () => {
    set({ isMobileMenuOpen: true });
  },
  closeMobileMenu: () => {
    set({ isMobileMenuOpen: false });
  },

  // モーダル
  activeModal: null,
  modalData: null,
  openModal: (modalId, data) => {
    set({ activeModal: modalId, modalData: data });
  },
  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },

  // Toast通知
  toasts: [],
  showToast: (message, type = 'info') => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    // 自動で消す (2.5秒後)
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 2500);
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // レベルアップ演出
  levelUpData: null,
  showLevelUp: (newLevel, expGained) => {
    set({ levelUpData: { newLevel, expGained } });
  },
  hideLevelUp: () => {
    set({ levelUpData: null });
  },

  // ナビゲーション設定
  navOrder: JSON.parse(localStorage.getItem('navOrder') || '[]'),
  hiddenNavItems: JSON.parse(localStorage.getItem('hiddenNavItems') || '[]'),

  setNavOrder: (order: string[]) => {
    localStorage.setItem('navOrder', JSON.stringify(order));
    set({ navOrder: order });
  },

  toggleNavVisibility: (path: string) => {
    set((state) => {
      const isHidden = state.hiddenNavItems.includes(path);
      let newHiddenItems;

      if (isHidden) {
        // 表示にする（削除）
        newHiddenItems = state.hiddenNavItems.filter(p => p !== path);
      } else {
        // 非表示にする（追加）
        newHiddenItems = [...state.hiddenNavItems, path];
      }

      localStorage.setItem('hiddenNavItems', JSON.stringify(newHiddenItems));
      return { hiddenNavItems: newHiddenItems };
    });
  },

  resetNavSettings: () => {
    localStorage.removeItem('navOrder');
    localStorage.removeItem('hiddenNavItems');
    set({ navOrder: [], hiddenNavItems: [] });
  },

  // パフォーマンス設定
  iconAnimation: JSON.parse(localStorage.getItem('iconAnimation') ?? 'true'),
  toggleIconAnimation: () => {
    set((state) => {
      const newValue = !state.iconAnimation;
      localStorage.setItem('iconAnimation', JSON.stringify(newValue));
      return { iconAnimation: newValue };
    });
  },
  petAnimation: JSON.parse(localStorage.getItem('petAnimation') ?? 'true'),
  togglePetAnimation: () => {
    set((state) => {
      const newValue = !state.petAnimation;
      localStorage.setItem('petAnimation', JSON.stringify(newValue));
      return { petAnimation: newValue };
    });
  },
}));
