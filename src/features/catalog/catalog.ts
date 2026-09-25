import { M3UChannel } from '../../lib/m3u';

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

const TAG_BRACKETS = /\[[^\]]*\]/g;
const TAG_QUALITY = /\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi;
const TAG_RELEASE = /\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi;
const TAG_EPISODE = /\b(?:S\d{1,2}E\d{1,3}|S\d{1,2}|E\d{1,3})\b/gi;
const SEPARATORS = /[_.]+/g;
const SPACES = /\s+/g;
const ARABIC = /[؀-ۿ]/;

/** Display title used by the library cards (same rules the grid always used). */
export function cleanMediaTitle(value: string): string {
  return String(value || '')
    .replace(TAG_BRACKETS, ' ')
    .replace(TAG_QUALITY, ' ')
    .replace(TAG_RELEASE, ' ')
    .replace(TAG_EPISODE, ' ')
    .replace(SEPARATORS, ' ')
    .replace(SPACES, ' ')
    .trim();
}

export const channelKey = (channel: M3UChannel) => `${channel.contentType}:${String(channel.id)}`;

type Builder = {
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

function pushToGroup<T>(index: Map<string, T[]>, group: string, value: T) {
  const bucket = index.get(group);
  if (bucket) bucket.push(value);
  else index.set(group, [value]);
}

function addChannel(b: Builder, channel: M3UChannel) {
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

  const type: MediaKind = channel.contentType;
  const title = cleanMediaTitle(channel.name) || channel.name;

  if (type === 'series') {
    // Plain M3U lists carry one line per episode: merge them into one card.
    const mergeKey = title.toLowerCase();
    const existing = b.seriesByTitle.get(mergeKey);
    if (existing) {
      existing.episodeCount += 1;
      if (!existing.channel.logo && channel.logo) existing.channel = channel;
      return;
    }
    const item = makeItem(channel, type, title, group);
    b.seriesByTitle.set(mergeKey, item);
    c.series.push(item);
    c.itemsByKey.set(item.key, item);
    if (group) {
      pushToGroup(c.seriesByGroup, group, item);
      b.groupCounts.series.set(group, (b.groupCounts.series.get(group) || 0) + 1);
    }
    return;
  }

  const item = makeItem(channel, type, title, group);
  c.movies.push(item);
  c.itemsByKey.set(item.key, item);
  if (group) {
    pushToGroup(c.moviesByGroup, group, item);
    b.groupCounts.movie.set(group, (b.groupCounts.movie.get(group) || 0) + 1);
  }
}

function makeItem(channel: M3UChannel, type: MediaKind, title: string, group: string): CatalogItem {
  return {
    key: `${type}:${String(channel.id)}`,
    channel,
    type,
    title,
    group,
    episodeCount: 1,
    search: `${title} ${group}`.toLowerCase(),
    foreign: !ARABIC.test(title),
  };
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

export type CatalogOptions = {
  /** Lite builds keep live channels only. */
  liveOnly?: boolean;
};

/** Synchronous build (tests, small sources). */
export function buildCatalog(channels: M3UChannel[], options: CatalogOptions = {}): Catalog {
  const b = createBuilder(channels);
  for (const channel of channels) {
    if (options.liveOnly && channel.contentType !== 'live') continue;
    addChannel(b, channel);
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
    if (!(options.liveOnly && channel.contentType !== 'live')) addChannel(b, channel);
    if (index > 0 && index % chunk === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  return finish(b);
}

export function emptyCatalog(): Catalog {
  return finish(createBuilder([]));
}
