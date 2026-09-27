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
import { PickedPlaylist, reimportPlaylistFile } from '../../lib/playlistPicker';
import { tvDiag } from '../../lib/tvDiagnostics';
import { AMER_BUILT_IN_LABEL, AMER_BUILT_IN_SOURCE, isBuiltInSource, loadBuiltInPlaylist } from './builtInPlaylist';

/**
 * عامر IPTV's content source. Bundled in place of
 * src/variants/lite/useLitePlaylist.ts (metro.amer.config.js) and exposes the
 * same API, so LiteApp runs unchanged.
 *
 * One saved source string (connectionSession), three kinds:
 * - builtin: the playlist packaged in the APK (builtInPlaylist.ts). It is the
 *   default: with nothing saved (a fresh install, or after "تغيير المصدر" and a
 *   restart) the app opens it straight into Live TV, no sign-in and no picker;
 *   picking it on the source screen saves it explicitly;
 * - account: server + username + password (Xtream), live channels only
 *   (get_live_categories + get_live_streams); the library is cached for 12 h
 *   without credentials (catalogCache), the source itself is kept in the
 *   Keystore-encrypted connection store;
 * - file: a local M3U file, read and restored exactly like Shashtna Lite.
 * There is no M3U link.
 *
 * Launch priority: a saved account or file (the user's explicit choice) >
 * the built-in playlist > the source screen (only when the built-in playlist
 * cannot be loaded, with its error and the other sources).
 */
export type LiteStatus = 'restoring' | 'indexing' | 'import' | 'ready';
export type SourceKind = 'builtin' | 'file' | 'account';

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
/** original: the picked document (content://) the private copy came from, to re-copy it on reload. */
type Meta = { id: string; name: string; kind: SourceKind; original?: string };

export function nameFromUri(uri: string): string {
  const last = decodeURIComponent(uri.split(/[?#]/)[0]).split(/[/:]/).filter(Boolean).pop() || '';
  return /\.m3u8?$/i.test(last) ? last : 'playlist.m3u';
}

const kindOf = (source: string): SourceKind => (isBuiltInSource(source) ? 'builtin' : isLocalPlaylistSource(source) ? 'file' : 'account');

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
  if (isBuiltInSource(source)) return loadBuiltInPlaylist(progress.onChannelCount);
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
  const originalRef = useRef<string | undefined>(undefined);

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
      const stored = await loadConnectionSource();
      if (!alive || run !== generation.current) return;
      const usable = !!stored && (isLocalPlaylistSource(stored) || !!getXtreamSessionFromSource(stored));
      if (stored && !usable) void clearConnectionSource();
      // The user's saved account or file first; otherwise the built-in playlist.
      const saved = usable ? stored! : AMER_BUILT_IN_SOURCE;
      const meta = await readJsonFile<Meta | null>(META_FILE, null);
      const kind = kindOf(saved);
      originalRef.current = meta?.id === fingerprint(saved) ? meta.original : undefined;
      const info: LitePlaylistInfo = {
        uri: saved,
        kind,
        name: kind === 'builtin' ? AMER_BUILT_IN_LABEL.ar : meta?.id === fingerprint(saved) && meta.name ? meta.name : kind === 'file' ? nameFromUri(saved) : '',
      };
      try {
        setStatus('indexing');
        const next = await index(await loadSource(saved, {}, true));
        if (!alive || run !== generation.current) return;
        show(next, info);
      } catch (error) {
        // Kind and error name only: an error's text could carry a source (URL, path).
        console.warn('[Amer] Source could not be restored:', kind, error instanceof Error ? error.name : 'error');
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
      tvDiag('AMER_TV_PICKER', { stage: 'import:parsed', kind, liveChannels: next.live.length });
      const info: LitePlaylistInfo = {
        uri: source,
        kind,
        name: kind === 'builtin' ? AMER_BUILT_IN_LABEL.ar : request.name || (kind === 'file' ? nameFromUri(source) : ''),
      };
      if (kind === 'account') {
        const session = getXtreamSessionFromSource(source);
        activateXtreamSession(session);
        if (session) void saveLibraryCache(source, session, next.live, true);
      }
      await saveConnectionSource(source);
      originalRef.current = kind === 'file' ? request.original : undefined;
      await writeJsonFile(META_FILE, { id: fingerprint(source), name: info.name, kind, original: originalRef.current } satisfies Meta);
      lastFailedKind = null;
      if (run === generation.current) show(next, info);
      return next;
    },
    [show],
  );

  const reload = useCallback(async () => {
    if (!playlist) return;
    // A file is a private copy: "read the file again" copies the original document again.
    if (playlist.kind === 'file' && originalRef.current) {
      const picked = await reimportPlaylistFile(originalRef.current);
      await importFile({ ...picked, name: playlist.name || picked.name });
      return;
    }
    const run = ++generation.current;
    const next = await index(await loadSource(playlist.uri));
    if (run === generation.current) setCatalog(next);
  }, [importFile, playlist]);

  useEffect(() => {
    signOutHandler = () => {
      generation.current += 1;
      void clearConnectionSource();
      void clearLibraryCache();
      void deleteJsonFile(META_FILE);
      clearXtreamSession();
      originalRef.current = undefined;
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
