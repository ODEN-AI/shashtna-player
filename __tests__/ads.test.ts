import ReactNativeBlobUtil from 'react-native-blob-util';

import {
  LocalAdvertisementRepository,
  readCachedAdvertisements,
  RemoteAdvertisementRepository,
} from '../src/features/ads/advertisementRepository';

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;

const local = new LocalAdvertisementRepository([
  { id: 'local', title: { ar: 'محلي', en: 'Local' }, description: { ar: '', en: '' }, action: { type: 'none' }, order: 1, active: true },
]);

const remotePayload = {
  advertisements: [
    { id: 'b', title: { ar: 'ب', en: 'B' }, priority: 1, actionType: 'movies' },
    { id: 'a', title: 'Promo', priority: 5, actionType: 'liveCategory', actionTarget: 'Sports' },
    { id: 'x', title: 'Bad link', actionType: 'external', actionTarget: 'javascript:alert(1)' },
    { id: 'old', title: 'Expired', endsAt: '2000-01-01T00:00:00Z' },
    { title: 'missing id' },
  ],
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
beforeEach(() => files.clear());

test('remote list is parsed, prioritised, validated and cached', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => remotePayload })) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();

  expect(ads.map(ad => ad.id)).toEqual(['a', 'b', 'x']);
  expect(ads[0].action).toEqual({ type: 'liveCategory', group: 'Sports' });
  expect(ads[1].action).toEqual({ type: 'navigate', page: 'movies' });
  expect(ads[2].action).toEqual({ type: 'none' }); // non-http link rejected
  expect((await readCachedAdvertisements()).map(ad => ad.id)).toEqual(['a', 'b', 'x']);
});

test('offline: falls back to the cached list', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => remotePayload })) as any;
  await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();

  global.fetch = jest.fn(async () => {
    throw new Error('Network request failed');
  }) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();
  expect(ads[0].id).toBe('a');
});

test('offline without cache: falls back to bundled ads', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();
  expect(ads.map(ad => ad.id)).toEqual(['local']);
});
