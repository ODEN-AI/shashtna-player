import React, { useCallback, useMemo, useState } from 'react';
import { Animated, Linking, StatusBar, StyleSheet, View } from 'react-native';

import AppShell from './src/app/AppShell';
import LibraryLoadingScreen from './src/app/LibraryLoadingScreen';
import PlayerHost, { PlayerLaunchOptions } from './src/app/PlayerHost';
import SplashScreen from './src/app/SplashScreen';
import { useBackNavigation } from './src/app/useBackNavigation';
import { useLibrarySession } from './src/app/useLibrarySession';
import { usePageTransition } from './src/app/usePageTransition';
import { usePreferencesState } from './src/app/usePreferencesState';
import { AppIconName } from './src/components/common/AppIcon';
import { AppLanguage, AppPreferencesProvider } from './src/design/AppPreferencesContext';
import { SHASHTNA_THEME } from './src/design/theme';
import { Advertisement } from './src/features/ads/types';
import {
  ContinueWatchingEntry,
  ensureContinueWatchingLoaded,
  getResumePosition,
  recordProgress,
} from './src/features/continueWatching/continueWatchingStore';
import { setPlaybackResumeStore } from './src/features/player/resumeRegistry';
import MovieDetailsScreen from './src/features/details/MovieDetailsScreen';
import SeriesDetailsScreen from './src/features/details/SeriesDetailsScreen';
import { M3UChannel } from './src/lib/m3u';
import { getSeriesDetails, getSeriesFirstEpisode, loadXtreamVod } from './src/lib/xtreamVod';
import type { Edition } from './src/app/edition';
import { indexMedia } from './src/features/catalog/mediaCatalog';
import Sidebar from './src/navigation/Sidebar';
import { screenMemory } from './src/navigation/tvFocus';
import ConnectionScreen from './src/screens/Connection/ConnectionScreen';
import FavoritesScreen from './src/screens/Favorites/FavoritesScreen';
import HomeScreen from './src/screens/Home/HomeScreen';
import LiveScreen from './src/screens/Live/LiveScreen';
import MoviesScreen from './src/screens/Movies/MoviesScreen';
import { PlayerDetailScreens } from './src/screens/Player/PlayerScreen';
import SeriesScreen from './src/screens/Series/SeriesScreen';
import SettingsScreen, { PreferredQuality } from './src/screens/Settings/SettingsScreen';

/**
 * Shashtna Player (Full): Live TV + Movies + Series.
 *
 * Shashtna Player Lite has its own root (src/variants/lite/LiteApp.tsx) and
 * entry file; both share the session, catalog, player, favorites, theme and
 * TV focus code. Only this root imports the VOD screens.
 */

type Page = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'settings';
type NavItem = { id: Page; label: string; icon: AppIconName };

const DETAIL_SCREENS: PlayerDetailScreens = { Movie: MovieDetailsScreen, Series: SeriesDetailsScreen };

/** Found in the embedded bundle by the Gradle check; identifies this root. */
export const EDITION_MARKER = 'shashtna-edition:full';

// Movies and episodes resume where they stopped (Full only; Lite registers nothing).
setPlaybackResumeStore({ ensureLoaded: ensureContinueWatchingLoaded, getResumePosition, recordProgress });

/** Full edition: live + movies + series. */
const FULL_EDITION: Edition = { id: 'full', liveOnly: false, loadVod: loadXtreamVod, indexMedia };

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

