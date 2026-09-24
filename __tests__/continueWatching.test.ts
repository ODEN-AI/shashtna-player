import { M3UChannel } from '../src/lib/m3u';

// Each test re-requires the store (fresh module state); read the mock file
// system from the same module registry the store uses.
let files: Map<string, string>;
const FILE = '/docs/shashtna-continue-watching.json';

const movie = (over: Partial<M3UChannel> = {}): M3UChannel => ({
  id: 'm1',
  name: 'Movie',
  group: '',
  url: 'http://srv:80/movie/bob/s3cret/m1.mp4',
  logo: '',
  tvgId: '',
  tvgName: '',
  contentType: 'movie',
  ...over,
});

beforeEach(() => {
  jest.resetModules();
  files = require('react-native-blob-util').default.fs.__files;
  files.clear();
});

test('never persists stream URLs (they embed credentials)', async () => {
  jest.useFakeTimers();
  const store = require('../src/features/continueWatching/continueWatchingStore');
  await store.ensureContinueWatchingLoaded();
  store.recordProgress(movie(), 120, 3600);
  jest.runAllTimers();
  jest.useRealTimers();
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  const saved = files.get(FILE) as string;
  expect(saved).toBeDefined();
  expect(saved).not.toContain('s3cret');
  expect(store.getProgress(movie())?.position).toBe(120);
});

test('scrubs URLs from files written by earlier versions', async () => {
  files.set(FILE, JSON.stringify([{ key: 'movie:m1', item: movie(), position: 90, duration: 3600, updatedAt: 1 }]));
  jest.useFakeTimers();
  const store = require('../src/features/continueWatching/continueWatchingStore');
  await store.ensureContinueWatchingLoaded();
  jest.runAllTimers();
  jest.useRealTimers();
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(files.get(FILE)).not.toContain('s3cret');
  expect(store.getResumePosition(movie())).toBe(90);
});

test('keeps internal series detail links', () => {
  const { stripStreamUrl } = require('../src/features/continueWatching/continueWatchingStore');
  const parent = movie({ id: 's1', contentType: 'series', url: 'shashtna-series-detail://42' });
  expect(stripStreamUrl(parent).url).toBe('shashtna-series-detail://42');
});
