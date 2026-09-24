import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TVFocusGuideView,
  View,
} from 'react-native';

import AppIcon from '../../components/common/AppIcon';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { M3UChannel } from '../../lib/m3u';

type Props = {
  channels: M3UChannel[];
  /** `queue` is the list currently on screen; the player zaps through it. */
  onOpenPlayer: (channel: M3UChannel, queue: M3UChannel[]) => void;
  onBackHome: () => void;
  /** Pre-select a category (Home shortcut, or the one in use before opening the player). */
  initialGroup?: string | null;
  /** Remembers the chosen category across player visits. */
  onGroupChange?: (group: string | null) => void;
  /** Channel to scroll to and focus when returning from the player. */
  focusChannelId?: string | null;
};

type Group = { key: string; label: string; count: number };

const ALL = '__all__';

/**
 * Live TV browser.
 *
 * TV / tablet: two panes — category list with channel counts, and a grid of
 * uniform channel cards. Phone: categories become a horizontal chip row.
 * The visible, filtered list is what the player receives as its zapping queue,
 * so UP/DOWN in the player never jumps to a channel outside it.
 */
export default function LiveScreen({ channels, onOpenPlayer, onBackHome, initialGroup, onGroupChange, focusChannelId }: Props) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const device = useDeviceClass();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const compact = device === 'phone';
  const columns = device === 'tv' ? 3 : device === 'tablet' ? 2 : 1;

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>(initialGroup || ALL);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    if (initialGroup) setGroup(initialGroup);
  }, [initialGroup]);

  const selectGroup = useCallback(
    (key: string) => {
      setGroup(key);
      onGroupChange?.(key === ALL ? null : key);
    },
    [onGroupChange],
  );

  const groups = useMemo<Group[]>(() => {
    const counts = new Map<string, number>();
    for (const channel of channels) {
      const name = String(channel.group || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [
      { key: ALL, label: ar ? 'كل القنوات' : 'All channels', count: channels.length },
      ...Array.from(counts, ([name, count]) => ({ key: name, label: name, count })),
    ];
  }, [channels, ar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      c =>
        (group === ALL || String(c.group || '').trim() === group) &&
        (!q || c.name.toLowerCase().includes(q) || String(c.group || '').toLowerCase().includes(q)),
    );
  }, [channels, group, query]);

  const openChannel = useCallback(
    (channel: M3UChannel) => onOpenPlayer(channel, filtered),
    [filtered, onOpenPlayer],
  );

  // Returning from the player: start the list at the channel that was playing.
  const focusIndex = useMemo(
    () => (focusChannelId ? filtered.findIndex(c => String(c.id) === focusChannelId) : -1),
    [filtered, focusChannelId],
  );
  const rowHeight = SHASHTNA_THEME.layout.liveCardH + (columns === 1 ? 10 : 14);

  const activeGroupLabel = groups.find(g => g.key === group)?.label || groups[0].label;

  const header = (
    <View style={[styles.header, { flexDirection: compact ? 'column' : rowDirection }]}>
      <View style={styles.headerTitle}>
        <View style={[styles.liveTag, { flexDirection: rowDirection, alignSelf: ar ? 'flex-end' : 'flex-start' }]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTagText}>LIVE</Text>
        </View>
        <Text style={[styles.title, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
          {ar ? 'البث المباشر' : 'Live TV'}
        </Text>
        <Text numberOfLines={1} style={[styles.sub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
          {activeGroupLabel} · {filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')} {ar ? 'قناة' : 'channels'}
        </Text>
      </View>

      <View style={[styles.headerActions, { flexDirection: rowDirection }]}>
        <View
          style={[
            styles.search,
            compact && styles.searchCompact,
            {
              flexDirection: rowDirection,
              backgroundColor: palette.surface,
              borderColor: searchFocused ? palette.focus : palette.border,
            },
          ]}
        >
          <AppIcon name="search" size={17} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={ar ? 'ابحث عن قناة...' : 'Search channels...'}
            placeholderTextColor={palette.muted}
            style={[styles.input, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}
          />
        </View>
        {!compact ? (
          <Pressable
            focusable
            accessibilityLabel={ar ? 'الرئيسية' : 'Home'}
            onPress={onBackHome}
            style={({ focused, pressed }) => [
              styles.iconButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
              focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="home" size={19} color={palette.secondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const channelList = (
    <FlatList
      key={`grid-${columns}`}
      data={filtered}
      keyExtractor={c => String(c.id)}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? [styles.row, { flexDirection: rowDirection }] : undefined}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      initialScrollIndex={focusIndex > 0 ? Math.floor(focusIndex / columns) : undefined}
      getItemLayout={(_data, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      windowSize={7}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, columns === 1 && styles.cellSingle]}>
          <ChannelCard
            channel={item}
            number={index + 1}
            onOpen={openChannel}
            ar={ar}
            palette={palette}
            preferred={index === focusIndex}
          />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: palette.primarySoft }]}>
            <AppIcon name="live" size={28} color={palette.primaryText} />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>{ar ? 'ماكو قنوات مطابقة' : 'No matching channels'}</Text>
          <Text style={[styles.emptySub, { color: palette.muted }]}>
            {ar ? 'غيّر البحث أو التصنيف.' : 'Try changing your search or category.'}
          </Text>
        </View>
      }
    />
  );

  if (compact) {
    return (
      <View style={[styles.screen, styles.screenCompact, { backgroundColor: palette.background }]}>
        {header}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={[styles.chips, { flexDirection: rowDirection }]}
        >
          {groups.map(g => {
            const active = g.key === group;
            return (
              <Pressable
                key={g.key}
                onPress={() => selectGroup(g.key)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text numberOfLines={1} style={[styles.chipText, { color: active ? '#FFFFFF' : palette.secondary }]}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {channelList}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {header}
      <View style={[styles.body, { flexDirection: rowDirection }]}>
        <TVFocusGuideView autoFocus style={[styles.groupPane, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.paneCaption, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {ar ? 'التصنيفات' : 'CATEGORIES'}
          </Text>
          <FlatList
            data={groups}
            keyExtractor={g => g.key}
            showsVerticalScrollIndicator={false}
            initialNumToRender={14}
            windowSize={9}
            contentContainerStyle={styles.groupList}
            renderItem={({ item }) => (
              <GroupItem group={item} active={item.key === group} onSelect={selectGroup} ar={ar} palette={palette} />
            )}
          />
        </TVFocusGuideView>
        <TVFocusGuideView autoFocus style={styles.channelPane}>
          {channelList}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const GroupItem = memo(function GroupItem({
  group,
  active,
  onSelect,
  ar,
  palette,
}: {
  group: Group;
  active: boolean;
  onSelect: (key: string) => void;
  ar: boolean;
  palette: Palette;
}) {
  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={group.label}
      onPress={() => onSelect(group.key)}
      style={({ focused, pressed }) => [
        styles.groupItem,
        { flexDirection: ar ? 'row-reverse' : 'row' },
        active && { experimental_backgroundImage: SHASHTNA_THEME.gradients.brandSoft, borderColor: palette.primarySoft },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      {active ? <View style={[styles.groupIndicator, ar ? styles.groupIndicatorRtl : styles.groupIndicatorLtr]} /> : null}
      <Text
        numberOfLines={1}
        style={[
          styles.groupLabel,
          { color: active ? palette.text : palette.secondary, fontWeight: active ? '900' : '700', textAlign: ar ? 'right' : 'left' },
        ]}
      >
        {group.label}
      </Text>
      <Text style={[styles.groupCount, { color: active ? palette.primaryText : palette.muted }]}>{group.count}</Text>
    </Pressable>
  );
});

const ChannelCard = memo(function ChannelCard({
  channel,
  number,
  onOpen,
  ar,
  palette,
  preferred = false,
}: {
  channel: M3UChannel;
  number: number;
  onOpen: (channel: M3UChannel) => void;
  ar: boolean;
  palette: Palette;
  preferred?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={channel.name}
      onPress={() => onOpen(channel)}
      style={({ focused, pressed }) => [
        styles.card,
        { flexDirection: ar ? 'row-reverse' : 'row', backgroundColor: palette.surface, borderColor: palette.border },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.number, { color: palette.muted }]}>{number}</Text>
      <View style={styles.logoBox}>
        {channel.logo && !failed ? (
          <Image source={{ uri: channel.logo }} style={styles.logo} onError={() => setFailed(true)} />
        ) : (
          <Text style={[styles.logoFallback, { color: palette.secondary }]}>{channel.name.trim().slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.cardMain}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
          {channel.name}
        </Text>
        <View style={[styles.metaRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <View style={styles.liveDotSmall} />
          <Text numberOfLines={1} style={[styles.group, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {channel.group || (ar ? 'بث مباشر' : 'Live TV')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 24 },
  screenCompact: { paddingHorizontal: 16, paddingTop: 16 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 16 },
  headerTitle: { flex: 1, alignSelf: 'stretch' },
  liveTag: { height: 24, paddingHorizontal: 10, borderRadius: 7, alignItems: 'center', gap: 6, experimental_backgroundImage: SHASHTNA_THEME.gradients.live },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  liveTagText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontFamily: SHASHTNA_FONT.display, fontSize: T.size.pageTitle, lineHeight: T.lineHeight.pageTitle, fontWeight: '900', marginTop: 10 },
  sub: { fontSize: T.size.secondary, marginTop: 2, fontWeight: '700' },
  headerActions: { alignItems: 'center', gap: 12, alignSelf: 'stretch', justifyContent: 'flex-end' },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  search: { height: 48, width: 340, borderRadius: 24, borderWidth: 2, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  searchCompact: { flex: 1, width: undefined },
  input: { flex: 1, fontFamily: SHASHTNA_FONT.sans, fontSize: 16, paddingVertical: 0 },

  body: { flex: 1, gap: 18 },
  groupPane: { width: 264, borderRadius: 24, borderWidth: 1, paddingTop: 14, paddingHorizontal: 10, marginBottom: 20 },
  paneCaption: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, paddingHorizontal: 12, marginBottom: 8 },
  groupList: { paddingBottom: 16, gap: 4 },
  groupItem: { height: 50, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', gap: 10, borderWidth: 2, borderColor: 'transparent' },
  groupIndicator: { position: 'absolute', top: 14, width: 3, height: 18, borderRadius: 2, backgroundColor: SHASHTNA_THEME.colors.primaryBright },
  groupIndicatorLtr: { left: 2 },
  groupIndicatorRtl: { right: 2 },
  groupLabel: { flex: 1, fontSize: 15, fontFamily: SHASHTNA_FONT.sans },
  groupCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  channelPane: { flex: 1 },

  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { height: 40, maxWidth: 220, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipActive: { experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, borderColor: 'transparent' },
  chipText: { fontSize: 14, fontFamily: SHASHTNA_FONT.sans, fontWeight: '800' },

  list: { paddingTop: 4, paddingBottom: 40, paddingHorizontal: 4 },
  row: { gap: 14 },
  cell: { flex: 1, marginBottom: 14, minWidth: 0 },
  cellSingle: { marginBottom: 10 },
  card: { height: SHASHTNA_THEME.layout.liveCardH, borderRadius: 18, borderWidth: 2, alignItems: 'center', paddingHorizontal: 12, gap: 12 },
  number: { width: 30, fontSize: 13, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  logoBox: { width: 72, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 6, backgroundColor: 'rgba(255,255,255,0.07)' },
  logo: { width: '100%', height: '100%', resizeMode: 'contain' },
  logoFallback: { fontSize: 16, fontWeight: '900' },
  cardMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 21, fontFamily: SHASHTNA_FONT.sans, fontWeight: '900' },
  metaRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: SHASHTNA_THEME.colors.live },
  group: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 110 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptySub: { fontSize: 15, marginTop: 5 },
});
