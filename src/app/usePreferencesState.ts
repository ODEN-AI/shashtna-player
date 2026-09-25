import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppLanguage, AppPreferencesValue, ThemeMode } from '../design/AppPreferencesContext';
import { AccentId } from '../features/appearance/accents';
import { DEFAULT_APPEARANCE, loadAppearance, saveAppearance } from '../features/appearance/appearanceStore';
import { ensureFavoritesLoaded } from '../features/favorites/favoritesStore';

/**
 * Language, theme and accent (+ favorites loading), shared by the Full and
 * Lite apps. Appearance and favorites load during the splash and appearance
 * is saved whenever it changes afterwards.
 */
export function usePreferencesState(): AppPreferencesValue {
  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [accent, setAccentId] = useState<AccentId>(DEFAULT_APPEARANCE.accent);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const appearanceLoaded = useRef(false);

  const setAccent = useCallback((next: AccentId, customHex?: string | null) => {
    setAccentId(next);
    if (next === 'custom') setCustomAccent(customHex ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    loadAppearance().then(saved => {
      if (!alive) return;
      setThemeMode(saved.themeMode);
      setAccentId(saved.accent);
      setCustomAccent(saved.customAccent);
      appearanceLoaded.current = true;
    });
    void ensureFavoritesLoaded();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (appearanceLoaded.current) void saveAppearance({ themeMode, accent, customAccent });
  }, [themeMode, accent, customAccent]);

  return useMemo(
    () => ({ language, setLanguage, themeMode, setThemeMode, accent, customAccent, setAccent }),
    [language, themeMode, accent, customAccent, setAccent],
  );
}
