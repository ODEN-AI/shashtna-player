/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React from 'react';
import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ReactTestRenderer from 'react-test-renderer';

/**
 * عامر IPTV (Amer IPTV): the Shashtna Player Lite app with its own brand and
 * Android identity (com.ameriptv.player).
 *
 * The release bundle is built with metro.amer.config.js, which swaps
 * src/design/brand.ts and src/variants/lite/editionMarker.ts for the Amer
 * modules. The jest.mock calls below do the same swap, so everything rendered
 * here is exactly what the Amer APK runs.
 */
jest.mock('../src/design/brand', () => jest.requireActual('../src/variants/amer/brand'));
jest.mock('../src/variants/lite/editionMarker', () => jest.requireActual('../src/variants/amer/editionMarker'));
// metro.amer.config.js extends metro.config.js (Metro's defaults, not loadable
// under Jest); only its resolveRequest swap is exercised here.
jest.mock('../metro.config', () => ({}));

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ---------------------------------------------------------------------------
// Android identity

describe('Amer IPTV Android identity', () => {
  const gradle = read('android/app/build.gradle');

  it('is its own application: com.ameriptv.player, named عامر IPTV', () => {
    expect(gradle).toMatch(/amer \{[^}]*applicationId "com\.ameriptv\.player"/s);
    expect(gradle).toMatch(/amer \{[^}]*JS_MAIN_MODULE", '"index\.amer"'/s);
    expect(read('android/app/src/amer/res/values/strings.xml')).toContain('<string name="app_name">عامر IPTV</string>');
  });

  it('leaves Shashtna Player and Shashtna Player Lite identities untouched', () => {
    expect(gradle).toMatch(/applicationId "com\.shashtnaplayer"/);
    expect(gradle).toMatch(/lite \{[^}]*applicationIdSuffix "\.lite"/s);
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Shashtna Player</string>');
    expect(read('android/app/src/lite/res/values/strings.xml')).toContain('<string name="app_name">Shashtna Player Lite</string>');
  });

  it('has its own launcher icons (legacy, round, adaptive foreground) and TV banner', () => {
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
        const amer = fs.readFileSync(path.join(ROOT, `android/app/src/amer/res/mipmap-${density}/${name}`));
        const shashtna = fs.readFileSync(path.join(ROOT, `android/app/src/main/res/mipmap-${density}/${name}`));
        expect(amer.equals(shashtna)).toBe(false);
      }
    }
    const banner = fs.readFileSync(path.join(ROOT, 'android/app/src/amer/res/drawable-xhdpi/tv_banner.png'));
    expect(banner.equals(fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/drawable-xhdpi/tv_banner.png')))).toBe(false);
    expect(read('android/app/src/amer/res/values/colors.xml')).toMatch(/name="ic_launcher_background"/);
  });

  it('bundles index.amer.js with metro.amer.config.js and guards the Amer marker', () => {
    expect(gradle).toMatch(/t\.entryFile\.set\(file\("\.\.\/\.\.\/index\.amer\.js"\)\)\s*t\.bundleConfig\.set\(file\("\.\.\/\.\.\/metro\.amer\.config\.js"\)\)/);
    expect(gradle).toMatch(/createBundleAmer\\w\*JsAndAssets/);
    expect(gradle).toContain('ameriptv-edition:amer');
    expect(read('index.amer.js')).toMatch(/registerComponent\(appName, \(\) => LiteApp\)/);
  });
});

// ---------------------------------------------------------------------------
// Bundle: the Amer module graph (with the Metro swap applied)

const EXTENSIONS = ['.tsx', '.ts', '.js', '.jsx', '/index.tsx', '/index.ts', '/index.js'];
const IMPORT = /(?:import|export)\s+(type\s+)?(?:[^'"]*?from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const metroAmer = require('../metro.amer.config.js');

/** Resolves like Metro with metro.amer.config.js (its resolveRequest does the swap). */
function resolveAmer(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  let file: string | null = null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) file = base;
  else for (const ext of EXTENSIONS) if (!file && fs.existsSync(base + ext)) file = base + ext;
  if (!file) return null;
  const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: file }) };
  return metroAmer.resolver.resolveRequest(context, spec, 'android').filePath;
}

