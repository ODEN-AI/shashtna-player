import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Platform, Pressable, StyleSheet, TVFocusGuideView, View } from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { Text } from '../../components/common/Typography';
import { usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import type { M3UChannel } from '../../lib/m3uCore';

/**
 * In-player channel list ("قائمة القنوات") for live TV.
 *
 * Shows the player's own live queue (the list the channel was opened from:
 * the same one UP/DOWN zaps through), so nothing is parsed or stored again.
 * Built for a TV remote:
 * - a side panel over the picture; playback keeps running behind it;
 * - vertical list, D-pad UP/DOWN moves between channels, OK tunes;
 * - opens with the playing channel focused and marked «يعرض الآن»;
 * - BACK closes it (Modal onRequestClose) and returns to the player;
 * - virtualised with fixed row heights, so thousands of channels are fine;
 * - channels are grouped under their playlist group (group-title / Xtream
 *   category) when the list has groups; no groups are invented.
 */
type Props = {
  channels: readonly M3UChannel[];
  /** Id of the channel on screen. */
  currentId: string;
  ar: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export const CHANNEL_ROW_HEIGHT = 64;
export const GROUP_ROW_HEIGHT = 40;

type Row =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'channel'; key: string; channel: M3UChannel; index: number };

/**
 * Channel rows, with a header per playlist group when the list is made of
 * group blocks (the usual M3U / Xtream order). When groups are interleaved
 * (e.g. a search result), headers would repeat on almost every row, so the
 * list stays flat and each row shows its group instead.
 */
export function buildChannelRows(channels: readonly M3UChannel[]): { rows: Row[]; grouped: boolean } {
  const groups = new Set(channels.map(c => (c.group || '').trim()));
  let runs = 0;
  let previous: string | null = null;
  for (const channel of channels) {
    const group = (channel.group || '').trim();
    if (group !== previous) runs += 1;
    previous = group;
  }
  const hasGroups = groups.size > 1 || (groups.size === 1 && !groups.has(''));
  const grouped = hasGroups && runs <= groups.size + 2;
  const rows: Row[] = [];
  let lastGroup: string | null = null;
  let headerAt = -1;
  channels.forEach((channel, index) => {
    const group = (channel.group || '').trim();
    if (grouped && group !== lastGroup) {
      lastGroup = group;
      headerAt = rows.length;
      rows.push({ kind: 'group', key: `g:${index}:${group}`, label: group, count: 0 });
    }
    if (grouped && headerAt >= 0) (rows[headerAt] as { count: number }).count += 1;
    rows.push({ kind: 'channel', key: `c:${index}:${channel.id}`, channel, index });
  });
  return { rows, grouped };
}

function ChannelListPanel({ channels, currentId, ar, onSelect, onClose }: Props) {
  const palette = usePalette();
  const { rows, grouped } = useMemo(() => buildChannelRows(channels), [channels]);
  const offsets = useMemo(() => {
    const list = new Array<number>(rows.length);
    let y = 0;
    rows.forEach((row, i) => {
      list[i] = y;
      y += row.kind === 'group' ? GROUP_ROW_HEIGHT : CHANNEL_ROW_HEIGHT;
    });
    return list;
  }, [rows]);
  const currentRow = useMemo(() => {
    const at = rows.findIndex(row => row.kind === 'channel' && String(row.channel.id) === String(currentId));
    return at >= 0 ? at : rows.findIndex(row => row.kind === 'channel');
  }, [rows, currentId]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: rows[index]?.kind === 'group' ? GROUP_ROW_HEIGHT : CHANNEL_ROW_HEIGHT,
      offset: offsets[index] ?? 0,
      index,
    }),
    [rows, offsets],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) =>
      item.kind === 'group' ? (
        <GroupHeader label={item.label} count={item.count} ar={ar} />
      ) : (
        <ChannelRow
          channel={item.channel}
          number={item.index + 1}
          playing={String(item.channel.id) === String(currentId)}
          preferred={index === currentRow}
          showGroup={!grouped}
          ar={ar}
          onPress={() => onSelect(item.index)}
        />
      ),
    [ar, currentId, currentRow, grouped, onSelect],
  );

  // Keep a couple of rows above the playing channel in view.
  const initialScrollIndex = Math.max(0, currentRow - 2);
  const Trap = Platform.isTV ? TVFocusGuideView : View;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <Trap
          style={[styles.panel, { backgroundColor: 'rgba(6,11,24,0.96)', borderColor: palette.glassBorder }]}
          {...(Platform.isTV ? { trapFocusLeft: true, trapFocusRight: true } : {})}
        >
          <View style={[styles.header, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { textAlign: ar ? 'right' : 'left' }]}>
                {ar ? 'قائمة القنوات' : 'Channel list'}
              </Text>
              <Text style={[styles.subtitle, { textAlign: ar ? 'right' : 'left' }]}>
                {ar
                  ? `${channels.length.toLocaleString('ar-IQ')} قناة · اضغط رجوع للعودة`
                  : `${channels.length.toLocaleString('en-US')} channels · press Back to return`}
              </Text>
            </View>
            <Pressable
              focusable
              accessibilityRole="button"
              accessibilityLabel={ar ? 'إغلاق قائمة القنوات' : 'Close channel list'}
              onPress={onClose}
              style={({ focused }) => [styles.close, focused && { borderColor: palette.focus, backgroundColor: palette.accent.soft }]}
            >
              <AppIcon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <FlatList
            data={rows}
            keyExtractor={row => row.key}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            initialScrollIndex={rows.length ? initialScrollIndex : undefined}
            initialNumToRender={14}
            maxToRenderPerBatch={16}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </Trap>
        {/* The picture stays visible here; tapping it closes the list (touch). */}
        <Pressable
          style={styles.dismiss}
          focusable={false}
          accessibilityLabel={ar ? 'إغلاق قائمة القنوات' : 'Close channel list'}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}

