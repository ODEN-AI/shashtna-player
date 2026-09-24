import React, { createContext, useContext, useMemo } from 'react';

import { AccentId } from '../features/appearance/accents';

export type AppLanguage = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

export type AppPreferencesValue = {
  language: AppLanguage;
  setLanguage: (value: AppLanguage) => void;
  themeMode: ThemeMode;
  setThemeMode: (value: ThemeMode) => void;
  accent: AccentId;
  customAccent: string | null;
  /** Pass `customHex` together with 'custom'. */
  setAccent: (accent: AccentId, customHex?: string | null) => void;
};

const AppPreferencesContext = createContext<AppPreferencesValue | null>(null);

export function AppPreferencesProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: AppPreferencesValue }>) {
  const { language, setLanguage, themeMode, setThemeMode, accent, customAccent, setAccent } = value;
  const memoValue = useMemo(
    () => ({ language, setLanguage, themeMode, setThemeMode, accent, customAccent, setAccent }),
    [language, setLanguage, themeMode, setThemeMode, accent, customAccent, setAccent],
  );

  return (
    <AppPreferencesContext.Provider value={memoValue}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const value = useContext(AppPreferencesContext);
  if (!value) {
    throw new Error('useAppPreferences must be used inside AppPreferencesProvider');
  }
  return value;
}
