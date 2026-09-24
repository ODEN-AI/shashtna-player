import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { M3UChannel } from '../../lib/m3u';
import { getRecentTmdbCatalog, tmdbImageUrl, TmdbMediaMetadata, TmdbRecentItem } from '../../lib/tmdb';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { focusStyle, Palette, usePalette } from '../../design/palette';

type Props = {
  channels: M3UChannel[];
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  onNavigate: (page: 'home'|'live'|'movies'|'series'|'favorites'|'search'|'settings') => void;
  onOpenPlayer: (channel: M3UChannel) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (channel: M3UChannel) => void;
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

function discoveryMatchesSource(
  catalog: TmdbRecentItem[],
  sourceItems: MediaItem[],
): RankedItem[] {
  if (!catalog.length || !sourceItems.length) return [];

  const byTitle = new Map<string, MediaItem[]>();

  for (const item of sourceItems) {
    const key = normalizeMatch(item.title);
    if (!key) continue;
    const bucket = byTitle.get(key);
    if (bucket) bucket.push(item);
    else byTitle.set(key, [item]);
  }

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

export default function HomeScreen({
  channels,
  channelCount,
  movieCount,
  seriesCount,
  onNavigate,
  onOpenPlayer,
  favoriteIds = [],
  onToggleFavorite,
}:Props) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const favoriteSet = useMemo(()=>new Set(favoriteIds),[favoriteIds]);

  const [foreignMovies, setForeignMovies] = useState<MediaItem[]>([]);
  const [foreignSeries, setForeignSeries] = useState<MediaItem[]>([]);

  useEffect(() => {
    let alive = true;

    const collectSourceItems = async () => {
      // Let Home paint first, then scan the large channel array in chunks.
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      const nextMovies: MediaItem[] = [];
      const nextSeries: MediaItem[] = [];

      for (let index = 0; index < channels.length; index += 1) {
        const channel = channels[index];
        if (channel.contentType !== 'movie' && channel.contentType !== 'series') continue;

        const title = cleanTitle(channel.name);
        if (hasArabicLetters(title)) continue;

        const item: MediaItem = {
          channel,
          type: channel.contentType,
          title,
        };

        if (channel.contentType === 'movie') nextMovies.push(item);
        else nextSeries.push(item);

        if (index > 0 && index % 1500 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }

      if (!alive) return;
      setForeignMovies(nextMovies);
      setForeignSeries(nextSeries);
    };

    collectSourceItems();

    return () => {
      alive = false;
    };
  }, [channels]);

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

  const fallbackMovies = useMemo<RankedItem[]>(
    () =>
      foreignMovies.map(item => ({
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
      })),
    [foreignMovies],
  );

  const fallbackSeries = useMemo<RankedItem[]>(
    () =>
      foreignSeries.map(item => ({
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
      })),
    [foreignSeries],
  );

  const displayMovies = useMemo(
    () =>
      rotate(
        latestMovies.length ? latestMovies : fallbackMovies,
        rotation,
        8,
      ),
    [latestMovies, fallbackMovies, rotation],
  );

  const displaySeries = useMemo(
    () =>
      rotate(
        latestSeries.length ? latestSeries : fallbackSeries,
        rotation + 3,
        8,
      ),
    [latestSeries, fallbackSeries, rotation],
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

  const heroPool = useMemo(() => {
    const merged = [...latestMovies.slice(0, 8), ...latestSeries.slice(0, 8)];

    if (merged.length) {
      return merged;
    }

    return [...displayMovies, ...displaySeries];
  }, [latestMovies, latestSeries, displayMovies, displaySeries]);

  const hero = heroPool.length
    ? heroPool[rotation % heroPool.length]
    : undefined;

  const heroPoster =
    hero?.meta?.backdropPath
      ? tmdbImageUrl(hero.meta.backdropPath, 'w780') || ''
      : hero?.meta?.posterPath
        ? tmdbImageUrl(hero.meta.posterPath, 'w780') || ''
        : hero?.channel.logo || '';

  const isFav = (item: MediaItem) => favoriteSet.has(`${item.type}:${String(item.channel.id)}`);
  const toggle = (item: MediaItem) => onToggleFavorite?.(item.channel);
  const locale = ar ? 'ar-IQ' : 'en-US';
  const dir = ar ? 'rtl' : 'ltr';
  const textAlign = ar ? 'right' : 'left';
  const rowDirection = ar ? 'row-reverse' : 'row';

  const heroDots = Math.min(heroPool.length, 6);
  const heroIndex = heroPool.length ? rotation % heroPool.length : 0;
  const heroRating = Number(hero?.meta?.voteAverage || 0);
  const heroYear = hero?.meta?.releaseDate ? hero.meta.releaseDate.slice(0, 4) : '';

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        style={[styles.content, { direction: dir }]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        {/* ================= HERO ================= */}
        <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {heroPoster ? (
            <Image source={{ uri: heroPoster }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]} />
          )}
          <View style={[styles.fill, { experimental_backgroundImage: ar ? palette.heroFadeRtl : palette.heroFade }]} />
          <View style={[styles.fill, { experimental_backgroundImage: palette.heroBottom }]} />

          <View style={[styles.heroCopy, ar ? styles.heroCopyRtl : styles.heroCopyLtr]}>
            <View style={[styles.heroBadgeRow, { flexDirection: rowDirection }]}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{ar ? 'جديد' : 'NEW'}</Text>
              </View>
              {hero ? (
                <Text style={[styles.heroKind, { color: palette.secondary }]}>
                  {hero.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : (ar ? 'مسلسل' : 'Series')}
                </Text>
              ) : null}
            </View>

            <Text numberOfLines={2} style={[styles.heroTitle, { color: palette.text, writingDirection: dir, textAlign }]}>
              {hero ? hero.title : ar ? 'أحدث المحتوى يظهر هنا' : 'Latest content appears here'}
            </Text>

            {hero && (heroRating || heroYear) ? (
              <View style={[styles.heroMetaRow, { flexDirection: rowDirection }]}>
                {heroRating ? (
                  <View style={[styles.metaPill, { flexDirection: rowDirection }]}>
                    <AppIcon name="star" size={13} color={SHASHTNA_THEME.colors.rating} />
                    <Text style={styles.metaPillText}>{heroRating.toFixed(1)}</Text>
                  </View>
                ) : null}
                {heroYear ? (
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>{heroYear}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text numberOfLines={2} style={[styles.heroDesc, { color: palette.secondary, writingDirection: dir, textAlign }]}>
              {hero?.meta?.overview ||
                (ar
                  ? 'نعرض لك أحدث الأفلام والمسلسلات الأجنبية المتوفرة في المصدر المتصل، مع تبديل الاقتراحات تلقائياً.'
                  : 'Showing recent foreign movies and series available in the connected source, with rotating recommendations.')}
            </Text>

            {hero ? (
              <View style={[styles.actions, { flexDirection: rowDirection }]}>
                <Pressable
                  focusable
                  onPress={() => onOpenPlayer(hero.channel)}
                  style={({ focused, pressed }) => [
                    styles.primaryButton,
                    { flexDirection: rowDirection },
                    focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
                    pressed && styles.pressed,
                  ]}
                >
                  <AppIcon name="play" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>{ar ? 'مشاهدة الآن' : 'Watch now'}</Text>
                </Pressable>
                <Pressable
                  focusable
                  onPress={() => toggle(hero)}
                  style={({ focused, pressed }) => [
                    styles.secondaryButton,
                    { flexDirection: rowDirection, backgroundColor: palette.overlay, borderColor: palette.borderStrong },
                    focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
                    pressed && styles.pressed,
                  ]}
                >
                  <AppIcon
                    name={isFav(hero) ? 'check' : 'plus'}
                    size={18}
                    color={palette.mode === 'dark' ? '#FFFFFF' : palette.text}
                  />
                  <Text style={[styles.secondaryButtonText, { color: palette.mode === 'dark' ? '#FFFFFF' : palette.text }]}>
                    {isFav(hero) ? (ar ? 'في قائمتي' : 'In my list') : ar ? 'أضف لقائمتي' : 'My list'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {heroDots > 1 ? (
            <View style={[styles.heroDots, ar ? styles.heroDotsRtl : styles.heroDotsLtr, { flexDirection: rowDirection }]}>
              {Array.from({ length: heroDots }).map((_, i) => (
                <View key={i} style={[styles.heroDot, i === heroIndex % heroDots && styles.heroDotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        {/* ================= QUICK ACCESS ================= */}
        <View style={[styles.quickRow, { flexDirection: rowDirection }]}>
          <QuickCard
            icon="live"
            accent={SHASHTNA_THEME.gradients.live}
            title={ar ? 'البث المباشر' : 'Live TV'}
            sub={`${channelCount.toLocaleString(locale)} ${ar ? 'قناة' : 'channels'}`}
            onPress={() => onNavigate('live')}
            palette={palette}
            ar={ar}
          />
          <QuickCard
            icon="movies"
            accent={SHASHTNA_THEME.gradients.brand}
            title={ar ? 'الأفلام' : 'Movies'}
            sub={`${movieCount.toLocaleString(locale)} ${ar ? 'عنوان' : 'titles'}`}
            onPress={() => onNavigate('movies')}
            palette={palette}
            ar={ar}
          />
          <QuickCard
            icon="series"
            accent="linear-gradient(120deg, #7B4DFF 0%, #B26BFF 100%)"
            title={ar ? 'المسلسلات' : 'Series'}
            sub={`${seriesCount.toLocaleString(locale)} ${ar ? 'مسلسل' : 'series'}`}
            onPress={() => onNavigate('series')}
            palette={palette}
            ar={ar}
          />
          <QuickCard
            icon="favorite"
            accent="linear-gradient(120deg, #FF4D7A 0%, #FF8A5B 100%)"
            title={ar ? 'المفضلة' : 'Favorites'}
            sub={`${favoriteIds.length.toLocaleString(locale)} ${ar ? 'محفوظ' : 'saved'}`}
            onPress={() => onNavigate('favorites')}
            palette={palette}
            ar={ar}
          />
        </View>

        {/* ================= ROWS ================= */}
        <MediaRow
          title={ar ? 'أحدث الأفلام الأجنبية' : 'Latest foreign movies'}
          action={ar ? 'عرض الكل' : 'View all'}
          onAction={() => onNavigate('movies')}
          items={displayMovies}
          keyPrefix="movies"
          palette={palette}
          ar={ar}
          isFav={isFav}
          onToggle={onToggleFavorite ? toggle : undefined}
          onOpen={item => onOpenPlayer(item.channel)}
        />
        <MediaRow
          title={ar ? 'أحدث المسلسلات الأجنبية' : 'Latest foreign series'}
          action={ar ? 'عرض الكل' : 'View all'}
          onAction={() => onNavigate('series')}
          items={displaySeries}
          keyPrefix="series"
          palette={palette}
          ar={ar}
          isFav={isFav}
          onToggle={onToggleFavorite ? toggle : undefined}
          onOpen={item => onOpenPlayer(item.channel)}
        />
        <MediaRow
          title={ar ? 'وصل حديثاً' : 'Recently added'}
          action={ar ? 'تحديث العرض' : 'Refresh'}
          actionIcon="refresh"
          onAction={() => setRotation(value => value + 1)}
          items={recentMixed}
          keyPrefix="recent"
          palette={palette}
          ar={ar}
          isFav={isFav}
          onToggle={onToggleFavorite ? toggle : undefined}
          onOpen={item => onOpenPlayer(item.channel)}
        />
      </ScrollView>
    </View>
  );
}

/* =========================================================
   BUILDING BLOCKS
   ========================================================= */

function MediaRow({
  title,
  action,
  actionIcon = 'chevron',
  onAction,
  items,
  keyPrefix,
  palette,
  ar,
  isFav,
  onToggle,
  onOpen,
}: {
  title: string;
  action: string;
  actionIcon?: AppIconName;
  onAction: () => void;
  items: RankedItem[];
  keyPrefix: string;
  palette: Palette;
  ar: boolean;
  isFav: (item: MediaItem) => boolean;
  onToggle?: (item: MediaItem) => void;
  onOpen: (item: MediaItem) => void;
}) {
  if (!items.length) return null;

  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <View style={[styles.sectionTitleWrap, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <View style={styles.sectionAccent} />
          <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
        </View>
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
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { flexDirection: ar ? 'row-reverse' : 'row' }]}
      >
        {items.map(item => (
          <PosterCard
            key={`${keyPrefix}:${item.type}:${item.channel.id}`}
            item={item}
            favorite={isFav(item)}
            onPress={() => onOpen(item)}
            onToggleFavorite={onToggle ? () => onToggle(item) : undefined}
            palette={palette}
            ar={ar}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PosterCard({
  item,
  favorite,
  onPress,
  onToggleFavorite,
  palette,
  ar,
}: {
  item: RankedItem;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  palette: Palette;
  ar: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const poster = tmdbImageUrl(item.meta?.posterPath, 'w342') || item.channel.logo || '';
  const rating = Number(item.meta?.voteAverage || 0);
  const year = item.meta?.releaseDate ? item.meta.releaseDate.slice(0, 4) : '';

  return (
    <View style={styles.posterWrap}>
      <Pressable
        focusable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={onPress}
        style={({ focused, pressed }) => [
          styles.poster,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
          focused && focusStyle(palette),
          pressed && styles.pressed,
        ]}
      >
        {poster && !failed ? (
          <Image source={{ uri: poster }} style={styles.posterImage} onError={() => setFailed(true)} />
        ) : (
          <View style={styles.posterFallback}>
            <AppIcon name={item.type === 'movie' ? 'movies' : 'series'} size={28} color={palette.muted} />
            <Text numberOfLines={3} style={[styles.posterFallbackText, { color: palette.secondary }]}>
              {item.title}
            </Text>
          </View>
        )}
        <View style={[styles.fill, { experimental_backgroundImage: SHASHTNA_THEME.gradients.posterBottom }]} />
        {rating ? (
          <View style={[styles.posterRating, ar ? styles.posterRatingRtl : styles.posterRatingLtr]}>
            <AppIcon name="star" size={11} color={SHASHTNA_THEME.colors.rating} />
            <Text style={styles.posterRatingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </Pressable>

      {onToggleFavorite ? (
        <Pressable
          focusable
          onPress={onToggleFavorite}
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

      <Text numberOfLines={1} style={[styles.posterTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={[styles.posterMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
        {[item.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : ar ? 'مسلسل' : 'Series', year].filter(Boolean).join(' • ')}
      </Text>
    </View>
  );
}

function QuickCard({
  icon,
  accent,
  title,
  sub,
  onPress,
  palette,
  ar,
}: {
  icon: AppIconName;
  accent: string;
  title: string;
  sub: string;
  onPress: () => void;
  palette: Palette;
  ar: boolean;
}) {
  return (
    <Pressable
      focusable
      onPress={onPress}
      style={({ focused, pressed }) => [
        styles.quickCard,
        { flexDirection: ar ? 'row-reverse' : 'row', backgroundColor: palette.surface, borderColor: palette.border },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.quickIcon, { experimental_backgroundImage: accent }]}>
        <AppIcon name={icon} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.quickText}>
        <Text numberOfLines={1} style={[styles.quickTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.quickSub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const L = SHASHTNA_THEME.layout;
const T = SHASHTNA_THEME.typography;

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: L.contentX, paddingTop: 24, paddingBottom: 48 },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  flipX: { transform: [{ scaleX: -1 }] },

  hero: { height: L.heroH, borderRadius: 26, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  heroImage: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroPlaceholder: { experimental_backgroundImage: 'linear-gradient(120deg, #0C1B36 0%, #1560DB 60%, #5CC4FF 100%)', opacity: 0.35 },
  heroCopy: { position: 'absolute', top: 0, bottom: 0, width: '62%', paddingHorizontal: 36, justifyContent: 'center' },
  heroCopyLtr: { left: 0, alignItems: 'flex-start' },
  heroCopyRtl: { right: 0, alignItems: 'flex-end' },
  heroBadgeRow: { alignItems: 'center', gap: 10, marginBottom: 10 },
  heroBadge: { height: 24, paddingHorizontal: 10, borderRadius: 7, justifyContent: 'center', experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  heroBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  heroKind: { fontSize: T.size.metadata, fontWeight: '800' },
  heroTitle: { fontSize: T.size.hero, lineHeight: T.lineHeight.hero, fontWeight: '900', fontFamily: SHASHTNA_FONT.display },
  heroMetaRow: { alignItems: 'center', gap: 8, marginTop: 12 },
  metaPill: { height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  metaPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  heroDesc: { fontSize: T.size.body, lineHeight: T.lineHeight.body, marginTop: 12, fontFamily: SHASHTNA_FONT.sans },
  actions: { gap: 12, marginTop: 20, alignItems: 'center' },
  primaryButton: { height: 50, paddingHorizontal: 24, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 2, borderColor: 'transparent', experimental_backgroundImage: SHASHTNA_THEME.gradients.brand, boxShadow: SHASHTNA_THEME.shadows.brand },
  primaryButtonText: { color: '#FFFFFF', fontSize: T.size.button, fontWeight: '900' },
  secondaryButton: { height: 50, paddingHorizontal: 22, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButtonText: { fontSize: T.size.button, fontWeight: '800' },
  heroDots: { position: 'absolute', bottom: 18, gap: 6, alignItems: 'center' },
  heroDotsLtr: { right: 24 },
  heroDotsRtl: { left: 24 },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  heroDotActive: { width: 22, backgroundColor: '#FFFFFF' },

  quickRow: { marginTop: 22, gap: 14 },
  quickCard: { flex: 1, height: 78, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', gap: 12 },
  quickIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  quickText: { flex: 1, minWidth: 0 },
  quickTitle: { fontSize: T.size.button, fontWeight: '900' },
  quickSub: { fontSize: T.size.caption, marginTop: 3, fontWeight: '700' },

  section: { marginTop: SHASHTNA_THEME.spacing.section },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitleWrap: { alignItems: 'center', gap: 10 },
  sectionAccent: { width: 4, height: 20, borderRadius: 2, experimental_backgroundImage: SHASHTNA_THEME.gradients.brand },
  sectionTitle: { fontSize: T.size.section, lineHeight: T.lineHeight.section, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  viewAll: { height: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  viewAllText: { fontSize: T.size.secondary, fontWeight: '800' },

  row: { gap: L.rowGap, paddingHorizontal: 6, paddingTop: 12, paddingBottom: 10 },
  posterWrap: { width: L.compactW, position: 'relative' },
  poster: { width: L.compactW, height: L.compactH, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  posterImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 10, experimental_backgroundImage: 'linear-gradient(160deg, #13203A 0%, #0A101C 100%)' },
  posterFallbackText: { fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
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

  pressed: { opacity: 0.84 },
});
