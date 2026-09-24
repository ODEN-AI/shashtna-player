import { useMemo } from 'react';

import { AccentTokens, resolveAccent } from '../features/appearance/accents';
import { useAppPreferences } from './AppPreferencesContext';
import { SHASHTNA_THEME } from './theme';

export type Palette = {
  mode: 'dark' | 'light';
  background: string;
  canvas: string;
  backgroundSoft: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  /** Subtle translucent "glass" fill for cards/panels (no blur; cheap on TV). */
  glass: string;
  glassBorder: string;
  border: string;
  borderStrong: string;
  text: string;
  secondary: string;
  muted: string;
  /** Accent-derived tokens (user preference). */
  accent: AccentTokens;
  primary: string;
  primaryText: string;
  primarySoft: string;
  focus: string;
  overlay: string;
  heroFade: string;
  heroFadeRtl: string;
  heroBottom: string;
  sidebar: string;
};

type BasePalette = Omit<Palette, 'accent' | 'primary' | 'primaryText' | 'primarySoft' | 'focus'>;

const c = SHASHTNA_THEME.colors;
const g = SHASHTNA_THEME.gradients;

const DARK_BASE: BasePalette = {
  mode: 'dark',
  // Screens are transparent in dark mode so the AppShell background
  // (Image 1 + scrim) shows through; use `canvas` where a solid fill is needed.
  background: 'transparent',
  canvas: c.background,
  backgroundSoft: c.backgroundSoft,
  surface: c.surface,
  surfaceElevated: c.surfaceElevated,
  surfaceHover: 'rgba(140,180,255,0.10)',
  glass: 'linear-gradient(160deg, rgba(24,38,76,0.62) 0%, rgba(8,14,32,0.54) 100%)',
  glassBorder: 'rgba(170,200,255,0.16)',
  border: c.borderSoft,
  borderStrong: c.borderStrong,
  text: c.textPrimary,
  secondary: c.textSecondary,
  muted: c.textTertiary,
  overlay: 'rgba(2,4,9,0.78)',
  heroFade: g.heroLtr,
  heroFadeRtl: g.heroRtl,
  heroBottom: g.heroBottom,
  sidebar: g.sidebar,
};

// Warm ivory light theme: calmer than pure white, same hierarchy as dark.
const LIGHT_BASE: BasePalette = {
  mode: 'light',
  background: '#F7F5F0',
  canvas: '#F7F5F0',
  backgroundSoft: '#EFECE5',
  surface: '#FFFDF9',
  surfaceElevated: '#F3F0E9',
  surfaceHover: 'rgba(60,50,30,0.05)',
  glass: 'linear-gradient(160deg, rgba(255,253,249,0.92) 0%, rgba(243,240,233,0.88) 100%)',
  glassBorder: 'rgba(60,50,30,0.10)',
  border: '#E6E0D5',
  borderStrong: '#D6CEC0',
  text: '#1E1B16',
  secondary: '#554E43',
  muted: '#877F72',
  overlay: 'rgba(30,27,22,0.55)',
  heroFade:
    'linear-gradient(90deg, rgba(247,245,240,0.98) 0%, rgba(247,245,240,0.86) 40%, rgba(247,245,240,0.2) 75%, rgba(247,245,240,0) 100%)',
  heroFadeRtl:
    'linear-gradient(270deg, rgba(247,245,240,0.98) 0%, rgba(247,245,240,0.86) 40%, rgba(247,245,240,0.2) 75%, rgba(247,245,240,0) 100%)',
  heroBottom: 'linear-gradient(0deg, rgba(247,245,240,1) 0%, rgba(247,245,240,0) 50%)',
  sidebar: 'linear-gradient(180deg, #FFFDF9 0%, #F3F0E9 100%)',
};

export function buildPalette(mode: 'dark' | 'light', accent: AccentTokens): Palette {
  const base = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  return {
    ...base,
    accent,
    primary: mode === 'light' ? accent.deep : accent.base,
    primaryText: mode === 'light' ? accent.deep : accent.light,
    primarySoft: accent.soft,
    // White rings vanish on light surfaces, so light mode focuses in the accent.
    focus: mode === 'light' ? accent.deep : '#FFFFFF',
  };
}

export const DARK_PALETTE = buildPalette('dark', resolveAccent('shashtna'));
export const LIGHT_PALETTE = buildPalette('light', resolveAccent('shashtna'));

export function usePalette(): Palette {
  const { themeMode, accent, customAccent } = useAppPreferences();
  return useMemo(
    () => buildPalette(themeMode, resolveAccent(accent, customAccent)),
    [themeMode, accent, customAccent],
  );
}

/** Shared focus treatment for D-pad navigation. */
export function focusStyle(p: Palette, scale: number = SHASHTNA_THEME.focus.scale) {
  return {
    borderColor: p.focus,
    borderWidth: 2,
    transform: [{ scale }],
    boxShadow:
      p.mode === 'dark'
        ? `0px 0px 0px 3px ${p.accent.glow}, 0px 14px 30px rgba(0,0,0,0.55)`
        : `0px 10px 24px ${p.accent.soft}`,
    zIndex: 50,
  } as const;
}
