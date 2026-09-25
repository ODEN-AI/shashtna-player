import ReactNativeBlobUtil from 'react-native-blob-util';

import { ALL_GROUP, buildCatalog as buildCatalogCore, buildCatalogAsync as buildCatalogAsyncCore, CatalogOptions } from '../src/features/catalog/catalog';
import { cleanMediaTitle, indexMedia } from '../src/features/catalog/mediaCatalog';

// Full edition catalog (with movie/series indexing), as App.tsx builds it.
const buildCatalog = (list: M3UChannel[], options: CatalogOptions = {}) => buildCatalogCore(list, { indexMedia, ...options });
const buildCatalogAsync = (list: M3UChannel[], options: CatalogOptions & { chunk?: number } = {}) => buildCatalogAsyncCore(list, { indexMedia, ...options });
import { CACHE_TTL_MS, fingerprint, fromRows, loadLibraryCache, saveLibraryCache, toRows } from '../src/features/catalog/catalogCache';
import { createSearcher, sortedByTitle } from '../src/features/catalog/search';
import { M3UChannel } from '../src/lib/m3u';

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;

let n = 0;
function ch(contentType: M3UChannel['contentType'], name: string, group: string, extra: Partial<M3UChannel> = {}): M3UChannel {
  n += 1;
  return { id: `${contentType}-${n}`, name, group, url: `http://s/${n}`, logo: '', tvgId: '', tvgName: '', contentType, ...extra };
}

const channels: M3UChannel[] = [
  ch('live', 'MBC 1', 'عربي'),
  ch('live', 'Al Jazeera', 'أخبار'),
  ch('live', 'Sky News', 'أخبار '),
  ch('live', 'No Group', ''),
  ch('movie', 'Dune Part Two (2024) [1080p] WEB-DL', 'Action'),
  ch('movie', 'الرسالة 1976 HD', 'عربي'),
  ch('movie', 'Arrival 2016', 'Sci-Fi'),
  ch('series', 'Dark S01E01', 'Netflix', { logo: '' }),
  ch('series', 'Dark S01E02', 'Netflix', { logo: 'http://img/dark.jpg' }),
  ch('series', 'باب الحارة S01E01', 'رمضان'),
];

describe('catalog', () => {
  const catalog = buildCatalog(channels);

  it('splits live, movies and series once, with counts per group', () => {
    expect(catalog.live).toHaveLength(4);
    expect(catalog.movies).toHaveLength(3);
    expect(catalog.series).toHaveLength(2); // episodes merged by title
    expect(catalog.liveGroups).toEqual([
      { key: 'عربي', label: 'عربي', count: 1 },
      { key: 'أخبار', label: 'أخبار', count: 2 }, // trailing space trimmed into the same group
    ]);
    expect(catalog.movieGroups.map(g => g.key)).toEqual(['Action', 'عربي', 'Sci-Fi']);
  });

  it('indexes categories so changing one is a lookup', () => {
    expect(catalog.liveByGroup.get('أخبار')!.map(c => c.name)).toEqual(['Al Jazeera', 'Sky News']);
    expect(catalog.moviesByGroup.get('Action')!.map(i => i.title)).toEqual(['Dune Part Two (2024)']);
    expect(catalog.liveByGroup.has(ALL_GROUP)).toBe(false);
  });

  it('merges series episodes, keeps a card with artwork and counts episodes', () => {
    const dark = catalog.series.find(s => s.title === 'Dark')!;
    expect(dark.episodeCount).toBe(2);
    expect(dark.channel.logo).toBe('http://img/dark.jpg');
  });

  it('cleans titles once and precomputes search keys and TMDB flags', () => {
    expect(cleanMediaTitle('Dune Part Two (2024) [1080p] WEB-DL x264')).toBe('Dune Part Two (2024)');
    const dune = catalog.movies[0];
    expect(dune.search).toBe('dune part two (2024) action');
    expect(dune.foreign).toBe(true);
    expect(catalog.movies[1].foreign).toBe(false);
  });

  it('maps keys for favorites and resume', () => {
    expect(catalog.byKey.get(`live:${channels[0].id}`)).toBe(channels[0]);
    expect(catalog.itemsByKey.get(`movie:${channels[4].id}`)!.title).toBe('Dune Part Two (2024)');
  });

  it('liveOnly drops everything but live channels', () => {
    const lite = buildCatalog(channels, { liveOnly: true });
    expect(lite.live).toHaveLength(4);
    expect(lite.movies).toHaveLength(0);
    expect(lite.series).toHaveLength(0);
    expect(lite.itemsByKey.size).toBe(0);
  });

  it('async build (chunked) gives the same indexes', async () => {
    const asyncCatalog = await buildCatalogAsync(channels, { chunk: 2 });
    expect(asyncCatalog.movies.map(i => i.key)).toEqual(catalog.movies.map(i => i.key));
    expect(asyncCatalog.liveGroups).toEqual(catalog.liveGroups);
    expect(asyncCatalog.version).not.toBe(catalog.version);
  });
});

