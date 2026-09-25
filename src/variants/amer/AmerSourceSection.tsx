import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { Text } from '../../components/common/Typography';
import { usePalette } from '../../design/palette';
import { SHASHTNA_THEME } from '../../design/theme';
import { pickPlaylistFile } from '../../lib/playlistPicker';
import { describeConnectionError } from '../../screens/Connection/connectionErrors';
import type { ImportProgress, ImportRequest } from './useAmerPlaylist';
import { requestSignOut, useAmerSource } from './useAmerPlaylist';

/**
 * Settings → "مصدر المحتوى" in عامر IPTV. Bundled in place of
 * src/variants/lite/LiteSourceSection.tsx (same props).
 *
 * - M3U file: current file, channel count, replace / read again (as in Lite).
 * - Account: "حساب IPTV" with `username @ server` (never the password),
 *   channel count, refresh from the server.
 * - Both: "تغيير المصدر" returns to the sign-in screen.
 */
type Props = {
  ar: boolean;
  fileName: string;
  channelCount: number;
  onReplace: (picked: ImportRequest, progress: ImportProgress) => Promise<unknown>;
  onReload: () => Promise<void>;
};

type Busy = 'replace' | 'reload' | null;

export default function AmerSourceSection({ ar, fileName, channelCount, onReplace, onReload }: Props) {
  const palette = usePalette();
  const source = useAmerSource();
  const account = source?.kind === 'account';
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<unknown>(null);
  const align = ar ? 'right' : 'left';
  const row = ar ? 'row-reverse' : 'row';

  const run = async (kind: Busy, work: () => Promise<unknown>) => {
    setError(null);
    setBusy(kind);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const replace = () =>
    run('replace', async () => {
      const picked = await pickPlaylistFile();
      if (picked) await onReplace(picked, {});
    });

  const shown = error ? describeConnectionError(error, ar) : null;

  return (
    <View style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surfaceElevated }]}>
      <Text style={[styles.title, { color: palette.text, textAlign: align }]}>{ar ? 'مصدر المحتوى' : 'Content source'}</Text>

      <View style={[styles.current, { flexDirection: row, borderColor: palette.border, backgroundColor: palette.surface }]}>
        <View style={[styles.badge, { backgroundColor: palette.primarySoft, borderColor: palette.border }]}>
          <AppIcon name={account ? 'user' : 'folder'} size={17} color={palette.primary} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.label, { color: palette.muted, textAlign: align }]}>
            {account ? (ar ? 'حساب IPTV' : 'IPTV account') : ar ? 'ملف M3U الحالي' : 'Current M3U file'}
          </Text>
          <Text numberOfLines={1} style={[styles.value, { color: palette.text, textAlign: align }]}>
            {account ? source?.name : fileName}
          </Text>
          <Text style={[styles.count, { color: palette.secondary, textAlign: align }]}>
            {ar ? `القنوات: ${channelCount.toLocaleString('ar-IQ')}` : `Channels: ${channelCount.toLocaleString('en-US')}`}
          </Text>
        </View>
      </View>

      {account ? (
        <ActionRow
          icon="refresh"
          title={ar ? 'تحديث القنوات' : 'Refresh channels'}
          sub={ar ? 'تحميل أحدث القنوات من السيرفر الآن' : 'Load the latest channels from the server now'}
          busy={busy === 'reload'}
          disabled={!!busy}
          onPress={() => run('reload', onReload)}
          ar={ar}
        />
      ) : (
        <>
          <ActionRow
            icon="folder"
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
            onPress={() => run('reload', onReload)}
            ar={ar}
          />
        </>
      )}
      <ActionRow
        icon="source"
        title={ar ? 'تغيير المصدر' : 'Change source'}
        sub={ar ? 'تسجيل الدخول بحساب آخر أو اختيار ملف M3U' : 'Sign in with another account or choose an M3U file'}
        busy={false}
        disabled={!!busy}
        onPress={requestSignOut}
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
  icon: 'source' | 'refresh' | 'folder';
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
