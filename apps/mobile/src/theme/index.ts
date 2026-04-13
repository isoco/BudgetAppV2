export const colors = {
  // Brand
  primary:   '#6366f1',
  primaryDark:'#4f46e5',
  success:   '#10b981',
  danger:    '#ef4444',
  warning:   '#f59e0b',

  // Dark theme (default)
  dark: {
    bg:           '#0f172a',
    surface:      '#1e293b',
    surfaceHigh:  '#334155',
    border:       '#334155',
    text:         '#f1f5f9',
    textMuted:    '#94a3b8',
    textSubtle:   '#64748b',
  },

  // Light theme
  light: {
    bg:           '#f8fafc',
    surface:      '#ffffff',
    surfaceHigh:  '#f1f5f9',
    border:       '#e2e8f0',
    text:         '#0f172a',
    textMuted:    '#64748b',
    textSubtle:   '#94a3b8',
  },
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  full: 999,
} as const;

export const typography = {
  xs:   { fontSize: 11, lineHeight: 16 },
  sm:   { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 22 },
  lg:   { fontSize: 17, lineHeight: 24 },
  xl:   { fontSize: 20, lineHeight: 28 },
  '2xl':{ fontSize: 24, lineHeight: 32 },
  '3xl':{ fontSize: 30, lineHeight: 38 },
} as const;
