import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from './Typography';
import { ClearFiltersButton, FilterButton, FilterOption, OptionSheet } from '../filters/FilterControls';
import { M3UChannel } from '../../lib/m3u';
import { getTmdbMetadata } from '../../lib/tmdb';
import AppIcon from './AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { useDeviceClass } from '../../design/device';
import { posterGridLayout, PosterGridLayout } from './posterGrid';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { ALL_GROUP, CatalogGroup, CatalogItem } from '../../features/catalog/catalog';
import { createSearcher, sortedByTitle } from '../../features/catalog/search';
import { toggleFavorite, useIsFavorite } from '../../features/favorites/favoritesStore';
import { FocusRegion, initialRowFor, screenMemory } from '../../navigation/tvFocus';

type MediaType = 'movie' | 'series';
type Props = {
  type: MediaType;
  title: string;
  /** Catalog slices, built once per source (see features/catalog). */
  items: CatalogItem[];
  groups: CatalogGroup[];
  itemsByGroup: Map<string, CatalogItem[]>;
  onOpenPlayer: (c: M3UChannel) => void;
  onBack: () => void;
};
type SortMode = 'latest' | 'rating' | 'az';
type LibraryMemory = { group: string; sort: SortMode; query: string; focusKey: string };

const SEARCH_DEBOUNCE_MS = 180;

