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
  border: string;
  borderStrong: string;
  text: string;
  secondary: string;
  muted: string;
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

const c = SHASHTNA_THEME.colors;
const g = SHASHTNA_THEME.gradients;

export const DARK_PALETTE: Palette = {
  mode: 'dark',
  // Screens are transparent in dark mode so the AppShell background
  // (Image 1 + scrim) shows through; use `canvas` where a solid fill is needed.
  background: 'transparent',
  canvas: c.background,
  backgroundSoft: c.backgroundSoft,
  surface: c.surface,
  surfaceElevated: c.surfaceElevated,
  surfaceHover: 'rgba(140,180,255,0.10)',
  border: c.borderSoft,
  borderStrong: c.borderStrong,
  text: c.textPrimary,
  secondary: c.textSecondary,
  muted: c.textTertiary,
  primary: c.primary,
  primaryText: c.primaryLight,
  primarySoft: c.primarySoft,
  focus: c.focus,
  overlay: 'rgba(2,4,9,0.78)',
  heroFade: g.heroLtr,
  heroFadeRtl: g.heroRtl,
  heroBottom: g.heroBottom,
  sidebar: g.sidebar,
};

export const LIGHT_PALETTE: Palette = {
  mode: 'light',
  background: '#F3F6FB',
  canvas: '#F3F6FB',
  backgroundSoft: '#EAF0F8',
  surface: '#FFFFFF',
  surfaceElevated: '#F6F9FD',
  surfaceHover: 'rgba(21,96,219,0.06)',
  border: '#DCE4F0',
  borderStrong: '#C3D0E3',
  text: '#0E1B2E',
  secondary: '#4A5B74',
  muted: '#7A8AA2',
  primary: c.primaryDeep,
  primaryText: c.primaryDeep,
  primarySoft: 'rgba(21,96,219,0.10)',
  // White rings vanish on light surfaces, so light mode focuses in brand blue.
  focus: c.primaryDeep,
  overlay: 'rgba(14,27,46,0.55)',
  heroFade:
    'linear-gradient(90deg, rgba(243,246,251,0.98) 0%, rgba(243,246,251,0.86) 40%, rgba(243,246,251,0.2) 75%, rgba(243,246,251,0) 100%)',
  heroFadeRtl:
    'linear-gradient(270deg, rgba(243,246,251,0.98) 0%, rgba(243,246,251,0.86) 40%, rgba(243,246,251,0.2) 75%, rgba(243,246,251,0) 100%)',
  heroBottom: 'linear-gradient(0deg, rgba(243,246,251,1) 0%, rgba(243,246,251,0) 50%)',
  sidebar: 'linear-gradient(180deg, #FFFFFF 0%, #F3F6FB 100%)',
};

export function usePalette(): Palette {
  const { themeMode } = useAppPreferences();
  return themeMode === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

/** Shared focus treatment for D-pad navigation. */
export function focusStyle(p: Palette, scale: number = SHASHTNA_THEME.focus.scale) {
  return {
    borderColor: p.focus,
    borderWidth: 2,
    transform: [{ scale }],
    boxShadow: p.mode === 'dark' ? SHASHTNA_THEME.shadows.focusGlow : '0px 10px 24px rgba(21,96,219,0.25)',
    zIndex: 50,
  } as const;
}