describe('search and sort', () => {
  const items = Array.from({ length: 2000 }, (_, i) => ({ id: i, search: `title ${i} ${i % 3 ? 'drama' : 'storm'}` }));

  it('incremental search matches a full scan for every prefix', () => {
    const search = createSearcher<{ id: number; search: string }>(x => x.search);
    for (const q of ['s', 'st', 'sto', 'storm', 'storm', 'sto', 'title 1', '']) {
      const expected = q ? items.filter(x => x.search.includes(q.toLowerCase())) : items;
      expect(search(items, q)).toEqual(expected);
    }
  });

  it('does not reuse results across different lists', () => {
    const search = createSearcher<{ id: number; search: string }>(x => x.search);
    const other = items.slice(0, 10);
    search(items, 'st');
    expect(search(other, 'sto')).toEqual(other.filter(x => x.search.includes('sto')));
  });

  it('empty query returns the list itself (no copy)', () => {
    const search = createSearcher<{ id: number; search: string }>(x => x.search);
    expect(search(items, '   ')).toBe(items);
  });

  it('sorts A-Z once per list and serves the cached order afterwards', () => {
    const list = [{ t: 'zeta' }, { t: 'Alpha' }, { t: 'بيت' }, { t: 'beta' }, { t: 'أمل' }];
    const first = sortedByTitle(list, x => x.t);
    // Arabic first (the app's primary language), then Latin; case-insensitive.
    expect(first.map(x => x.t)).toEqual(['أمل', 'بيت', 'Alpha', 'beta', 'zeta']);
    expect(sortedByTitle(list, x => x.t)).toBe(first);
    expect(list[0].t).toBe('zeta'); // original untouched
  });
});

describe('library cache', () => {
  const session = { baseUrl: 'http://srv:8080', username: 'user name', password: 'p@ss/word' };
  const secret = `/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/`;
  const source = `http://srv:8080/get.php?username=${encodeURIComponent(session.username)}&password=${encodeURIComponent(session.password)}`;
  const xtream: M3UChannel[] = [
    { id: 'xtream-live:1', name: 'قناة', group: 'عام', url: `http://srv:8080/live${secret}1.ts`, logo: '', tvgId: 'a', tvgName: '', contentType: 'live' },
    { id: 'xtream-movie:2', name: 'Film', group: 'Movies', url: `http://srv:8080/movie${secret}2.mp4`, logo: 'http://l', tvgId: '', tvgName: '', contentType: 'movie', contentKey: 'xtream-movie:2' },
    { id: 'xtream-series:3', name: 'Show', group: 'S', url: '', logo: '', tvgId: '', tvgName: '', contentType: 'series', contentKey: 'xtream-series:3' },
    { id: 'xtream-live:4', name: 'Direct', group: 'عام', url: 'http://cdn.other/stream.m3u8', logo: '', tvgId: '', tvgName: '', contentType: 'live' },
  ];

  beforeEach(() => files.clear());

  it('round-trips channels and never stores the credentials', () => {
    const rows = toRows(xtream, session);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(encodeURIComponent(session.password));
    expect(text).not.toContain(encodeURIComponent(session.username));
    expect(fromRows(rows, session)).toEqual(xtream);
  });

  it('fingerprints do not contain the source', () => {
    expect(fingerprint(source)).not.toContain('word');
    expect(fingerprint(source)).toBe(fingerprint(source));
    expect(fingerprint(source)).not.toBe(fingerprint(`${source}x`));
  });

  it('serves the cache only for the same source, edition and within the TTL', async () => {
    await saveLibraryCache(source, session, xtream, false);
    const saved = [...files.values()].join('');
    expect(saved).not.toContain(encodeURIComponent(session.password));
    expect(await loadLibraryCache(source, session, false)).toEqual(xtream);
    expect(await loadLibraryCache(`${source}&x=1`, session, false)).toBeNull();
    expect(await loadLibraryCache(source, session, true)).toBeNull();
    expect(await loadLibraryCache(source, session, false, Date.now() + CACHE_TTL_MS + 1)).toBeNull();
  });
});
