import type { MediaIndexer } from '../features/catalog/catalog';
import type { XtreamVodLoader } from '../lib/m3u';

/**
 * What a product edition loads. Each root defines its own:
 * - Full (App.tsx): live + movies + series, with the Xtream VOD loader.
 * - Lite (src/variants/lite/LiteApp.tsx): live only, no VOD loader, so the
 *   VOD request code is not even part of the Lite bundle.
 * Shared code (session, connection screen) only ever receives this object.
 */
export type Edition = {
  id: 'full' | 'lite';
  /** Drop movie/series entries while parsing M3U playlists. */
  liveOnly: boolean;
  /** Xtream movies/series loader; absent in Lite. */
  loadVod?: XtreamVodLoader;
  /** Movie/series catalog indexing; absent in Lite. */
  indexMedia?: MediaIndexer;
};
