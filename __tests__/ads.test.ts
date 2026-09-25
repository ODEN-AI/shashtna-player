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

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
beforeEach(() => files.clear());

test('remote list is parsed, prioritised, validated and cached', async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => remotePayload })) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();

  expect(ads.map(ad => ad.id)).toEqual(['a', 'b', 'x']);
  expect(ads[0].action).toEqual({ type: 'liveCategory', group: 'Sports' });
  expect(ads[1].action).toEqual({ type: 'navigate', page: 'movies' });
  expect(ads[2].action).toEqual({ type: 'none' }); // non-http link rejected
  expect((await readCachedAdvertisements()).map(ad => ad.id)).toEqual(['a', 'b', 'x']);
});

test('offline: falls back to the cached list', async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => remotePayload })) as any;
  await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();

  globalThis.fetch = jest.fn(async () => {
    throw new Error('Network request failed');
  }) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();
  expect(ads[0].id).toBe('a');
});

test('offline without cache: falls back to bundled ads', async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();
  expect(ads.map(ad => ad.id)).toEqual(['local']);
});

describe('bundled Shashtna banners', () => {
  const { LOCAL_ADVERTISEMENTS } = require('../src/features/ads/localAdvertisements');
  const { normalizeAdvertisements } = require('../src/features/ads/advertisementRepository');

  test('the three banners show in the agreed order, as finished artwork', () => {
    const ads = normalizeAdvertisements(LOCAL_ADVERTISEMENTS);
    expect(ads.map((ad: any) => ad.id)).toEqual([
      'shashtna-player-launch',
      'shashtna-official-website',
      'subscription-app-coming-soon',
    ]);
    for (const ad of ads) {
      expect(ad.presentation).toBe('artwork');
      expect(ad.image).toBeTruthy();
    }
    expect(ads[0].title.ar).toBe('تم إطلاق تطبيق شاشتنا بلير');
    expect(ads[1].cta.ar).toBe('تصفح موقع شاشتنا');
    expect(ads[2].title.ar).toBe('قريباً — تطبيق شاشتنا');
  });

  test('targets: player ad opens /apps, website ad opens the website, coming soon has none', () => {
    const ads = normalizeAdvertisements(LOCAL_ADVERTISEMENTS);
    expect(ads[0].action).toEqual({ type: 'external', url: 'https://shashtna.netlify.app/apps' });
    expect(ads[1].action).toEqual({ type: 'external', url: 'https://shashtna.netlify.app/' });
    expect(ads[2].action).toEqual({ type: 'none' });
  });

  test('with a website URL, the player ad opens its /apps page and the website ad the home page', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/features/ads/adsConfig', () => ({
        ...jest.requireActual('../src/features/ads/adsConfig'),
        SHASHTNA_WEBSITE_URL: 'https://site.test/',
      }));
      const bundled = require('../src/features/ads/localAdvertisements').LOCAL_ADVERTISEMENTS;
      const byId = Object.fromEntries(bundled.map((ad: any) => [ad.id, ad]));
      expect(byId['shashtna-player-launch'].action).toEqual({ type: 'external', url: 'https://site.test/apps' });
      expect(byId['shashtna-official-website'].action).toEqual({ type: 'external', url: 'https://site.test/' });
      expect(byId['subscription-app-coming-soon'].action).toEqual({ type: 'none' });
    });
    jest.dontMock('../src/features/ads/adsConfig');
  });
});

test('remote ads can be finished banners; without an image they fall back to the regular layout', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      advertisements: [
        { id: 'banner', title: 'Banner', image: 'https://cdn.test/banner.webp', presentation: 'artwork', order: 1 },
        { id: 'no-image', title: 'No image', presentation: 'artwork', order: 2 },
        { id: 'plain', title: 'Plain', order: 3 },
      ],
    }),
  })) as any;
  const ads = await new RemoteAdvertisementRepository('https://example.test/ads.json', local).list();
  expect(ads.map(ad => [ad.id, ad.presentation])).toEqual([
    ['banner', 'artwork'],
    ['no-image', 'overlay'],
    ['plain', 'overlay'],
  ]);
});
