/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Shashtna Player Lite must not contain VOD code. These tests walk the real
 * import graph (relative imports) from each entry file, the same graph Metro
 * bundles, so adding a Movies/Series import anywhere reachable from the Lite
 * entry fails here instead of silently growing the Lite APK.
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
  return new Set([...seen].map(f => path.relative(ROOT, f)));
}

const VOD_MODULES = [
  'App.tsx',
  'src/screens/Home/HomeScreen.tsx',
  'src/screens/Movies/MoviesScreen.tsx',
  'src/screens/Series/SeriesScreen.tsx',
  'src/components/common/MediaLibraryScreen.tsx',
  'src/features/details/MovieDetailsScreen.tsx',
  'src/features/details/SeriesDetailsScreen.tsx',
  'src/features/details/DetailParts.tsx',
  'src/lib/tmdb.ts',
  'src/features/ads/HeroCarousel.tsx',
];

describe('Lite feature boundaries', () => {
  const lite = reachable('index.lite.js');
  const full = reachable('index.js');

  it('Lite entry reaches the shared live-TV modules', () => {
    for (const shared of [
      'src/variants/lite/LiteApp.tsx',
      'src/screens/Live/LiveScreen.tsx',
      'src/screens/Player/PlayerScreen.tsx',
      'src/screens/Favorites/FavoritesScreen.tsx',
      'src/screens/Connection/ConnectionScreen.tsx',
      'src/features/catalog/catalog.ts',
      'src/lib/m3u.ts',
    ]) {
      expect(lite.has(shared)).toBe(true);
    }
  });

  it('Lite entry reaches no Movies / Series / VOD module', () => {
    expect(VOD_MODULES.filter(m => lite.has(m))).toEqual([]);
  });

  it('Full entry still includes them (sanity check of the walker)', () => {
    expect(VOD_MODULES.filter(m => !full.has(m))).toEqual([]);
  });

  it('Lite navigation has no Movies or Series pages', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/variants/lite/LiteApp.tsx'), 'utf8');
    const pageType = /type Page = ([^;]+);/.exec(source)![1];
    expect(pageType).toBe("'live' | 'favorites' | 'settings'");
    expect(source).toMatch(/useLibrarySession\(\{ liveOnly: true \}\)/);
    expect(source).toMatch(/<ConnectionScreen[^>]*liveOnly/);
  });

  it('Android flavors keep the Full applicationId and give Lite its own', () => {
    const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toMatch(/applicationId "com\.shashtnaplayer"/);
    expect(gradle).toMatch(/lite \{[^}]*applicationIdSuffix "\.lite"/s);
    expect(gradle).toMatch(/entryFile\.set\(file\("\.\.\/\.\.\/index\.lite\.js"\)\)/);
    const liteName = fs.readFileSync(path.join(ROOT, 'android/app/src/lite/res/values/strings.xml'), 'utf8');
    expect(liteName).toContain('<string name="app_name">Shashtna Player Lite</string>');
  });
});
