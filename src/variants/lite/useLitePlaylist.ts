import { useCallback, useEffect, useRef, useState } from 'react';

import { buildCatalogAsync, Catalog, emptyCatalog } from '../../features/catalog/catalog';
import { clearConnectionSource, loadConnectionSource, saveConnectionSource } from '../../lib/connectionSession';
import { readJsonFile, writeJsonFile, deleteJsonFile } from '../../lib/jsonFileStore';
import { DownloadProgress, isLocalPlaylistSource, loadLocalPlaylist, NoLiveChannelsError } from '../../lib/m3uCore';
import type { PickedPlaylist } from '../../lib/playlistPicker';

/**
 * Shashtna Player Lite's only content source: an M3U file on the device.
 *
 * - import: read the picked file (live channels only), index it, save its URI
 *   (connectionSession, the same store as before) and its display name, then
 *   report `ready`.
 * - restore: on launch, read the saved file again. If it can no longer be
 *   read, `status` is 'import' and `failure` says why.
 *
 * No Xtream, no playlist links, no network requests.
 */
export type LiteStatus = 'restoring' | 'indexing' | 'import' | 'ready';

export type LitePlaylistInfo = {
  uri: string;
  /** File name shown in Settings ("playlist.m3u"). */
  name: string;
};

export type ImportProgress = {
  onProgress?: DownloadProgress;
  onChannelCount?: (count: number) => void;
};

export type LitePlaylistSession = {
  status: LiteStatus;
  catalog: Catalog;
  playlist: LitePlaylistInfo | null;
  /** Why the saved file could not be restored (shown on the import screen). */
  failure: unknown;
  /**
   * Reads, parses and installs a picked file. Throws (and keeps the current
   * playlist) when it cannot be read or has no live channels.
   */
  importFile: (picked: PickedPlaylist, progress?: ImportProgress) => Promise<Catalog>;
  /** Reads the current file again (Settings). */
  reload: () => Promise<void>;
};

/** Display name of the imported file, kept next to the saved URI. */
const META_FILE = 'shashtna-lite-playlist.json';

/** Best-effort name for a URI saved before the name was stored. */
export function nameFromUri(uri: string): string {
  const last = decodeURIComponent(uri.split(/[?#]/)[0]).split(/[/:]/).filter(Boolean).pop() || '';
  return /\.m3u8?$/i.test(last) ? last : 'playlist.m3u';
}

async function readPlaylist(uri: string, progress: ImportProgress = {}): Promise<Catalog> {
  const channels = await loadLocalPlaylist(uri, progress.onProgress, progress.onChannelCount, { liveOnly: true });
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

  useEffect(() => {
    let alive = true;
    const run = ++generation.current;
    (async () => {
      const saved = await loadConnectionSource();
      if (!alive || run !== generation.current) return;
      // Lite restores local files only. Anything else (e.g. a source saved by
      // an older Lite build) is dropped: the user imports an M3U file.
      if (!saved || !isLocalPlaylistSource(saved)) {
        if (saved) void clearConnectionSource();
        setStatus('import');
        return;
      }
      const meta = await readJsonFile<LitePlaylistInfo | null>(META_FILE, null);
      const info = { uri: saved, name: meta?.uri === saved && meta.name ? meta.name : nameFromUri(saved) };
      try {
        setStatus('indexing');
        const next = await readPlaylist(saved);
        if (!alive || run !== generation.current) return;
        setCatalog(next);
        setPlaylist(info);
        setStatus('ready');
      } catch (error) {
        console.warn('[Shashtna] Saved M3U file could not be restored:', error);
        if (!alive || run !== generation.current) return;
        setFailure(error);
        setPlaylist(info);
        setStatus('import');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const importFile = useCallback(async (picked: PickedPlaylist, progress?: ImportProgress) => {
    const run = ++generation.current;
    const next = await readPlaylist(picked.uri, progress);
    const info = { uri: picked.uri, name: picked.name || nameFromUri(picked.uri) };
    await saveConnectionSource(picked.uri);
    await writeJsonFile(META_FILE, info);
    if (run === generation.current) {
      setCatalog(next);
      setPlaylist(info);
      setFailure(null);
      setStatus('ready');
    }
    return next;
  }, []);

  const reload = useCallback(async () => {
    if (!playlist) return;
    const run = ++generation.current;
    const next = await readPlaylist(playlist.uri);
    if (run === generation.current) setCatalog(next);
  }, [playlist]);

  return { status, catalog, playlist, failure, importFile, reload };
}

/** Forgets the imported file (tests / a future "remove" action). */
export async function forgetLitePlaylist(): Promise<void> {
  await clearConnectionSource();
  await deleteJsonFile(META_FILE);
}
