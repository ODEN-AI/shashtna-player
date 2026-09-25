import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../components/common/Typography';
import HScroll from '../../components/layout/HScroll';
import { M3UChannel } from '../../lib/m3u';
import { getRecentTmdbCatalog, tmdbImageUrl, TmdbMediaMetadata, TmdbRecentItem } from '../../lib/tmdb';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { useDeviceClass } from '../../design/device';
import HeroCarousel from '../../features/ads/HeroCarousel';
import { useAdvertisements } from '../../features/ads/advertisementRepository';
import { Advertisement } from '../../features/ads/types';
import { ContinueWatchingEntry, useContinueWatching } from '../../features/continueWatching/continueWatchingStore';
import { Catalog } from '../../features/catalog/catalog';
import { toggleFavorite, useFavoriteKeys, useIsFavorite } from '../../features/favorites/favoritesStore';
import { FocusRegion, screenMemory } from '../../navigation/tvFocus';

type Props = {
  catalog: Catalog;
  onNavigate: (page: 'home'|'live'|'movies'|'series'|'favorites'|'search'|'settings') => void;
  onOpenPlayer: (channel: M3UChannel) => void;
  onResume: (entry: ContinueWatchingEntry) => void;
  onOpenLiveGroup: (group: string) => void;
  onAdAction: (ad: Advertisement) => void;
};

type MediaType = 'movie' | 'series';
type MediaItem = {
  channel: M3UChannel;
  type: MediaType;
  title: string;
};
type RankedItem = MediaItem & {
  meta: TmdbMediaMetadata;
};

