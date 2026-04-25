import { create } from 'zustand';

interface PrivacyState {
  privacyEnabled: boolean;
  isLocked: boolean;
  biometricEnabled: boolean;
  hideCats: string;
  setPrivacy: (patch: Partial<Omit<PrivacyState, 'setPrivacy'>>) => void;
}

export const usePrivacyStore = create<PrivacyState>(set => ({
  privacyEnabled: false,
  isLocked: true,
  biometricEnabled: false,
  hideCats: 'all',
  setPrivacy: patch => set(prev => ({ ...prev, ...patch })),
}));

/** Returns true when income values should be hidden. */
export function useIncomeHidden(): boolean {
  const { privacyEnabled, isLocked } = usePrivacyStore();
  return privacyEnabled && isLocked;
}
