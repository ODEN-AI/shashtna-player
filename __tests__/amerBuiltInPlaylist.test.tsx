/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import React from 'react';
import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ReactTestRenderer from 'react-test-renderer';

/**
 * عامر IPTV built-in playlist («قنوات عامر المباشرة»).
 *
 * The real Amer app (the same module swap as metro.amer.config.js) against a
 * stand-in for PlaylistPickerModule. The built-in asset is a SYNTHETIC fixture
 * here (fake host, generated names); the packaged playlist is only read by the
 * last test, which asserts counts and never prints entries or URLs.
 */
jest.mock('../src/design/brand', () => jest.requireActual('../src/variants/amer/brand'));
jest.mock('../src/variants/lite/editionMarker', () => jest.requireActual('../src/variants/amer/editionMarker'));
jest.mock('../src/variants/lite/LiteImportScreen', () => jest.requireActual('../src/variants/amer/AmerSignInScreen'));
jest.mock('../src/variants/lite/useLitePlaylist', () => jest.requireActual('../src/variants/amer/useAmerPlaylist'));
jest.mock('../src/variants/lite/LiteSourceSection', () => jest.requireActual('../src/variants/amer/AmerSourceSection'));

const BUILT_IN = 'asset:///playlists/amer-default.m3u';
const FAKE_HOST = 'http://stream.test.invalid';

/** 1,200 synthetic live channels; some names look like VOD but are live (allLive). */
function fixture(count = 1200): string {
  const lines = ['#EXTM3U'];
  for (let i = 1; i <= count; i += 1) {
    const name = i % 50 === 0 ? `Cinema Movies ${i}` : `قناة ${i}`;
    lines.push(`#EXTINF:-1 tvg-logo="${FAKE_HOST}/logo/${i}.png" group-title="مجموعة ${1 + (i % 6)}",${name}`, `${FAKE_HOST}/u/p/${i}`);
  }
  return lines.join('\r\n');
}

const disk = new Map<string, string>();
const readers = new Map<string, { text: string; pos: number }>();
let handles = 0;
const native = {
  pickPlaylist: jest.fn(async (): Promise<Record<string, unknown>> => ({ status: 'cancelled' })),
  prunePlaylists: jest.fn(async () => 0),
  openPlaylist: jest.fn(async (uri: string) => {
    if (!disk.has(uri)) throw Object.assign(new Error('java.io.FileNotFoundException: playlists/amer-default.m3u'), { code: 'E_NOT_FOUND' });
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
    // Several chunks per file (the real reader's chunking), not one big string.
    const text = reader.text.slice(reader.pos, reader.pos + Math.min(maxChars, 16 * 1024));
    reader.pos += text.length;
    return { text, bytes: Buffer.byteLength(reader.text.slice(0, reader.pos)) };
  }),
  closePlaylist: jest.fn((handle: string) => readers.delete(handle)),
};

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;
const LiteApp = require('../src/variants/lite/LiteApp').default;
const { loadConnectionSource, saveConnectionSource, clearConnectionSource } = require('../src/lib/connectionSession');
const { resetBuiltInPlaylistCache, loadBuiltInPlaylist } = require('../src/variants/amer/builtInPlaylist');
const { buildXtreamM3UUrl } = require('../src/lib/m3u');
const { setDiagnosticsSink } = require('../src/lib/tvDiagnostics');

type Tree = ReactTestRenderer.ReactTestRenderer;
const allText = (tree: Tree) =>
  tree.root
    .findAll(n => typeof n.type === 'string')
    .flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string' || typeof c === 'number'))
    .join(' | ');
const labelled = (tree: Tree, label: string) => tree.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === label);
async function press(tree: Tree, label: string) {
  const target = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!target) throw new Error(`Nothing labelled "${label}".`);
  await ReactTestRenderer.act(async () => {
    await target.props.onPress();
  });
}
async function pressText(tree: Tree, text: string) {
  const target = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === text).length > 0)[0];
  if (!target) throw new Error(`No button "${text}".`);
  await ReactTestRenderer.act(async () => {
    await target.props.onPress();
  });
}
async function waitFor(tree: Tree, check: () => boolean, what: string) {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await ReactTestRenderer.act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  // Only a short, content-free hint: never dump the screen (it would hold channel names).
  throw new Error(`Timed out waiting for ${what}.`);
}
async function mount(): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<LiteApp />);
  });
  return tree!;
}
const unmount = (tree: Tree) => ReactTestRenderer.act(async () => tree.unmount());
const onSourceScreen = (tree: Tree) => labelled(tree, 'بيانات الحساب').length > 0;
const onLiveTv = (tree: Tree) => labelled(tree, 'قناة 1').length > 0;
const assetReads = () => native.openPlaylist.mock.calls.filter(([uri]) => uri === BUILT_IN).length;

