import { useCallback, useEffect, useRef, useState } from 'react';

import { buildCatalogAsync, Catalog, emptyCatalog } from '../features/catalog/catalog';
import type { Edition } from './edition';
import { clearLibraryCache, loadLibraryCache, saveLibraryCache } from '../features/catalog/catalogCache';
import { clearConnectionSource, loadConnectionSource, saveConnectionSource } from '../lib/connectionSession';
import {
  activateXtreamSession,
  clearXtreamSession,
  downloadAndParseM3U,
  getXtreamSessionFromSource,
  M3UChannel,
  NoLiveChannelsError,
} from '../lib/m3u';

/**
 * Loaded IPTV source + its catalog, shared by Shashtna Player and
 * Shashtna Player Lite.
 *
 * - restoring: reading the saved source (cache first, then network).
 * - indexing: channels are in, the catalog is being built (UI stays live).
 * - disconnected: no usable source; show the connection screen.
 * - ready: catalog available.
 */
export type LibraryStatus = 'restoring' | 'indexing' | 'disconnected' | 'ready';

/** Why the library went back to 'disconnected', and for which source. */
export type LibraryFailure = { error: unknown; source: string };

export type LibrarySession = {
  status: LibraryStatus;
  /**
   * Set when a saved source could not be restored (e.g. an imported M3U file
   * that was deleted or whose access was revoked) or a connected source
   * produced nothing usable. Cleared by the next connect.
   */
  failure: LibraryFailure | null;
  catalog: Catalog;
  source: string;
  /** Called by the connection screen after it downloaded and parsed a source. */
  connect: (channels: M3UChannel[], source: string) => Promise<void>;
  disconnect: () => void;
  /** Re-download the current source, bypassing the cache. */
  refresh: () => Promise<void>;
};

export function useLibrarySession(edition: Edition): LibrarySession {
  const { liveOnly, loadVod, indexMedia } = edition;
  const [status, setStatus] = useState<LibraryStatus>('restoring');
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [source, setSource] = useState('');
  const [failure, setFailure] = useState<LibraryFailure | null>(null);
  const generation = useRef(0);

  const install = useCallback(
    async (channels: M3UChannel[], nextSource: string, persist: boolean) => {
      const run = ++generation.current;
      setStatus('indexing');
      const next = await buildCatalogAsync(channels, { liveOnly, indexMedia });
      if (run !== generation.current) return;
      if (!next.all.length || (liveOnly && !next.live.length)) {
        setFailure({ error: new NoLiveChannelsError(), source: nextSource });
        setStatus('disconnected');
        return;
      }
      setCatalog(next);
      setSource(nextSource);
      setStatus('ready');
      const session = getXtreamSessionFromSource(nextSource);
      // Lite persists the live channels only, whatever the source contained.
      if (persist && session) void saveLibraryCache(nextSource, session, liveOnly ? next.live : channels, liveOnly);
    },
    [liveOnly, indexMedia],
  );

  useEffect(() => {
    let alive = true;
    let savedSource = '';
    (async () => {
      try {
        const saved = await loadConnectionSource();
        savedSource = saved || '';
        if (!saved) {
          if (alive) setStatus('disconnected');
          return;
        }
        const session = getXtreamSessionFromSource(saved);
        const cached = session ? await loadLibraryCache(saved, session, liveOnly) : null;
        if (!alive) return;
        if (cached && cached.length) {
          activateXtreamSession(session);
          await install(cached, saved, false);
          return;
        }
        const channels = await downloadAndParseM3U(saved, undefined, undefined, { liveOnly, loadVod });
        if (!alive) return;
        await install(channels, saved, true);
      } catch (error) {
        console.warn('[Shashtna] Saved connection restore failed:', error);
        if (alive) {
          setFailure({ error, source: savedSource });
          setStatus('disconnected');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [install, liveOnly, loadVod]);

  const connect = useCallback(
    async (channels: M3UChannel[], nextSource: string) => {
      setFailure(null);
      void saveConnectionSource(nextSource);
      await install(channels, nextSource, true);
    },
    [install],
  );

  const disconnect = useCallback(() => {
    generation.current += 1;
    setFailure(null);
    void clearConnectionSource();
    void clearLibraryCache();
    clearXtreamSession();
    setCatalog(emptyCatalog());
    setSource('');
    setStatus('disconnected');
  }, []);

  const refresh = useCallback(async () => {
    if (!source) return;
    setStatus('restoring');
    try {
      const channels = await downloadAndParseM3U(source, undefined, undefined, { liveOnly, loadVod });
      await install(channels, source, true);
    } catch (error) {
      console.warn('[Shashtna] Library refresh failed:', error);
      // Keep the library that was already loaded.
      setStatus('ready');
    }
  }, [install, liveOnly, loadVod, source]);

  return { status, failure, catalog, source, connect, disconnect, refresh };
}
