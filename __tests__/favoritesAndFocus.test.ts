import {
  __resetFavoritesForTests,
  ensureFavoritesLoaded,
  isFavorite,
  loadFavorites,
  toggleFavorite,
} from '../src/features/favorites/favoritesStore';
import { liveGridColumns, MIN_LIVE_CARD_WIDTH } from '../src/components/common/posterGrid';
import { initialRowFor, screenMemory } from '../src/navigation/tvFocus';
import ReactNativeBlobUtil from 'react-native-blob-util';

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;

describe('favorites store', () => {
  beforeEach(() => {
    files.clear();
    __resetFavoritesForTests();
    jest.useRealTimers();
  });

  it('toggles keys and persists them after loading', async () => {
    await ensureFavoritesLoaded();
    toggleFavorite('live:1');
    toggleFavorite('movie:2');
    toggleFavorite('live:1');
    expect(isFavorite('live:1')).toBe(false);
    expect(isFavorite('movie:2')).toBe(true);
    await new Promise<void>(resolve => setTimeout(resolve, 500)); // debounced write
    expect(await loadFavorites()).toEqual(['movie:2']);
  });

  it('keeps and saves toggles made before the file finished loading', async () => {
    toggleFavorite('series:9');
    await ensureFavoritesLoaded();
    expect(isFavorite('series:9')).toBe(true);
    await new Promise<void>(resolve => setTimeout(resolve, 500));
    expect(await loadFavorites()).toContain('series:9');
  });
});

describe('TV focus helpers', () => {
  it('opens a grid at the row of the remembered item', () => {
    expect(initialRowFor(-1, 5)).toBeUndefined();
    expect(initialRowFor(0, 5)).toBeUndefined();
    expect(initialRowFor(4, 5)).toBe(0);
    expect(initialRowFor(5, 5)).toBe(1);
    expect(initialRowFor(23, 2)).toBe(11);
  });

  it('screen memory survives unmounts and merges patches', () => {
    screenMemory.clear();
    screenMemory.set('library:movie', { group: 'Action', sort: 'az' });
    screenMemory.set('library:movie', { focusKey: 'movie:7' });
    expect(screenMemory.get('library:movie')).toEqual({ group: 'Action', sort: 'az', focusKey: 'movie:7' });
    expect(screenMemory.get('live')).toEqual({});
    screenMemory.clear('library:movie');
    expect(screenMemory.get('library:movie')).toEqual({});
  });

  it('live grid columns follow the available width and keep names readable', () => {
    expect(liveGridColumns(390, 'phone')).toBe(1);
    expect(liveGridColumns(0, 'tv')).toBe(2);
    // 960x540 TV: ~500 dp next to the category pane.
    expect(liveGridColumns(500, 'tv')).toBe(1);
    expect(liveGridColumns(530, 'tv')).toBe(2);
    expect(liveGridColumns(1200, 'tablet')).toBe(4);
    for (const width of [300, 530, 800, 1100]) {
      const cols = liveGridColumns(width, 'tv');
      expect((width - (cols - 1) * 14) / cols).toBeGreaterThanOrEqual(MIN_LIVE_CARD_WIDTH);
    }
  });
});