const XTREAM = {
  get_live_categories: [{ category_id: '1', category_name: 'عام' }],
  get_live_streams: [{ stream_id: 11, name: 'قناة الحساب', category_id: '1' }],
} as Record<string, unknown[]>;
const useXtreamServer = () => {
  globalThis.fetch = jest.fn(async (url: string) => {
    const action = /action=([a-z_]+)/.exec(String(url))?.[1];
    if (!action) throw new Error('offline');
    return { ok: true, json: async () => XTREAM[action] || [] } as any;
  }) as any;
};

beforeAll(() => {
  (NativeModules as any).ShashtnaPlaylistPicker = native;
});
beforeEach(async () => {
  disk.clear();
  readers.clear();
  files.clear();
  jest.clearAllMocks();
  resetBuiltInPlaylistCache();
  await clearConnectionSource();
  disk.set(BUILT_IN, fixture());
  globalThis.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as any;
});

describe('عامر IPTV built-in playlist', () => {
  it('fresh install: straight into Live TV with the built-in channels, no sign-in, no picker', async () => {
    const tree = await mount();
    await waitFor(tree, () => onLiveTv(tree), 'Live TV');
    expect(onSourceScreen(tree)).toBe(false);
    expect(native.pickPlaylist).not.toHaveBeenCalled();
    expect(allText(tree)).toContain((1200).toLocaleString('ar-IQ')); // all 1,200, including the "Cinema Movies …" ones (allLive)
    expect(native.readPlaylistChunk.mock.calls.length).toBeGreaterThan(3); // read in chunks
    // Default, not a saved choice: nothing written to the source store.
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it('restart: loads the built-in playlist again, parsed once per app session', async () => {
    let tree = await mount();
    await waitFor(tree, () => onLiveTv(tree), 'Live TV');
    await unmount(tree);
    tree = await mount();
    await waitFor(tree, () => onLiveTv(tree), 'Live TV again');
    expect(onSourceScreen(tree)).toBe(false);
    expect(assetReads()).toBe(1);
    await unmount(tree);
  });

  it('the player gets the canonical live queue, and zapping walks it', async () => {
    const tree = await mount();
    await waitFor(tree, () => onLiveTv(tree), 'Live TV');
    await press(tree, 'قناة 3');
    await waitFor(tree, () => tree.root.findAll(n => n.props.source?.uri === `${FAKE_HOST}/u/p/3`).length > 0, 'the player');
    const player = tree.root.findAll(n => Array.isArray(n.props.liveQueue) && typeof n.props.onBack === 'function')[0];
    expect(player.props.liveQueue.length).toBe(1200);
    expect(player.props.liveQueue.every((c: { contentType: string }) => c.contentType === 'live')).toBe(true);
    // The same next-channel control as account / file sources (ChannelBanner + tuneTo).
    const next = tree.root.findAll(n => n.props.accessibilityLabel === 'القناة التالية' && typeof n.props.onPress === 'function')[0];
    await ReactTestRenderer.act(async () => next.props.onPress());
    await waitFor(tree, () => tree.root.findAll(n => n.props.source?.uri === `${FAKE_HOST}/u/p/4`).length > 0, 'the next channel');
    await unmount(tree);
  });

  it('an existing account is respected: the built-in playlist is not even read', async () => {
    useXtreamServer();
    await saveConnectionSource(buildXtreamM3UUrl('http://srv.example:8080', 'amer', 'secret'));
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'قناة الحساب').length > 0, 'the account channels');
    expect(assetReads()).toBe(0);
    expect(labelled(tree, 'قناة 1')).toEqual([]);
    await unmount(tree);
  });

  it('an existing local M3U file is respected: the built-in playlist is not even read', async () => {
    const copy = 'file:///data/user/0/com.ameriptv.player/files/playlists/import-1.m3u';
    disk.set(copy, '#EXTM3U\n#EXTINF:-1 group-title="محلي",قناة الملف\nhttp://local.test.invalid/live/u/p/1.ts\n');
    await saveConnectionSource(copy);
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'قناة الملف').length > 0, 'the file channels');
    expect(assetReads()).toBe(0);
    await unmount(tree);
  });

  it('switching: built-in → ملف M3U → built-in again (saved explicitly) → restart keeps it', async () => {
    const tree = await mount();
    await waitFor(tree, () => onLiveTv(tree), 'Live TV');
    await press(tree, 'الإعدادات');
    await waitFor(tree, () => allText(tree).includes('مصدر المحتوى'), 'Settings');
    expect(allText(tree)).toContain('قنوات عامر المباشرة');
    expect(allText(tree)).not.toContain('إعادة قراءة الملف'); // nothing to refresh: part of the app
    await press(tree, 'تغيير المصدر');
    await waitFor(tree, () => onSourceScreen(tree), 'the source screen');
    // The source screen: built-in first, then account and file.
    expect(labelled(tree, 'قنوات عامر المباشرة')[0].props.accessibilityState).toMatchObject({ selected: true });

    const copy = 'file:///data/user/0/com.ameriptv.player/files/playlists/import-2.m3u';
    disk.set(copy, '#EXTM3U\n#EXTINF:-1 group-title="محلي",قناة الملف\nhttp://local.test.invalid/live/u/p/1.ts\n');
    native.pickPlaylist.mockResolvedValueOnce({ status: 'picked', uri: copy, name: 'mine.m3u', size: 90 });
    await press(tree, 'ملف M3U');
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => labelled(tree, 'قناة الملف').length > 0, 'the file channels');
    expect(await loadConnectionSource()).toBe(copy);

    await press(tree, 'الإعدادات');
    await waitFor(tree, () => allText(tree).includes('مصدر المحتوى'), 'Settings');
    await press(tree, 'تغيير المصدر');
    await waitFor(tree, () => onSourceScreen(tree), 'the source screen');
    await pressText(tree, 'مشاهدة القنوات');
    await waitFor(tree, () => onLiveTv(tree), 'the built-in channels');
    expect(await loadConnectionSource()).toBe(BUILT_IN); // an explicit choice now
    expect(assetReads()).toBe(1); // still the session's parsed copy
    await unmount(tree);

    const again = await mount();
    await waitFor(again, () => onLiveTv(again), 'Live TV after restart');
    await unmount(again);
  });

  it('an unusable built-in playlist (missing, or no channels): readable error, retry, and the other sources', async () => {
    for (const broken of [null, '#EXTM3U\r\n']) {
      resetBuiltInPlaylistCache();
      if (broken === null) disk.delete(BUILT_IN);
      else disk.set(BUILT_IN, broken);
      const tree = await mount();
      await waitFor(tree, () => onSourceScreen(tree), 'the source screen');
      const text = allText(tree);
      expect(text).toContain('تعذر تحميل قائمة القنوات المدمجة.');
      expect(text).toContain('إعادة المحاولة');
      expect(text).not.toMatch(/FileNotFound|java\.|E_NOT_FOUND/); // no raw technical text
      expect(labelled(tree, 'قناة 1')).toEqual([]); // never an empty Live TV
      // Retry works once the playlist is fine.
      disk.set(BUILT_IN, fixture(30));
      await pressText(tree, 'إعادة المحاولة');
      await waitFor(tree, () => onLiveTv(tree), 'Live TV after retry');
      await unmount(tree);
    }
  });

  it('"اختيار مصدر آخر" opens the account form', async () => {
    disk.delete(BUILT_IN);
    const tree = await mount();
    await waitFor(tree, () => onSourceScreen(tree), 'the source screen');
    await press(tree, 'اختيار مصدر آخر');
    expect(tree.root.findAll(n => n.props.placeholder === 'أدخل اسم المستخدم').length).toBeGreaterThan(0);
    await unmount(tree);
  });

  it('stream URLs and playlist contents are never logged', async () => {
    const lines: string[] = [];
    setDiagnosticsSink((l: string) => lines.push(l));
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(m => jest.spyOn(console, m).mockImplementation((...args: unknown[]) => lines.push(args.map(String).join(' '))));
    try {
      let tree = await mount();
      await waitFor(tree, () => onLiveTv(tree), 'Live TV');
      await unmount(tree);
      resetBuiltInPlaylistCache();
      disk.delete(BUILT_IN);
      tree = await mount();
      await waitFor(tree, () => onSourceScreen(tree), 'the source screen');
      await unmount(tree);
    } finally {
      setDiagnosticsSink(null);
      spies.forEach(s => s.mockRestore());
    }
    const joined = lines.join('\n');
    expect(joined).not.toContain('stream.test.invalid');
    expect(joined).not.toMatch(/قناة \d|Cinema Movies|مجموعة \d/);
  });
});

