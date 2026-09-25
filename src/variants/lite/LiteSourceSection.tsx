import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { Text } from '../../components/common/Typography';
import { usePalette } from '../../design/palette';
import { SHASHTNA_THEME } from '../../design/theme';
import { PickedPlaylist, pickPlaylistFile } from '../../lib/playlistPicker';
import { describeImportError } from './importErrors';
import type { ImportProgress } from './useLitePlaylist';

/**
 * Settings → "مصدر المحتوى" in Shashtna Player Lite: the imported M3U file,
 * its channel count, and replacing or re-reading it. Nothing about accounts,
 * servers or links: Lite's only source is a local M3U file.
 */
type Props = {
  ar: boolean;
  fileName: string;
  channelCount: number;
  /** Imports the picked file; on success the app opens Live TV. */
  onReplace: (picked: PickedPlaylist, progress: ImportProgress) => Promise<unknown>;
  onReload: () => Promise<void>;
};

export default function LiteSourceSection({ ar, fileName, channelCount, onReplace, onReload }: Props) {
  const palette = usePalette();
  const [busy, setBusy] = useState<'replace' | 'reload' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const align = ar ? 'right' : 'left';
  const row = ar ? 'row-reverse' : 'row';

  const replace = async () => {
    setError(null);
    try {
      const picked = await pickPlaylistFile();
      if (!picked) return;
      setBusy('replace');
      await onReplace(picked, {});
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const reload = async () => {
    setError(null);
    setBusy('reload');
    try {
      await onReload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const shown = error ? describeImportError(error, ar) : null;

  return (
    <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}>
      <Text style={[styles.title, { color: palette.text, textAlign: align }]}>{ar ? 'مصدر المحتوى' : 'Content source'}</Text>

      <View style={[styles.current, { flexDirection: row, borderColor: palette.border, backgroundColor: palette.surface }]}>
        <View style={[styles.badge, { backgroundColor: palette.primarySoft, borderColor: palette.border }]}>
          <AppIcon name="folder" size={17} color={palette.primary} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.label, { color: palette.muted, textAlign: align }]}>{ar ? 'ملف M3U الحالي' : 'Current M3U file'}</Text>
          <Text numberOfLines={1} style={[styles.value, { color: palette.text, textAlign: align }]}>{fileName}</Text>
          <Text style={[styles.count, { color: palette.secondary, textAlign: align }]}>
            {ar ? `القنوات: ${channelCount.toLocaleString('ar-IQ')}` : `Channels: ${channelCount.toLocaleString('en-US')}`}
          </Text>
        </View>
      </View>

      <ActionRow
        icon="source"
        title={ar ? 'استبدال ملف M3U' : 'Replace M3U file'}
        sub={ar ? 'اختر ملف M3U آخر من جهازك' : 'Choose another M3U file on this device'}
        busy={busy === 'replace'}
        disabled={!!busy}
        onPress={replace}
        ar={ar}
      />
      <ActionRow
        icon="refresh"
        title={ar ? 'إعادة قراءة الملف' : 'Read the file again'}
        sub={ar ? 'تحديث القنوات إذا تغيّر محتوى الملف' : 'Update the channels if the file changed'}
        busy={busy === 'reload'}
        disabled={!!busy}
        onPress={reload}
        ar={ar}
      />

      {shown ? (
        <View accessibilityRole="alert" style={[styles.error, { flexDirection: row }]}>
          <AppIcon name="info" size={17} color={SHASHTNA_THEME.colors.danger} />
          <Text style={[styles.errorText, { color: palette.secondary, textAlign: align }]}>{shown.message}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ActionRow({
  icon,
  title,
  sub,
  busy,
  disabled,
  onPress,
  ar,
}: {
  icon: 'source' | 'refresh';
  title: string;
  sub: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  ar: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      focusable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ focused }) => [
        styles.action,
        { flexDirection: ar ? 'row-reverse' : 'row', borderColor: palette.border, backgroundColor: palette.surface },
        focused && styles.focus,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: palette.primarySoft, borderColor: palette.border }]}>
        {busy ? <ActivityIndicator size="small" color={palette.primary} /> : <AppIcon name={icon} size={17} color={palette.primary} />}
      </View>
      <View style={styles.body}>
        <Text style={[styles.actionTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
        <Text style={[styles.actionSub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{sub}</Text>
      </View>
      <AppIcon name="chevron" size={14} color={palette.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12, gap: 9 },
  title: { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  current: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 12, alignItems: 'center' },
  badge: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 11, fontWeight: '800' },
  value: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  count: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  action: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 12, alignItems: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '800' },
  actionSub: { fontSize: 11, marginTop: 2 },
  focus: { borderColor: SHASHTNA_THEME.colors.primary, borderWidth: 2 },
  error: { gap: 9, padding: 12, borderRadius: 12, backgroundColor: 'rgba(242,89,106,0.10)', borderWidth: 1, borderColor: 'rgba(242,89,106,0.35)', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
