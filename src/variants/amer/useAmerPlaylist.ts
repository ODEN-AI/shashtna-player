import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { buildCatalogAsync, Catalog, emptyCatalog } from '../../features/catalog/catalog';
import { clearLibraryCache, fingerprint, loadLibraryCache, saveLibraryCache } from '../../features/catalog/catalogCache';
import { clearConnectionSource, loadConnectionSource, saveConnectionSource } from '../../lib/connectionSession';
import { deleteJsonFile, readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';
import {
  activateXtreamSession,
  clearXtreamSession,
  downloadAndParseM3U,
  getXtreamSessionFromSource,
  isLocalPlaylistSource,
  M3UChannel,
  NoLiveChannelsError,
} from '../../lib/m3u';
import type { PickedPlaylist } from '../../lib/playlistPicker';

/**
 * عامر IPTV's content source. Bundled in place of
 * src/variants/lite/useLitePlaylist.ts (metro.amer.config.js) and exposes the
 * same API, so LiteApp runs unchanged.
 *
 * Two ways in, the same as the Shashtna sign-in screen shows in live-only mode:
 * - account: server + username + password (Xtream), live channels only
 *   (get_live_categories + get_live_streams); the library is cached for 12 h
 *   without credentials (catalogCache), the source itself is kept in the
 *   Keystore-encrypted connection store;
 * - file: a local M3U file, read and restored exactly like Shashtna Lite.
 * There is no M3U link.
 */
export type LiteStatus = 'restoring' | 'indexing' | 'import' | 'ready';
export type SourceKind = 'file' | 'account';

export type LitePlaylistInfo = {
  /** The saved source: a content:// URI, or the Xtream get.php URL (holds the credentials; never shown). */
  uri: string;
  /** Shown in Settings: the file name, or `username @ server:port`. */
  name: string;
  kind: SourceKind;
};

export type ImportProgress = {
  onProgress?: (received: number, total: number) => void;
  onChannelCount?: (count: number) => void;
};

/** A picked file, or a source the sign-in screen has already loaded (`channels`). */
export type ImportRequest = PickedPlaylist & { channels?: M3UChannel[] };

export type LitePlaylistSession = {
  status: LiteStatus;
  catalog: Catalog;
  playlist: LitePlaylistInfo | null;
  failure: unknown;
  importFile: (picked: ImportRequest, progress?: ImportProgress) => Promise<Catalog>;
  reload: () => Promise<void>;
};

const META_FILE = 'shashtna-lite-playlist.json';
type Meta = { id: string; name: string; kind: SourceKind };

export function nameFromUri(uri: string): string {
  const last = decodeURIComponent(uri.split(/[?#]/)[0]).split(/[/:]/).filter(Boolean).pop() || '';
  return /\.m3u8?$/i.test(last) ? last : 'playlist.m3u';
}

const kindOf = (source: string): SourceKind => (isLocalPlaylistSource(source) ? 'file' : 'account');

// ---------------------------------------------------------------------------
// Shared with the Settings source section and the sign-in screen.

type Listener = () => void;
const listeners = new Set<Listener>();
let current: LitePlaylistInfo | null = null;
let lastFailedKind: SourceKind | null = null;
let signOutHandler: (() => void) | null = null;

function setCurrent(info: LitePlaylistInfo | null) {
  current = info;
  listeners.forEach(l => l());
}

/** The source in use (for Settings). */
export function useAmerSource(): LitePlaylistInfo | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Kind of the saved source that failed to restore at launch, if any. */
export function lastRestoreFailureKind(): SourceKind | null {
  return lastFailedKind;
}

/** Settings → "تغيير المصدر": forget the source and return to the sign-in screen. */
export function requestSignOut(): void {
  signOutHandler?.();
}

// ---------------------------------------------------------------------------

async function loadSource(source: string, progress: ImportProgress = {}, useCache = false): Promise<M3UChannel[]> {
  if (isLocalPlaylistSource(source)) {
    return downloadAndParseM3U(source, progress.onProgress, progress.onChannelCount, { liveOnly: true });
  }
  const session = getXtreamSessionFromSource(source);
  // Accounts only: a plain playlist link is not a source in عامر IPTV.
  if (!session) throw new Error('Unsupported source');
  const cached = useCache ? await loadLibraryCache(source, session, true) : null;
  activateXtreamSession(session);
  if (cached && cached.length) return cached;
  const channels = await downloadAndParseM3U(source, progress.onProgress, progress.onChannelCount, { liveOnly: true });
  void saveLibraryCache(source, session, channels, true);
  return channels;
}

async function index(channels: M3UChannel[]): Promise<Catalog> {
  const catalog = await buildCatalogAsync(channels, { liveOnly: true });
  if (!catalog.live.length) throw new NoLiveChannelsError();
  return catalog;
}

export function useLitePlaylist(): LitePlaylistSession {
  const [status, setStatus] = useState<LiteStatus>('restoring');
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [playlist, setPlaylist] = useState<LitePlaylistInfo | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const generation = useRef(0);

  const show = useCallback((next: Catalog, info: LitePlaylistInfo) => {
    setCatalog(next);
    setPlaylist(info);
    setCurrent(info);
    setFailure(null);
    setStatus('ready');
  }, []);

  useEffect(() => {
    let alive = true;
    const run = ++generation.current;
    (async () => {
      const saved = await loadConnectionSource();
      if (!alive || run !== generation.current) return;
      if (!saved || (!isLocalPlaylistSource(saved) && !getXtreamSessionFromSource(saved))) {
        if (saved) void clearConnectionSource();
        setStatus('import');
        return;
      }
      const meta = await readJsonFile<Meta | null>(META_FILE, null);
      const kind = kindOf(saved);
      const info: LitePlaylistInfo = {
        uri: saved,
        kind,
        name: meta?.id === fingerprint(saved) && meta.name ? meta.name : kind === 'file' ? nameFromUri(saved) : '',
      };
      try {
        setStatus('indexing');
        const next = await index(await loadSource(saved, {}, true));
        if (!alive || run !== generation.current) return;
        show(next, info);
      } catch (error) {
        console.warn('[Amer] Saved source could not be restored:', error);
        if (!alive || run !== generation.current) return;
        lastFailedKind = kind;
        setFailure(error);
        setPlaylist(info);
        setStatus('import');
      }
    })();
    return () => {
      alive = false;
    };
  }, [show]);

  const importFile = useCallback(
    async (request: ImportRequest, progress?: ImportProgress) => {
      const run = ++generation.current;
      const source = request.uri;
      const next = await index(request.channels ?? (await loadSource(source, progress)));
      const kind = kindOf(source);
      const info: LitePlaylistInfo = { uri: source, kind, name: request.name || (kind === 'file' ? nameFromUri(source) : '') };
      if (kind === 'account') {
        const session = getXtreamSessionFromSource(source);
        activateXtreamSession(session);
        if (session) void saveLibraryCache(source, session, next.live, true);
      }
      await saveConnectionSource(source);
      await writeJsonFile(META_FILE, { id: fingerprint(source), name: info.name, kind } satisfies Meta);
      lastFailedKind = null;
      if (run === generation.current) show(next, info);
      return next;
    },
    [show],
  );

  const reload = useCallback(async () => {
    if (!playlist) return;
    const run = ++generation.current;
    const next = await index(await loadSource(playlist.uri));
    if (run === generation.current) setCatalog(next);
  }, [playlist]);

  useEffect(() => {
    signOutHandler = () => {
      generation.current += 1;
      void clearConnectionSource();
      void clearLibraryCache();
      void deleteJsonFile(META_FILE);
      clearXtreamSession();
      lastFailedKind = null;
      setCatalog(emptyCatalog());
      setPlaylist(null);
      setCurrent(null);
      setFailure(null);
      setStatus('import');
    };
    return () => {
      signOutHandler = null;
    };
  }, []);

  return { status, catalog, playlist, failure, importFile, reload };
}
