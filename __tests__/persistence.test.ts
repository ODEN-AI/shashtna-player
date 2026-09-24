import ReactNativeBlobUtil from 'react-native-blob-util';

import { loadFavorites, sanitizeFavoriteKeys, saveFavorites } from '../src/features/favorites/favoritesStore';
import { loadAppearance, sanitizeAppearance, saveAppearance } from '../src/features/appearance/appearanceStore';
import { readJsonFile, writeJsonFile } from '../src/lib/jsonFileStore';

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;

beforeEach(() => files.clear());

describe('jsonFileStore', () => {
  test('round-trips and leaves no temp file behind', async () => {
    await writeJsonFile('x.json', { a: 1 });
    expect(await readJsonFile('x.json', null)).toEqual({ a: 1 });
    expect(Array.from(files.keys())).toEqual(['/docs/x.json']);
  });

  test('returns the fallback for corrupt JSON', async () => {
    files.set('/docs/bad.json', '{not json');
    expect(await readJsonFile('bad.json', 'fallback')).toBe('fallback');
  });
});

describe('favorites persistence', () => {
  test('keeps only valid, unique keys', () => {
    expect(sanitizeFavoriteKeys(['movie:1', 'movie:1', 'series:9', 'live:x', 'bogus', 5, null])).toEqual([
      'movie:1',
      'series:9',
      'live:x',
    ]);
    expect(sanitizeFavoriteKeys({ version: 1, keys: ['movie:2'] })).toEqual(['movie:2']);
    expect(sanitizeFavoriteKeys('garbage')).toEqual([]);
  });

  test('survives a save/load cycle (app restart)', async () => {
    jest.useFakeTimers();
    saveFavorites(new Set(['movie:1', 'series:2']));
    saveFavorites(new Set(['movie:1', 'series:2', 'live:7'])); // debounced: last write wins
    jest.runAllTimers();
    jest.useRealTimers();
    await new Promise(resolve => setImmediate(resolve));
    expect(await loadFavorites()).toEqual(['movie:1', 'series:2', 'live:7']);
  });

  test('corrupt file loads as empty instead of crashing', async () => {
    files.set('/docs/shashtna-favorites.json', '<<<');
    expect(await loadFavorites()).toEqual([]);
  });
});

describe('appearance persistence', () => {
  test('sanitizes unknown values to safe defaults', () => {
    expect(sanitizeAppearance({ themeMode: 'neon', accent: 'gold' })).toEqual({
      themeMode: 'dark',
      accent: 'shashtna',
      customAccent: null,
    });
    expect(sanitizeAppearance({ accent: 'custom', customAccent: 'zzz' }).accent).toBe('shashtna');
  });

  test('persists theme and custom accent', async () => {
    await saveAppearance({ themeMode: 'light', accent: 'custom', customAccent: '#FF8800' });
    expect(await loadAppearance()).toEqual({ themeMode: 'light', accent: 'custom', customAccent: '#FF8800' });
  });
});
