import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../../components/common/Typography';

import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { FilterButton, OptionSheet } from '../../components/filters/FilterControls';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import type { M3UChannel } from '../../lib/m3uCore';
import { ALL_GROUP, Catalog, channelKey } from '../../features/catalog/catalog';
import { createSearcher } from '../../features/catalog/search';
import { toggleFavorite, useFavoriteKeys, useIsFavorite } from '../../features/favorites/favoritesStore';
import { FocusRegion, initialRowFor, screenMemory } from '../../navigation/tvFocus';
import { liveGridColumns } from './liveGrid';

type Props = {
  /** Built once per source; categories are Map lookups (see features/catalog). */
  catalog: Catalog;
  /** `queue` is the list currently on screen; the player zaps through it. */
  onOpenPlayer: (channel: M3UChannel, queue: readonly M3UChannel[]) => void;
  /**
   * Show the "Favorites" filter at the top of the categories (Full). Lite keeps
   * favorites as channel-level state only (long-press + heart), with no
   * Favorites filter or destination.
   */
  favoritesFilter?: boolean;
  /** Header shortcut to the start page (Full: Home). Lite has none: Live TV is its start page. */
  onBackHome?: () => void;
  /** Label/icon of the header shortcut. */
  homeLabel?: string;
  homeIcon?: AppIconName;
  /** Pre-select a category (Home shortcut, or the one in use before opening the player). */
  initialGroup?: string | null;
  /** Remembers the chosen category across player visits. */
  onGroupChange?: (group: string | null) => void;
  /** Channel to scroll to and focus when returning from the player. */
  focusChannelId?: string | null;
};

type Group = { key: string; label: string; count: number };

const ALL = ALL_GROUP;
/** Virtual category: the user's favorite channels (long-press a channel to add). */
export const FAVORITES_GROUP = '__favorites__';
const SEARCH_DEBOUNCE_MS = 150;
type LiveMemory = { query: string };

/**
 * Live TV browser.
 *
 * TV / tablet: two panes — category list with channel counts, and a grid of
 * uniform channel cards. Phone: one category button that opens a sheet with
 * every category.
 * The visible, filtered list is what the player receives as its zapping queue,
 * so UP/DOWN in the player never jumps to a channel outside it.
 */
