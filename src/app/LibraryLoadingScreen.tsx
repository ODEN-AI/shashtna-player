import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '../components/common/Typography';
import { resolveAccent } from '../features/appearance/accents';
import { useAppPreferences } from '../design/AppPreferencesContext';
import { SHASHTNA_THEME } from '../design/theme';
import { ShellBackground } from './AppShell';

/** Shown while the saved source is restored or a new library is indexed. */
export default function LibraryLoadingScreen({ indexing }: { indexing: boolean }) {
  const { language, accent, customAccent } = useAppPreferences();
  const ar = language === 'ar';
  return (
    <View style={styles.screen}>
      <ShellBackground />
      <ActivityIndicator size="large" color={resolveAccent(accent, customAccent).bright} />
      <Text style={styles.title}>
        {indexing ? (ar ? 'تجهيز المكتبة...' : 'Preparing your library...') : ar ? 'استعادة الاشتراك...' : 'Restoring your subscription...'}
      </Text>
      <Text style={styles.subtitle}>{ar ? 'جاري تجهيز مكتبتك تلقائياً' : 'Getting your library ready'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SHASHTNA_THEME.colors.backgroundDeep },
  title: { color: SHASHTNA_THEME.colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 8 },
  subtitle: { color: SHASHTNA_THEME.colors.textSecondary, fontSize: 13 },
});