function amerGraph(): Set<string> {
  const seen = new Set<string>();
  const stack = [path.join(ROOT, 'index.amer.js')];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (match[1]) continue;
      const spec = match[2] || match[3];
      if (!spec || !spec.startsWith('.')) continue;
      const target = resolveAmer(file, spec);
      if (target) stack.push(target);
    }
  }
  return new Set([...seen].map(f => path.relative(ROOT, f).split(path.sep).join('/')));
}

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

describe('Amer IPTV bundle contents', () => {
  const graph = amerGraph();

  it('is the Lite app: same root, M3U reader/parser, Live TV, Settings', () => {
    for (const m of [
      'src/variants/lite/LiteApp.tsx',
      'src/variants/lite/LiteImportScreen.tsx',
      'src/variants/lite/LiteSourceSection.tsx',
      'src/variants/lite/useLitePlaylist.ts',
      'src/lib/m3uCore.ts',
      'src/lib/playlistPicker.ts',
      'src/screens/Live/LiveScreen.tsx',
      'src/screens/Player/PlayerScreen.tsx',
      'src/screens/Settings/SettingsScreen.tsx',
    ]) {
      expect(graph.has(m)).toBe(true);
    }
  });

  it('uses the Amer brand, marker and artwork, and none of Shashtna’s', () => {
    expect(graph.has('src/variants/amer/brand.ts')).toBe(true);
    expect(graph.has('src/variants/amer/editionMarker.ts')).toBe(true);
    expect(graph.has('src/variants/amer/assets/amer-iptv-logo.png')).toBe(true);
    expect(graph.has('src/design/brand.ts')).toBe(false);
    expect(graph.has('src/variants/lite/editionMarker.ts')).toBe(false);
    expect([...graph].filter(m => /shashtna-player-logo|shashtna-app-background/.test(m))).toEqual([]);
  });

  it('has no Xtream, sign-in, M3U link, Home, Movies, Series, VOD, TMDB or ads module', () => {
    const banned = [
      'App.tsx',
      'src/lib/m3u.ts',
      'src/lib/xtreamVod.ts',
      'src/lib/serverUrl.ts',
      'src/lib/tmdb.ts',
      'src/app/useLibrarySession.ts',
      'src/features/catalog/catalogCache.ts',
      'src/features/catalog/mediaCatalog.ts',
      'src/screens/Connection/ConnectionScreen.tsx',
      'src/screens/Connection/connectionErrors.ts',
      'src/screens/Connection/playlistLink.ts',
      'src/screens/Home/HomeScreen.tsx',
      'src/screens/Movies/MoviesScreen.tsx',
      'src/screens/Series/SeriesScreen.tsx',
      'src/screens/Favorites/FavoritesScreen.tsx',
      'src/components/common/MediaLibraryScreen.tsx',
      'src/features/details/MovieDetailsScreen.tsx',
      'src/features/details/SeriesDetailsScreen.tsx',
      'src/features/continueWatching/continueWatchingStore.ts',
      'src/features/ads/HeroCarousel.tsx',
    ];
    expect(banned.filter(m => graph.has(m))).toEqual([]);
  });

  it('shows no Shashtna name anywhere in its code (comments excluded)', () => {
    const visible = /شاشتنا|Shashtna Player|SHASHTNA PLAYER|Shashtna Lite|Shashtna Blue/;
    const offenders = [...graph]
      .filter(m => /\.(tsx?|jsx?)$/.test(m))
      .filter(m => visible.test(stripComments(read(m))));
    expect(offenders).toEqual([]);
  });

  it('keeps all app state in the app sandbox (no shared or external storage paths)', () => {
    const shared = /\/sdcard|\/storage\/|DownloadDir|SDCardDir|MusicDir|PictureDir|MovieDir|getExternal/;
    expect([...graph].filter(m => /\.(tsx?|jsx?)$/.test(m) && shared.test(stripComments(read(m))))).toEqual([]);
    expect(read('src/lib/jsonFileStore.ts')).toMatch(/fs\.dirs\.DocumentDir/);
    expect(read('android/app/src/main/java/com/shashtnaplayer/SecureStoreModule.kt')).toMatch(/getSharedPreferences\(PREFS, Context\.MODE_PRIVATE\)/);
  });
});

