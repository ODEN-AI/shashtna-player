import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, StatusBar, StyleSheet, Text, View } from 'react-native';

import AppShell from '../../app/AppShell';
import LibraryLoadingScreen from '../../app/LibraryLoadingScreen';
import PlayerHost, { PlayerLaunchOptions } from '../../app/PlayerHost';
import SplashScreen from '../../app/SplashScreen';
import { useBackNavigation } from '../../app/useBackNavigation';
import { usePageTransition } from '../../app/usePageTransition';
import { usePreferencesState } from '../../app/usePreferencesState';
import AppIcon, { AppIconName } from '../../components/common/AppIcon';
import { AppLanguage, AppPreferencesProvider } from '../../design/AppPreferencesContext';
import { BRAND_LITE } from '../../design/brand';
import { SHASHTNA_FONT, SHASHTNA_THEME } from '../../design/theme';
import { isLocalPlaylistSource } from '../../lib/m3uCore';
import type { M3UChannel } from '../../lib/m3uCore';
import type { PickedPlaylist } from '../../lib/playlistPicker';
import Sidebar from '../../navigation/Sidebar';
import { screenMemory } from '../../navigation/tvFocus';
import LiveScreen from '../../screens/Live/LiveScreen';
import SettingsScreen, { PreferredQuality } from '../../screens/Settings/SettingsScreen';
import { EDITION_MARKER } from './editionMarker';
import LiteImportScreen from './LiteImportScreen';
import LiteSourceSection from './LiteSourceSection';
import { ImportProgress, useLitePlaylist } from './useLitePlaylist';

/**
 * Shashtna Player Lite: a dedicated Live TV application.
 *
 * Navigation is exactly: البث المباشر, الإعدادات (in that order). There is no
 * Home, Movies, Series, Favorites page or any other destination; Live TV is
 * the start page and the page opened after connecting.
 *
 * Its only content source is an M3U file on the device ("رفع ملف M3U",
 * LiteImportScreen + useLitePlaylist): no account/Xtream sign-in, no server
 * address, no playlist link. Movies, series and other VOD lines in the file
 * are dropped while it is parsed.
 *
 * Shares the catalog, player, theme, TV focus and M3U parser (m3uCore.ts)
 * with the Full app, but never imports App.tsx, the Full connection screen,
 * the Xtream/URL loader (m3u.ts), Home, Movies, Series, detail pages, TMDB,
 * ads or Continue Watching, so none of it is in the Lite bundle (built from
 * index.lite.js; checked at build time in android/app/build.gradle).
 *
 * Channel favorites stay channel-level state only (long-press OK toggles the
 * heart on a channel); there is no Favorites page or Favorites category.
 */

/** Found in the embedded bundle by the Gradle check; identifies this root. */
export { EDITION_MARKER };

export type LitePage = 'live' | 'settings';
type Page = LitePage;
type NavItem = { id: Page; label: string; icon: AppIconName };

/** Shown at launch and right after connecting. */
export const START_PAGE: Page = 'live';

/** How long the "M3U file loaded" confirmation stays on screen. */
export const IMPORT_NOTICE_MS = 6000;

/** Confirmation shown over Live TV after an M3U file was imported. */
export function importNoticeText(count: number, ar: boolean, source: 'file' | 'account' = 'file'): { title: string; detail: string } {
  // عامر IPTV can also sign in with an account (its session swaps in for useLitePlaylist).
  if (source === 'account') {
    return ar
      ? { title: 'تم تسجيل الدخول بنجاح', detail: `عدد القنوات: ${count.toLocaleString('ar-IQ')}` }
      : { title: 'Signed in', detail: `Channels: ${count.toLocaleString('en-US')}` };
  }
  return ar
    ? { title: 'تم تحميل ملف M3U بنجاح', detail: `عدد القنوات: ${count.toLocaleString('ar-IQ')}` }
    : { title: 'M3U file loaded', detail: `Channels: ${count.toLocaleString('en-US')}` };
}

export function getLiteNavItems(language: AppLanguage): NavItem[] {
  const ar = language === 'ar';
  return [
    { id: 'live', label: ar ? 'البث المباشر' : 'Live TV', icon: 'live' },
    { id: 'settings', label: ar ? 'الإعدادات' : 'Settings', icon: 'settings' },
  ];
}

