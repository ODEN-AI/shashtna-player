import { readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';
import { AccentId, ACCENT_PRESETS, DEFAULT_ACCENT, isValidHex } from './accents';

export type ThemeMode = 'dark' | 'light';

export type AppearancePreferences = {
  themeMode: ThemeMode;
  accent: AccentId;
  customAccent: string | null;
};

const FILE = 'shashtna-appearance.json';

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  themeMode: 'dark',
  accent: DEFAULT_ACCENT,
  customAccent: null,
};

const ACCENT_IDS = new Set<string>([...ACCENT_PRESETS.map(p => p.id), 'custom']);

/** Validates stored data so a corrupt or old file can never break startup. */
export function sanitizeAppearance(value: unknown): AppearancePreferences {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const customAccent =
    typeof raw.customAccent === 'string' && isValidHex(raw.customAccent) ? raw.customAccent : null;
  let accent = typeof raw.accent === 'string' && ACCENT_IDS.has(raw.accent) ? (raw.accent as AccentId) : DEFAULT_ACCENT;
  if (accent === 'custom' && !customAccent) accent = DEFAULT_ACCENT;
  return {
    themeMode: raw.themeMode === 'light' ? 'light' : 'dark',
    accent,
    customAccent,
  };
}

export async function loadAppearance(): Promise<AppearancePreferences> {
  return sanitizeAppearance(await readJsonFile<unknown>(FILE, DEFAULT_APPEARANCE));
}

export function saveAppearance(value: AppearancePreferences): Promise<void> {
  return writeJsonFile(FILE, sanitizeAppearance(value));
}