function AppContent() {
  const preferences = usePreferencesState();
  const { language, setLanguage, themeMode, setThemeMode } = preferences;
  const library = useLibrarySession(FULL_EDITION);
  const { catalog } = library;

  const [page, setPage] = useState<Page>('home');
  const [selectedChannel, setSelectedChannel] = useState<M3UChannel | null>(null);
  const [playerOptions, setPlayerOptions] = useState<PlayerLaunchOptions>({});
  const [preferredQuality, setPreferredQuality] = useState<PreferredQuality>('auto');
  const [autoplay, setAutoplay] = useState(true);
  const [subtitles, setSubtitles] = useState(false);
  const [liveInitialGroup, setLiveInitialGroup] = useState<string | null>(null);
  const [lastLiveChannelId, setLastLiveChannelId] = useState<string | null>(null);
  const navItems = useMemo(() => getNavItems(language), [language]);
  const transition = usePageTransition(page);

  const navigate = useCallback((next: string) => {
    const target = next as Page;
    if (target !== 'live') {
      setLiveInitialGroup(null);
      setLastLiveChannelId(null);
    }
    setPage(target);
  }, []);
  const goHome = useCallback(() => navigate('home'), [navigate]);
  const closePlayer = useCallback(() => setSelectedChannel(null), []);

  useBackNavigation({ playerOpen: !!selectedChannel, closePlayer, page, startPage: 'home', goTo: navigate });

  const openPlayer = useCallback(async (channel: M3UChannel, options: PlayerLaunchOptions = {}) => {
    setPlayerOptions(options);
    if (channel.contentType === 'series' && channel.contentKey?.startsWith('xtream-series:')) {
      try {
        const episode = await getSeriesFirstEpisode(channel);
        if (episode?.url) {
          setSelectedChannel(episode);
          return;
        }
        console.warn('[Shashtna] No episode found for series:', channel.name);
      } catch (error) {
        console.warn('[Shashtna] Failed to load series:', error);
      }
      return;
    }
    if (channel.url) setSelectedChannel(channel);
  }, []);

  const openLiveChannel = useCallback(
    (channel: M3UChannel, queue?: readonly M3UChannel[]) => openPlayer(channel, { liveQueue: queue }),
    [openPlayer],
  );
  const openMedia = useCallback((channel: M3UChannel) => openPlayer(channel), [openPlayer]);

  /**
   * Continue Watching: reopen the exact movie/episode where it stopped. Saved
   * entries carry no stream URL (credentials), so a fresh one is resolved
   * from the current session before playing.
   */
  const resume = useCallback(
    async (entry: ContinueWatchingEntry) => {
      if (entry.parent) {
        let episode: M3UChannel | null = entry.item.url ? entry.item : null;
        if (!episode) {
          try {
            const details = await getSeriesDetails(entry.parent);
            episode = details.episodes.find(ep => String(ep.id) === String(entry.item.id)) || null;
          } catch (error) {
            console.warn('[Shashtna] Could not resolve episode for resume:', error);
          }
        }
        setPlayerOptions(episode ? { startEpisode: episode } : {});
        setSelectedChannel(entry.parent);
        return;
      }
      const fresh = catalog.byKey.get(`${entry.item.contentType}:${String(entry.item.id)}`) || (entry.item.url ? entry.item : null);
      if (!fresh) {
        console.warn('[Shashtna] Continue Watching item is no longer in this source:', entry.item.name);
        return;
      }
      setPlayerOptions({ autoStart: fresh.contentType === 'movie' });
      setSelectedChannel(fresh);
    },
    [catalog],
  );

  const openLiveGroup = useCallback((group: string) => {
    setLiveInitialGroup(group);
    setPage('live');
  }, []);

  const handleAdAction = useCallback(
    (ad: Advertisement) => {
      const action = ad.action;
      if (action.type === 'navigate') navigate(action.page);
      else if (action.type === 'liveCategory') openLiveGroup(action.group);
      else if (action.type === 'external') {
        // Many TV boxes ship without a browser; the banners also show the address.
        Linking.openURL(action.url).catch(error => console.warn('[Shashtna] Could not open advertisement link:', error));
      }
    },
    [navigate, openLiveGroup],
  );

  const changeSource = useCallback(() => {
    setSelectedChannel(null);
    setPage('home');
    screenMemory.clear();
    library.disconnect();
  }, [library]);

  if (library.status === 'restoring' || library.status === 'indexing') {
    return (
      <AppPreferencesProvider value={preferences}>
        <LibraryLoadingScreen indexing={library.status === 'indexing'} />
      </AppPreferencesProvider>
    );
  }

  if (library.status === 'disconnected') {
    return (
      <AppPreferencesProvider value={preferences}>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#050C18" />
          <ConnectionScreen onConnected={library.connect} edition={FULL_EDITION} />
        </View>
      </AppPreferencesProvider>
    );
  }

  if (selectedChannel) {
    return (
      <AppPreferencesProvider value={preferences}>
        <View style={styles.container}>
          <StatusBar hidden />
          <PlayerHost
            channel={selectedChannel}
            options={playerOptions}
            preferredQuality={preferredQuality}
            autoplay={autoplay}
            subtitles={subtitles}
            detailScreens={DETAIL_SCREENS}
            onBack={lastPlayed => {
              // Lets Live TV scroll back to and focus the channel just watched.
              if (lastPlayed?.contentType === 'live') setLastLiveChannelId(String(lastPlayed.id));
              setSelectedChannel(null);
            }}
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  let content: React.ReactNode;
  if (page === 'live') {
    content = (
      <LiveScreen
        catalog={catalog}
        onOpenPlayer={openLiveChannel}
        onBackHome={goHome}
        initialGroup={liveInitialGroup}
        onGroupChange={setLiveInitialGroup}
        focusChannelId={lastLiveChannelId}
        favoritesFilter
      />
    );
  } else if (page === 'movies') {
    content = <MoviesScreen catalog={catalog} onOpenPlayer={openMedia} onBack={goHome} />;
  } else if (page === 'series') {
    content = <SeriesScreen catalog={catalog} onOpenPlayer={openMedia} onBack={goHome} />;
  } else if (page === 'favorites') {
    content = <FavoritesScreen catalog={catalog} onOpen={openLiveChannel} />;
  } else if (page === 'settings') {
    content = (
      <SettingsScreen
        preferredQuality={preferredQuality}
        setPreferredQuality={setPreferredQuality}
        autoplay={autoplay}
        setAutoplay={setAutoplay}
        subtitles={subtitles}
        setSubtitles={setSubtitles}
        language={language}
        setLanguage={setLanguage}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        onChangeSource={changeSource}
        onRefreshLibrary={library.refresh}
        onBack={goHome}
      />
    );
  } else {
    content = (
      <HomeScreen
        catalog={catalog}
        onNavigate={navigate}
        onOpenPlayer={openMedia}
        onResume={resume}
        onOpenLiveGroup={openLiveGroup}
        onAdAction={handleAdAction}
      />
    );
  }

  return (
    <AppPreferencesProvider value={preferences}>
      <AppShell
        ar={language === 'ar'}
        sidebar={<Sidebar items={navItems} activeId={page} onNavigate={navigate} onChangeSource={changeSource} ar={language === 'ar'} />}
      >
        <Animated.View style={[styles.page, transition]}>{content}</Animated.View>
      </AppShell>
    </AppPreferencesProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.background },
  container: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.backgroundDeep },
  page: { flex: 1 },
});

/** Root: the app plus the launch splash layered on top while it starts up. */
function App() {
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  return (
    <View style={styles.root} testID={EDITION_MARKER}>
      <AppContent />
      {splashDone ? null : <SplashScreen onFinish={finishSplash} />}
    </View>
  );
}

export default App;