function cleanTitle(v: string) {
  return String(v || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi, ' ')
    .replace(/\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasArabicLetters(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function hintedYear(value: string) {
  const match = String(value || '').match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function dateValue(value: string) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function rotate<T>(items: T[], offset: number, count: number) {
  if (!items.length) return [] as T[];
  const start = ((offset % items.length) + items.length) % items.length;
  return Array.from({ length: Math.min(count, items.length) }, (_, index) =>
    items[(start + index) % items.length],
  );
}

function normalizeMatch(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '')
    .trim();
}

function matchTokens(value: string) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .split(/[^a-z0-9\u0600-\u06FF]+/)
    .filter(Boolean);
}

function titleMatchScore(sourceTitle: string, metaTitle: string, sourceYear: number, metaYear: number) {
  if (sourceYear && metaYear && sourceYear !== metaYear) {
    return 0;
  }

  const sourceExact = normalizeMatch(sourceTitle);
  const metaExact = normalizeMatch(metaTitle);
  if (!sourceExact || !metaExact) return 0;

  if (sourceExact === metaExact) {
    return sourceYear && metaYear ? 105 : 100;
  }

  const sourceTokens = matchTokens(sourceTitle);
  const metaTokens = matchTokens(metaTitle);
  if (!sourceTokens.length || !metaTokens.length) return 0;

  const metaSet = new Set(metaTokens);
  const shared = sourceTokens.filter(token => metaSet.has(token)).length;
  const coverage = shared / Math.max(sourceTokens.length, metaTokens.length);
  const sourceFlat = sourceTokens.join('');
  const metaFlat = metaTokens.join('');
  const lengthRatio =
    Math.min(sourceFlat.length, metaFlat.length) /
    Math.max(sourceFlat.length, metaFlat.length);

  if (coverage >= 0.85 && lengthRatio >= 0.72) {
    return sourceYear && metaYear ? 92 : 88;
  }

  if (
    coverage >= 0.72 &&
    lengthRatio >= 0.82 &&
    (sourceFlat.includes(metaFlat) || metaFlat.includes(sourceFlat))
  ) {
    return sourceYear && metaYear ? 86 : 82;
  }

  return 0;
}

/*
 * Title index for TMDB matching, built once per source list (the catalog's
 * lists never change), not on every Home visit: normalising tens of
 * thousands of titles with regexes was the most expensive part of opening Home.
 */
const titleIndexCache = new WeakMap<readonly MediaItem[], Map<string, MediaItem[]>>();

function titleIndexFor(sourceItems: readonly MediaItem[]): Map<string, MediaItem[]> {
  const cached = titleIndexCache.get(sourceItems);
  if (cached) return cached;
  const byTitle = new Map<string, MediaItem[]>();
  for (const item of sourceItems) {
    const key = normalizeMatch(item.title);
    if (!key) continue;
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(item);
    else byTitle.set(key, [item]);
  }
  titleIndexCache.set(sourceItems, byTitle);
  return byTitle;
}

function discoveryMatchesSource(
  catalog: TmdbRecentItem[],
  sourceItems: readonly MediaItem[],
): RankedItem[] {
  if (!catalog.length || !sourceItems.length) return [];

  const byTitle = titleIndexFor(sourceItems);

  const matched: RankedItem[] = [];
  const usedSourceIds = new Set<string>();

  for (const meta of catalog) {
    const key = normalizeMatch(meta.title);
    const candidates = byTitle.get(key) || [];
    if (!candidates.length) continue;

    const metaYear = hintedYear(meta.releaseDate);
    let best: MediaItem | undefined;

    if (metaYear) {
      best = candidates.find(item => {
        const sourceYear = hintedYear(item.title);
        return sourceYear === metaYear && !usedSourceIds.has(String(item.channel.id));
      });
    }

    if (!best) {
      const withoutYear = candidates.filter(item =>
        !hintedYear(item.title) && !usedSourceIds.has(String(item.channel.id)),
      );
      if (withoutYear.length === 1) best = withoutYear[0];
    }

    if (!best && candidates.length === 1 && !usedSourceIds.has(String(candidates[0].channel.id))) {
      best = candidates[0];
    }

    if (!best) continue;

    const sourceId = String(best.channel.id);
    usedSourceIds.add(sourceId);
    matched.push({ ...best, meta });
  }

  return matched;
}

const foreignCache = new WeakMap<readonly MediaItem[], MediaItem[]>();

/** Non-Arabic titles (matched against TMDB), computed once per catalog list. */
function foreignOf(items: readonly (MediaItem & { foreign?: boolean })[]): MediaItem[] {
  const cached = foreignCache.get(items);
  if (cached) return cached;
  const result = items.filter(item => item.foreign ?? !hasArabicLetters(item.title));
  foreignCache.set(items, result);
  return result;
}

function withEmptyMeta(item: MediaItem): RankedItem {
  return {
    ...item,
    meta: {
      id: 0,
      title: item.title,
      overview: '',
      posterPath: null,
      backdropPath: null,
      voteAverage: 0,
      releaseDate: '',
    },
  };
}

export default function HomeScreen({
  catalog,
  onNavigate,
  onOpenPlayer,
  onResume,
  onOpenLiveGroup,
  onAdAction,
}:Props) {
  const device = useDeviceClass();
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const favoriteKeys = useFavoriteKeys();

  // Titles were cleaned once when the catalog was built; Home only picks the
  // non-Arabic ones for TMDB matching (cached per catalog).
  const foreignMovies = useMemo(() => foreignOf(catalog.movies), [catalog]);
  const foreignSeries = useMemo(() => foreignOf(catalog.series), [catalog]);

  const [latestMovies, setLatestMovies] = useState<RankedItem[]>([]);
  const [latestSeries, setLatestSeries] = useState<RankedItem[]>([]);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let alive = true;

    const loadRecent = async () => {
      try {
        const [movieCatalog, seriesCatalog] = await Promise.all([
          getRecentTmdbCatalog('movie'),
          getRecentTmdbCatalog('series'),
        ]);

        if (!alive) return;

        setLatestMovies(
          discoveryMatchesSource(movieCatalog, foreignMovies),
        );
        setLatestSeries(
          discoveryMatchesSource(seriesCatalog, foreignSeries),
        );
      } catch (error) {
        console.warn('[Home] Recent catalog load failed:', error);
        if (alive) {
          setLatestMovies([]);
          setLatestSeries([]);
        }
      }
    };

    loadRecent();

    return () => {
      alive = false;
    };
  }, [foreignMovies, foreignSeries]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRotation(value => value + 1);
    }, 90000);

    return () => clearInterval(timer);
  }, []);

  // Without TMDB matches, show 8 source titles. Only those 8 get a placeholder
  // `meta` (previously every title in the library was copied to add one).
  const displayMovies = useMemo(
    () =>
      latestMovies.length
        ? rotate(latestMovies, rotation, 8)
        : rotate(foreignMovies, rotation, 8).map(withEmptyMeta),
    [latestMovies, foreignMovies, rotation],
  );

  const displaySeries = useMemo(
    () =>
      latestSeries.length
        ? rotate(latestSeries, rotation + 3, 8)
        : rotate(foreignSeries, rotation + 3, 8).map(withEmptyMeta),
    [latestSeries, foreignSeries, rotation],
  );

  const recentMixed = useMemo(
    () =>
      rotate(
        [...latestMovies, ...latestSeries].sort(
          (a, b) =>
            dateValue(b.meta.releaseDate) -
            dateValue(a.meta.releaseDate),
        ),
        rotation + 5,
        8,
      ),
    [latestMovies, latestSeries, rotation],
  );

  const topRated = useMemo(
    () =>
      [...latestMovies, ...latestSeries]
        .filter(item => Number(item.meta.voteAverage) >= 6.5)
        .sort((a, b) => Number(b.meta.voteAverage) - Number(a.meta.voteAverage))
        .slice(0, 12),
    [latestMovies, latestSeries],
  );

  const liveCategories = useMemo(
    () =>
      [...catalog.liveGroups]
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
        .map(group => ({ name: group.key, count: group.count })),
    [catalog],
  );

  const ads = useAdvertisements();
  const continueWatching = useContinueWatching();

  const openItem = useCallback((item: MediaItem) => onOpenPlayer(item.channel), [onOpenPlayer]);
  // First focus: the card the user opened last (coming back from the player),
  // otherwise the first quick destination.
  const rememberedFocus = useMemo(() => screenMemory.get<{ focusKey: string }>('home').focusKey || '', []);
  const locale = ar ? 'ar-IQ' : 'en-US';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const compact = device === 'phone';

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, compact && styles.contentContainerCompact]}
        showsVerticalScrollIndicator={false}
      >
        {/* ================= ADVERTISEMENT HERO ================= */}
        <HeroCarousel ads={ads} onAction={onAdAction} palette={palette} ar={ar} height={compact ? 260 : L.heroH} />

        {/* ================= QUICK DESTINATIONS ================= */}
        <FocusRegion style={[styles.pills, { flexDirection: rowDirection, borderColor: palette.border }]}>
          <NavPill icon="live" label={ar ? 'البث المباشر' : 'Live TV'} count={catalog.live.length.toLocaleString(locale)} onPress={() => onNavigate('live')} palette={palette} ar={ar} preferred={!rememberedFocus} />
          <NavPill icon="movies" label={ar ? 'الأفلام' : 'Movies'} count={catalog.movies.length.toLocaleString(locale)} onPress={() => onNavigate('movies')} palette={palette} ar={ar} />
          <NavPill icon="series" label={ar ? 'المسلسلات' : 'Series'} count={catalog.series.length.toLocaleString(locale)} onPress={() => onNavigate('series')} palette={palette} ar={ar} />
          <NavPill icon="favorites" label={ar ? 'قائمتي' : 'My list'} count={favoriteKeys.length.toLocaleString(locale)} onPress={() => onNavigate('favorites')} palette={palette} ar={ar} />
        </FocusRegion>

        {/* ================= CONTINUE WATCHING ================= */}
        {continueWatching.length ? (
          <View style={styles.section}>
            <SectionHeader title={ar ? 'متابعة المشاهدة' : 'Continue watching'} palette={palette} ar={ar} />
            <FocusRegion>
              <HScroll ar={ar} contentContainerStyle={styles.row}>
                {continueWatching.map(entry => (
                  <ContinueCard
                    key={entry.key}
                    entry={entry}
                    onPress={() => onResume(entry)}
                    palette={palette}
                    ar={ar}
                    preferred={rememberedFocus === `continue:${entry.key}`}
                  />
                ))}
              </HScroll>
            </FocusRegion>
          </View>
        ) : null}

        {/* ================= CONTENT ROWS ================= */}
        <MediaRow
          title={ar ? 'الأعلى تقييماً' : 'Top rated'}
          items={topRated}
          keyPrefix="top"
          palette={palette}
          ar={ar}
          onOpen={openItem}
          rememberedFocus={rememberedFocus}
        />
        <MediaRow
          title={ar ? 'أحدث الأفلام' : 'Latest movies'}
          action={ar ? 'عرض الكل' : 'View all'}
          onAction={() => onNavigate('movies')}
          items={displayMovies}
          keyPrefix="movies"
          palette={palette}
          ar={ar}
          onOpen={openItem}
          rememberedFocus={rememberedFocus}
        />
        <MediaRow
          title={ar ? 'أحدث المسلسلات' : 'Latest series'}
          action={ar ? 'عرض الكل' : 'View all'}
          onAction={() => onNavigate('series')}
          items={displaySeries}
          keyPrefix="series"
          palette={palette}
          ar={ar}
          onOpen={openItem}
          rememberedFocus={rememberedFocus}
        />
        <MediaRow
          title={ar ? 'وصل حديثاً' : 'Recently added'}
          action={ar ? 'تحديث' : 'Refresh'}
          actionIcon="refresh"
          onAction={() => setRotation(value => value + 1)}
          items={recentMixed}
          keyPrefix="recent"
          palette={palette}
          ar={ar}
          onOpen={openItem}
          rememberedFocus={rememberedFocus}
        />

        {/* ================= LIVE CATEGORIES ================= */}
        {liveCategories.length ? (
          <View style={styles.section}>
            <SectionHeader
              title={ar ? 'تصنيفات البث المباشر' : 'Live categories'}
              action={ar ? 'كل القنوات' : 'All channels'}
              onAction={() => onNavigate('live')}
              palette={palette}
              ar={ar}
            />
            <FocusRegion style={[styles.categoryGrid, { flexDirection: rowDirection }]}>
              {liveCategories.map(category => (
                <Pressable
                  key={category.name}
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={category.name}
                  onPress={() => onOpenLiveGroup(category.name)}
                  style={({ focused, pressed }) => [
                    styles.category,
                    { flexDirection: rowDirection, backgroundColor: palette.surface, borderColor: palette.border },
                    focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.categoryDot} />
                  <Text numberOfLines={1} style={[styles.categoryName, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
                    {category.name}
                  </Text>
                  <Text style={[styles.categoryCount, { color: palette.muted }]}>{category.count.toLocaleString(locale)}</Text>
                </Pressable>
              ))}
            </FocusRegion>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* =========================================================
   BUILDING BLOCKS
   ========================================================= */

function SectionHeader({
  title,
  action,
  actionIcon = 'chevron',
  onAction,
  palette,
  ar,
}: {
  title: string;
  action?: string;
  actionIcon?: AppIconName;
  onAction?: () => void;
  palette: Palette;
  ar: boolean;
}) {
  return (
    <View style={[styles.sectionHeader, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
      <View style={[styles.sectionTitleWrap, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <View style={[styles.sectionAccent, { experimental_backgroundImage: palette.accent.gradient }]} />
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable
          focusable
          onPress={onAction}
          style={({ focused, pressed }) => [
            styles.viewAll,
            { flexDirection: ar ? 'row-reverse' : 'row' },
            focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.viewAllText, { color: palette.primaryText }]}>{action}</Text>
          <View style={ar && actionIcon === 'chevron' ? styles.flipX : undefined}>
            <AppIcon name={actionIcon} size={14} color={palette.primaryText} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function MediaRow({
  title,
  action,
  actionIcon,
  onAction,
  items,
  keyPrefix,
  palette,
  ar,
  onOpen,
  rememberedFocus,
}: {
  title: string;
  action?: string;
  actionIcon?: AppIconName;
  onAction?: () => void;
  items: RankedItem[];
  keyPrefix: string;
  palette: Palette;
  ar: boolean;
  onOpen: (item: MediaItem) => void;
  rememberedFocus: string;
}) {
  if (!items.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} action={action} actionIcon={actionIcon} onAction={onAction} palette={palette} ar={ar} />
      {/* Each row remembers its focused card: UP/DOWN between rows returns to it. */}
      <FocusRegion>
        <HScroll ar={ar} contentContainerStyle={styles.row}>
          {items.map(item => {
            const focusKey = `${keyPrefix}:${item.type}:${item.channel.id}`;
            return (
              <PosterCard
                key={focusKey}
                focusKey={focusKey}
                item={item}
                onOpen={onOpen}
                palette={palette}
                ar={ar}
                preferred={rememberedFocus === focusKey}
              />
            );
          })}
        </HScroll>
      </FocusRegion>
    </View>
  );
}

const PosterCard = memo(function PosterCard({
  item,
  focusKey,
  onOpen,
  palette,
  ar,
  preferred,
}: {
  item: RankedItem;
  focusKey: string;
  onOpen: (item: MediaItem) => void;
  palette: Palette;
  ar: boolean;
  preferred: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const favoriteKey = `${item.type}:${String(item.channel.id)}`;
  const favorite = useIsFavorite(favoriteKey);
  const remember = useCallback(() => screenMemory.set('home', { focusKey }), [focusKey]);
  const poster = tmdbImageUrl(item.meta?.posterPath, 'w342') || item.channel.logo || '';
  const rating = Number(item.meta?.voteAverage || 0);
  const year = item.meta?.releaseDate ? item.meta.releaseDate.slice(0, 4) : '';

  return (
    <View style={styles.posterWrap}>
      <Pressable
        focusable
        hasTVPreferredFocus={preferred}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={() => onOpen(item)}
        onFocus={remember}
        style={({ focused, pressed }) => [
          styles.poster,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {poster && !failed ? (
          <Image source={{ uri: poster }} style={styles.posterImage} resizeMethod="resize" onError={() => setFailed(true)} />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={item.type === 'movie' ? 'movies' : 'series'} size={28} color={palette.muted} />
            <Text numberOfLines={3} style={[styles.posterFallbackText, { color: palette.secondary }]}>
              {item.title}
            </Text>
          </View>
        )}
        <View style={styles.posterFade} />
        {rating ? (
          <View style={[styles.posterRating, ar ? styles.posterRatingRtl : styles.posterRatingLtr]}>
            <AppIcon name="star" size={11} color={SHASHTNA_THEME.colors.rating} />
            <Text style={styles.posterRatingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </Pressable>

      {favoriteKey ? (
        <Pressable
          focusable
          onPress={() => toggleFavorite(favoriteKey)}
          onFocus={remember}
          accessibilityRole="button"
          accessibilityLabel={favorite ? (ar ? 'إزالة من المفضلة' : 'Remove from favorites') : ar ? 'إضافة للمفضلة' : 'Add to favorites'}
          style={({ focused, pressed }) => [
            styles.favoriteButton,
            ar ? styles.favoriteButtonRtl : styles.favoriteButtonLtr,
            favorite && styles.favoriteButtonActive,
            focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name={favorite ? 'favorite' : 'favorites'} size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {/* Titles come from the playlist/TMDB and are shown as-is. */}
      <Text numberOfLines={1} style={[styles.posterTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={[styles.posterMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
        {[item.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : ar ? 'مسلسل' : 'Series', year].filter(Boolean).join(' • ')}
      </Text>
    </View>
  );
});

const ContinueCard = memo(function ContinueCard({
  entry,
  onPress,
  palette,
  ar,
  preferred,
}: {
  entry: ContinueWatchingEntry;
  onPress: () => void;
  palette: Palette;
  ar: boolean;
  preferred: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const image = entry.item.logo || entry.parent?.logo || '';
  const ratio = entry.duration > 0 ? Math.min(1, entry.position / entry.duration) : 0;
  const remaining = Math.max(0, Math.round((entry.duration - entry.position) / 60));
  const episode =
    entry.item.seasonNumber || entry.item.episodeNumber
      ? `S${entry.item.seasonNumber ?? 1} · E${entry.item.episodeNumber ?? 1}`
      : '';
  const title = entry.parent?.name || entry.item.name;

  return (
    <View style={styles.continueWrap}>
      <Pressable
        focusable
        hasTVPreferredFocus={preferred}
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        onFocus={() => screenMemory.set('home', { focusKey: `continue:${entry.key}` })}
        style={({ focused, pressed }) => [
          styles.continueCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {image && !failed ? (
          <Image source={{ uri: image }} style={styles.posterImage} resizeMethod="resize" onError={() => setFailed(true)} />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={entry.item.contentType === 'movie' ? 'movies' : 'series'} size={28} color={palette.muted} />
          </View>
        )}
        <View style={styles.posterFade} />
        <View style={[styles.continuePlay, { experimental_backgroundImage: palette.accent.gradient }]}>
          <AppIcon name="play" size={18} color="#FFFFFF" />
        </View>
        <View style={styles.continueTrack}>
          <View style={[styles.continueFill, { width: `${ratio * 100}%`, backgroundColor: palette.accent.bright }]} />
        </View>
      </Pressable>
      <Text numberOfLines={1} style={[styles.posterTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[styles.posterMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
        {[episode, ar ? `متبقي ${remaining} د` : `${remaining} min left`].filter(Boolean).join(' • ')}
      </Text>
    </View>
  );
});

function NavPill({
  icon,
  label,
  count,
  onPress,
  palette,
  ar,
  preferred = false,
}: {
  icon: AppIconName;
  label: string;
  count: string;
  onPress: () => void;
  palette: Palette;
  ar: boolean;
  preferred?: boolean;
}) {
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferred}
      onFocus={() => screenMemory.set('home', { focusKey: '' })}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.pill,
        { flexDirection: ar ? 'row-reverse' : 'row' },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} size={18} color={palette.primaryText} />
      <Text numberOfLines={1} style={[styles.pillLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.pillCount, { color: palette.muted }]}>{count}</Text>
    </Pressable>
  );
}

const L = SHASHTNA_THEME.layout;
const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: L.contentX, paddingTop: 24, paddingBottom: 48 },
  contentContainerCompact: { paddingHorizontal: 16, paddingTop: 16 },
  flipX: { transform: [{ scaleX: -1 }] },

  pills: { marginTop: 18, padding: 6, gap: 6, borderRadius: 30, borderWidth: 1, alignSelf: 'center', backgroundColor: 'rgba(8,14,32,0.55)', flexWrap: 'wrap', justifyContent: 'center' },
  pill: { height: 48, paddingHorizontal: 18, borderRadius: 24, alignItems: 'center', gap: 9, borderWidth: 2, borderColor: 'transparent' },
  pillLabel: { fontSize: T.size.secondary, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  pillCount: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },

  section: { marginTop: SHASHTNA_THEME.spacing.section },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: 38 },
  sectionTitleWrap: { alignItems: 'center', gap: 10 },
  sectionAccent: { width: 4, height: 20, borderRadius: 2, experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  sectionTitle: { fontSize: T.size.section, lineHeight: T.lineHeight.section, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  viewAll: { height: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  viewAllText: { fontSize: T.size.secondary, fontWeight: '800' },

  row: { gap: L.rowGap, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 10 },
  posterWrap: { width: L.compactW, position: 'relative' },
  poster: { width: L.compactW, height: L.compactH, borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  posterImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 10, experimental_backgroundImage: 'linear-gradient(160deg, rgba(22,38,80,0.9) 0%, rgba(8,14,32,0.9) 100%)' },
  posterFallbackText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  posterFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', experimental_backgroundImage: SHASHTNA_THEME.gradients.posterBottom },
  posterRating: { position: 'absolute', bottom: 8, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: 'rgba(2,4,9,0.78)', flexDirection: 'row', alignItems: 'center', gap: 4 },
  posterRatingLtr: { left: 8 },
  posterRatingRtl: { right: 8 },
  posterRatingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  favoriteButton: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(2,4,9,0.72)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', zIndex: 60 },
  favoriteButtonLtr: { right: 8 },
  favoriteButtonRtl: { left: 8 },
  favoriteButtonActive: { backgroundColor: '#FF4D7A', borderColor: 'rgba(255,255,255,0.4)' },
  posterTitle: { fontSize: T.size.cardTitle, lineHeight: T.lineHeight.cardTitle, fontWeight: '800', marginTop: 10, paddingHorizontal: 2 },
  posterMeta: { fontSize: 12, marginTop: 2, fontWeight: '700', paddingHorizontal: 2 },

  continueWrap: { width: 256 },
  continueCard: { width: 256, height: 144, borderRadius: 18, overflow: 'hidden', borderWidth: 1 },
  continuePlay: { position: 'absolute', bottom: 16, left: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  continueTrack: { position: 'absolute', left: 12, right: 12, bottom: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  continueFill: { height: '100%', backgroundColor: SHASHTNA_THEME.colors.primaryBright },

  categoryGrid: { flexWrap: 'wrap', gap: 12, paddingTop: 12, paddingHorizontal: 4 },
  category: { minWidth: 210, maxWidth: 300, height: 56, paddingHorizontal: 16, borderRadius: 18, borderWidth: 2, alignItems: 'center', gap: 10 },
  categoryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: SHASHTNA_THEME.colors.live },
  categoryName: { flex: 1, fontSize: 15, fontWeight: '800' },
  categoryCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },
});
