import { useColorScheme } from 'react-native';
import { colors, spacing, radius, typography, shadow } from './index';
import { useThemeStore } from '../store/themeStore';

export function useTheme() {
  const systemScheme = useColorScheme() ?? 'dark';
  const { mode } = useThemeStore();
  const scheme = mode === 'system' ? systemScheme : mode;
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return { colors: { ...colors, ...palette }, spacing, radius, typography, shadow, isDark: scheme === 'dark' };
}