function LiteContent() {
  const preferences = usePreferencesState();
  const { language, setLanguage, themeMode, setThemeMode } = preferences;
  const library = useLitePlaylist();
  const { catalog } = library;

  const [page, setPage] = useState<Page>(START_PAGE);
  const [selectedChannel, setSelectedChannel] = useState<M3UChannel | null>(null);
  const [playerOptions, setPlayerOptions] = useState<PlayerLaunchOptions>({});
  const [preferredQuality, setPreferredQuality] = useState<PreferredQuality>('auto');
  const [autoplay, setAutoplay] = useState(true);
  const [subtitles, setSubtitles] = useState(false);
  const [liveGroup, setLiveGroup] = useState<string | null>(null);
  const [lastChannelId, setLastChannelId] = useState<string | null>(null);
  // Set when an M3U file was just imported; shown once Live TV is on screen.
  const [importNotice, setImportNotice] = useState(false);
  const ready = library.status === 'ready';
  useEffect(() => {
    if (!importNotice || !ready) return;
    const timer = setTimeout(() => setImportNotice(false), IMPORT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [importNotice, ready]);

  const { importFile } = library;
  const onImport = useCallback(
    async (picked: PickedPlaylist, progress: ImportProgress) => {
      await importFile(picked, progress);
      // A fresh import always lands on Live TV, at the top of all channels.
      setPage(START_PAGE);
      setLiveGroup(null);
      setLastChannelId(null);
      setSelectedChannel(null);
      screenMemory.clear();
      setImportNotice(true);
    },
    [importFile],
  );
  const navItems = useMemo(() => getLiteNavItems(language), [language]);
  const transition = usePageTransition(page);

  const navigate = useCallback((next: string) => setPage(next as Page), []);
  const closePlayer = useCallback(() => setSelectedChannel(null), []);
  useBackNavigation({ playerOpen: !!selectedChannel, closePlayer, page, startPage: START_PAGE, goTo: navigate });

  const openChannel = useCallback((channel: M3UChannel, queue?: readonly M3UChannel[], scope?: string) => {
    if (!channel.url) return;
    setPlayerOptions({ liveQueue: queue, liveScope: scope });
    setSelectedChannel(channel);
  }, []);

  if (library.status === 'restoring' || library.status === 'indexing') {
    return (
      <AppPreferencesProvider value={preferences}>
        <LibraryLoadingScreen indexing={library.status === 'indexing'} />
      </AppPreferencesProvider>
    );
  }

  if (library.status === 'import') {
    return (
      <AppPreferencesProvider value={preferences}>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#050C18" />
          <LiteImportScreen onImport={onImport} restoreError={library.failure || undefined} previousName={library.playlist?.name} />
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
  if (page === 'settings') {
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
        sourceSection={
          <LiteSourceSection
            ar={language === 'ar'}
            fileName={library.playlist?.name || ''}
            channelCount={catalog.live.length}
            onReplace={onImport}
            onReload={library.reload}
          />
        }
        liveOnly
        onBack={() => navigate(START_PAGE)}
      />
    );
  } else {
    content = (
      <LiveScreen
        catalog={catalog}
        onOpenPlayer={openChannel}
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
            ar={language === 'ar'}
            brandName={BRAND_LITE.nameInside}
          />
        }
      >
        <Animated.View style={[styles.page, transition]}>{content}</Animated.View>
        {importNotice ? (
          <ImportNotice
            count={catalog.live.length}
            ar={language === 'ar'}
            source={library.playlist && !isLocalPlaylistSource(library.playlist.uri) ? 'account' : 'file'}
          />
        ) : null}
      </AppShell>
    </AppPreferencesProvider>
  );
}

/** "M3U file loaded · N channels" banner; not focusable, so the remote stays on the channels. */
function ImportNotice({ count, ar, source }: { count: number; ar: boolean; source: 'file' | 'account' }) {
  const { title, detail } = importNoticeText(count, ar, source);
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="lite-import-notice"
      style={[styles.notice, { flexDirection: ar ? 'row-reverse' : 'row' }]}
    >
      <View style={styles.noticeIcon}>
        <AppIcon name="check" size={16} color="#FFFFFF" />
      </View>
      <View>
        <Text style={[styles.noticeTitle, { textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
        <Text style={[styles.noticeDetail, { textAlign: ar ? 'right' : 'left' }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.background },
  container: { flex: 1, backgroundColor: SHASHTNA_THEME.colors.backgroundDeep },
  page: { flex: 1 },
  notice: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
    backgroundColor: 'rgba(6,24,20,0.94)',
    boxShadow: '0px 12px 32px rgba(0,0,0,0.35)',
  },
  noticeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SHASHTNA_THEME.colors.success,
  },
  noticeTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: SHASHTNA_FONT.sans },
  noticeDetail: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600', fontFamily: SHASHTNA_FONT.sans, marginTop: 2 },
});

/** Root of Shashtna Player Lite (registered by index.lite.js). */
export default function LiteApp() {
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  return (
    <View style={styles.root} testID={EDITION_MARKER}>
      <LiteContent />
      {splashDone ? null : <SplashScreen onFinish={finishSplash} name={BRAND_LITE.nameInside} />}
    </View>
  );
}