export default function LiveScreen({ catalog, onOpenPlayer, onBackHome, homeLabel, homeIcon = 'home', initialGroup, onGroupChange, focusChannelId, favoritesFilter = false }: Props) {
  const channels = catalog.live;
  const { language } = useAppPreferences();
  const palette = usePalette();
  const device = useDeviceClass();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const compact = device === 'phone';
  // Columns follow the width the channel grid really has (see liveGridColumns).
  const [paneWidth, setPaneWidth] = useState(0);
  const columns = liveGridColumns(paneWidth, device);

  const remembered = useRef(screenMemory.get<LiveMemory>('live')).current;
  const [queryInput, setQueryInput] = useState(remembered.query || '');
  const [query, setQuery] = useState(remembered.query || '');
  const [group, setGroup] = useState<string>(initialGroup || ALL);
  const favoriteKeys = useFavoriteKeys();

  useEffect(() => {
    if (queryInput === query) return;
    const timer = setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput, query]);

  useEffect(() => {
    screenMemory.set<LiveMemory>('live', { query });
  }, [query]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [groupSheet, setGroupSheet] = useState(false);

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

  // Favorite channels in the order they were added (small list: keys -> channels).
  const favoriteChannels = useMemo(() => {
    const list: M3UChannel[] = [];
    for (const key of favoriteKeys) {
      if (!key.startsWith('live:')) continue;
      const channel = catalog.byKey.get(key);
      if (channel) list.push(channel);
    }
    return list;
  }, [favoriteKeys, catalog]);

  const groups = useMemo<Group[]>(
    () => [
      { key: ALL, label: ar ? 'كل القنوات' : 'All channels', count: channels.length },
      ...(favoritesFilter ? [{ key: FAVORITES_GROUP, label: ar ? 'المفضلة' : 'Favorites', count: favoriteChannels.length }] : []),
      ...catalog.liveGroups,
    ],
    [catalog, channels.length, favoriteChannels.length, ar, favoritesFilter],
  );

  // Category change = Map lookup; search runs on precomputed lowercase keys.
  const searcher = useMemo(
    () => createSearcher<M3UChannel>(c => catalog.liveSearch.get(String(c.id)) || ''),
    [catalog],
  );
  const base = useMemo(
    () => (group === ALL ? channels : group === FAVORITES_GROUP ? favoriteChannels : catalog.liveByGroup.get(group) || []),
    [group, channels, favoriteChannels, catalog],
  );
  const filtered = useMemo(() => searcher(base, query), [searcher, base, query]);

  const openChannel = useCallback(
    (channel: M3UChannel) => onOpenPlayer(channel, filtered),
    [filtered, onOpenPlayer],
  );

  // Returning from the player: start the list at the channel that was playing.
  // Only for the list shown on arrival; once the user changes category or
  // search, focus stays where they are instead of jumping into the grid.
  const [focusTarget, setFocusTarget] = useState(focusChannelId);
  const arrival = useRef(true);
  useEffect(() => {
    if (arrival.current) {
      arrival.current = false;
      return;
    }
    setFocusTarget(null);
  }, [group, query]);
  useEffect(() => {
    // A new return from the player (same page instance).
    if (focusChannelId) setFocusTarget(focusChannelId);
  }, [focusChannelId]);
  const focusIndex = useMemo(
    () => (focusTarget ? filtered.findIndex(c => String(c.id) === focusTarget) : -1),
    [filtered, focusTarget],
  );
  const rowHeight = SHASHTNA_THEME.layout.liveCardH + (columns === 1 ? 10 : 14);
  // First focus: the channel just watched, otherwise the active category.
  const focusGroupFirst = focusIndex < 0;
  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({ length: rowHeight, offset: rowHeight * index, index }),
    [rowHeight],
  );
  const getGroupLayout = useCallback(
    (_data: unknown, index: number) => ({ length: GROUP_ROW, offset: GROUP_ROW * index, index }),
    [],
  );

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
            value={queryInput}
            onChangeText={setQueryInput}
            onSubmitEditing={() => setQuery(queryInput)}
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={ar ? 'ابحث عن قناة...' : 'Search channels...'}
            placeholderTextColor={palette.muted}
            style={[styles.input, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}
          />
        </View>
        {!compact && onBackHome ? (
          <Pressable
            focusable
            accessibilityLabel={homeLabel || (ar ? 'الرئيسية' : 'Home')}
            onPress={onBackHome}
            style={({ focused, pressed }) => [
              styles.iconButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
              focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name={homeIcon} size={19} color={palette.secondary} />
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
      initialScrollIndex={initialRowFor(focusIndex, columns)}
      getItemLayout={getItemLayout}
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
        <View style={styles.groupButton}>
          <FilterButton
            caption={ar ? 'التصنيف' : 'Category'}
            value={activeGroupLabel}
            count={groups.find(g => g.key === group)?.count}
            icon="grid"
            active={group !== ALL}
            onPress={() => setGroupSheet(true)}
            palette={palette}
            ar={ar}
          />
        </View>
        <OptionSheet
          visible={groupSheet}
          title={ar ? 'اختر التصنيف' : 'Choose a category'}
          options={groups}
          selectedKey={group}
          onSelect={key => {
            selectGroup(key);
            setGroupSheet(false);
          }}
          onClose={() => setGroupSheet(false)}
          palette={palette}
          ar={ar}
        />
        {channelList}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      {header}
      <View style={[styles.body, { flexDirection: rowDirection }]}>
        <FocusRegion style={[styles.groupPane, { backgroundColor: palette.surface, borderColor: palette.border }]}>
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
            initialScrollIndex={Math.max(0, groups.findIndex(g => g.key === group)) || undefined}
            getItemLayout={getGroupLayout}
            renderItem={({ item }) => (
              <GroupItem
                group={item}
                active={item.key === group}
                preferred={focusGroupFirst && item.key === group}
                onSelect={selectGroup}
                ar={ar}
                palette={palette}
              />
            )}
          />
        </FocusRegion>
        <FocusRegion style={styles.channelPane}>
          <View style={styles.channelPane} onLayout={e => setPaneWidth(e.nativeEvent.layout.width)}>
            {channelList}
          </View>
        </FocusRegion>
      </View>
    </View>
  );
}

const GroupItem = memo(function GroupItem({
  group,
  active,
  preferred,
  onSelect,
  ar,
  palette,
}: {
  group: Group;
  active: boolean;
  preferred: boolean;
  onSelect: (key: string) => void;
  ar: boolean;
  palette: Palette;
}) {
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={group.label}
      onPress={() => onSelect(group.key)}
      style={({ focused, pressed }) => [
        styles.groupItem,
        { flexDirection: ar ? 'row-reverse' : 'row' },
        active && { experimental_backgroundImage: palette.accent.softGradient, borderColor: palette.primarySoft },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      {active ? <View style={[styles.groupIndicator, ar ? styles.groupIndicatorRtl : styles.groupIndicatorLtr, { backgroundColor: palette.accent.bright }]} /> : null}
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
  const key = channelKey(channel);
  const favorite = useIsFavorite(key);

  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={channel.name}
      accessibilityHint={favorite ? (ar ? 'اضغط مطولاً للإزالة من المفضلة' : 'Long-press to remove from favorites') : ar ? 'اضغط مطولاً للإضافة إلى المفضلة' : 'Long-press to add to favorites'}
      onPress={() => onOpen(channel)}
      // Long-press OK (TV) / touch: add or remove the channel from favorites.
      onLongPress={() => toggleFavorite(key)}
      delayLongPress={600}
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
          <Image source={{ uri: channel.logo }} style={styles.logo} resizeMethod="resize" onError={() => setFailed(true)} />
        ) : (
          <Text style={[styles.logoFallback, { color: palette.secondary }]}>{channel.name.trim().slice(0, 2).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.cardMain}>
        <View style={[styles.nameRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <Text numberOfLines={1} style={[styles.name, styles.nameFlex, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
            {channel.name}
          </Text>
          {favorite ? <AppIcon name="favorite" size={13} color="#FF4D7A" /> : null}
        </View>
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

/** groupItem height (50) + list gap (4). */
const GROUP_ROW = 54;

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
  groupButton: { marginBottom: 12 },
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
  nameRow: { alignItems: 'center', gap: 6 },
  nameFlex: { flex: 1 },
  metaRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: SHASHTNA_THEME.colors.live },
  group: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 110 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptySub: { fontSize: 15, marginTop: 5 },
});