// ---------------------------------------------------------------------------
// The app itself, rendered with the Amer modules

const disk = new Map<string, string>();
const readers = new Map<string, { text: string; pos: number }>();
let handles = 0;
const native = {
  pickPlaylist: jest.fn(async (): Promise<{ uri: string; name: string; size: number } | null> => null),
  openPlaylist: jest.fn(async (uri: string) => {
    if (!disk.has(uri)) throw Object.assign(new Error(`java.io.FileNotFoundException: ${uri}`), { code: 'E_NOT_FOUND' });
    const handle = `h${++handles}`;
    readers.set(handle, { text: disk.get(uri)!, pos: 0 });
    return handle;
  }),
  readPlaylistChunk: jest.fn(async (handle: string, maxChars: number) => {
    const reader = readers.get(handle);
    if (!reader) throw Object.assign(new Error('closed'), { code: 'E_CLOSED' });
    if (reader.pos >= reader.text.length) {
      readers.delete(handle);
      return { text: null, bytes: Buffer.byteLength(reader.text) };
    }
    const text = reader.text.slice(reader.pos, reader.pos + Math.min(maxChars, 7));
    reader.pos += text.length;
    return { text, bytes: Buffer.byteLength(reader.text.slice(0, reader.pos)) };
  }),
  closePlaylist: jest.fn((handle: string) => readers.delete(handle)),
};

const URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Famer.m3u';
const PLAYLIST = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="قنوات عراقية",العراقية',
  'http://srv:8080/live/u/p/1.ts',
  '#EXTINF:-1 group-title="رياضة",بي إن سبورت 1',
  'http://srv:8080/live/u/p/2.ts',
  '#EXTINF:-1 group-title="أفلام",فيلم الرسالة',
  'http://srv:8080/movie/u/p/4.mp4',
  '#EXTINF:-1 group-title="مسلسلات",باب الحارة S01E01',
  'http://srv:8080/series/u/p/5.mkv',
].join('\n');

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;
const LiteApp = require('../src/variants/lite/LiteApp').default;
const { EDITION_MARKER } = require('../src/variants/lite/LiteApp');
const { loadConnectionSource } = require('../src/lib/connectionSession');

type Tree = ReactTestRenderer.ReactTestRenderer;
const allText = (tree: Tree) =>
  tree.root
    .findAll(n => typeof n.type === 'string')
    .flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string' || typeof c === 'number'))
    .join(' | ');
