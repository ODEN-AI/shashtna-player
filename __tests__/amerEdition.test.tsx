/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React from 'react';
import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ReactTestRenderer from 'react-test-renderer';

/**
 * عامر IPTV (Amer IPTV): the Shashtna Player Lite app with its own brand,
 * Android identity (com.ameriptv.player) and the Shashtna sign-in (account or
 * M3U file, live channels only, no M3U link).
 *
 * The release bundle is built with metro.amer.config.js, which swaps a few
 * Lite modules for the Amer ones. The jest.mock calls below do the same swap,
 * so everything rendered here is exactly what the Amer APK runs.
 */
jest.mock('../src/design/brand', () => jest.requireActual('../src/variants/amer/brand'));
jest.mock('../src/variants/lite/editionMarker', () => jest.requireActual('../src/variants/amer/editionMarker'));
jest.mock('../src/variants/lite/LiteImportScreen', () => jest.requireActual('../src/variants/amer/AmerSignInScreen'));
jest.mock('../src/variants/lite/useLitePlaylist', () => jest.requireActual('../src/variants/amer/useAmerPlaylist'));
jest.mock('../src/variants/lite/LiteSourceSection', () => jest.requireActual('../src/variants/amer/AmerSourceSection'));
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

  it('is the Lite app with the Shashtna sign-in: same root, Live TV, Settings, M3U reader, live-only Xtream', () => {
    for (const m of [
      'src/variants/lite/LiteApp.tsx',
      'src/variants/amer/AmerSignInScreen.tsx',
      'src/variants/amer/AmerSourceSection.tsx',
      'src/variants/amer/useAmerPlaylist.ts',
      'src/screens/Connection/ConnectionScreen.tsx',
      'src/lib/m3u.ts',
      'src/features/catalog/catalogCache.ts',
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
    for (const lite of ['src/variants/lite/LiteImportScreen.tsx', 'src/variants/lite/useLitePlaylist.ts', 'src/variants/lite/LiteSourceSection.tsx']) {
      expect(graph.has(lite)).toBe(false);
    }
    expect([...graph].filter(m => /shashtna-player-logo|shashtna-app-background/.test(m))).toEqual([]);
  });

  it('has no M3U link, Xtream VOD, Home, Movies, Series, TMDB or ads module', () => {
    const banned = [
      'App.tsx',
      'src/lib/xtreamVod.ts',
      'src/lib/tmdb.ts',
      'src/app/useLibrarySession.ts',
      'src/features/catalog/mediaCatalog.ts',
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
  // Native contract: structured results, never a raw rejection (PlaylistPickerModule.kt).
  pickPlaylist: jest.fn(async (): Promise<Record<string, unknown>> => ({ status: 'cancelled' })),
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
  native.pickPlaylist.mockResolvedValueOnce({ status: 'picked', uri, name, size: Buffer.byteLength(text) });
};
const SHASHTNA = /شاشتنا|Shashtna|SHASHTNA/;
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

const XTREAM = {
  get_live_categories: [{ category_id: '1', category_name: 'عام' }, { category_id: '2', category_name: 'رياضة' }],
  get_live_streams: [
    { stream_id: 11, name: 'قناة الحساب', category_id: '1' },
    { stream_id: 12, name: 'رياضة الحساب', category_id: '2' },
  ],
} as Record<string, unknown[]>;
let xtreamActions: string[] = [];
let userAgents: string[] = [];
const useXtreamServer = () => {
  xtreamActions = [];
  userAgents = [];
  globalThis.fetch = jest.fn(async (url: string, init?: any) => {
    const action = /action=([a-z_]+)/.exec(String(url))?.[1];
    if (!action) throw new Error('offline'); // connectivity pings
    xtreamActions.push(action);
    userAgents.push(init?.headers?.['User-Agent'] || '');
    return { ok: true, json: async () => XTREAM[action] || [] } as any;
  }) as any;
};
const type = async (tree: Tree, placeholder: string, value: string) => {
  const input = tree.root.findAll(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  await ReactTestRenderer.act(async () => input.props.onChangeText(value));
};
const signIn = async (tree: Tree) => {
  const button = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'تسجيل الدخول').length > 0)[0];
  await ReactTestRenderer.act(async () => {
    await button.props.onPress();
  });
};
const onSignIn = (tree: Tree) => labelled(tree, 'بيانات الحساب').length > 0;

describe('عامر IPTV app', () => {
  it('opens on the Shashtna-style sign-in: بيانات الحساب + ملف M3U, no M3U link, Amer brand', async () => {
    const tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    const text = everything(tree);
    expect(labelled(tree, 'بيانات الحساب').length).toBeGreaterThan(0);
    expect(labelled(tree, 'ملف M3U').length).toBeGreaterThan(0);
    expect(labelled(tree, 'رابط M3U')).toEqual([]);
    expect(tree.root.findAll(n => n.props.placeholder === 'http://provider.tv/playlist.m3u')).toEqual([]);
    for (const field of ['http://server:port', 'أدخل اسم المستخدم', 'أدخل كلمة المرور']) {
      expect(tree.root.findAll(n => n.props.placeholder === field).length).toBeGreaterThan(0);
    }
    expect(text).toContain('AMER IPTV');
    expect(text).not.toMatch(SHASHTNA);
    expect(text).not.toMatch(/أفلام|مسلسلات/);
    expect(EDITION_MARKER).toBe('ameriptv-edition:amer');
    expect(tree.root.findAll(n => n.props.testID === 'ameriptv-edition:amer').length).toBeGreaterThan(0);
    await unmount(tree);
  });

  it('signs in with server + username + password: live channels only, Live TV, saved and restored', async () => {
    useXtreamServer();
    let tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    await type(tree, 'http://server:port', 'srv.example:8080');
    await type(tree, 'أدخل اسم المستخدم', 'amer');
    await type(tree, 'أدخل كلمة المرور', 'secret');
    await signIn(tree);
    await waitFor(tree, () => labelled(tree, 'قناة الحساب').length > 0, 'the account channels');
    expect(xtreamActions.sort()).toEqual(['get_live_categories', 'get_live_streams']);
    expect(userAgents.every(ua => ua === 'AmerIPTV/1.0')).toBe(true);
    let text = everything(tree);
    expect(text).toContain('تم تسجيل الدخول بنجاح');
    expect(text).toContain(`عدد القنوات: ${(2).toLocaleString('ar-IQ')}`);
    expect(text).not.toMatch(SHASHTNA);

    await press(tree, 'قناة الحساب');
    await waitFor(tree, () => tree.root.findAll(n => n.props.source?.uri === 'http://srv.example:8080/live/amer/secret/11.ts').length > 0, 'the player');
    await unmount(tree);

    // Saved (Keystore store in the app; in-memory here), restored from the cache without asking again.
    expect(await loadConnectionSource()).toContain('username=amer');
    xtreamActions = [];
    tree = await mount();
    await waitFor(tree, () => labelled(tree, 'قناة الحساب').length > 0, 'the restored channels');
    expect(xtreamActions).toEqual([]); // from the 12 h cache
    await press(tree, 'الإعدادات');
    await waitFor(tree, () => allText(tree).includes('مصدر المحتوى'), 'Settings');
    text = everything(tree);
    expect(text).toContain('حساب IPTV');
    expect(text).toContain('amer @ srv.example:8080');
    expect(text).not.toContain('secret');
    expect(text).toContain('تحديث القنوات');
    expect(text).not.toMatch(SHASHTNA);

    // تغيير المصدر → back to the sign-in screen, source forgotten.
    await press(tree, 'تغيير المصدر');
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it('a wrong account shows the sign-in error and stays on the sign-in screen', async () => {
    globalThis.fetch = jest.fn(async (url: string) => {
      if (!/action=/.test(String(url))) throw new Error('offline');
      return { ok: false, status: 401, json: async () => ({}) } as any;
    }) as any;
    const tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    await type(tree, 'http://server:port', 'srv.example:8080');
    await type(tree, 'أدخل اسم المستخدم', 'amer');
    await type(tree, 'أدخل كلمة المرور', 'wrong');
    await signIn(tree);
    await waitFor(tree, () => allText(tree).includes('تعذر تسجيل الدخول'), 'the sign-in error');
    expect(onSignIn(tree)).toBe(true);
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it('ملف M3U: picking a file imports it at once — live only, notice, count, playback, Settings', async () => {
    const tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the imported channels');
    let text = everything(tree);
    expect(text).toContain('تم تحميل ملف M3U بنجاح');
    expect(text).toContain(`عدد القنوات: ${(2).toLocaleString('ar-IQ')}`);
    expect(text).not.toMatch(/فيلم الرسالة|باب الحارة/);
    expect(text).not.toMatch(SHASHTNA);

    await press(tree, 'العراقية');
    await waitFor(tree, () => tree.root.findAll(n => n.props.source?.uri === 'http://srv:8080/live/u/p/1.ts').length > 0, 'the player');
    expect(everything(tree)).not.toMatch(SHASHTNA);
    await unmount(tree);

    const again = await mount();
    await waitFor(again, () => labelled(again, 'العراقية').length > 0, 'the restored channels');
    await press(again, 'الإعدادات');
    await waitFor(again, () => allText(again).includes('مصدر المحتوى'), 'Settings');
    text = everything(again);
    for (const word of ['ملف M3U الحالي', 'amer.m3u', `القنوات: ${(2).toLocaleString('ar-IQ')}`, 'استبدال ملف M3U', 'إعادة قراءة الملف', 'تغيير المصدر', 'أزرق عامر']) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(SHASHTNA);
    await unmount(again);
  });

  it('a saved file that is gone reopens the ملف M3U tab with the read error', async () => {
    let tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => labelled(tree, 'العراقية').length > 0, 'the imported channels');
    await unmount(tree);
    disk.delete(URI);
    tree = await mount();
    await waitFor(tree, () => allText(tree).includes('تعذر قراءة ملف M3U'), 'the read error');
    const fileTab = labelled(tree, 'ملف M3U')[0];
    expect(fileTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(everything(tree)).not.toMatch(SHASHTNA);
    await unmount(tree);
  });

  it('a file without live channels is rejected with the Amer wording', async () => {
    const tree = await mount();
    await waitFor(tree, () => onSignIn(tree), 'the sign-in screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n');
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => allText(tree).includes('لم يتم العثور على قنوات مباشرة داخل الملف'), 'the no-live message');
    expect(allText(tree)).toContain('عامر IPTV يعرض البث المباشر فقط.');
    expect(everything(tree)).not.toMatch(SHASHTNA);
    await unmount(tree);
  });
});
