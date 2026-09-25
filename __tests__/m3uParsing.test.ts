import ReactNativeBlobUtil from 'react-native-blob-util';

import { createM3UTextParser, downloadAndParseM3U, isLocalPlaylistSource } from '../src/lib/m3u';

const fs = ReactNativeBlobUtil.fs as any;
const files: Map<string, string> = fs.__files;

const PLAYLIST = [
  '#EXTM3U x-tvg-url="http://epg.example/guide.xml"',
  '#EXTINF:-1 tvg-id="mbc1.ae" tvg-name="MBC 1" tvg-logo="http://logo/mbc1.png" group-title="قنوات عربية",MBC 1 HD',
  'http://stream.example/live/1.ts',
  '#EXTINF:-1 tvg-logo="http://logo/j.png" group-title="رياضة",الجزيرة الرياضية',
  '#EXTVLCOPT:http-user-agent=Mozilla',
  'http://stream.example/live/2.ts',
  '# a comment line',
  'http://stream.example/orphan-url-without-extinf.ts',
  '#EXTINF:-1 group-title="أفلام",فيلم الرسالة (1976)',
  'http://stream.example/movie/3.mp4',
  '#EXTINF:-1 group-title="مسلسلات رمضان",باب الحارة S01E05',
  'http://stream.example/series/4.mkv',
  '#EXTINF:-1 group-title="Broken",Entry without a URL',
  '',
  '#EXTINF:-1,No attributes at all',
  'http://stream.example/live/5.ts',
].join('\r\n');

function parseInChunks(text: string, chunk: number, options = {}) {
  const parser = createM3UTextParser(options);
  for (let i = 0; i < text.length; i += chunk) parser.push(text.slice(i, i + chunk));
  return parser.end();
}

