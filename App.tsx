import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import PlayerScreen from './src/screens/Player/PlayerScreen';
import LiveScreen from './src/screens/Live/LiveScreen';
import HomeScreen from './src/screens/Home/HomeScreen';
import MoviesScreen from './src/screens/Movies/MoviesScreen';
import SeriesScreen from './src/screens/Series/SeriesScreen';
import ConnectionScreen from './src/screens/Connection/ConnectionScreen';
import SettingsScreen, { PreferredQuality } from './src/screens/Settings/SettingsScreen';
import { SHASHTNA_FONT, SHASHTNA_THEME } from './src/design/theme';
import AppIcon, { AppIconName } from './src/components/common/AppIcon';
import { AppPreferencesProvider, useAppPreferences } from './src/design/AppPreferencesContext';
import { focusStyle, usePalette } from './src/design/palette';
import AppShell from './src/app/AppShell';
import { ContinueWatchingEntry } from './src/features/continueWatching/continueWatchingStore';
import { Advertisement } from './src/features/ads/types';
import Sidebar from './src/navigation/Sidebar';

import {
  M3UChannel,
  M3UContentType,
  buildXtreamM3UUrl,
  downloadAndParseM3U,
  getSeriesFirstEpisode,
} from './src/lib/m3u';

import {
  getTmdbMetadata,
  tmdbImageUrl,
  TmdbMediaMetadata,
} from './src/lib/tmdb';

import {
  clearConnectionSource,
  loadConnectionSource,
  saveConnectionSource,
} from './src/lib/connectionSession';

type ConnectionMode =
  | 'm3u'
  | 'xtream';

type ContentType =
  M3UContentType;

type AppLanguage = 'ar' | 'en';
type ThemeMode = 'dark' | 'light';
type NavItem = { id: string; label: string; icon: AppIconName };

function getNavItems(language: AppLanguage): NavItem[] {
  const ar = language === 'ar';
  return [
    { id: 'home', label: ar ? 'الرئيسية' : 'Home', icon: 'home' },
    { id: 'live', label: ar ? 'البث المباشر' : 'Live TV', icon: 'live' },
    { id: 'movies', label: ar ? 'الأفلام' : 'Movies', icon: 'movies' },
    { id: 'series', label: ar ? 'المسلسلات' : 'Series', icon: 'series' },
    { id: 'favorites', label: ar ? 'المفضلة' : 'Favorites', icon: 'favorites' },
    { id: 'settings', label: ar ? 'الإعدادات' : 'Settings', icon: 'settings' },
  ];
}

/*
 * مهم جداً:
 *
 * App لا يخمّن نوع Xtream من اسم المجموعة.
 *
 * m3u.ts هو المسؤول عن إعطاء:
 * live / movie / series
 *
 * وبالنسبة لمصدر Xtream:
 *
 * get_live_streams -> live
 * get_vod_streams  -> movie
 * get_series       -> series
 */
function getDetectedContentType(
  channel: M3UChannel,
): ContentType {
  return channel.contentType;
}