const MediaCard = memo(function MediaCard({
  item,
  type,
  onOpen,
  palette,
  ar,
  grid,
  preferred,
  memoryKey,
}: {
  item: CatalogItem;
  type: MediaType;
  onOpen: (item: CatalogItem) => void;
  palette: Palette;
  ar: boolean;
  grid: PosterGridLayout;
  preferred: boolean;
  memoryKey: string;
}) {
  const [failed, setFailed] = useState(false);
  // Subscribes to this card's key only: toggling one heart re-renders one card.
  const isFavorite = useIsFavorite(item.key);
  const poster = item.channel.logo || '';
  const title = item.title;
  const rawYear = (item.channel as any).releaseDate;
  const year = rawYear && /^\d{4}/.test(String(rawYear)) ? String(rawYear).slice(0, 4) : '';
  const typeLabel = type === 'movie' ? (ar ? 'فيلم' : 'Movie') : (ar ? 'مسلسل' : 'Series');
  const meta = type === 'series'
    ? `${item.episodeCount} ${ar ? 'حلقة' : item.episodeCount === 1 ? 'Episode' : 'Episodes'}${year ? ` • ${year}` : ''}`
    : year || item.group || typeLabel;
  // Focus only writes to screen memory; it never triggers a render.
  const remember = useCallback(() => screenMemory.set<LibraryMemory>(memoryKey, { focusKey: item.key }), [memoryKey, item.key]);

  return (
    <View style={[styles.cardWrap, { width: grid.cardWidth }]}>
      <Pressable
        focusable
        hasTVPreferredFocus={preferred}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel} ${title}`}
        onPress={() => onOpen(item)}
        onFocus={remember}
        style={({ focused, pressed }) => [
          styles.posterFrame,
          { width: grid.cardWidth, height: grid.cardHeight },
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {poster && !failed ? (
          // resizeMethod="resize": decode the provider's (often full-size) poster at card
          // size instead of keeping the full bitmap in memory for every visible card.
          <Image source={{ uri: poster }} style={styles.posterImage} resizeMode="cover" resizeMethod="resize" onError={() => setFailed(true)} />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={type === 'movie' ? 'movies' : 'series'} size={28} color={palette.muted} />
            <Text numberOfLines={3} style={[styles.posterFallbackText, { color: palette.secondary }]}>{title}</Text>
          </View>
        )}
        <View style={styles.posterFade} />
        {type === 'series' ? (
          <View style={[styles.episodesBadge, ar ? styles.badgeRtl : styles.badgeLtr]}>
            <Text style={styles.episodesText}>{item.episodeCount}</Text>
            <AppIcon name="series" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
      <Pressable
        focusable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? (ar ? 'إزالة من قائمتي' : 'Remove from My List') : (ar ? 'إضافة إلى قائمتي' : 'Add to My List')}
        onPress={(event: any) => {
          event?.stopPropagation?.();
          toggleFavorite(item.key);
        }}
        onFocus={remember}
        style={({ focused, pressed }) => [
          styles.favoriteButton,
          ar ? styles.favoriteRtl : styles.favoriteLtr,
          isFavorite && styles.favoriteButtonActive,
          focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name={isFavorite ? 'favorite' : 'favorites'} size={14} color="#FFFFFF" />
      </Pressable>
      <Text numberOfLines={1} style={[styles.mediaName, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
      <Text numberOfLines={1} style={[styles.mediaMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{meta}</Text>
    </View>
  );
});

/** Height of one grid row; every row is identical, which enables getItemLayout. */
function rowHeightFor(grid: PosterGridLayout) {
  return grid.cardHeight + CARD_TEXT_HEIGHT + ROW_GAP;
}

export default function MediaLibraryScreen({ type, title, items, groups: catalogGroups, itemsByGroup, onOpenPlayer, onBack }: Props) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  // Phones stack the header and give search and the filter buttons the full width.
  const device = useDeviceClass();
  const compact = device === 'phone';
  // Width the grid really has (after the rail, screen padding and list padding).
  const [gridWidth, setGridWidth] = useState(0);
  const grid = useMemo(() => posterGridLayout(gridWidth - GRID_PAD_X * 2, device), [gridWidth, device]);
  const gridReady = device === 'tv' || gridWidth > 0;

  // Restore the category, sort, search and focused card from before the
  // player / details screen replaced this page.
  const memoryKey = `library:${type}`;
  const remembered = useRef(screenMemory.get<LibraryMemory>(memoryKey)).current;
  const [group, setGroup] = useState(remembered.group && (remembered.group === ALL_GROUP || itemsByGroup.has(remembered.group)) ? remembered.group : ALL_GROUP);
  const [sort, setSort] = useState<SortMode>(remembered.sort || 'latest');
  const [queryInput, setQueryInput] = useState(remembered.query || '');
  const [query, setQuery] = useState(remembered.query || '');
  const [sheet, setSheet] = useState<'group' | 'sort' | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    screenMemory.set<LibraryMemory>(memoryKey, { group, sort, query });
  }, [memoryKey, group, sort, query]);

  // Debounced: typing fast filters once per pause, not once per character.
  useEffect(() => {
    if (queryInput === query) return;
    const timer = setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput, query]);

  // Every category with its title count; the sheet lists them all, so none are cut off.
  const groups = useMemo<FilterOption[]>(
    () => [{ key: ALL_GROUP, label: ar ? 'الكل' : 'All', count: items.length }, ...catalogGroups],
    [catalogGroups, items.length, ar],
  );
  const sortOptions = useMemo<FilterOption[]>(() => [
    { key: 'latest', label: ar ? 'الأحدث' : 'Latest', icon: 'clock' },
    { key: 'rating', label: ar ? 'الأعلى تقييماً' : 'Top rated', icon: 'star' },
    { key: 'az', label: ar ? 'أبجدي (A-Z)' : 'A-Z', icon: 'grid' },
  ], [ar]);

  // Category = Map lookup; search = precomputed keys, refined while typing.
  const searcher = useMemo(() => createSearcher<CatalogItem>(item => item.search), []);
  const base = useMemo(() => (group === ALL_GROUP ? items : itemsByGroup.get(group) || []), [group, items, itemsByGroup]);
  const ordered = useMemo(
    () => (sort === 'az' ? sortedByTitle(base, item => item.title) : base),
    [base, sort],
  );
  const searched = useMemo(() => searcher(ordered, query), [searcher, ordered, query]);
  const filtered = useMemo(
    () =>
      sort === 'rating'
        ? [...searched].sort((a, b) => (ratings[a.key] || 0) < (ratings[b.key] || 0) ? 1 : (ratings[a.key] || 0) > (ratings[b.key] || 0) ? -1 : 0)
        : searched,
    [searched, sort, ratings],
  );

  // Ratings are fetched for the first 20 matches of the unsorted result, so
  // the fetch does not depend on the order it produces.
  const ratingTargets = useMemo(() => (sort === 'rating' ? searched.slice(0, 20) : []), [sort, searched]);
  useEffect(() => {
    if (!ratingTargets.length) return;
    let alive = true;
    Promise.all(ratingTargets.map(async item => {
      try {
        const m = await getTmdbMetadata({ ...item.channel, name: item.title }, type);
        return [item.key, Number(m?.voteAverage || 0)] as const;
      } catch {
        return [item.key, 0] as const;
      }
    })).then(entries => {
      if (alive) setRatings(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { alive = false; };
  }, [ratingTargets, type]);

  const reset = () => { setQueryInput(''); setQuery(''); setGroup(ALL_GROUP); setSort('latest'); };
  const activeGroup = groups.find(g => g.key === group) || groups[0];
  const activeSort = sortOptions.find(o => o.key === sort) || sortOptions[0];
  const filtersActive = group !== ALL_GROUP || sort !== 'latest' || query.trim() !== '';

  // First focus: the card the user left from, else the first card.
  const focusIndex = useMemo(() => {
    const key = remembered.focusKey;
    const index = key ? filtered.findIndex(item => item.key === key) : -1;
    return index >= 0 ? index : 0;
    // Only for the first render of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [preferredIndex, setPreferredIndex] = useState(focusIndex);
  const firstListRender = useRef(true);
  useEffect(() => {
    // After the list changes (category, sort, search) focus stays where the user
    // is (toolbar / search); no card grabs it.
    if (firstListRender.current) {
      firstListRender.current = false;
      return;
    }
    setPreferredIndex(-1);
  }, [group, sort, query]);

  const openItem = useCallback(
    (item: CatalogItem) => {
      screenMemory.set<LibraryMemory>(memoryKey, { focusKey: item.key });
      onOpenPlayer(item.channel);
    },
    [memoryKey, onOpenPlayer],
  );

  const rowHeight = rowHeightFor(grid);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: rowHeight, offset: GRID_PAD_TOP + rowHeight * index, index }),
    [rowHeight],
  );

  return (
    <View style={[styles.screen, compact && styles.screenCompact, { backgroundColor: palette.background }]}>
      <FocusRegion>
        <View style={[styles.header, compact && styles.headerCompact, { flexDirection: compact ? 'column' : rowDirection }]}>
          <View style={[styles.headerTitleWrap, compact && styles.headerTitleWrapCompact]}>
            <Text style={[styles.eyebrow, { color: palette.primaryText, textAlign: ar ? 'right' : 'left' }]}>{type === 'movie' ? 'MOVIES' : 'SERIES'}</Text>
            <Text style={[styles.pageTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
            <Text style={[styles.pageSub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')} {type === 'movie' ? (ar ? 'فيلم متاح' : 'titles available') : (ar ? 'مسلسل متاح' : 'series available')}</Text>
          </View>
          <View style={[styles.headerTools, compact && styles.headerToolsCompact, { flexDirection: rowDirection }]}>
            <View style={[styles.searchBox, compact && styles.searchBoxCompact, { flexDirection: rowDirection, backgroundColor: palette.surface, borderColor: searchFocused ? palette.focus : palette.border }]}>
              <AppIcon name="search" size={18} color={palette.muted} />
              <TextInput
                value={queryInput}
                onChangeText={setQueryInput}
                onSubmitEditing={() => setQuery(queryInput)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={ar ? `ابحث عن ${type === 'movie' ? 'فيلم' : 'مسلسل'}...` : `Search ${type === 'movie' ? 'movies' : 'series'}...`}
                placeholderTextColor={palette.muted}
                returnKeyType="search"
                style={[styles.searchInput, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}
              />
            </View>
            <Pressable
              focusable
              accessibilityLabel={ar ? 'رجوع' : 'Back'}
              onPress={onBack}
              style={({ focused, pressed }) => [
                styles.iconButton,
                { backgroundColor: palette.surface, borderColor: palette.border },
                focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
                pressed && styles.pressed,
              ]}
            >
              <View style={ar ? styles.flipX : undefined}>
                <AppIcon name="back" size={19} color={palette.secondary} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={[styles.toolbar, { flexDirection: rowDirection }]}>
          <FilterButton
            grow
            caption={ar ? 'التصنيف' : 'Category'}
            value={activeGroup.label}
            count={activeGroup.count}
            icon="grid"
            active={group !== ALL_GROUP}
            onPress={() => setSheet('group')}
            palette={palette}
            ar={ar}
          />
          <FilterButton
            grow={compact}
            caption={ar ? 'الترتيب' : 'Sort by'}
            value={activeSort.label}
            icon="sliders"
            active={sort !== 'latest'}
            onPress={() => setSheet('sort')}
            palette={palette}
            ar={ar}
          />
          {filtersActive ? <ClearFiltersButton onPress={reset} palette={palette} ar={ar} /> : null}
        </View>
      </FocusRegion>

      <OptionSheet
        visible={sheet === 'group'}
        title={ar ? 'اختر التصنيف' : 'Choose a category'}
        options={groups}
        selectedKey={group}
        onSelect={key => { setGroup(key); setSheet(null); }}
        onClose={() => setSheet(null)}
        palette={palette}
        ar={ar}
      />
      <OptionSheet
        visible={sheet === 'sort'}
        variant="list"
        title={ar ? 'ترتيب حسب' : 'Sort by'}
        options={sortOptions}
        selectedKey={sort}
        onSelect={key => { setSort(key as SortMode); setSheet(null); }}
        onClose={() => setSheet(null)}
        palette={palette}
        ar={ar}
      />

      <FocusRegion style={styles.gridArea}>
        <View style={styles.gridArea} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
          {gridReady ? (
            <FlatList
              key={`grid-${grid.columns}`}
              data={filtered}
              keyExtractor={i => i.key}
              numColumns={grid.columns}
              columnWrapperStyle={grid.columns > 1 ? [styles.gridRow, { gap: grid.gap, flexDirection: rowDirection }] : undefined}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              getItemLayout={getItemLayout}
              initialScrollIndex={preferredIndex > 0 ? initialRowFor(preferredIndex, grid.columns) : undefined}
              renderItem={({ item, index }) => (
                <MediaCard
                  item={item}
                  type={type}
                  onOpen={openItem}
                  palette={palette}
                  ar={ar}
                  grid={grid}
                  preferred={index === preferredIndex}
                  memoryKey={memoryKey}
                />
              )}
              ListEmptyComponent={<Empty type={type} palette={palette} ar={ar} />}
              removeClippedSubviews
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={7}
            />
          ) : null}
        </View>
      </FocusRegion>
    </View>
  );
}

function Empty({ type, palette, ar }: { type: MediaType; palette: Palette; ar: boolean }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.primarySoft }]}>
        <AppIcon name={type === 'movie' ? 'movies' : 'series'} size={28} color={palette.primaryText} />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>
        {ar ? 'ماكو محتوى مطابق' : 'No matching content'}
      </Text>
      <Text style={[styles.emptyText, { color: palette.muted }]}>
        {ar ? 'جرّب تغيير البحث أو التصنيف حتى تظهر النتائج.' : 'Try changing the search or filter.'}
      </Text>
    </View>
  );
}

const T = SHASHTNA_THEME.typography;
const GRID_PAD_X = 4;
const GRID_PAD_TOP = 10;
const ROW_GAP = 22;
const META_LINE = 16;
/** mediaName (10 + line) + mediaMeta (2 + line): fixed so every row has the same height. */
const CARD_TEXT_HEIGHT = 10 + T.lineHeight.cardTitle + 2 + META_LINE;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 26 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 20 },
  headerTitleWrap: { flex: 1 },
  headerTitleWrapCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  screenCompact: { paddingHorizontal: 16, paddingTop: 16 },
  headerCompact: { alignItems: 'stretch', gap: 12 },
  headerToolsCompact: { alignSelf: 'stretch' },
  searchBoxCompact: { flex: 1, width: undefined },
  headerTools: { alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4 },
  pageTitle: { fontSize: T.size.pageTitle, lineHeight: T.lineHeight.pageTitle, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 4 },
  pageSub: { fontSize: T.size.secondary, marginTop: 2, fontWeight: '700' },
  flipX: { transform: [{ scaleX: -1 }] },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  searchBox: { width: 340, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  searchInput: { flex: 1, fontFamily: SHASHTNA_FONT.sans, fontSize: 16, paddingVertical: 0 },
  toolbar: { alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16, paddingHorizontal: 4 },
  gridArea: { flex: 1 },
  grid: { paddingBottom: 40, paddingTop: GRID_PAD_TOP, paddingHorizontal: GRID_PAD_X },
  gridRow: {},
  cardWrap: { position: 'relative', marginBottom: ROW_GAP },
  posterFrame: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  posterImage: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 10, experimental_backgroundImage: 'linear-gradient(160deg, #13203A 0%, #0A101C 100%)' },
  posterFallbackText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  posterFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', experimental_backgroundImage: SHASHTNA_THEME.gradients.posterBottom },
  episodesBadge: { position: 'absolute', bottom: 8, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(2,4,9,0.78)', flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeLtr: { left: 8 },
  badgeRtl: { right: 8 },
  episodesText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  favoriteButton: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'rgba(2,4,9,.72)', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  favoriteLtr: { right: 8 },
  favoriteRtl: { left: 8 },
  favoriteButtonActive: { backgroundColor: '#FF4D7A', borderColor: 'rgba(255,255,255,.4)' },
  mediaName: { fontSize: T.size.cardTitle, lineHeight: T.lineHeight.cardTitle, fontWeight: '800', marginTop: 10, paddingHorizontal: 2 },
  mediaMeta: { fontSize: 12, lineHeight: META_LINE, marginTop: 2, fontWeight: '700', paddingHorizontal: 2 },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 24, maxWidth: 560 },
  pressed: { opacity: 0.84 },
});
