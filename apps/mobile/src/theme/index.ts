export const colors = {
  // Brand
  primary:     '#6366f1',
  primaryDark: '#4f46e5',
  primaryLight:'#818cf8',
  success:     '#10b981',
  danger:      '#ef4444',
  warning:     '#f59e0b',
  savings:     '#14b8a6',   // teal — used for all savings displays

  // Gradients (start → end)
  gradientPrimary: ['#6366f1', '#8b5cf6'] as [string, string],
  gradientSuccess: ['#10b981', '#059669'] as [string, string],
  gradientDanger:  ['#ef4444', '#dc2626'] as [string, string],

  // Dark theme (default)
  dark: {
    bg:           '#0a0f1e',
    surface:      '#141b2d',
    surfaceHigh:  '#1e2a42',
    border:       '#1e2a42',
    borderStrong: '#2d3d5a',
    text:         '#f1f5f9',
    textMuted:    '#94a3b8',
    textSubtle:   '#4e6380',
  },

  // Light theme
  light: {
    bg:           '#f0f4ff',
    surface:      '#ffffff',
    surfaceHigh:  '#f1f5f9',
    border:       '#e2e8f0',
    borderStrong: '#cbd5e1',
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
  sm:   8,
  md:   12,
  lg:   18,
  xl:   24,
  xxl:  32,
  full: 999,
} as const;

export const typography = {
  xs:   { fontSize: 11, lineHeight: 16 },
  sm:   { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 22 },
  lg:   { fontSize: 17, lineHeight: 24 },
  xl:   { fontSize: 20, lineHeight: 28 },
  '2xl':{ fontSize: 24, lineHeight: 32 },
  '3xl':{ fontSize: 32, lineHeight: 40 },
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primary: {
    shadowColor: '#6366f1',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
} as const;