function cleanDisplayTitle(
  value: string,
  type: 'movie' | 'series',
): string {
  let result =
    String(value || '');

  result = result
    .replace(
      /\[[^\]]*\]/g,
      ' ',
    )
    .replace(
      /\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi,
      ' ',
    );

  if (
    type === 'series'
  ) {
    result = result
      .replace(
        /\bS\d{1,2}\s*E\d{1,3}\b/gi,
        ' ',
      )
      .replace(
        /\bS\d{1,2}\b/gi,
        ' ',
      )
      .replace(
        /\bE\d{1,3}\b/gi,
        ' ',
      )
      .replace(
        /\b(?:episode|ep|الحلقة|حلقة)\s*\d+\b/gi,
        ' ',
      )
      .replace(
        /\b(?:season|موسم)\s*\d+\b/gi,
        ' ',
      )
      .replace(
        /(^|[\s._-])\d{1,2}x\d{1,3}(\b|[\s._-])/gi,
        ' ',
      );
  }

  return result
    .replace(
      /\s*[-|•]\s*/g,
      ' ',
    )
    .replace(
      /[_]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

type MediaDisplayItem = {
  channel: M3UChannel;
  title: string;
  group: string;
  episodeCount: number;
};

function buildMediaDisplayItems(
  channels: M3UChannel[],
  type: 'movie' | 'series',
): MediaDisplayItem[] {
  const map =
    new Map<
      string,
      MediaDisplayItem
    >();

  for (
    const channel of channels
  ) {
    /*
     * هذا هو الفلتر الأساسي.
     *
     * Live لا يدخل هنا إطلاقاً.
     * Movie فقط للأفلام.
     * Series فقط للمسلسلات.
     */
    if (
      getDetectedContentType(
        channel,
      ) !== type
    ) {
      continue;
    }

    const title =
      cleanDisplayTitle(
        channel.name,
        type,
      );

    /*
     * المسلسلات:
     * نجمع الحلقات تحت مسلسل واحد
     *
     * الأفلام:
     * Xtream يعطي الفيلم كعنصر مستقل،
     * لذلك كل فيلم يبقى بطاقة مستقلة.
     */
    const key =
      type === 'series'
        ? (
            title ||
            channel.name
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              ' ',
            )
            .trim()
        : channel.id;

    const mapKey =
      key ||
      channel.id;

    const existing =
      map.get(
        mapKey,
      );

    if (existing) {
      existing.episodeCount +=
        1;

      if (
        !existing.channel.logo &&
        channel.logo
      ) {
        existing.channel =
          channel;
      }

      continue;
    }

    map.set(
      mapKey,
      {
        channel,
        title:
          title ||
          channel.name,
        group:
          channel.group ||
          '',
        episodeCount: 1,
      },
    );
  }

  return Array.from(
    map.values(),
  );
}

function Home({
  channels,
  channelCount,
  movieCount,
  seriesCount,
  onNavigate,
  onOpenPlayer,
  favoriteIds,
  onToggleFavorite,
  onResume,
  onOpenLiveGroup,
  onAdAction,
}: {
  channels: M3UChannel[];
  channelCount: number;
  movieCount: number;
  seriesCount: number;
  onNavigate: (
    page:
      | 'home'
      | 'live'
      | 'movies'
      | 'series'
      | 'favorites'
      | 'search'
      | 'settings',
  ) => void;
  onOpenPlayer: (
    channel: M3UChannel,
  ) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (channel: M3UChannel) => void;
  onResume: (entry: ContinueWatchingEntry) => void;
  onOpenLiveGroup: (group: string) => void;
  onAdAction: (ad: Advertisement) => void;
}) {
  return (
    <HomeScreen
      onResume={onResume}
      onOpenLiveGroup={onOpenLiveGroup}
      onAdAction={onAdAction}
      channels={
        channels
      }
      channelCount={
        channelCount
      }
      movieCount={
        movieCount
      }
      seriesCount={
        seriesCount
      }
      onNavigate={
        onNavigate
      }
      onOpenPlayer={
        onOpenPlayer
      }
      favoriteIds={favoriteIds}
      onToggleFavorite={onToggleFavorite}
    />
  );
}

function LiveTV({
  channels,
  onOpenPlayer,
  onBackHome,
  initialGroup,
}: {
  channels: M3UChannel[];
  onOpenPlayer: (
    channel: M3UChannel,
    queue: M3UChannel[],
  ) => void;
  onBackHome: () => void;
  initialGroup: string | null;
}) {
  /*
   * Live page يستقبل فقط:
   * contentType === live
   */
  const liveChannels =
    useMemo(
      () =>
        channels.filter(
          channel =>
            channel.contentType ===
            'live',
        ),
      [channels],
    );

  return (
    <LiveScreen
      channels={
        liveChannels
      }
      onOpenPlayer={
        onOpenPlayer
      }
      onBackHome={
        onBackHome
      }
      initialGroup={initialGroup}
    />
  );
}

type PlayerLaunchOptions = {
  /** Live list the channel was picked from (enables in-player zapping). */
  liveQueue?: M3UChannel[];
  /** Series episode to open directly (Continue Watching). */
  startEpisode?: M3UChannel | null;
  /** Start a movie without its details page (Continue Watching). */
  autoStart?: boolean;
};

function Player({
  channel,
  onBack,
  preferredQuality,
  autoplay,
  subtitles,
  options,
}: {
  channel: M3UChannel;
  onBack: () => void;
  preferredQuality: PreferredQuality;
  autoplay: boolean;
  subtitles: boolean;
  options: PlayerLaunchOptions;
}) {
  return (
    <PlayerScreen
      channel={channel}
      onBack={onBack}
      preferredQuality={preferredQuality}
      autoplay={autoplay}
      subtitles={subtitles}
      liveQueue={options.liveQueue}
      startEpisode={options.startEpisode}
      autoStart={options.autoStart}
    />
  );
}


function FavoritesPage({
  channels,
  favoriteIds,
  onOpenPlayer,
  onToggleFavorite,
}: {
  channels: M3UChannel[];
  favoriteIds: Set<string>;
  onOpenPlayer: (channel: M3UChannel) => void;
  onToggleFavorite: (channel: M3UChannel) => void;
}) {
  const { language } = useAppPreferences();
  const palette = usePalette();
  const ar = language === 'ar';
  const rowDirection = ar ? 'row-reverse' : 'row';
  const movieItems = useMemo(() => buildMediaDisplayItems(channels, 'movie'), [channels]);
  const seriesItems = useMemo(() => buildMediaDisplayItems(channels, 'series'), [channels]);

  const items = useMemo(
    () => [
      ...movieItems.map(item => ({ ...item, type: 'movie' as const })),
      ...seriesItems.map(item => ({ ...item, type: 'series' as const })),
    ].filter(item => favoriteIds.has(`${item.type}:${String(item.channel.id)}`)),
    [movieItems, seriesItems, favoriteIds],
  );

  return (
    <View style={[fav.page, { backgroundColor: palette.background }]}>
      <View style={[fav.header, { flexDirection: rowDirection }]}>
        <View style={fav.headerText}>
          <Text style={[fav.eyebrow, { color: palette.primaryText, textAlign: ar ? 'right' : 'left' }]}>MY LIST</Text>
          <Text style={[fav.title, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{ar ? 'المفضلة' : 'Favorites'}</Text>
          <Text style={[fav.sub, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>
            {items.length
              ? `${items.length} ${ar ? 'عنصر محفوظ في قائمتك' : items.length === 1 ? 'item saved to your list' : 'items saved to your list'}`
              : ar ? 'احفظ الأفلام والمسلسلات التي تريد الرجوع لها بسرعة.' : 'Save movies and series you want to find quickly.'}
          </Text>
        </View>
        <View style={[fav.countPill, { flexDirection: rowDirection }]}>
          <AppIcon name="favorite" size={15} color="#FFFFFF" />
          <Text style={fav.countText}>{items.length}</Text>
        </View>
      </View>

      {items.length ? (
        <FlatList
          data={items}
          keyExtractor={item => `favorite:${item.type}:${item.channel.id}`}
          numColumns={SHASHTNA_THEME.layout.gridColumns}
          columnWrapperStyle={[fav.gridRow, { flexDirection: rowDirection }]}
          contentContainerStyle={fav.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const poster = item.channel.logo || '';
            const typeLabel = item.type === 'movie' ? (ar ? 'فيلم' : 'Movie') : ar ? 'مسلسل' : 'Series';
            return (
              <View style={fav.card}>
                <Pressable
                  focusable
                  accessibilityLabel={item.title}
                  onPress={() => onOpenPlayer(item.channel)}
                  style={({ focused, pressed }) => [
                    fav.poster,
                    { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
                    focused && focusStyle(palette),
                    pressed && fav.pressed,
                  ]}
                >
                  {poster ? (
                    <Image source={{ uri: poster }} style={fav.posterImage} resizeMode="cover" />
                  ) : (
                    <View style={fav.posterFallback}>
                      <AppIcon name={item.type === 'movie' ? 'movies' : 'series'} size={28} color={palette.muted} />
                    </View>
                  )}
                </Pressable>
                <Pressable
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={ar ? 'إزالة من قائمتي' : 'Remove from My List'}
                  onPress={() => onToggleFavorite(item.channel)}
                  style={({ focused, pressed }) => [
                    fav.remove,
                    ar ? fav.removeRtl : fav.removeLtr,
                    focused && focusStyle(palette, SHASHTNA_THEME.focus.iconScale),
                    pressed && fav.pressed,
                  ]}
                >
                  <AppIcon name="favorite" size={14} color="#FFFFFF" />
                </Pressable>
                <Text numberOfLines={1} style={[fav.cardTitle, { color: palette.text, textAlign: ar ? 'right' : 'left' }]}>{item.title}</Text>
                <Text numberOfLines={1} style={[fav.cardMeta, { color: palette.muted, textAlign: ar ? 'right' : 'left' }]}>{typeLabel}</Text>
              </View>
            );
          }}
        />
      ) : (
        <View style={fav.empty}>
          <View style={fav.emptyIcon}>
            <AppIcon name="favorites" size={30} color="#FFFFFF" />
          </View>
          <Text style={[fav.emptyTitle, { color: palette.text }]}>{ar ? 'قائمتك فارغة حالياً' : 'Your list is empty'}</Text>
          <Text style={[fav.emptyText, { color: palette.muted }]}>
            {ar ? 'اضغط رمز القلب على أي فيلم أو مسلسل حتى يظهر هنا.' : 'Press the heart on any movie or series card to add it here.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const fav = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: SHASHTNA_THEME.layout.contentX, paddingTop: 26 },
  header: { alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, gap: 20 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4 },
  title: { fontSize: SHASHTNA_THEME.typography.size.pageTitle, lineHeight: SHASHTNA_THEME.typography.lineHeight.pageTitle, fontWeight: '900', fontFamily: SHASHTNA_FONT.display, marginTop: 4 },
  sub: { fontSize: 15, marginTop: 2, fontWeight: '700' },
  countPill: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', gap: 8, experimental_backgroundImage: 'linear-gradient(120deg, #FF4D7A 0%, #FF8A5B 100%)' },
  countText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  grid: { paddingBottom: 40, paddingTop: 6, paddingHorizontal: 4 },
  gridRow: { gap: 16, marginBottom: 22 },
  card: { width: 128, position: 'relative' },
  poster: { width: 128, height: 192, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  posterImage: { width: '100%', height: '100%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF4D7A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  removeLtr: { right: 8 },
  removeRtl: { left: 8 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 10, paddingHorizontal: 2 },
  cardMeta: { fontSize: 12, marginTop: 2, fontWeight: '700', paddingHorizontal: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: 'linear-gradient(120deg, #FF4D7A 0%, #FF8A5B 100%)' },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 18 },
  emptyText: { fontSize: 15, marginTop: 6, textAlign: 'center', maxWidth: 460, lineHeight: 24 },
  pressed: { opacity: 0.84 },
});

function App() {
  const [
    channels,
    setChannels,
  ] = useState<
    M3UChannel[]
  >([]);

  const [
    source,
    setSource,
  ] = useState('');

  const [
    activeNav,
    setActiveNav,
  ] = useState(
    'home',
  );

  const [
    selectedChannel,
    setSelectedChannel,
  ] =
    useState<M3UChannel | null>(
      null,
    );

  const [
    preferredQuality,
    setPreferredQuality,
  ] = useState<PreferredQuality>(
    'auto',
  );

  const [
    autoplay,
    setAutoplay,
  ] = useState(true);

  const [
    subtitles,
    setSubtitles,
  ] = useState(false);

  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [restoringConnection, setRestoringConnection] = useState(true);
  const [playerOptions, setPlayerOptions] = useState<PlayerLaunchOptions>({});
  const [liveInitialGroup, setLiveInitialGroup] = useState<string | null>(null);
  const navItems = useMemo(() => getNavItems(language), [language]);

  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageTranslate = useRef(new Animated.Value(0)).current;
  const pageScale = useRef(new Animated.Value(1)).current;
  const firstPageRender = useRef(true);

  useEffect(() => {
    if (activeNav !== 'live') {
      setLiveInitialGroup(null);
    }
  }, [activeNav]);

  useEffect(() => {
    if (firstPageRender.current) {
      firstPageRender.current = false;
      return;
    }

    pageOpacity.stopAnimation();
    pageTranslate.stopAnimation();
    pageOpacity.setValue(0);
    pageTranslate.setValue(6);
    pageScale.setValue(0.992);

    Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslate, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pageScale, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeNav, pageOpacity, pageScale, pageTranslate]);

  /*
   * Live:
   * فقط channel.contentType === live
   */
  const liveCount =
    useMemo(
      () =>
        channels.filter(
          channel =>
            channel.contentType ===
            'live',
        ).length,
      [channels],
    );

  /*
   * Movies:
   * فقط get_vod_streams في Xtream
   */
  const movieCount =
    useMemo(
      () =>
        buildMediaDisplayItems(
          channels,
          'movie',
        ).length,
      [channels],
    );

  /*
   * Series:
   * فقط get_series في Xtream
   */
  const seriesCount =
    useMemo(
      () =>
        buildMediaDisplayItems(
          channels,
          'series',
        ).length,
      [channels],
    );

  useEffect(() => {
    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (
            selectedChannel
          ) {
            setSelectedChannel(
              null,
            );

            return true;
          }

          if (
            activeNav !==
            'home'
          ) {
            setActiveNav(
              'home',
            );

            return true;
          }

          return false;
        },
      );

    return () =>
      subscription.remove();
  }, [
    activeNav,
    selectedChannel,
  ]);

  useEffect(() => {
    let alive = true;

    const restoreSavedConnection = async () => {
      try {
        const savedSource = await loadConnectionSource();

        if (!savedSource) {
          return;
        }

        console.log('[Shashtna] Restoring saved connection...');

        const restoredChannels = await downloadAndParseM3U(savedSource);

        if (!alive || restoredChannels.length === 0) {
          return;
        }

        console.log(
          '[Shashtna] Restored channels:',
          restoredChannels.length,
        );

        setChannels(restoredChannels);
        setSource(savedSource);
        setActiveNav('home');
        setSelectedChannel(null);
      } catch (error) {
        console.warn('[Shashtna] Saved connection restore failed:', error);
      } finally {
        if (alive) {
          setRestoringConnection(false);
        }
      }
    };

    restoreSavedConnection();

    return () => {
      alive = false;
    };
  }, []);

  const handleConnected =
    (
      parsedChannels: M3UChannel[],
      playlistSource: string,
    ) => {
      void saveConnectionSource(playlistSource);

      setRestoringConnection(false);

      console.log(
        '[Shashtna] Loaded channels:',
        parsedChannels.length,
      );

      /*
       * هذا هو المكان الذي تدخل فيه
       * بيانات Xtream/ M3U إلى التطبيق.
       */
      setChannels(
        parsedChannels,
      );

      setSource(
        playlistSource,
      );

      setActiveNav(
        'home',
      );

      setSelectedChannel(
        null,
      );
    };

  const handleChangeSource =
    () => {
      void clearConnectionSource();

      setRestoringConnection(false);

      setSelectedChannel(
        null,
      );

      setChannels(
        [],
      );

      setSource(
        '',
      );

      setActiveNav(
        'home',
      );
    };

  const handleBackHome =
    () => {
      setSelectedChannel(
        null,
      );

      setActiveNav(
        'home',
      );
    };

  const favoriteKey = (channel: M3UChannel) =>
    `${channel.contentType}:${String(channel.id)}`;

  const toggleFavorite = (channel: M3UChannel) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      const key = favoriteKey(channel);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /*
   * فتح عنصر:
   *
   * Movie -> Player مباشرة
   * Live  -> Player مباشرة
   * Series -> نجيب أول حلقة حالياً
   */
  const handleOpenPlayer =
    async (
      channel: M3UChannel,
      options: PlayerLaunchOptions = {},
    ) => {
      setPlayerOptions(options);

      if (
        channel.contentType ===
          'series' &&
        channel.contentKey?.startsWith(
          'xtream-series:',
        )
      ) {
        try {
          const episode =
            await getSeriesFirstEpisode(
              channel,
            );

          if (
            episode &&
            episode.url
          ) {
            setSelectedChannel(
              episode,
            );

            return;
          }

          console.warn(
            '[Shashtna] No episode found for series:',
            channel.name,
          );
        } catch (
          error
        ) {
          console.warn(
            '[Shashtna] Failed to load series:',
            error,
          );
        }

        return;
      }

      if (
        channel.url
      ) {
        setSelectedChannel(
          channel,
        );
      }
    };

  /** Continue Watching: reopen the exact movie/episode where it stopped. */
  const handleResume = (entry: ContinueWatchingEntry) => {
    if (entry.parent) {
      setPlayerOptions({ startEpisode: entry.item });
      setSelectedChannel(entry.parent);
      return;
    }

    setPlayerOptions({ autoStart: entry.item.contentType === 'movie' });
    setSelectedChannel(entry.item);
  };

  const handleAdAction = (ad: Advertisement) => {
    const action = ad.action;

    if (action.type === 'navigate') {
      setActiveNav(action.page);
    } else if (action.type === 'liveCategory') {
      openLiveGroup(action.group);
    } else if (action.type === 'external') {
      // Many TV boxes ship without a browser; the ad also shows displayUrl as text.
      Linking.openURL(action.url).catch(error =>
        console.warn('[Shashtna] Could not open advertisement link:', error),
      );
    }
  };

  const openLiveGroup = (group: string) => {
    setLiveInitialGroup(group);
    setActiveNav('live');
  };

  if (restoringConnection) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View style={[styles.container, styles.restoringConnectionScreen]}>
          <ActivityIndicator
            size="large"
            color={SHASHTNA_THEME.colors.primaryBright}
          />
          <Text style={styles.restoringConnectionTitle}>
            استعادة الاشتراك...
          </Text>
          <Text style={styles.restoringConnectionSubtitle}>
            جاري تجهيز مكتبتك تلقائياً
          </Text>
        </View>
      </AppPreferencesProvider>
    );
  }

  if (
    !source ||
    channels.length ===
      0
  ) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View
          style={
            styles.container
          }
        >
          <StatusBar
            barStyle="light-content"
            backgroundColor="#050C18"
          />

          <ConnectionScreen
            onConnected={
              handleConnected
            }
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  if (
    selectedChannel
  ) {
    return (
      <AppPreferencesProvider
        value={{
          language,
          setLanguage,
          themeMode,
          setThemeMode,
        }}
      >
        <View
          style={
            styles.container
          }
        >
          <StatusBar hidden />

          <Player
            channel={
              selectedChannel
            }
            preferredQuality={
              preferredQuality
            }
            autoplay={
              autoplay
            }
            subtitles={
              subtitles
            }
            options={playerOptions}
            onBack={() =>
              setSelectedChannel(
                null,
              )
            }
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  let page:
    | React.ReactNode;

  if (
    activeNav ===
    'live'
  ) {
    page = (
      <LiveTV
        channels={
          channels
        }
        onOpenPlayer={(channel, queue) =>
          handleOpenPlayer(channel, { liveQueue: queue })
        }
        onBackHome={
          handleBackHome
        }
        initialGroup={liveInitialGroup}
      />
    );
  } else if (
    activeNav ===
    'movies'
  ) {
    page = (
      <MoviesScreen
        channels={
          channels
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        onNavigate={
          setActiveNav
        }
        onBack={() =>
          setActiveNav('home')
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else if (
    activeNav ===
    'series'
  ) {
    page = (
      <SeriesScreen
        channels={
          channels
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        onNavigate={
          setActiveNav
        }
        onBack={() =>
          setActiveNav('home')
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else if (
    activeNav ===
    'settings'
  ) {
    page = (
      <SettingsScreen
        preferredQuality={
          preferredQuality
        }
        setPreferredQuality={
          setPreferredQuality
        }
        autoplay={
          autoplay
        }
        setAutoplay={
          setAutoplay
        }
        subtitles={
          subtitles
        }
        language={language}
        setLanguage={setLanguage}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        setSubtitles={
          setSubtitles
        }
        onChangeSource={
          handleChangeSource
        }
        onBack={() =>
          setActiveNav(
            'home',
          )
        }
      />
    );
  } else if (
    activeNav ===
    'favorites'
  ) {
    page = (
      <FavoritesPage
        channels={channels}
        favoriteIds={favoriteIds}
        onOpenPlayer={handleOpenPlayer}
        onToggleFavorite={toggleFavorite}
      />
    );
  } else {
    page = (
      <Home
        channels={
          channels
        }
        channelCount={
          liveCount
        }
        movieCount={
          movieCount
        }
        seriesCount={
          seriesCount
        }
        onNavigate={
          setActiveNav
        }
        onOpenPlayer={
          handleOpenPlayer
        }
        favoriteIds={Array.from(favoriteIds)}
        onToggleFavorite={toggleFavorite}
        onResume={handleResume}
        onOpenLiveGroup={openLiveGroup}
        onAdAction={handleAdAction}
      />
    );
  }

  return (
    <AppPreferencesProvider
      value={{
        language,
        setLanguage,
        themeMode,
        setThemeMode,
      }}
    >
      <AppShell
        ar={language === 'ar'}
        sidebar={
          <Sidebar
            items={navItems}
            activeId={activeNav}
            onNavigate={setActiveNav}
            onChangeSource={handleChangeSource}
            ar={language === 'ar'}
          />
        }
      >
        <Animated.View
          style={[
            styles.pageTransition,
            {
              opacity: pageOpacity,
              transform: [
                { translateY: pageTranslate },
                { scale: pageScale },
              ],
            },
          ]}
        >
          {page}
        </Animated.View>
      </AppShell>
    </AppPreferencesProvider>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        SHASHTNA_THEME.colors.backgroundDeep,
    },

    restoringConnectionScreen: {
      alignItems: 'center',
      justifyContent: 'center',
    },

    restoringConnectionTitle: {
      color: SHASHTNA_THEME.colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      marginTop: 8,
    },

    restoringConnectionSubtitle: {
      color: SHASHTNA_THEME.colors.textSecondary,
      fontSize: 13,
    },

    pageTransition: {
      flex: 1,
    },
  });

export default App;