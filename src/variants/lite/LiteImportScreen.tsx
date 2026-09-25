import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ShellBackground } from '../../app/AppShell';
import AppIcon from '../../components/common/AppIcon';
import { Text } from '../../components/common/Typography';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { BRAND_ASSETS, BRAND_LITE } from '../../design/brand';
import { useDeviceClass } from '../../design/device';
import { focusStyle, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { PickedPlaylist, pickPlaylistFile } from '../../lib/playlistPicker';
import { describeImportError } from './importErrors';
import type { ImportProgress } from './useLitePlaylist';

/**
 * The only way content gets into Shashtna Player Lite: "رفع ملف M3U".
 *
 * One action. Picking a file reads it, keeps its live channels, saves it and
 * opens Live TV (done by `onImport`). There is no account form, no server
 * address, no username/password and no playlist link.
 */
type Props = {
  onImport: (picked: PickedPlaylist, progress: ImportProgress) => Promise<unknown>;
  /** Why the saved file could not be reloaded at launch, if it could not. */
  restoreError?: unknown;
  /** The file that was imported before, if any (shown with the restore error). */
  previousName?: string;
};

export const IMPORT_TEXT = {
  ar: {
    title: 'استيراد ملف M3U',
    description: 'اختر ملف M3U من جهازك لبدء استخدام القنوات المباشرة.',
    action: 'رفع ملف M3U',
    reading: 'جاري قراءة ملف M3U...',
    failed: 'تعذر استيراد ملف M3U',
  },
  en: {
    title: 'Import an M3U file',
    description: 'Choose an M3U file on this device to start watching live channels.',
    action: 'Upload M3U file',
    reading: 'Reading the M3U file...',
    failed: 'M3U import failed',
  },
};

export default function LiteImportScreen({ onImport, restoreError, previousName }: Props) {
  const { language, setLanguage } = useAppPreferences();
  const ar = language === 'ar';
  const text = ar ? IMPORT_TEXT.ar : IMPORT_TEXT.en;
  const palette = usePalette();
  const dark = palette.mode === 'dark';
  const compact = useDeviceClass() === 'phone';
  const align = ar ? 'right' : 'left';

  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState(restoreError ? previousName || '' : '');
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<unknown>(restoreError ?? null);
  const shownError = error ? describeImportError(error, ar) : null;

  const upload = async () => {
    setError(null);
    let picked: PickedPlaylist | null;
    try {
      picked = await pickPlaylistFile();
    } catch (e) {
      setError(e);
      return;
    }
    if (!picked) return; // cancelled
    setFileName(picked.name);
    setBusy(true);
    setProgress(0);
    setCount(0);
    try {
      await onImport(picked, {
        onProgress: (received, total) => setProgress(total > 0 ? Math.min(99, (received / total) * 100) : 0),
        onChannelCount: setCount,
      });
      // Success: the app switches to Live TV and unmounts this screen.
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.canvas }]}>
      {dark ? (
        <>
          <ShellBackground />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </>
      ) : null}
      <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.card,
            compact && styles.cardCompact,
            { backgroundColor: dark ? 'rgba(8,14,30,0.78)' : palette.surface, borderColor: palette.glassBorder },
          ]}
        >
          <Pressable
            focusable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'English' : 'العربية'}
            onPress={() => setLanguage(ar ? 'en' : 'ar')}
            style={({ focused }) => [styles.lang, { borderColor: palette.glassBorder, alignSelf: ar ? 'flex-start' : 'flex-end' }, focused && focusStyle(palette)]}
          >
            <AppIcon name="language" size={15} color={palette.secondary} />
            <Text style={[styles.langText, { color: palette.secondary }]}>{ar ? 'English' : 'العربية'}</Text>
          </Pressable>

          <Image source={BRAND_ASSETS.logo} style={[styles.logo, compact && styles.logoCompact]} resizeMode="contain" />
          <Text style={[styles.wordmark, { color: palette.muted }]}>{BRAND_LITE.nameLatin.toUpperCase()}</Text>

          <Text style={[styles.title, { color: palette.text }]}>{text.title}</Text>
          <Text style={[styles.description, { color: palette.secondary }]}>{text.description}</Text>

          <Pressable
            focusable
            hasTVPreferredFocus
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={text.action}
            onPress={upload}
            style={({ focused, pressed }) => [
              styles.action,
              { flexDirection: ar ? 'row-reverse' : 'row', experimental_backgroundImage: palette.accent.gradient, boxShadow: palette.accent.buttonShadow },
              busy && styles.actionBusy,
              focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
              pressed && styles.pressed,
            ]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <AppIcon name="folder" size={20} color="#FFFFFF" />}
            <Text style={styles.actionText}>{busy ? text.reading : text.action}</Text>
          </Pressable>

          {fileName ? (
            <View style={[styles.file, { flexDirection: ar ? 'row-reverse' : 'row', borderColor: palette.glassBorder }]}>
              <AppIcon name="folder" size={15} color={palette.muted} />
              <Text numberOfLines={1} style={[styles.fileName, { color: palette.secondary, textAlign: align }]}>
                {fileName}
              </Text>
            </View>
          ) : null}

          {busy ? (
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: palette.surfaceHover }]}>
                <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%`, backgroundColor: palette.accent.bright }]} />
              </View>
              <Text style={[styles.progressText, { color: palette.muted }]}>
                {ar
                  ? `تمت قراءة ${Math.round(progress)}٪ · ${count.toLocaleString('ar-IQ')} قناة`
                  : `${Math.round(progress)}% read · ${count.toLocaleString('en-US')} channels`}
              </Text>
            </View>
          ) : null}

          {shownError ? (
            <View accessibilityRole="alert" style={[styles.error, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
              <AppIcon name="info" size={18} color={SHASHTNA_THEME.colors.danger} />
              <View style={styles.errorCopy}>
                <Text style={[styles.errorTitle, { textAlign: align }]}>{text.failed}</Text>
                <Text style={[styles.errorBody, { color: palette.secondary, textAlign: align }]}>{shownError.message}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <Text style={[styles.credit, { color: palette.muted }]}>{ar ? 'تصميم عبدالرحمن عامر' : 'Design by Abdulrahman Amer'}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  scrim: { backgroundColor: 'rgba(2,5,16,0.52)' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  scrollCompact: { paddingHorizontal: 16 },
  card: {
    width: 460,
    maxWidth: '100%',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 30,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 12,
    boxShadow: '0px 30px 70px rgba(0,0,0,0.45)',
  },
  cardCompact: { width: '100%', paddingHorizontal: 20 },
  lang: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  langText: { fontSize: 13, fontWeight: '800' },
  logo: { width: 104, height: 104, marginTop: 2 },
  logoCompact: { width: 84, height: 84 },
  wordmark: { fontSize: 12, fontWeight: '800', letterSpacing: 4.2, fontFamily: SHASHTNA_FONT.sans },
  title: { fontSize: 28, lineHeight: 38, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans, textAlign: 'center', marginTop: 6 },
  description: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 6 },
  action: {
    alignSelf: 'stretch',
    height: 58,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionBusy: { opacity: 0.85 },
  actionText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
  file: { alignSelf: 'stretch', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  fileName: { flex: 1, fontSize: 14, fontFamily: SHASHTNA_FONT.sans },
  progressWrap: { alignSelf: 'stretch', gap: 6 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  error: { alignSelf: 'stretch', gap: 10, padding: 14, borderRadius: 16, backgroundColor: 'rgba(242,89,106,0.10)', borderWidth: 1, borderColor: 'rgba(242,89,106,0.35)' },
  errorCopy: { flex: 1, gap: 4 },
  errorTitle: { color: SHASHTNA_THEME.colors.danger, fontSize: 14, fontWeight: '900' },
  errorBody: { fontSize: 14, lineHeight: 21 },
  credit: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 18, letterSpacing: 0.4 },
});
