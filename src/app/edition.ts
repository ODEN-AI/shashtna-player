import type { MediaIndexer } from '../features/catalog/catalog';
import type { XtreamVodLoader } from '../lib/m3u';
import type { M3UChannel } from '../lib/m3uCore';

/**
 * What a product edition loads. Each root defines its own:
 * - Full (App.tsx): live + movies + series, with the Xtream VOD loader.
 * - Lite (src/variants/lite/LiteApp.tsx): live only, no VOD loader, so the
 *   VOD request code is not even part of the Lite bundle.
 * Shared code (session, connection screen) only ever receives this object.
 */
/** The "M3U link" sign-in method (src/screens/Connection/playlistLink.ts); Full only. */
export type PlaylistLinkMethod = {
  tabLabel: (ar: boolean) => string;
  subtitle: (ar: boolean) => string;
  fieldLabel: (ar: boolean) => string;
  placeholder: string;
  /** Normalised, validated playlist URL; throws a ValidationError otherwise. */
  resolve: (value: string, ar: boolean) => string;
};

/** A playlist packaged with the app, offered as the first sign-in method (عامر IPTV). */
export type BuiltInSourceMethod = {
  /** The source string saved when the user picks it (e.g. asset:///playlists/…). */
  source: string;
  tabLabel: (ar: boolean) => string;
  description: (ar: boolean) => string;
  /** Reads and parses it (cached per session); throws when it is unusable. */
  load: (onChannelCount?: (count: number) => void) => Promise<M3UChannel[]>;
  /** Shown when it cannot be loaded (no technical detail). */
  errorMessage: (ar: boolean) => string;
};

export type Edition = {
  id: 'full' | 'lite' | 'amer';
  /** Drop movie/series entries while parsing M3U playlists. */
  liveOnly: boolean;
  /** Xtream movies/series loader; absent in Lite. */
  loadVod?: XtreamVodLoader;
  /** Movie/series catalog indexing; absent in Lite. */
  indexMedia?: MediaIndexer;
  /** Sign-in with an M3U playlist link; absent in Lite (local M3U file only). */
  playlistLink?: PlaylistLinkMethod;
  /** Load a picked M3U file right away instead of waiting for Sign in (عامر IPTV). */
  importFileOnPick?: boolean;
  /** A built-in playlist offered before account and file (عامر IPTV). */
  builtIn?: BuiltInSourceMethod;
};