const labels = (tree: Tree) =>
  tree.root.findAll(n => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
const labelled = (tree: Tree, label: string) => tree.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === label);
async function press(tree: Tree, label: string) {
  const target = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!target) throw new Error(`Nothing labelled "${label}". Screen: ${allText(tree).slice(0, 300)}`);
  await ReactTestRenderer.act(async () => {
    await target.props.onPress();
  });
}
async function waitFor(tree: Tree, check: () => boolean, what: string) {
  for (let i = 0; i < 300; i += 1) {
    if (check()) return;
    await ReactTestRenderer.act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Timed out waiting for ${what}. Screen: ${allText(tree).slice(0, 500)}`);
}
async function mount(): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<LiteApp />);
  });
  return tree!;
}
const unmount = (tree: Tree) => ReactTestRenderer.act(async () => tree.unmount());
const pickReturns = (uri: string, text: string, name = 'amer.m3u') => {
  disk.set(uri, text);
  native.pickPlaylist.mockResolvedValueOnce({ uri, name, size: Buffer.byteLength(text) });
};
const SHASHTNA = /شاشتنا|Shashtna|SHASHTNA/;
const ACCOUNT_WORDS = ['بيانات الحساب', 'اسم المستخدم', 'كلمة المرور', 'رابط السيرفر', 'رابط M3U', 'رابط قائمة التشغيل'];
const everything = (tree: Tree) => `${allText(tree)} | ${labels(tree).join(' | ')}`;

beforeAll(() => {
  (NativeModules as any).ShashtnaPlaylistPicker = native;
});
beforeEach(() => {
  disk.clear();
  readers.clear();
  files.clear();
  jest.clearAllMocks();
  globalThis.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as any;
});

describe('عامر IPTV app', () => {
  it('opens on "استيراد ملف M3U" with the Amer brand, and no account form, link or Shashtna name', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'رفع ملف M3U').length > 0, 'the import screen');
    const text = everything(tree);
    expect(text).toContain('AMER IPTV');
    expect(text).toContain('استيراد ملف M3U');
    expect(text).toContain('اختر ملف M3U من جهازك ليعرض عامر IPTV قنواتك المباشرة.');
    expect(text).not.toMatch(SHASHTNA);
    for (const word of ACCOUNT_WORDS) expect(text).not.toContain(word);
    expect(tree.root.findAll(n => typeof n.props.onChangeText === 'function')).toEqual([]);
    expect(EDITION_MARKER).toBe('ameriptv-edition:amer');
    expect(tree.root.findAll(n => n.props.testID === 'ameriptv-edition:amer').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.props.testID === 'shashtna-edition:lite')).toEqual([]);
    await unmount(tree);
  });

  it('imports a local M3U: live channels only, success notice, count, and playback of the stream URL', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'رفع ملف M3U').length > 0, 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'رفع ملف M3U');
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the imported channels');
    let text = everything(tree);
    expect(text).toContain('تم تحميل ملف M3U بنجاح');
    expect(text).toContain(`عدد القنوات: ${(2).toLocaleString('ar-IQ')}`);
    expect(text).toContain('عامر IPTV'); // sidebar brand
    expect(text).not.toMatch(/فيلم الرسالة|باب الحارة/);
    expect(text).not.toMatch(SHASHTNA);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await press(tree, 'العراقية');
    await waitFor(tree, () => tree.root.findAll(n => n.props.source?.uri === 'http://srv:8080/live/u/p/1.ts').length > 0, 'the player');
    text = everything(tree);
    expect(text).not.toMatch(SHASHTNA);
    await unmount(tree);
  });

  it('Settings: M3U source section, Amer accent name, no Shashtna name, no account or link', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'رفع ملف M3U').length > 0, 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'رفع ملف M3U');
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the imported channels');
    await press(tree, 'الإعدادات');
    await waitFor(tree, () => allText(tree).includes('مصدر المحتوى'), 'Settings');
    const text = everything(tree);
    for (const word of ['مصدر المحتوى', 'ملف M3U الحالي', 'amer.m3u', `القنوات: ${(2).toLocaleString('ar-IQ')}`, 'استبدال ملف M3U', 'إعادة قراءة الملف', 'أزرق عامر']) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(SHASHTNA);
    for (const word of ACCOUNT_WORDS) expect(text).not.toContain(word);
    await unmount(tree);
  });

  it('restores its playlist after a restart, and explains a missing file on the import screen', async () => {
    let tree = await mount();
    await waitFor(tree, () => labelled(tree, 'رفع ملف M3U').length > 0, 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'رفع ملف M3U');
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the imported channels');
    await unmount(tree);
    expect(await loadConnectionSource()).toBe(URI);

    tree = await mount();
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the restored channels');
    await unmount(tree);

    disk.delete(URI);
    tree = await mount();
    await waitFor(tree, () => allText(tree).includes('تعذر قراءة ملف M3U'), 'the read error');
    const text = everything(tree);
    expect(text).toContain('استيراد ملف M3U');
    expect(text).not.toMatch(SHASHTNA);
    await unmount(tree);
  });

  it('a file without live channels is rejected with the Amer wording', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'رفع ملف M3U').length > 0, 'the import screen');
    pickReturns(URI, '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n');
    await press(tree, 'رفع ملف M3U');
    await waitFor(tree, () => allText(tree).includes('لم يتم العثور على قنوات مباشرة داخل الملف'), 'the no-live message');
    expect(allText(tree)).toContain('عامر IPTV يعرض البث المباشر فقط.');
    expect(everything(tree)).not.toMatch(SHASHTNA);
    await unmount(tree);
  });
});