describe('M3U text parser', () => {
  it('parses names, groups, logos and ids, including Arabic metadata', () => {
    const channels = parseInChunks(PLAYLIST, PLAYLIST.length);
    expect(channels.map(c => c.name)).toEqual([
      'MBC 1 HD',
      'الجزيرة الرياضية',
      'فيلم الرسالة (1976)',
      'باب الحارة S01E05',
      'No attributes at all',
    ]);
    expect(channels[0]).toMatchObject({
      group: 'قنوات عربية',
      logo: 'http://logo/mbc1.png',
      tvgId: 'mbc1.ae',
      tvgName: 'MBC 1',
      url: 'http://stream.example/live/1.ts',
      contentType: 'live',
    });
    expect(channels[1].group).toBe('رياضة');
    expect(channels[2].contentType).toBe('movie');
    expect(channels[3].contentType).toBe('series');
    expect(channels[4]).toMatchObject({ group: '', logo: '', contentType: 'live' });
  });

  it('skips malformed entries: URLs without #EXTINF and #EXTINF without a URL', () => {
    const channels = parseInChunks(PLAYLIST, 64);
    expect(channels.some(c => c.url.includes('orphan'))).toBe(false);
    expect(channels.some(c => c.name === 'Entry without a URL')).toBe(false);
  });

  it('gives the same result whatever the chunk size (lines and Arabic split across chunks)', () => {
    const whole = parseInChunks(PLAYLIST, PLAYLIST.length);
    for (const size of [1, 3, 7, 50]) {
      expect(parseInChunks(PLAYLIST, size)).toEqual(whole);
    }
  });

  it('liveOnly keeps live channels only', () => {
    const channels = parseInChunks(PLAYLIST, 20, { liveOnly: true });
    expect(channels.map(c => c.contentType)).toEqual(['live', 'live', 'live']);
  });

  it('assigns stable, unique ids', () => {
    const a = parseInChunks(PLAYLIST, 5);
    const b = parseInChunks(PLAYLIST, 11);
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
    expect(new Set(a.map(c => c.id)).size).toBe(a.length);
  });

  it('handles a large playlist in one streaming pass', () => {
    const lines = ['#EXTM3U'];
    for (let i = 0; i < 50000; i += 1) {
      lines.push(`#EXTINF:-1 tvg-logo="http://l/${i}.png" group-title="مجموعة ${i % 200}",قناة ${i}`, `http://s/${i}.ts`);
    }
    const text = lines.join('\n');
    const counts: number[] = [];
    const parser = createM3UTextParser({}, count => counts.push(count));
    const started = Date.now();
    for (let i = 0; i < text.length; i += 256 * 1024) parser.push(text.slice(i, i + 256 * 1024));
    const channels = parser.end();
    expect(channels).toHaveLength(50000);
    expect(channels[49999]).toMatchObject({ name: 'قناة 49999', group: 'مجموعة 199', url: 'http://s/49999.ts' });
    expect(counts[counts.length - 1]).toBe(50000); // progress reported
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('flags text that is not a playlist', () => {
    const parser = createM3UTextParser();
    parser.push('<html><body>Not found</body></html>');
    expect(parser.end()).toEqual([]);
    expect(parser.looksLikeM3U()).toBe(false);
  });
});

describe('local playlist files (content:// URIs)', () => {
  beforeEach(() => files.clear());

  it('recognises picked documents as local sources', () => {
    expect(isLocalPlaylistSource('content://com.android.providers.downloads/document/42')).toBe(true);
    expect(isLocalPlaylistSource('file:///sdcard/list.m3u')).toBe(true);
    expect(isLocalPlaylistSource('http://example.com/list.m3u')).toBe(false);
  });

  it('streams the file from its URI into the same model as URL playlists', async () => {
    const uri = 'content://com.android.externalstorage.documents/document/primary%3Alist.m3u';
    files.set(uri, PLAYLIST);
    const progress: Array<[number, number]> = [];
    const channels = await downloadAndParseM3U(uri, (r, t) => progress.push([r, t]), undefined, { sizeHint: PLAYLIST.length });
    expect(channels).toEqual(parseInChunks(PLAYLIST, PLAYLIST.length));
    expect(progress[0]).toEqual([0, PLAYLIST.length]);
    expect(progress[progress.length - 1]).toEqual([PLAYLIST.length, PLAYLIST.length]);
    // Streamed, not read whole.
    expect(fs.readFile).not.toHaveBeenCalledWith(uri, expect.anything());
  });

  it('rejects a file that is not an M3U playlist', async () => {
    const uri = 'content://docs/not-a-playlist.txt';
    files.set(uri, 'hello world\nthis is text');
    await expect(downloadAndParseM3U(uri)).rejects.toMatchObject({ name: 'PlaylistFormatError' });
  });

  it('reports a read error when access to the file is gone', async () => {
    await expect(downloadAndParseM3U('content://docs/removed.m3u')).rejects.toThrow(/Permission Denial/);
  });

  it('liveOnly applies to imported files too', async () => {
    const uri = 'content://docs/list.m3u';
    files.set(uri, PLAYLIST);
    const channels = await downloadAndParseM3U(uri, undefined, undefined, { liveOnly: true });
    expect(channels.every(c => c.contentType === 'live')).toBe(true);
  });
});

describe('Xtream loading for Lite', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests live data only when liveOnly is set', async () => {
    const actions: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      const action = /action=([a-z_]+)/.exec(url)?.[1] || '';
      actions.push(action);
      const body = action === 'get_live_streams' ? [{ stream_id: 7, name: 'قناة', category_id: '1' }] : action === 'get_live_categories' ? [{ category_id: '1', category_name: 'عام' }] : [];
      return { ok: true, json: async () => body } as any;
    }) as any;
    const channels = await downloadAndParseM3U('http://srv:8080/get.php?username=u&password=p&type=m3u_plus', undefined, undefined, { liveOnly: true });
    expect(actions.sort()).toEqual(['get_live_categories', 'get_live_streams']);
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ contentType: 'live', group: 'عام', url: 'http://srv:8080/live/u/p/7.ts' });
  });
});