const GroupHeader = memo(function GroupHeader({ label, count, ar }: { label: string; count: number; ar: boolean }) {
  return (
    <View style={[styles.group, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
      <Text numberOfLines={1} style={[styles.groupLabel, { textAlign: ar ? 'right' : 'left' }]}>
        {label || (ar ? 'بدون تصنيف' : 'No group')}
      </Text>
      <Text style={styles.groupCount}>{count.toLocaleString(ar ? 'ar-IQ' : 'en-US')}</Text>
    </View>
  );
});

const ChannelRow = memo(function ChannelRow({
  channel,
  number,
  playing,
  preferred,
  showGroup,
  ar,
  onPress,
}: {
  channel: M3UChannel;
  number: number;
  playing: boolean;
  preferred: boolean;
  /** Under the name, when the list has no group headers. */
  showGroup: boolean;
  ar: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = channel.logo && !logoFailed ? channel.logo : '';
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityState={{ selected: playing }}
      accessibilityLabel={channel.name}
      onPress={onPress}
      style={({ focused }) => [
        styles.row,
        { flexDirection: ar ? 'row-reverse' : 'row' },
        playing && { backgroundColor: palette.accent.soft, borderColor: palette.accent.base },
        focused && { borderColor: palette.focus, backgroundColor: 'rgba(120,170,255,0.16)', transform: [{ scale: 1.02 }] },
      ]}
    >
      <Text style={[styles.number, playing && { color: palette.accent.light }]}>{number}</Text>
      {/* Only a real logo from the playlist; no placeholder artwork. */}
      {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" onError={() => setLogoFailed(true)} /> : null}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.name, { textAlign: ar ? 'right' : 'left' }]}>
          {channel.name}
        </Text>
        {showGroup && channel.group ? (
          <Text numberOfLines={1} style={[styles.meta, { textAlign: ar ? 'right' : 'left' }]}>
            {channel.group}
          </Text>
        ) : null}
      </View>
      {playing ? (
        <View style={[styles.nowPlaying, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <View style={styles.liveDot} />
          <Text style={styles.nowPlayingText}>{ar ? 'يعرض الآن' : 'Now playing'}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  panel: { width: '42%', minWidth: 340, maxWidth: 520, height: '100%', borderWidth: 1, paddingTop: 22, paddingHorizontal: 14 },
  dismiss: { flex: 1 },
  header: { alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  subtitle: { color: 'rgba(220,232,255,0.62)', fontSize: 12, fontWeight: '700', marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  list: { flex: 1 },
  group: { height: GROUP_ROW_HEIGHT, alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6, gap: 8 },
  groupLabel: { flex: 1, color: SHASHTNA_THEME.colors.textSecondary, fontSize: 13, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  groupCount: { color: 'rgba(220,232,255,0.5)', fontSize: 12, fontWeight: '800' },
  row: {
    height: CHANNEL_ROW_HEIGHT - 6,
    marginVertical: 3,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  number: { minWidth: 34, textAlign: 'center', color: 'rgba(220,232,255,0.7)', fontSize: 15, fontWeight: '900' },
  logo: { width: 44, height: 36, borderRadius: 8 },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', fontFamily: SHASHTNA_FONT.sans },
  meta: { color: 'rgba(220,232,255,0.55)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  nowPlaying: { alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,72,94,0.16)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF4D63' },
  nowPlayingText: { color: '#FFD1D8', fontSize: 11, fontWeight: '900' },
});

export default memo(ChannelListPanel);
