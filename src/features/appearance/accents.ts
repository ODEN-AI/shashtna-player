/**
 * User-selectable accent colours.
 *
 * The accent only drives controlled accent surfaces (focus, selection,
 * primary buttons, progress, active navigation, small highlights). Background,
 * body text and surface tokens never change with it, so every accent keeps
 * the same contrast and overall look.
 */
export type AccentId = 'shashtna' | 'cyan' | 'purple' | 'green' | 'rose' | 'custom';

export type AccentSwatch = { id: AccentId; labelAr: string; labelEn: string; base: string };

export const ACCENT_PRESETS: AccentSwatch[] = [
  { id: 'shashtna', labelAr: 'أزرق شاشتنا', labelEn: 'Shashtna Blue', base: '#2F7BFF' },
  { id: 'cyan', labelAr: 'سماوي', labelEn: 'Cyan', base: '#14B8D9' },
  { id: 'purple', labelAr: 'بنفسجي', labelEn: 'Purple', base: '#8B5CF6' },
  { id: 'green', labelAr: 'أخضر', labelEn: 'Green', base: '#16B97E' },
  { id: 'rose', labelAr: 'وردي', labelEn: 'Rose', base: '#F0487E' },
];

export const DEFAULT_ACCENT: AccentId = 'shashtna';

export type AccentTokens = {
  base: string;
  bright: string;
  light: string;
  deep: string;
  soft: string;
  medium: string;
  glow: string;
  gradient: string;
  softGradient: string;
  buttonShadow: string;
  focusShadow: string;
};

const HEX = /^#?([0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX.test(value.trim());
}

function toRgb(hex: string): [number, number, number] {
  const match = HEX.exec(hex.trim());
  const value = match ? match[1] : '2F7BFF';
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Mix with white (amount > 0) or black (amount < 0). */
function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgb.map(v => v + (target - v) * t) as [number, number, number];
}

const rgba = ([r, g, b]: [number, number, number], alpha: number) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;

/** Custom colours are clamped away from near-black/near-white so accents stay visible. */
function normalizeCustom(rgb: [number, number, number]): [number, number, number] {
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  if (luminance < 0.18) return shade(rgb, 0.35);
  if (luminance > 0.82) return shade(rgb, -0.35);
  return rgb;
}

export function buildAccent(baseHex: string, custom = false): AccentTokens {
  const base = custom ? normalizeCustom(toRgb(baseHex)) : toRgb(baseHex);
  const bright = shade(base, 0.18);
  const light = shade(base, 0.55);
  const deep = shade(base, -0.28);
  return {
    base: toHex(base),
    bright: toHex(bright),
    light: toHex(light),
    deep: toHex(deep),
    soft: rgba(base, 0.16),
    medium: rgba(base, 0.28),
    glow: rgba(bright, 0.45),
    gradient: `linear-gradient(120deg, ${toHex(deep)} 0%, ${toHex(base)} 55%, ${toHex(shade(base, 0.3))} 100%)`,
    softGradient: `linear-gradient(120deg, ${rgba(base, 0.3)} 0%, ${rgba(base, 0.08)} 100%)`,
    buttonShadow: `0px 8px 22px ${rgba(base, 0.45)}`,
    focusShadow: `0px 0px 14px ${rgba(bright, 0.4)}`,
  };
}

export function resolveAccent(id: AccentId, customHex?: string | null): AccentTokens {
  if (id === 'custom' && customHex && isValidHex(customHex)) {
    return buildAccent(customHex.startsWith('#') ? customHex : `#${customHex}`, true);
  }
  const preset = ACCENT_PRESETS.find(p => p.id === id) || ACCENT_PRESETS[0];
  return buildAccent(preset.base);
}
