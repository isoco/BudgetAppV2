import { create } from 'zustand';

interface ThemeStore {
  mode: 'dark' | 'light' | 'system';
  setMode: (mode: 'dark' | 'light' | 'system') => void;
}

export const useThemeStore = create<ThemeStore>(set => ({
  mode: 'dark',
  setMode: mode => set({ mode }),
}));
