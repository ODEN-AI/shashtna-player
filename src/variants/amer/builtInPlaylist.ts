import { loadLocalPlaylist, NoLiveChannelsError } from '../../lib/m3uCore';
import type { M3UChannel } from '../../lib/m3uCore';

/**
 * عامر IPTV built-in Live TV playlist ("قنوات عامر المباشرة").
 *
 * The playlist is a separate file packaged in the Amer APK only:
 *   android/app/src/amer/assets/playlists/amer-default.m3u
 * (Gradle merges src/amer/assets into the amer flavor; Full and Lite do not
 * contain it). To update it, replace that file and build a new APK
 * (docs/AMER_BUILT_IN_PLAYLIST.md). No channel data lives in source files.
 *
 * It is read-only application content: read through the same native chunked
 * reader as imported files (PlaylistPickerModule, asset:// scheme) and parsed
 * by the same M3U parser, off the UI thread in chunks, into memory. It is not
 * copied to user storage. The parsed result is kept for the app session so
 * switching back to it does not parse again.
 *
 * Its source string is what the source store (connectionSession) keeps when
 * the user explicitly picks it; with nothing saved (a fresh install) it is the
 * default source. Stream URLs are never logged.
 */
export const AMER_BUILT_IN_SOURCE = 'asset:///playlists/amer-default.m3u';

export const AMER_BUILT_IN_LABEL = { ar: 'قنوات عامر المباشرة', en: 'Amer Live TV' } as const;

export function isBuiltInSource(source: string | null | undefined): boolean {
  return (source || '').trim() === AMER_BUILT_IN_SOURCE;
}

/** Thrown when the packaged playlist cannot be read or has no channels. */
export class BuiltInPlaylistError extends Error {
  readonly code = 'BUILT_IN_UNAVAILABLE';
  constructor(cause?: unknown) {
    // Only the error kind, never playlist content.
    super(`The built-in playlist could not be loaded (${cause instanceof Error ? cause.name : 'unknown'}).`);
    this.name = 'BuiltInPlaylistError';
    // Kept for debugging but not enumerable, so logging this error never expands it.
    Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}

let session: Promise<M3UChannel[]> | null = null;

/**
 * Reads and parses the built-in playlist once per app session. Every entry is
 * a live channel (allLive). Zero channels is an error, never an empty Live TV.
 */
export function loadBuiltInPlaylist(onChannelCount?: (count: number) => void): Promise<M3UChannel[]> {
  if (!session) {
    const run = (async () => {
      let channels: M3UChannel[];
      try {
        channels = await loadLocalPlaylist(AMER_BUILT_IN_SOURCE, undefined, onChannelCount, { liveOnly: true, allLive: true });
      } catch (error) {
        throw new BuiltInPlaylistError(error);
      }
      if (!channels.length) throw new BuiltInPlaylistError(new NoLiveChannelsError());
      return channels;
    })();
    session = run;
    // A failure is not cached: "إعادة المحاولة" reads the asset again.
    run.catch(() => {
      if (session === run) session = null;
    });
  }
  return session;
}

/** Tests: forget the session cache. */
export function resetBuiltInPlaylistCache(): void {
  session = null;
}
