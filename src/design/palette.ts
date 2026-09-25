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

// Soft warm-stone light theme: low-glare, never pure white, same hierarchy as dark.
// Page #EEECE7; cards sit one step lighter, inputs/hover one step darker.
const LIGHT_BASE: BasePalette = {
  mode: 'light',
  background: '#EEECE7',
  canvas: '#EEECE7',
  backgroundSoft: '#E6E3DD',
  surface: '#F5F3EF',
  surfaceElevated: '#E8E5DF',
  surfaceHover: 'rgba(60,50,30,0.06)',
  glass: 'linear-gradient(160deg, rgba(245,243,239,0.94) 0%, rgba(236,233,227,0.90) 100%)',
  glassBorder: 'rgba(60,50,30,0.12)',
  border: '#DCD7CE',
  borderStrong: '#CCC5B8',
  text: '#1C1914',
  secondary: '#4D463C',
  muted: '#756D61',
  overlay: 'rgba(30,27,22,0.55)',
  heroFade:
    'linear-gradient(90deg, rgba(238,236,231,0.98) 0%, rgba(238,236,231,0.86) 40%, rgba(238,236,231,0.2) 75%, rgba(238,236,231,0) 100%)',
  heroFadeRtl:
    'linear-gradient(270deg, rgba(238,236,231,0.98) 0%, rgba(238,236,231,0.86) 40%, rgba(238,236,231,0.2) 75%, rgba(238,236,231,0) 100%)',
  heroBottom: 'linear-gradient(0deg, rgba(238,236,231,1) 0%, rgba(238,236,231,0) 50%)',
  sidebar: 'linear-gradient(180deg, #F3F1EC 0%, #E8E5DF 100%)',
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