describe('Xtream: Lite is live-only, Full keeps VOD', () => {
  const originalFetch = globalThis.fetch;
  const SOURCE = 'http://srv:8080/get.php?username=u&password=p&type=m3u_plus';
  let actions: string[] = [];
  const BODIES: Record<string, unknown[]> = {
    get_live_categories: [{ category_id: '1', category_name: 'عام' }],
    get_live_streams: [{ stream_id: 7, name: 'قناة', category_id: '1' }],
    get_vod_categories: [{ category_id: '2', category_name: 'أفلام' }],
    get_vod_streams: [{ stream_id: 8, name: 'فيلم', category_id: '2', container_extension: 'mp4' }],
    get_series_categories: [{ category_id: '3', category_name: 'مسلسلات' }],
    get_series: [{ series_id: 9, name: 'مسلسل', category_id: '3' }],
  };
  beforeEach(() => {
    actions = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      const action = /action=([a-z_]+)/.exec(url)?.[1] || '';
      actions.push(action);
      return { ok: true, json: async () => BODIES[action] || [] } as any;
    }) as any;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('the Lite edition (no VOD loader) makes no movie or series request', async () => {
    const channels = await downloadAndParseM3U(SOURCE, undefined, undefined, { liveOnly: true });
    expect(actions.sort()).toEqual(['get_live_categories', 'get_live_streams']);
    expect(channels.map(c => c.contentType)).toEqual(['live']);
  });

  it('without a VOD loader even a non-liveOnly load stays live (VOD code lives only in the Full bundle)', async () => {
    const channels = await downloadAndParseM3U(SOURCE);
    expect(actions.sort()).toEqual(['get_live_categories', 'get_live_streams']);
    expect(channels.every(c => c.contentType === 'live')).toBe(true);
  });

  it('the Full edition still loads movies and series', async () => {
    const { loadXtreamVod } = require('../src/lib/xtreamVod');
    const channels = await downloadAndParseM3U(SOURCE, undefined, undefined, { loadVod: loadXtreamVod });
    expect(actions.sort()).toEqual([
      'get_live_categories',
      'get_live_streams',
      'get_series',
      'get_series_categories',
      'get_vod_categories',
      'get_vod_streams',
    ]);
    expect(new Set(channels.map(c => c.contentType))).toEqual(new Set(['live', 'movie', 'series']));
  });
});

describe('Lite storage keeps no VOD', () => {
  const { buildCatalog } = require('../src/features/catalog/catalog');
  const { saveLibraryCache } = require('../src/features/catalog/catalogCache');
  const { indexMedia } = require('../src/features/catalog/mediaCatalog');

  beforeEach(() => files.clear());

  it('a plain M3U playlist in Lite yields a live-only catalog', () => {
    const channels = parseInChunks(PLAYLIST, 5, { liveOnly: true });
    expect(channels.length).toBeGreaterThan(0);
    expect(channels.every((c: any) => c.contentType === 'live')).toBe(true);
    const catalog = buildCatalog(channels, { liveOnly: true });
    expect(catalog.movies).toEqual([]);
    expect(catalog.series).toEqual([]);
    expect(catalog.all.every((c: any) => c.contentType === 'live')).toBe(true);
  });

  it('Lite indexing drops VOD rows even if a mixed list reaches it; Full indexes them', () => {
    const mixed = parseInChunks(PLAYLIST, PLAYLIST.length);
    expect(mixed.some((c: any) => c.contentType !== 'live')).toBe(true);
    const lite = buildCatalog(mixed, { liveOnly: true });
    expect([...lite.byKey.keys()].every(k => k.startsWith('live:'))).toBe(true);
    expect(lite.movies.length + lite.series.length).toBe(0);
    const full = buildCatalog(mixed, { indexMedia });
    expect(full.movies.length).toBeGreaterThan(0);
    expect(full.series.length).toBeGreaterThan(0);
  });

  it('the Lite library cache on disk holds live rows only', async () => {
    const mixed = parseInChunks(PLAYLIST, PLAYLIST.length);
    const lite = buildCatalog(mixed, { liveOnly: true });
    // What useLibrarySession persists for Lite: the catalog's live channels.
    await saveLibraryCache('http://srv/get.php?username=u&password=p', { baseUrl: 'http://srv', username: 'u', password: 'p' }, lite.live, true);
    const stored = [...files.entries()].find(([key]) => key.endsWith('shashtna-library-cache.json'));
    expect(stored).toBeDefined();
    const rows = JSON.parse(stored![1]).rows as unknown[][];
    expect(rows.length).toBe(lite.live.length);
    expect(rows.every(r => r[0] === 0)).toBe(true); // 0 = live
    expect(stored![1]).not.toMatch(/movie|series|الرسالة|باب الحارة/);
  });
});
