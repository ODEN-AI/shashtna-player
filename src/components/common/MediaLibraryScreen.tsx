import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { M3UChannel } from '../../lib/m3u';
import { getTmdbMetadata, tmdbImageUrl } from '../../lib/tmdb';
import AppIcon from './AppIcon';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { useAppPreferences } from '../../design/AppPreferencesContext';

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

function useOptionalMetadata(item: Item | undefined, type: MediaType) {
  const [metadata, setMetadata] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    if (!item) {
      setMetadata(null);
      return () => { alive = false; };
    }

    getTmdbMetadata({ ...item.channel, name: item.title }, type)
      .then(value => { if (alive) setMetadata(value); })
      .catch(() => {});

    return () => { alive = false; };
  }, [item?.channel, item?.title, type]);

  return metadata;
}

function MediaCard({ item, type, onPress, isFavorite, onToggleFavorite }: { item: Item; type: MediaType; onPress: () => void; isFavorite?: boolean; onToggleFavorite?: (channel: M3UChannel) => void }) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const [failed, setFailed] = useState(false);
  const poster = item.channel.logo || '';
  const title = item.title;
  const rawYear = (item.channel as any).releaseDate;
  const year = rawYear && /^\d{4}/.test(String(rawYear)) ? String(rawYear).slice(0, 4) : '';

  return (
    <Pressable
      focusable
      accessibilityRole="button"
      accessibilityLabel={`${type === 'movie' ? (ar ? 'ÙÙŠÙ„Ù…' : 'Movie') : (ar ? 'Ù…Ø³Ù„Ø³Ù„' : 'Series')} ${title}`}
      onPress={onPress}
      style={({ focused, pressed }) => [styles.mediaCard, focused && styles.mediaCardFocused, pressed && styles.mediaCardPressed]}
    >
      <View style={styles.posterFrame}>
        {poster && !failed ? (
          <Image source={{ uri: poster }} style={styles.posterImage} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={type === 'movie' ? 'movies' : 'series'} size={31} />
          </View>
        )}
        <View style={styles.posterFade} />
        {onToggleFavorite ? (
          <Pressable
            focusable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? (ar ? 'Ø¥Ø²Ø§Ù„Ø© Ù…Ù† Ù‚Ø§Ø¦Ù…ØªÙŠ' : 'Remove from My List') : (ar ? 'Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ù‚Ø§Ø¦Ù…ØªÙŠ' : 'Add to My List')}
            onPress={(event: any) => {
              event?.stopPropagation?.();
              onToggleFavorite(item.channel);
            }}
            style={({ focused, pressed }) => [
              styles.favoriteButton,
              isFavorite && styles.favoriteButtonActive,
              focused && styles.focusRing,
              pressed && styles.pressed,
            ]}
          >
            <AppIcon
              name={isFavorite ? 'favorite' : 'favorites'}
              size={13}
              color={isFavorite ? SHASHTNA_THEME.colors.rating : SHASHTNA_THEME.colors.primaryLight}
            />
          </Pressable>
        ) : null}
        <View style={styles.mediaTypeBadge}>
          <View style={styles.mediaTypeDot} />
          <Text style={styles.mediaTypeText}>{type === 'movie' ? (ar ? 'ÙÙŠÙ„Ù…' : 'Movie') : (ar ? 'Ù…Ø³Ù„Ø³Ù„' : 'Series')}</Text>
        </View>
      </View>
      <View style={styles.mediaInfo}>
        <Text numberOfLines={2} style={styles.mediaName}>{title}</Text>
        <Text numberOfLines={1} style={styles.mediaMeta}>{type === 'series' ? `${item.episodeCount} ${ar ? 'Ø­Ù„Ù‚Ø©' : item.episodeCount === 1 ? 'Episode' : 'Episodes'}${year ? ` â€¢ ${year}` : ''}` : year || item.group || (ar ? 'ÙÙŠÙ„Ù…' : 'Movie')}</Text>
      </View>
    </Pressable>
  );
}

