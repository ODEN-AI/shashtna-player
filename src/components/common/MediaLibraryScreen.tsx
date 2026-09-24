import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import HScroll from '../layout/HScroll';
import { M3UChannel } from '../../lib/m3u';
import { getTmdbMetadata } from '../../lib/tmdb';
import AppIcon from './AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { focusStyle, Palette, usePalette } from '../../design/palette';

type MediaType = 'movie' | 'series';
type PageName = 'home'|'live'|'movies'|'series'|'favorites'|'search'|'settings';
type Props = {
  type: MediaType;
  title: string;
  channels: M3UChannel[];
  onOpenPlayer: (c: M3UChannel) => void;
  onNavigate: (page: PageName) => void;
  onBack: () => void;
  favoriteIds?: string[];
  onToggleFavorite?: (channel: M3UChannel) => void;
};
type Item = { channel: M3UChannel; title: string; group: string; episodeCount: number };
type SortMode = 'latest' | 'rating' | 'az';

function clean(v: string) {
  return String(v || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi, ' ')
    .replace(/\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi, ' ')
    .replace(/\b(?:S\d{1,2}E\d{1,3}|S\d{1,2}|E\d{1,3})\b/gi, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildItems(channels: M3UChannel[], type: MediaType): Item[] {
  const map = new Map<string, Item>();
  for (const c of channels.filter(x => x.contentType === type)) {
    const title = clean(c.name) || c.name;
    const key = type === 'series' ? title.toLowerCase() : String(c.id);
    const old = map.get(key);
    if (old) {
      old.episodeCount += 1;
      if (!old.channel.logo && c.logo) old.channel = c;
    } else {
      map.set(key, { channel: c, title, group: String(c.group || ''), episodeCount: 1 });
    }
  }
  return [...map.values()];
}

function MediaCard({ item, type, onPress, isFavorite, onToggleFavorite, palette, ar }: { item: Item; type: MediaType; onPress: () => void; isFavorite?: boolean; onToggleFavorite?: (channel: M3UChannel) => void; palette: Palette; ar: boolean }) {
  const [failed, setFailed] = useState(false);
  const poster = item.channel.logo || '';
  const title = item.title;
  const rawYear = (item.channel as any).releaseDate;
  const year = rawYear && /^\d{4}/.test(String(rawYear)) ? String(rawYear).slice(0, 4) : '';
  const typeLabel = type === 'movie' ? (ar ? 'فيلم' : 'Movie') : (ar ? 'مسلسل' : 'Series');
  const meta = type === 'series'
    ? `${item.episodeCount} ${ar ? 'حلقة' : item.episodeCount === 1 ? 'Episode' : 'Episodes'}${year ? ` • ${year}` : ''}`
    : year || item.group || typeLabel;

  return (
    <View style={styles.cardWrap}>
      <Pressable
        focusable
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel} ${title}`}
        onPress={onPress}
        style={({ focused, pressed }) => [
          styles.posterFrame,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {poster && !failed ? (
          <Image source={{ uri: poster }} style={styles.posterImage} resizeMode="cover" onError={() => setFailed(true)} />
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
      {onToggleFavorite ? (
        <Pressable
          focusable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? (ar ? 'إزالة من قائمتي' : 'Remove from My List') : (ar ? 'إضافة إلى قائمتي' : 'Add to My List')}
          onPress={(event: any) => {
            event?.stopPropagation?.();
            onToggleFavorite(item.channel);
          }}
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
      ) : null}
      <Text numberOfLines={1} style={[styles.mediaName, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
      <Text numberOfLines={1} style={[styles.mediaMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{meta}</Text>
    </View>
  );
}

function Chip({ label, icon, active, onPress, palette }: {
  label: string;
  icon?: import('./AppIcon').AppIconName;
  active?: boolean;
  onPress: () => void;
  palette: Palette;
}) {
  return (
    <Pressable
      focusable
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.chip,
        { backgroundColor: palette.surface, borderColor: palette.border },
        active && [styles.chipActive, { experimental_backgroundImage: palette.accent.gradient }],
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      {icon ? <AppIcon name={icon} size={13} color={active ? '#FFFFFF' : palette.primaryText} /> : null}
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : palette.secondary }]}>{label}</Text>
    </Pressable>
  );
}

export default function MediaLibraryScreen({ type, title, channels, onOpenPlayer, onBack, favoriteIds = [], onToggleFavorite }: Props) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const items = useMemo(() => buildItems(channels, type), [channels, type]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const groups = useMemo(
    () => [ar ? 'الكل' : 'All', ...Array.from(new Set(items.map(i => i.group).filter(Boolean))).slice(0, 18)],
    [items, ar],
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(ar ? 'الكل' : 'All');
  const [sort, setSort] = useState<SortMode>('latest');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => { setGroup(ar ? 'الكل' : 'All'); }, [ar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = items.filter(i =>
      (group === (ar ? 'الكل' : 'All') || i.group === group) &&
      (!q || i.title.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)),
    );
    if (sort === 'az') arr.sort((a, b) => a.title.localeCompare(b.title, ar ? 'ar' : 'en'));
    if (sort === 'rating') arr.sort((a, b) => (ratings[String(b.channel.id)] || 0) - (ratings[String(a.channel.id)] || 0));
    return arr;
  }, [items, query, group, sort, ratings, ar]);

  useEffect(() => {
    if (sort !== 'rating') return;
    let alive = true;
    const targets = filtered.slice(0, 20);
    Promise.all(targets.map(async item => {
      try {
        const m = await getTmdbMetadata({ ...item.channel, name: item.title }, type);
        return [String(item.channel.id), Number(m?.voteAverage || 0)] as const;
      } catch {
        return [String(item.channel.id), 0] as const;
      }
    })).then(entries => {
      if (alive) setRatings(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { alive = false; };
  }, [sort, type, filtered.length, filtered.slice(0, 20).map(item => String(item.channel.id)).join('|')]);

  const reset = () => { setQuery(''); setGroup(ar ? 'الكل' : 'All'); setSort('latest'); };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.eyebrow, { color: palette.primaryText, textAlign: ar ? 'right' : 'left' }]}>{type === 'movie' ? 'MOVIES' : 'SERIES'}</Text>
          <Text style={[styles.pageTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
          <Text style={[styles.pageSub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')} {type === 'movie' ? (ar ? 'فيلم متاح' : 'titles available') : (ar ? 'مسلسل متاح' : 'series available')}</Text>
        </View>
        <View style={[styles.headerTools, { flexDirection: rowDirection }]}>
          <View style={[styles.searchBox, { flexDirection: rowDirection, backgroundColor: palette.surface, borderColor: searchFocused ? palette.focus : palette.border }]}>
            <AppIcon name="search" size={18} color={palette.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={ar ? `ابحث عن ${type === 'movie' ? 'فيلم' : 'مسلسل'}...` : `Search ${type === 'movie' ? 'movies' : 'series'}...`}
              placeholderTextColor={palette.muted}
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
        <HScroll ar={ar} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {groups.map(g => <Chip key={g} label={g} active={group === g} onPress={() => setGroup(g)} palette={palette} />)}
        </HScroll>
        <View style={[styles.sortGroup, { flexDirection: rowDirection, backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Chip label={ar ? 'الأحدث' : 'Latest'} active={sort === 'latest'} onPress={() => setSort('latest')} palette={palette} />
          <Chip label={ar ? 'التقييم' : 'Rating'} active={sort === 'rating'} onPress={() => setSort('rating')} icon="star" palette={palette} />
          <Chip label="A-Z" active={sort === 'az'} onPress={() => setSort('az')} palette={palette} />
          <Pressable
            focusable
            accessibilityLabel={ar ? 'إعادة' : 'Reset'}
            onPress={reset}
            style={({ focused, pressed }) => [styles.resetButton, focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale), pressed && styles.pressed]}
          >
            <AppIcon name="refresh" size={17} color={palette.secondary} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => `${type}:${i.channel.id}`}
        numColumns={SHASHTNA_THEME.layout.gridColumns}
        columnWrapperStyle={[styles.gridRow, { flexDirection: rowDirection }]}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MediaCard
            item={item}
            type={type}
            onPress={() => onOpenPlayer(item.channel)}
            isFavorite={favoriteSet.has(`${type}:${item.channel.id}`)}
            onToggleFavorite={onToggleFavorite}
            palette={palette}
            ar={ar}
          />
        )}
        ListEmptyComponent={<Empty type={type} palette={palette} ar={ar} />}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
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
const CARD_W = 128;
const CARD_H = 192;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 26 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 20 },
  headerTitleWrap: { flex: 1 },
  headerTools: { alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4 },
  pageTitle: { fontSize: T.size.pageTitle, lineHeight: T.lineHeight.pageTitle, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 4 },
  pageSub: { fontSize: T.size.secondary, marginTop: 2, fontWeight: '700' },
  flipX: { transform: [{ scaleX: -1 }] },
  iconButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  searchBox: { width: 340, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  searchInput: { flex: 1, fontFamily: SHASHTNA_FONT.sans, fontSize: 16, paddingVertical: 0 },
  toolbar: { alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 14 },
  chipScroll: { flex: 1 },
  chipRow: { gap: 8, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  sortGroup: { alignItems: 'center', gap: 4, padding: 4, borderRadius: 24, borderWidth: 1 },
  chip: { height: 38, borderRadius: 19, borderWidth: 2, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipActive: { experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, borderColor: 'transparent' },
  chipText: { fontFamily: SHASHTNA_FONT.sans, fontSize: 14, fontWeight: '800' },
  resetButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  grid: { paddingBottom: 40, paddingTop: 10, paddingHorizontal: 4 },
  gridRow: { gap: 16, marginBottom: 22 },
  cardWrap: { width: CARD_W, position: 'relative' },
  posterFrame: { width: CARD_W, height: CARD_H, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
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
  mediaMeta: { fontSize: 12, marginTop: 2, fontWeight: '700', paddingHorizontal: 2 },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 24, maxWidth: 560 },
  pressed: { opacity: 0.84 },
});
