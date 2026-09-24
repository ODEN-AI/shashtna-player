import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppPreferences } from '../../design/AppPreferencesContext';
import { useDeviceClass } from '../../design/device';
import { usePalette } from '../../design/palette';
import { SHASHTNA_THEME } from '../../design/theme';
import { getXtreamMovieInfo, M3UChannel, XtreamMovieInfo } from '../../lib/m3u';
import { getTmdbMetadata, tmdbImageUrl, TmdbMediaMetadata } from '../../lib/tmdb';
import { getProgress, useContinueWatching } from '../continueWatching/continueWatchingStore';
import { formatClock } from '../player/progressStore';
import { ActionButton, BackButton, DetailBackground, DetailHero, formatDuration, heroMetrics, InfoCard, MetaChip } from './DetailParts';

type Props = {
  channel: M3UChannel;
  onBack: () => void;
  /** fromStart=true ignores the saved position. */
  onWatch: (options: { fromStart: boolean }) => void;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
};

/**
 * Movie detail page. Data comes from the Xtream VOD info endpoint with TMDB as
 * fallback (same sources as before); only the presentation is new.
 */
export default function MovieDetailsScreen({ channel, onBack, onWatch, isFavorite, onToggleFavorite }: Props) {
  const { language } = useAppPreferences();
  const ar = language === 'ar';
  const palette = usePalette();
  const device = useDeviceClass();
  const gutter = heroMetrics(device).gutter;

  const [info, setInfo] = useState<XtreamMovieInfo | null>(null);
  const [metadata, setMetadata] = useState<TmdbMediaMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-render when saved progress changes (e.g. returning from the player).
  useContinueWatching();
  const progress = getProgress(channel);

  const load = useCallback(async () => {
    setLoading(true);
    const [xtreamInfo, tmdbInfo] = await Promise.all([
      getXtreamMovieInfo(channel).catch(() => null),
      getTmdbMetadata(channel, 'movie').catch(() => null),
    ]);
    setInfo(xtreamInfo);
    setMetadata(tmdbInfo);
    setLoading(false);
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

  const title = metadata?.title || channel.name;
  const poster = info?.movie_image || info?.cover_big || info?.cover || tmdbImageUrl(metadata?.posterPath, 'w500') || channel.logo;
  const backdrop =
    (Array.isArray(info?.backdrop_path) ? info?.backdrop_path[0] : info?.backdrop_path) ||
    tmdbImageUrl(metadata?.backdropPath, 'w780') ||
    info?.cover_big ||
    poster;
  const plot = info?.plot?.trim() || info?.description?.trim() || metadata?.overview?.trim() || '';
  const rating = Number(info?.rating || metadata?.voteAverage || 0);
  const releaseDate = info?.releasedate || info?.releaseDate || metadata?.releaseDate || '';
  const year = releaseDate ? String(releaseDate).slice(0, 4) : '';
  const durationSecs = Number(info?.duration_secs || 0);
  const duration = durationSecs ? formatDuration(durationSecs, ar) : String(info?.duration || '');
  const genres = String(info?.genre || '')
    .split(/[,/|]/)
    .map(g => g.trim())
    .filter(Boolean)
    .slice(0, 3);
  const quality = (channel.name.match(/\b(4K|UHD|2160p|1080p|FHD|720p|HD)\b/i) || [])[0]?.toUpperCase();
  const canResume = Boolean(progress && progress.position > 0);

  return (
    <View style={styles.root}>
      <DetailBackground palette={palette} />
      <BackButton onPress={onBack} palette={palette} ar={ar} label={ar ? 'رجوع' : 'Back'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <DetailHero
          backdrop={backdrop}
          poster={poster}
          fallbackIcon="movies"
          kicker={ar ? 'فيلم' : 'MOVIE'}
          title={title}
          palette={palette}
          ar={ar}
          device={device}
          meta={
            <>
              {year ? <MetaChip label={year} palette={palette} ltr /> : null}
              {rating > 0 ? <MetaChip label={rating.toFixed(1)} icon="star" iconColor={SHASHTNA_THEME.colors.rating} palette={palette} ltr /> : null}
              {duration ? <MetaChip label={duration} icon="clock" palette={palette} /> : null}
              {quality ? <MetaChip label={quality} palette={palette} ltr /> : null}
              {genres.map(g => (
                <MetaChip key={g} label={g} palette={palette} />
              ))}
            </>
          }
          actions={
            <>
              {canResume && progress ? (
                <ActionButton
                  variant="primary"
                  icon="play"
                  label={ar ? `متابعة من ${formatClock(progress.position)}` : `Resume ${formatClock(progress.position)}`}
                  progress={progress.ratio}
                  onPress={() => onWatch({ fromStart: false })}
                  palette={palette}
                  preferred
                />
              ) : null}
              <ActionButton
                variant={canResume ? 'secondary' : 'primary'}
                icon={canResume ? 'refresh' : 'play'}
                label={canResume ? (ar ? 'من البداية' : 'From start') : ar ? 'مشاهدة الآن' : 'Watch now'}
                onPress={() => onWatch({ fromStart: canResume })}
                palette={palette}
                preferred={!canResume}
              />
              {onToggleFavorite ? (
                <ActionButton
                  variant="icon"
                  icon={isFavorite ? 'favorite' : 'favorites'}
                  label=""
                  accessibilityLabel={isFavorite ? (ar ? 'إزالة من قائمتي' : 'Remove from My List') : ar ? 'إضافة إلى قائمتي' : 'Add to My List'}
                  active={isFavorite}
                  onPress={onToggleFavorite}
                  palette={palette}
                />
              ) : null}
            </>
          }
        />

        <View style={[styles.body, { paddingHorizontal: gutter }]}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.accent.light} />
              <Text style={[styles.loadingText, { color: palette.muted }]}>{ar ? 'جاري تحميل التفاصيل...' : 'Loading details...'}</Text>
            </View>
          ) : (
            <InfoCard
              ar={ar}
              palette={palette}
              stacked={device === 'phone'}
              storyTitle={ar ? 'القصة' : 'Story'}
              story={plot || (ar ? 'لا توجد قصة متوفرة من مصدر الاشتراك.' : 'No synopsis is available from this source.')}
              facts={[
                { label: ar ? 'التصنيف' : 'Genre', value: info?.genre },
                { label: ar ? 'تاريخ الإصدار' : 'Release date', value: releaseDate ? String(releaseDate) : '', ltr: true },
                { label: ar ? 'المدة' : 'Runtime', value: duration },
                { label: ar ? 'الإخراج' : 'Director', value: info?.director },
                { label: ar ? 'البطولة' : 'Cast', value: info?.cast },
              ]}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.background },
  scroll: { paddingBottom: 56 },
  body: { marginTop: 8, gap: 28 },
  loading: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 15, fontWeight: '700' },
});
