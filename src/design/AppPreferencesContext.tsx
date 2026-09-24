import React, { createContext, useContext, useMemo } from 'react';

export type AppLanguage = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

export type AppPreferencesValue = {
  language: AppLanguage;
  setLanguage: (value: AppLanguage) => void;
  themeMode: ThemeMode;
  setThemeMode: (value: ThemeMode) => void;
};

const AppPreferencesContext = createContext<AppPreferencesValue | null>(null);

export function AppPreferencesProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: AppPreferencesValue }>) {
  const memoValue = useMemo(
    () => value,
    [value.language, value.themeMode, value.setLanguage, value.setThemeMode],
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
