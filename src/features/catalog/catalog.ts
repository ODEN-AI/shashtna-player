import type { M3UChannel } from '../../lib/m3uCore';

/**
 * Catalog: every index the browse screens need, built ONCE per loaded source.
 *
 * Before this module each screen re-derived its own data from the raw channel
 * array on every mount (and some on every render): App counted movies and
 * series with a regex title cleaner, Home re-cleaned every title, Movies and
 * Series rebuilt their lists and groups, Favorites rebuilt both again, and
 * Live TV filtered the full live array on every category change. With large
 * sources that is hundreds of thousands of regex replaces per navigation.
 *
 * Now a single pass produces:
 * - live channels, their groups and a group -> channels index;
 * - movie and series cards (series episodes merged by title), their groups
 *   and group -> cards indexes;
 * - a lowercase search key per entry, computed once instead of per keystroke;
 * - a key -> entry map for favorites and resume lookups.
 *
 * Screens only read from it; changing category is a Map lookup.
 */

export type MediaKind = 'movie' | 'series';

export type CatalogItem = {
  /** Favorites / identity key: `${type}:${id}`. */
  key: string;
  channel: M3UChannel;
  type: MediaKind;
  /** Display title with release tags removed. */
  title: string;
  group: string;
  /** Series from plain M3U lists have one entry per episode; they are merged. */
  episodeCount: number;
  /** Lowercase `title group`, used by search. */
  search: string;
  /** Title has no Arabic letters (Home matches these against TMDB). */
  foreign: boolean;
};

export type CatalogGroup = { key: string; label: string; count: number };

export type Catalog = {
  /** Increments for every build; lets memoised consumers key on it. */
  version: number;
  all: M3UChannel[];
  live: M3UChannel[];
  liveGroups: CatalogGroup[];
  liveByGroup: Map<string, M3UChannel[]>;
  /** channel id -> lowercase `name group` for live search. */
  liveSearch: Map<string, string>;
  movies: CatalogItem[];
  movieGroups: CatalogGroup[];
  moviesByGroup: Map<string, CatalogItem[]>;
  series: CatalogItem[];
  seriesGroups: CatalogGroup[];
  seriesByGroup: Map<string, CatalogItem[]>;
  /** `${contentType}:${id}` -> channel, for every entry (live, movie, series). */
  byKey: Map<string, M3UChannel>;
  /** `${type}:${id}` -> movie/series card. */
  itemsByKey: Map<string, CatalogItem>;
};

export const ALL_GROUP = '__all__';

export const channelKey = (channel: M3UChannel) => `${channel.contentType}:${String(channel.id)}`;

/** Internal state while a catalog is built (used by media indexers). */
export type Builder = {
  catalog: Catalog;
  seriesByTitle: Map<string, CatalogItem>;
  groupCounts: { live: Map<string, number>; movie: Map<string, number>; series: Map<string, number> };
};

let versionCounter = 0;

function createBuilder(all: M3UChannel[]): Builder {
  versionCounter += 1;
  return {
    catalog: {
      version: versionCounter,
      all,
      live: [],
      liveGroups: [],
      liveByGroup: new Map(),
      liveSearch: new Map(),
      movies: [],
      movieGroups: [],
      moviesByGroup: new Map(),
      series: [],
      seriesGroups: [],
      seriesByGroup: new Map(),
      byKey: new Map(),
      itemsByKey: new Map(),
    },
    seriesByTitle: new Map(),
    groupCounts: { live: new Map(), movie: new Map(), series: new Map() },
  };
}

export function pushToGroup<T>(index: Map<string, T[]>, group: string, value: T) {
  const bucket = index.get(group);
  if (bucket) bucket.push(value);
  else index.set(group, [value]);
}

function addChannel(b: Builder, channel: M3UChannel, media?: MediaIndexer) {
  const c = b.catalog;
  c.byKey.set(channelKey(channel), channel);
  const group = String(channel.group || '').trim();

  if (channel.contentType === 'live') {
    c.live.push(channel);
    c.liveSearch.set(String(channel.id), `${channel.name} ${group}`.toLowerCase());
    if (group) {
      pushToGroup(c.liveByGroup, group, channel);
      b.groupCounts.live.set(group, (b.groupCounts.live.get(group) || 0) + 1);
    }
    return;
  }

  // Movies / series are indexed only when the edition supplies an indexer
  // (Full: mediaCatalog.ts). Lite has none, so its bundle has no VOD indexing.
  if (media) media(b, channel, group);
}

const toGroups = (counts: Map<string, number>): CatalogGroup[] =>
  Array.from(counts, ([name, count]) => ({ key: name, label: name, count }));

function finish(b: Builder): Catalog {
  const c = b.catalog;
  c.liveGroups = toGroups(b.groupCounts.live);
  c.movieGroups = toGroups(b.groupCounts.movie);
  c.seriesGroups = toGroups(b.groupCounts.series);
  return c;
}

/** Adds one movie/series entry to the catalog being built. */
export type MediaIndexer = (b: Builder, channel: M3UChannel, group: string) => void;

export type CatalogOptions = {
  /** Keep live channels only (Lite). */
  liveOnly?: boolean;
  /** Movie/series indexing (Full: indexMedia from mediaCatalog.ts). */
  indexMedia?: MediaIndexer;
};

/** Synchronous build (tests, small sources). */
export function buildCatalog(channels: M3UChannel[], options: CatalogOptions = {}): Catalog {
  const b = createBuilder(channels);
  for (const channel of channels) {
    if (options.liveOnly && channel.contentType !== 'live') continue;
    addChannel(b, channel, options.indexMedia);
  }
  return finish(b);
}

/**
 * Same result as buildCatalog, but yields to the event loop every `chunk`
 * entries so touch/remote input and the loading indicator stay responsive
 * while a large source is indexed.
 */
export async function buildCatalogAsync(
  channels: M3UChannel[],
  options: CatalogOptions & { chunk?: number } = {},
): Promise<Catalog> {
  const chunk = options.chunk ?? 4000;
  const b = createBuilder(channels);
  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index];
    if (!(options.liveOnly && channel.contentType !== 'live')) addChannel(b, channel, options.indexMedia);
    if (index > 0 && index % chunk === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  return finish(b);
}

export function emptyCatalog(): Catalog {
  return finish(createBuilder([]));
}
