/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Shashtna Player Lite must be a Live TV app only. These tests walk the real
 * import graph (relative imports) from each entry file, the same graph Metro
 * bundles, so adding a Home/Movies/Series/VOD import anywhere reachable from
 * the Lite entry fails here instead of silently shipping the Full UI in Lite.
 */

const ROOT = path.resolve(__dirname, '..');
const EXTENSIONS = ['.tsx', '.ts', '.js', '.jsx', '/index.tsx', '/index.ts', '/index.js'];
const IMPORT = /(?:import|export)\s+(type\s+)?(?:[^'"]*?from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveModule(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [path.join(ROOT, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      if (match[1]) continue; // `import type` is erased, never bundled
      const spec = match[2] || match[3];
      if (!spec || !spec.startsWith('.')) continue;
      const target = resolveModule(file, spec);
      if (target) stack.push(target);
    }
  }
  return new Set([...seen].map(f => path.relative(ROOT, f).split(path.sep).join('/')));
}

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Full-only modules: none may be reachable from index.lite.js. */
const FULL_ONLY = [
  'App.tsx',
  'src/screens/Home/HomeScreen.tsx',
  'src/screens/Movies/MoviesScreen.tsx',
  'src/screens/Series/SeriesScreen.tsx',
  'src/screens/Favorites/FavoritesScreen.tsx',
  'src/components/common/MediaLibraryScreen.tsx',
  'src/components/common/posterGrid.ts',
  'src/features/details/MovieDetailsScreen.tsx',
  'src/features/details/SeriesDetailsScreen.tsx',
  'src/features/details/DetailParts.tsx',
  'src/lib/tmdb.ts',
  'src/lib/xtreamVod.ts',
  'src/features/catalog/mediaCatalog.ts',
  'src/features/continueWatching/continueWatchingStore.ts',
  'src/features/ads/HeroCarousel.tsx',
  'src/features/ads/advertisementRepository.ts',
  'src/features/ads/localAdvertisements.ts',
];

describe('Lite entry and import graph', () => {
  const lite = reachable('index.lite.js');
  const full = reachable('index.js');

  it('index.lite.js registers LiteApp, not App.tsx', () => {
    const entry = read('index.lite.js');
    expect(entry).toMatch(/import LiteApp from '\.\/src\/variants\/lite\/LiteApp'/);
    expect(entry).toMatch(/registerComponent\(appName, \(\) => LiteApp\)/);
    expect(entry).not.toMatch(/from '\.\/App'/);
    expect(read('index.js')).toMatch(/import App from '\.\/App'/);
  });

  it('Lite reaches the shared live-TV modules', () => {
    for (const shared of [
      'src/variants/lite/LiteApp.tsx',
      'src/screens/Live/LiveScreen.tsx',
      'src/screens/Player/PlayerScreen.tsx',
      'src/screens/Settings/SettingsScreen.tsx',
      'src/screens/Connection/ConnectionScreen.tsx',
      'src/features/catalog/catalog.ts',
      'src/features/favorites/favoritesStore.ts',
      'src/lib/m3u.ts',
    ]) {
      expect(lite.has(shared)).toBe(true);
    }
  });

  it('Lite cannot reach App, Home, Movies, Series, Favorites page, details, TMDB, ads or VOD modules', () => {
    expect(FULL_ONLY.filter(m => lite.has(m))).toEqual([]);
    expect([...lite].filter(m => /(^|\/)(Home|Movies|Series|details|ads|continueWatching)(\/|$)/.test(m))).toEqual([]);
    expect([...lite].filter(m => m.startsWith('src/assets/ads/'))).toEqual([]);
  });

  it('Full still reaches every VOD module (sanity check of the walker)', () => {
    expect(FULL_ONLY.filter(m => !full.has(m))).toEqual([]);
  });
});

describe('Lite navigation and startup', () => {
  // Loaded lazily so the graph tests above do not depend on React Native mocks.
  const lite = require('../src/variants/lite/LiteApp') as typeof import('../src/variants/lite/LiteApp');

  it('has exactly two destinations: البث المباشر then الإعدادات', () => {
    const ar = lite.getLiteNavItems('ar');
    expect(ar.map(i => i.label)).toEqual(['البث المباشر', 'الإعدادات']);
    expect(ar.map(i => i.id)).toEqual(['live', 'settings']);
    expect(lite.getLiteNavItems('en').map(i => i.label)).toEqual(['Live TV', 'Settings']);
  });

  it('has no Home, Movies, Series or Favorites route', () => {
    const pageType = /export type LitePage = ([^;]+);/.exec(read('src/variants/lite/LiteApp.tsx'))![1];
    expect(pageType).toBe("'live' | 'settings'");
    const ids = lite.getLiteNavItems('ar').map(i => i.id as string);
    for (const banned of ['home', 'movies', 'series', 'favorites']) expect(ids).not.toContain(banned);
  });

  it('starts on Live TV', () => {
    expect(lite.START_PAGE).toBe('live');
  });

  it('the Lite edition is live-only and carries no VOD loader or media indexer', () => {
    expect(lite.LITE_EDITION).toEqual({ id: 'lite', liveOnly: true });
    expect(lite.EDITION_MARKER).toBe('shashtna-edition:lite');
  });
});

describe('Android build wiring', () => {
  const gradle = read('android/app/build.gradle');

  it('keeps the Full applicationId and gives Lite its own id and name', () => {
    expect(gradle).toMatch(/applicationId "com\.shashtnaplayer"/);
    expect(gradle).toMatch(/lite \{[^}]*applicationIdSuffix "\.lite"/s);
    expect(read('android/app/src/lite/res/values/strings.xml')).toContain('<string name="app_name">Shashtna Player Lite</string>');
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Shashtna Player</string>');
  });

  it('points the Lite bundle task at index.lite.js after the React Native plugin configures it', () => {
    // The plugin sets entryFile when it registers createBundle<Variant>JsAndAssets
    // inside its own onVariants callback; only a later onVariants callback
    // + tasks.named().configure runs after that and wins.
    expect(gradle).toMatch(/androidComponents \{\s*onVariants\(selector\(\)\.all\(\)\)/);
    expect(gradle).toMatch(/tasks\.named\(taskName\)\.configure \{[^}]*entryFile\.set\(file\("\.\.\/\.\.\/index\.lite\.js"\)\)/);
  });

  it('fails the build if a bundle has the wrong entry or edition marker', () => {
    expect(gradle).toContain('shashtna-edition:lite');
    expect(gradle).toContain('shashtna-edition:full');
    expect(gradle).toMatch(/expectedEntry = lite \? "index\.lite\.js" : "index\.js"/);
    expect(gradle).toMatch(/throw new GradleException/);
    expect(read('App.tsx')).toContain("EDITION_MARKER = 'shashtna-edition:full'");
  });
});
