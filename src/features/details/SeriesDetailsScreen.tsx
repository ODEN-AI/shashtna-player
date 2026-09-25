import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  findNodeHandle,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from 'react-native';
import { Text } from '../../components/common/Typography';

import AppIcon from '../../components/common/AppIcon';
import HScroll from '../../components/layout/HScroll';
import { useAppPreferences } from '../../design/AppPreferencesContext';
import { DeviceClass, useDeviceClass } from '../../design/device';
import { focusStyle, Palette, usePalette } from '../../design/palette';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { M3UChannel } from '../../lib/m3u';
import { getSeriesDetails, XtreamSeriesDetails } from '../../lib/xtreamVod';
import { getTmdbMetadata, tmdbImageUrl, TmdbMediaMetadata } from '../../lib/tmdb';
import { getLatestEpisodeFor, getProgress, useContinueWatching } from '../continueWatching/continueWatchingStore';
import { ActionButton, BackButton, DetailBackground, DetailHero, heroMetrics, InfoCard, MetaChip, SectionTitle } from './DetailParts';

export type SeriesDetailsProps = {
  channel: M3UChannel;
  onBack: () => void;
  onPlayEpisode: (episode: M3UChannel) => void;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
};

/**
 * Series detail page: cinematic hero, season selector, virtualised episode
 * rail and story/facts. Data comes from the Xtream series endpoint (unchanged)
 * with TMDB only as an artwork/overview fallback.
 */
