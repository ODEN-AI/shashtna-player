import React, { useCallback, useMemo, useState } from 'react';
import { Animated, StatusBar, StyleSheet, View } from 'react-native';

import AppShell from '../../app/AppShell';
import LibraryLoadingScreen from '../../app/LibraryLoadingScreen';
import PlayerHost, { PlayerLaunchOptions } from '../../app/PlayerHost';
import SplashScreen from '../../app/SplashScreen';
import { useBackNavigation } from '../../app/useBackNavigation';
import { useLibrarySession } from '../../app/useLibrarySession';
import { usePageTransition } from '../../app/usePageTransition';
import { usePreferencesState } from '../../app/usePreferencesState';
import { AppIconName } from '../../components/common/AppIcon';
import { AppLanguage, AppPreferencesProvider } from '../../design/AppPreferencesContext';
import { BRAND_LITE } from '../../design/brand';
import { SHASHTNA_THEME } from '../../design/theme';
import { M3UChannel } from '../../lib/m3u';
import Sidebar from '../../navigation/Sidebar';
import { screenMemory } from '../../navigation/tvFocus';
import ConnectionScreen from '../../screens/Connection/ConnectionScreen';
import FavoritesScreen from '../../screens/Favorites/FavoritesScreen';
import LiveScreen from '../../screens/Live/LiveScreen';
import SettingsScreen, { PreferredQuality } from '../../screens/Settings/SettingsScreen';

/**
 * Shashtna Player Lite: Live TV first and only.
 *
 * Shares the connection, session, catalog, player, favorites, theme, TV focus
 * and diagnostics code with the Full app, but:
 * - loads live data only (2 Xtream requests instead of 6; VOD lines of plain
 *   M3U playlists are dropped while parsing, never stored);
 * - opens straight into Live TV; the navigation graph is Live / Favorites /
 *   Settings;
 * - never imports Home, Movies, Series, detail pages or Continue Watching
 *   UI, so none of that code is in the Lite bundle (index.lite.js).
 */

type Page = 'live' | 'favorites' | 'settings';
type NavItem = { id: Page; label: string; icon: AppIconName };

const START_PAGE: Page = 'live';

function getNavItems(language: AppLanguage): NavItem[] {
  const ar = language === 'ar';
  return [
    { id: 'live', label: ar ? 'البث المباشر' : 'Live TV', icon: 'live' },
    { id: 'favorites', label: ar ? 'المفضلة' : 'Favorites', icon: 'favorites' },
    { id: 'settings', label: ar ? 'الإعدادات' : 'Settings', icon: 'settings' },
  ];
}

function LiteContent() {
  const preferences = usePreferencesState();
  const { language, setLanguage, themeMode, setThemeMode } = preferences;
  const library = useLibrarySession({ liveOnly: true });
  const { catalog } = library;

  const [page, setPage] = useState<Page>(START_PAGE);
  const [selectedChannel, setSelectedChannel] = useState<M3UChannel | null>(null);
  const [playerOptions, setPlayerOptions] = useState<PlayerLaunchOptions>({});
  const [preferredQuality, setPreferredQuality] = useState<PreferredQuality>('auto');
  const [autoplay, setAutoplay] = useState(true);
  const [subtitles, setSubtitles] = useState(false);
  const [liveGroup, setLiveGroup] = useState<string | null>(null);
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);
  const navItems = useMemo(() => getNavItems(language), [language]);
  const transition = usePageTransition(page);

  const navigate = useCallback((next: string) => setPage(next as Page), []);
  const closePlayer = useCallback(() => setSelectedChannel(null), []);
  useBackNavigation({ playerOpen: !!selectedChannel, closePlayer, page, startPage: START_PAGE, goTo: navigate });

  const openChannel = useCallback((channel: M3UChannel, queue?: readonly M3UChannel[]) => {
    if (!channel.url) return;
    setPlayerOptions({ liveQueue: queue });
    setSelectedChannel(channel);
  }, []);

  const changeSource = useCallback(() => {
    setSelectedChannel(null);
    setPage(START_PAGE);
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
          <ConnectionScreen onConnected={library.connect} liveOnly />
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
            onBack={lastPlayed => {
              if (lastPlayed) setLastChannelId(String(lastPlayed.id));
              setSelectedChannel(null);
            }}
          />
        </View>
      </AppPreferencesProvider>
    );
  }

  let content: React.ReactNode;
  if (page === 'favorites') {
    content = <FavoritesScreen catalog={catalog} onOpen={openChannel} liveOnly />;
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
        onBack={() => navigate(START_PAGE)}
      />
    );
  } else {
    content = (
      <LiveScreen
        catalog={catalog}
        onOpenPlayer={openChannel}
        onBackHome={() => navigate('favorites')}
        homeLabel={language === 'ar' ? 'المفضلة' : 'Favorites'}
        homeIcon="favorites"
        initialGroup={liveGroup}
        onGroupChange={setLiveGroup}
        focusChannelId={lastChannelId}
      />
    );
  }

  return (
    <AppPreferencesProvider value={preferences}>
      <AppShell
        ar={language === 'ar'}
        sidebar={
          <Sidebar
            items={navItems}
            activeId={page}
            onNavigate={navigate}
            onChangeSource={changeSource}
            ar={language === 'ar'}
            brandName={BRAND_LITE.nameInside}
          />
        }
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

export default function LiteApp() {
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  return (
    <View style={styles.root}>
      <LiteContent />
      {splashDone ? null : <SplashScreen onFinish={finishSplash} name={BRAND_LITE.nameInside} />}
    </View>
  );
}