function Chip({ label, icon, active, onPress }: {
  label: string;
  icon?: import('./AppIcon').AppIconName;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      focusable
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.chip,
        active && styles.chipActive,
        focused && styles.focusRing,
        pressed && styles.pressed,
      ]}
    >
      {icon ? <AppIcon name={icon} size={13} color={active ? SHASHTNA_THEME.colors.white : SHASHTNA_THEME.colors.primaryLight} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function MediaLibraryScreen({ type, title, channels, onOpenPlayer, onNavigate, onBack, favoriteIds = [], onToggleFavorite }: Props) {
  const { language, themeMode } = useAppPreferences();
  const ar = language === 'ar';
  const light = themeMode === 'light';
  const items = useMemo(() => buildItems(channels, type), [channels, type]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const groups = useMemo(
    () => [ar ? 'Ø§Ù„ÙƒÙ„' : 'All', ...Array.from(new Set(items.map(i => i.group).filter(Boolean))).slice(0, 18)],
    [items, ar],
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(ar ? 'Ø§Ù„ÙƒÙ„' : 'All');
  const [sort, setSort] = useState<SortMode>('latest');
  const [ratings, setRatings] = useState<Record<string, number>>({});

  useEffect(() => { setGroup(ar ? 'Ø§Ù„ÙƒÙ„' : 'All'); }, [ar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = items.filter(i =>
      (group === (ar ? 'Ø§Ù„ÙƒÙ„' : 'All') || i.group === group) &&
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

  const reset = () => { setQuery(''); setGroup(ar ? 'Ø§Ù„ÙƒÙ„' : 'All'); setSort('latest'); };

  return (
    <View style={[styles.screen, { backgroundColor: light ? '#F4F7FB' : SHASHTNA_THEME.colors.background }]}>
      <View style={[styles.header, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.eyebrow}>{type === 'movie' ? 'MOVIES' : 'SERIES'}</Text>
          <Text style={[styles.pageTitle, { textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
          <Text style={[styles.pageSub, { textAlign: ar ? 'right' : 'left' }]}>{filtered.length.toLocaleString(ar ? 'ar-IQ' : 'en-US')} {type === 'movie' ? (ar ? 'ÙÙŠÙ„Ù… Ù…ØªØ§Ø­' : 'titles available') : (ar ? 'Ù…Ø³Ù„Ø³Ù„ Ù…ØªØ§Ø­' : 'series available')}</Text>
        </View>
        <View style={[styles.headerTools, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <Pressable focusable onPress={onBack} style={({ focused, pressed }) => [styles.backButton, focused && styles.focusRing, pressed && styles.pressed]}>
            <AppIcon name="back" size={20} />
            <Text style={styles.backText}>{ar ? 'Ø±Ø¬ÙˆØ¹' : 'Back'}</Text>
          </Pressable>
          <View style={styles.searchBox}>
            <AppIcon name="search" size={19} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={ar ? `Ø§Ø¨Ø­Ø« Ø¹Ù† ${type === 'movie' ? 'ÙÙŠÙ„Ù…' : 'Ù…Ø³Ù„Ø³Ù„'}...` : `Search ${type === 'movie' ? 'movies' : 'series'}...`}
              placeholderTextColor={SHASHTNA_THEME.colors.textMuted}
              style={styles.searchInput}
            />
          </View>
        </View>
      </View>

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          {groups.map(g => <Chip key={g} label={g} active={group === g} onPress={() => setGroup(g)} />)}
        </ScrollView>
        <View style={styles.sortGroup}>
          <Chip label={ar ? 'Ø§Ù„Ø£Ø­Ø¯Ø«' : 'Latest'} active={sort === 'latest'} onPress={() => setSort('latest')} />
          <Chip label={ar ? 'Ø§Ù„ØªÙ‚ÙŠÙŠÙ…' : 'Rating'} active={sort === 'rating'} onPress={() => setSort('rating')} icon="star" />
          <Chip label="A-Z" active={sort === 'az'} onPress={() => setSort('az')} icon="filter" />
          <Pressable focusable onPress={reset} style={({ focused, pressed }) => [styles.resetButton, focused && styles.focusRing, pressed && styles.pressed]}>
            <AppIcon name="refresh" size={17} />
            <Text style={styles.resetText}>{ar ? 'Ø¥Ø¹Ø§Ø¯Ø©' : 'Reset'}</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => `${type}:${i.channel.id}`}
        numColumns={5}
        columnWrapperStyle={[styles.gridRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MediaCard
            item={item}
            type={type}
            onPress={() => onOpenPlayer(item.channel)}
            isFavorite={favoriteSet.has(`${type}:${item.channel.id}`)}
            onToggleFavorite={onToggleFavorite}
          />
        )}
        ListEmptyComponent={<Empty type={type} />}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
    </View>
  );
}

function Empty({ type }: { type: MediaType }) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';

  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <AppIcon name={type === 'movie' ? 'movies' : 'series'} size={28} />
      </View>
      <Text style={styles.emptyTitle}>
        {ar ? 'Ù…Ø§ÙƒÙˆ Ù…Ø­ØªÙˆÙ‰ Ù…Ø·Ø§Ø¨Ù‚' : 'No matching content'}
      </Text>
      <Text style={styles.emptyText}>
        {ar ? 'Ø¬Ø±Ù‘Ø¨ ØªØºÙŠÙŠØ± Ø§Ù„Ø¨Ø­Ø« Ø£Ùˆ Ø§Ù„ØªØµÙ†ÙŠÙ Ø­ØªÙ‰ ØªØ¸Ù‡Ø± Ø§Ù„Ù†ØªØ§Ø¦Ø¬.' : 'Try changing the search or filter.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, paddingTop: 27, paddingBottom: 27 },
  header: { minHeight: 76, alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 24 },
  headerTitleWrap: { flex: 1 },
  headerTools: { alignItems: 'center', gap: 16 },
  eyebrow: { color: '#58B6FF', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  pageTitle: { color: '#fff', fontSize: 32, lineHeight: 40, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 2 },
  pageSub: { color: '#91A6BD', fontSize: 15, marginTop: 4 },
  backButton: { height: 48, minWidth: 108, borderRadius: 24, borderWidth: 2, borderColor: SHASHTNA_THEME.colors.border, backgroundColor: SHASHTNA_THEME.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  backText: { color: '#EAF2FA', fontSize: 15, fontWeight: '800' },
  searchBox: { width: 390, height: 48, borderRadius: 24, borderWidth: 1, borderColor: SHASHTNA_THEME.colors.border, backgroundColor: SHASHTNA_THEME.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontFamily: SHASHTNA_FONT.sans, fontSize: 16, paddingVertical: 0 },
  toolbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  chipRow: { gap: 8, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 3 },
  sortGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { height: 40, minHeight: 40, borderRadius: 20, borderWidth: 2, borderColor: SHASHTNA_THEME.colors.border, backgroundColor: SHASHTNA_THEME.colors.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  chipActive: { backgroundColor: SHASHTNA_THEME.colors.primarySoft, borderColor: SHASHTNA_THEME.colors.primary },
  chipText: { color: SHASHTNA_THEME.colors.textSecondary, fontFamily: SHASHTNA_FONT.sans, fontSize: 15, fontWeight: '800' },
  chipTextActive: { color: '#fff' },
  resetButton: { height: 40, minWidth: 92, borderRadius: 20, borderWidth: 2, borderColor: SHASHTNA_THEME.colors.border, backgroundColor: SHASHTNA_THEME.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16 },
  resetText: { color: '#C4D2E2', fontSize: 15, fontWeight: '800' },
  grid: { paddingBottom: 40, paddingTop: 8 },
  gridRow: { gap: 12, marginBottom: 32 },
  mediaCard: { width: 136, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', overflow: 'visible', paddingBottom: 2 },
  mediaCardFocused: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ scale: 1.08 }], shadowColor: '#030810', shadowOpacity: .28, shadowRadius: 8, elevation: 6, zIndex: 50 },
  mediaCardPressed: { opacity: .84 },
  posterFrame: { width: 136, height: 204, borderRadius: 16, backgroundColor: '#0A1B30', position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: SHASHTNA_THEME.colors.border },
  posterImage: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10233B' },
  posterFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, backgroundColor: 'rgba(2,9,19,.35)' },
  favoriteButton: { position: 'absolute', right: 8, top: 8, width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', backgroundColor: 'rgba(3,13,25,.82)', alignItems: 'center', justifyContent: 'center' },
  favoriteButtonActive: { backgroundColor: 'rgba(23,136,255,.84)', borderColor: '#7CC4FF' },
  mediaTypeBadge: { position: 'absolute', left: 8, top: 8, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(110,186,255,.28)', backgroundColor: 'rgba(3,13,25,.84)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mediaTypeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#58B6FF' },
  mediaTypeText: { color: '#E7F2FF', fontSize: 12, fontWeight: '900' },
  mediaRating: { position: 'absolute', right: 8, bottom: 8, height: 28, minWidth: 48, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,200,87,.28)', backgroundColor: 'rgba(3,13,25,.84)', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  mediaRatingText: { color: '#F5F8FD', fontSize: 12, fontWeight: '900' },
  mediaInfo: { minHeight: 76, paddingHorizontal: 4, paddingVertical: 9 },
  mediaName: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '900' },
  mediaMeta: { color: '#91A6BD', fontSize: 14, marginTop: 6, fontWeight: '700' },
  empty: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#0A2947', borderWidth: 1, borderColor: '#205A8B', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 14 },
  emptyText: { color: '#8195AA', fontSize: 15, textAlign: 'center', marginTop: 7, lineHeight: 24, maxWidth: 560 },
  focusRing: { borderColor: '#FFFFFF', borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.05)', shadowColor: '#030810', shadowOpacity: .28, shadowRadius: 8, elevation: 6, zIndex: 50 },
  pressed: { opacity: .84 },
});