export default function SeriesDetailsScreen({ channel, onBack, onPlayEpisode, isFavorite, onToggleFavorite }: SeriesDetailsProps) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const device = useDeviceClass();
  const gutter = heroMetrics(device).gutter;

  const [details, setDetails] = useState<XtreamSeriesDetails | null>(null);
  const [metadata, setMetadata] = useState<TmdbMediaMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(1);

  useContinueWatching();
  const latest = getLatestEpisodeFor(channel);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, tmdb] = await Promise.all([
        getSeriesDetails(channel),
        getTmdbMetadata(channel, 'series').catch(() => null),
      ]);
      setDetails(result);
      setMetadata(tmdb);
      const resumeSeason = latest?.item.seasonNumber;
      setSeason(Number(resumeSeason || result.seasons[0]?.season_number || 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : '');
    } finally {
      setLoading(false);
    }
    // `latest` only seeds the initial season; reloading on every progress
    // change would reset the user's season choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const seasons = useMemo(() => {
    const fromApi = (details?.seasons || []).map((s, i) => ({
      number: Number(s.season_number || i + 1),
      count: Number(s.episode_count || 0),
    }));
    if (fromApi.length) return fromApi;
    // Some panels omit the seasons list; derive it from the episodes.
    const counts = new Map<number, number>();
    for (const ep of details?.episodes || []) {
      const n = Number(ep.seasonNumber || 1);
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    return Array.from(counts, ([number, count]) => ({ number, count })).sort((a, b) => a.number - b.number);
  }, [details]);

  const episodes = useMemo(
    () =>
      (details?.episodes || [])
        .filter(ep => Number(ep.seasonNumber || 1) === season)
        .sort((a, b) => Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0)),
    [details, season],
  );

  const info = details?.info;
  const title = info?.name || metadata?.title || channel.name;
  const backdrop = info?.backdrop_path?.[0] || tmdbImageUrl(metadata?.backdropPath, 'w780') || info?.cover_big || info?.cover || channel.logo;
  const poster = info?.cover || info?.cover_big || tmdbImageUrl(metadata?.posterPath, 'w500') || channel.logo;
  const rating = Number(info?.rating || metadata?.voteAverage || 0);
  const release = String(info?.releaseDate || info?.release_date || info?.year || metadata?.releaseDate || '');
  const year = release.slice(0, 4);
  const plot = info?.plot?.trim() || info?.description?.trim() || metadata?.overview?.trim() || '';
  const genres = String(info?.genre || '')
    .split(/[,/|]/)
    .map(g => g.trim())
    .filter(Boolean)
    .slice(0, 3);
  const firstEpisode = useMemo(() => {
    const all = [...(details?.episodes || [])];
    all.sort(
      (a, b) =>
        Number(a.seasonNumber || 1) - Number(b.seasonNumber || 1) ||
        Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0),
    );
    return all[0] || null;
  }, [details]);

  const epLabel = (ep: M3UChannel) => `S${ep.seasonNumber ?? 1} · E${ep.episodeNumber ?? 1}`;

  return (
    <View style={styles.root}>
      <DetailBackground palette={palette} />
      <BackButton onPress={onBack} palette={palette} ar={ar} label={ar ? 'رجوع' : 'Back'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DetailHero
          backdrop={backdrop}
          poster={poster}
          fallbackIcon="series"
          kicker={ar ? 'مسلسل' : 'SERIES'}
          title={title}
          palette={palette}
          ar={ar}
          device={device}
          meta={
            <>
              {year ? <MetaChip label={year} palette={palette} ltr /> : null}
              {rating > 0 ? <MetaChip label={rating.toFixed(1)} icon="star" iconColor={SHASHTNA_THEME.colors.rating} palette={palette} ltr /> : null}
              {seasons.length ? (
                <MetaChip label={ar ? `${seasons.length} مواسم` : `${seasons.length} season${seasons.length > 1 ? 's' : ''}`} icon="series" palette={palette} />
              ) : null}
              {genres.map(g => (
                <MetaChip key={g} label={g} palette={palette} />
              ))}
            </>
          }
          actions={
            <>
              {latest ? (
                <ActionButton
                  variant="primary"
                  icon="play"
                  label={ar ? `متابعة ${epLabel(latest.item)}` : `Resume ${epLabel(latest.item)}`}
                  progress={latest.duration > 0 ? latest.position / latest.duration : undefined}
                  onPress={() => onPlayEpisode(latest.item)}
                  palette={palette}
                  preferred
                />
              ) : null}
              {firstEpisode ? (
                <ActionButton
                  variant={latest ? 'secondary' : 'primary'}
                  icon="play"
                  label={ar ? `مشاهدة ${epLabel(firstEpisode)}` : `Watch ${epLabel(firstEpisode)}`}
                  onPress={() => onPlayEpisode(firstEpisode)}
                  palette={palette}
                  preferred={!latest}
                />
              ) : null}
              {onToggleFavorite ? (
                <ActionButton
                  variant="icon"
                  icon={isFavorite ? 'favorite' : 'favorites'}
                  label=""
                  accessibilityLabel={isFavorite ? (ar ? 'إزالة من قائمتي' : 'Remove from My List') : ar ? 'إضافة إلى قائمتي' : 'Add to My List'}
                  active={isFavorite}
                  onPress={onToggleFavorite}
                  palette={palette}
                  preferred={!latest && !firstEpisode}
                />
              ) : null}
            </>
          }
        />

        <View style={[styles.body, { paddingHorizontal: gutter }]}>
          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={palette.accent.light} />
              <Text style={[styles.stateText, { color: palette.muted }]}>{ar ? 'جاري تحميل المواسم والحلقات...' : 'Loading seasons and episodes...'}</Text>
            </View>
          ) : error !== null ? (
            <View style={[styles.state, styles.errorCard, { borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass }]}>
              <Text style={[styles.errorTitle, { color: palette.text }]}>{ar ? 'تعذر تحميل تفاصيل المسلسل' : 'Could not load this series'}</Text>
              <Text style={[styles.stateText, { color: palette.muted }]}>
                {ar ? 'تأكد من الاتصال ثم أعد المحاولة.' : 'Check your connection and try again.'}
              </Text>
              <ActionButton icon="refresh" label={ar ? 'إعادة المحاولة' : 'Try again'} onPress={load} palette={palette} />
            </View>
          ) : (
            <>
              {seasons.length > 1 ? (
                <View>
                  <SectionTitle title={ar ? 'المواسم' : 'Seasons'} palette={palette} ar={ar} />
                  <HScroll ar={ar} contentContainerStyle={styles.seasonRow}>
                    {seasons.map(s => (
                      <SeasonChip
                        key={s.number}
                        number={s.number}
                        count={s.count}
                        selected={s.number === season}
                        onSelect={setSeason}
                        palette={palette}
                        ar={ar}
                      />
                    ))}
                  </HScroll>
                </View>
              ) : null}

              <View>
                <SectionTitle
                  title={ar ? `حلقات الموسم ${season}` : `Season ${season} episodes`}
                  trailing={ar ? `${episodes.length} حلقة` : `${episodes.length} episodes`}
                  palette={palette}
                  ar={ar}
                />
                {episodes.length ? (
                  <EpisodeRail
                    key={`season-${season}`}
                    episodes={episodes}
                    fallbackImage={backdrop}
                    onPlay={onPlayEpisode}
                    palette={palette}
                    ar={ar}
                    device={device}
                  />
                ) : (
                  <Text style={[styles.stateText, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
                    {ar ? 'هذا الموسم ما رجع حلقات من السيرفر.' : 'The server returned no episodes for this season.'}
                  </Text>
                )}
              </View>

              <InfoCard
                ar={ar}
                palette={palette}
                stacked={device === 'phone'}
                storyTitle={ar ? 'القصة' : 'Story'}
                story={plot || (ar ? 'لا توجد قصة متوفرة من مصدر الاشتراك.' : 'No synopsis is available from this source.')}
                facts={[
                  { label: ar ? 'التصنيف' : 'Genre', value: info?.genre },
                  { label: ar ? 'تاريخ العرض' : 'First aired', value: release, ltr: true },
                  { label: ar ? 'الإخراج' : 'Director', value: info?.director },
                  { label: ar ? 'البطولة' : 'Cast', value: info?.cast },
                ]}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const SeasonChip = memo(function SeasonChip({
  number,
  count,
  selected,
  onSelect,
  palette,
  ar,
}: {
  number: number;
  count: number;
  selected: boolean;
  onSelect: (n: number) => void;
  palette: Palette;
  ar: boolean;
}) {
  return (
    <Pressable
      focusable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={() => onSelect(number)}
      style={({ focused, pressed }) => [
        styles.seasonChip,
        selected
          ? { experimental_backgroundImage: palette.accent.gradient, borderColor: 'transparent' }
          : { experimental_backgroundImage: palette.glass, borderColor: palette.glassBorder },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.seasonTitle, { color: selected ? '#FFFFFF' : palette.text }]}>
        {ar ? `الموسم ${number}` : `Season ${number}`}
      </Text>
      {count > 0 ? (
        <Text style={[styles.seasonCount, { color: selected ? 'rgba(255,255,255,0.8)' : palette.muted }]}>
          {ar ? `${count} حلقة` : `${count} ep`}
        </Text>
      ) : null}
    </Pressable>
  );
});

function railMetrics(device: DeviceClass) {
  const width = device === 'tv' ? 300 : device === 'tablet' ? 264 : 224;
  const gap = device === 'phone' ? 12 : 16;
  return { width, gap, stride: width + gap, thumbHeight: Math.round(width * 0.5625) };
}

/**
 * Horizontal, virtualised episode rail.
 *
 * Root cause of the old bug: episodes were laid out in a plain row View
 * (flexWrap: nowrap, 31.5% width each) with no horizontal scroller, so
 * anything past the third card was off-screen and unreachable by touch, and
 * TV focus moved to invisible cards. This rail:
 *  - scrolls natively (touch drag/swipe) and virtualises long seasons;
 *  - uses getItemLayout so scrollToIndex is exact for any episode;
 *  - scrolls the focused card to the centre on TV so it never leaves view;
 *  - starts from episode 1 at the reading edge in Arabic;
 *  - restores focus to the last focused episode when re-entered (TV).
 */
const EpisodeRail = memo(function EpisodeRail({
  episodes,
  fallbackImage,
  onPlay,
  palette,
  ar,
  device,
}: {
  episodes: M3UChannel[];
  fallbackImage?: string | null;
  onPlay: (episode: M3UChannel) => void;
  palette: Palette;
  ar: boolean;
  device: DeviceClass;
}) {
  const listRef = useRef<FlatList<M3UChannel>>(null);
  const positioned = useRef(false);
  const cardHandles = useRef(new Map<string, number>());
  const [destination, setDestination] = useState<number | null>(null);
  const m = railMetrics(device);

  // Arabic reads right-to-left: episode 1 must sit at the right edge.
  const data = useMemo(() => (ar ? [...episodes].reverse() : episodes), [ar, episodes]);

  const registerCard = useCallback((id: string, handle: number | null) => {
    if (handle) cardHandles.current.set(id, handle);
    else cardHandles.current.delete(id);
  }, []);

  // First entry into the rail lands on episode 1, not whichever card is
  // geometrically closest to the season chip above.
  useEffect(() => {
    const first = episodes[0];
    const timer = setTimeout(() => {
      const handle = first ? cardHandles.current.get(String(first.id)) : undefined;
      if (handle) setDestination(current => current ?? handle);
    }, 0);
    return () => clearTimeout(timer);
  }, [episodes]);

  const onFocusIndex = useCallback(
    (index: number, id: string) => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      const handle = cardHandles.current.get(id);
      if (handle) setDestination(handle);
    },
    [],
  );

  return (
    <TVFocusGuideView
      destinations={destination ? [destination] : undefined}
      style={styles.railGuide}
    >
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={ep => String(ep.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        getItemLayout={(_d, index) => ({ length: m.stride, offset: m.stride * index + RAIL_PAD, index })}
        initialNumToRender={Math.min(data.length, 8)}
        maxToRenderPerBatch={8}
        windowSize={9}
        // Clipped subviews cannot receive focus on Android TV.
        removeClippedSubviews={false}
        onContentSizeChange={() => {
          if (ar && !positioned.current) {
            positioned.current = true;
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) =>
          listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: true })
        }
        renderItem={({ item, index }) => (
          <View style={{ width: m.stride, paddingHorizontal: m.gap / 2 }}>
            <EpisodeCard
              episode={item}
              fallbackImage={fallbackImage}
              width={m.width}
              thumbHeight={m.thumbHeight}
              onPlay={onPlay}
              onFocus={() => onFocusIndex(index, String(item.id))}
              registerCard={registerCard}
              palette={palette}
              ar={ar}
            />
          </View>
        )}
      />
    </TVFocusGuideView>
  );
});

const RAIL_PAD = 4;

const EpisodeCard = memo(function EpisodeCard({
  episode,
  fallbackImage,
  width,
  thumbHeight,
  onPlay,
  onFocus,
  registerCard,
  palette,
  ar,
}: {
  episode: M3UChannel;
  fallbackImage?: string | null;
  width: number;
  thumbHeight: number;
  onPlay: (episode: M3UChannel) => void;
  onFocus: () => void;
  registerCard: (id: string, handle: number | null) => void;
  palette: Palette;
  ar: boolean;
}) {
  const ref = useRef<View>(null);
  const [failed, setFailed] = useState(false);
  const progress = getProgress(episode);
  const image = !failed ? episode.logo || fallbackImage : fallbackImage;
  const number = Number(episode.episodeNumber || 1);

  useEffect(() => {
    const id = String(episode.id);
    registerCard(id, findNodeHandle(ref.current));
    return () => registerCard(id, null);
  }, [episode.id, registerCard]);

  return (
    <Pressable
      ref={ref}
      focusable
      accessibilityRole="button"
      accessibilityLabel={ar ? `الحلقة ${number}` : `Episode ${number}`}
      onPress={() => onPlay(episode)}
      onFocus={onFocus}
      style={({ focused, pressed }) => [
        styles.episode,
        { width, borderColor: palette.glassBorder, experimental_backgroundImage: palette.glass },
        focused && focusStyle(palette, SHASHTNA_THEME.focus.buttonScale),
        pressed && styles.pressed,
      ]}
    >
      {({ focused }) => (
        <>
          <View style={[styles.thumb, { height: thumbHeight }]}>
            {image ? (
              <Image source={{ uri: image }} style={styles.fill} resizeMode="cover" onError={() => setFailed(true)} />
            ) : (
              <View style={[styles.fill, styles.thumbFallback]}>
                <AppIcon name="series" size={30} color={palette.muted} />
              </View>
            )}
            <View style={[StyleSheet.absoluteFill, styles.thumbFade]} />
            <View style={[styles.epBadge, ar ? styles.epBadgeRtl : styles.epBadgeLtr]}>
              <Text style={styles.epBadgeText}>{number}</Text>
            </View>
            <View
              style={[
                styles.playBubble,
                { experimental_backgroundImage: palette.accent.gradient, opacity: focused ? 1 : 0.85 },
              ]}
            >
              <AppIcon name="play" size={16} color="#FFFFFF" />
            </View>
            {progress ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress.ratio * 100}%`, backgroundColor: palette.accent.bright }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.epText}>
            <Text numberOfLines={2} style={[styles.epTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>
              {episode.name}
            </Text>
            <Text style={[styles.epMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
              {ar ? `الحلقة ${number}` : `Episode ${number}`}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.background },
  scroll: { paddingBottom: 56 },
  body: { marginTop: 8, gap: 30 },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: SHASHTNA_THEME.opacity.pressed },

  state: { paddingVertical: 36, alignItems: 'center', gap: 12 },
  stateText: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  errorCard: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 24 },
  errorTitle: { fontSize: 20, fontWeight: '900' },

  seasonRow: { gap: 10, paddingVertical: 6, paddingHorizontal: 4 },
  seasonChip: { minWidth: 132, height: 60, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center' },
  seasonTitle: { fontSize: 16, fontWeight: '900', fontFamily: SHASHTNA_FONT.sans },
  seasonCount: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  railGuide: { marginHorizontal: -RAIL_PAD },
  railContent: { paddingHorizontal: RAIL_PAD, paddingVertical: 10 },
  episode: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  thumb: { width: '100%', position: 'relative', backgroundColor: 'rgba(8,14,32,0.6)' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbFade: { experimental_backgroundImage: 'linear-gradient(0deg, rgba(2,4,9,0.75) 0%, rgba(2,4,9,0) 55%)' },
  epBadge: { position: 'absolute', top: 10, minWidth: 34, height: 28, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,4,9,0.78)' },
  epBadgeLtr: { left: 10 },
  epBadgeRtl: { right: 10 },
  epBadgeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  playBubble: { position: 'absolute', bottom: 12, right: 12, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressFill: { height: '100%' },
  epText: { paddingHorizontal: 14, paddingVertical: 12, gap: 4, minHeight: 78 },
  epTitle: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  epMeta: { fontSize: 12, fontWeight: '700' },
});