describe('the packaged playlist (android/app/src/amer/assets/playlists/amer-default.m3u)', () => {
  const asset = path.join(__dirname, '../android/app/src/amer/assets/playlists/amer-default.m3u');

  it('is packaged in the amer flavor only, as a separate asset (no channel data in source files)', () => {
    expect(fs.existsSync(asset)).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '../android/app/src/main/assets/playlists/amer-default.m3u'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../android/app/src/lite/assets/playlists/amer-default.m3u'))).toBe(false);
    const builtIn = fs.readFileSync(path.join(__dirname, '../src/variants/amer/builtInPlaylist.ts'), 'utf8');
    expect(builtIn).not.toMatch(/#EXTINF/);
  });

  it('parses into more than 1,000 live channels with groups and logos (counts only, nothing printed)', async () => {
    disk.set(BUILT_IN, fs.readFileSync(asset, 'utf8'));
    resetBuiltInPlaylistCache();
    const started = Date.now();
    const channels: Array<{ name: string; url: string; group: string; logo: string; contentType: string }> = await loadBuiltInPlaylist();
    const entries = (fs.readFileSync(asset, 'utf8').match(/^#EXTINF/gm) || []).length;
    expect(channels.length).toBeGreaterThan(1000);
    expect(channels.length).toBe(entries); // every entry kept as a live channel
    expect(channels.every(c => c.contentType === 'live' && !!c.name && /^https?:\/\//.test(c.url))).toBe(true);
    expect(new Set(channels.map(c => c.group)).size).toBeGreaterThan(3);
    expect(channels.filter(c => !!c.logo).length).toBeGreaterThan(100);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
