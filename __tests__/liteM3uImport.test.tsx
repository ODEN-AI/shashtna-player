/// <reference types="node" />
import React from 'react';
import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ReactTestRenderer from 'react-test-renderer';

import { loadConnectionSource } from '../src/lib/connectionSession';
import {
  createM3UTextParser,
  loadLocalPlaylist,
  NoLiveChannelsError,
  PlaylistEmptyError,
  PlaylistFormatError,
} from '../src/lib/m3uCore';
import { PlaylistReadError } from '../src/lib/playlistPicker';
import { describeImportError } from '../src/variants/lite/importErrors';

/**
 * Shashtna Player Lite: its only source, a local M3U file. Also checks that
 * Shashtna Player (Full) keeps its account, link and file sign-in.
 *
 * The native picker/reader (PlaylistPickerModule.kt) is replaced by an
 * in-memory stand-in with the same contract: pickPlaylist -> { uri, name,
 * size }, openPlaylist -> handle, readPlaylistChunk -> { text | null, bytes }.
 * Everything else is the real code: parser, session hook, persistence
 * (jest.setup's in-memory file store) and the Lite UI.
 */

const disk = new Map<string, string>();
const readers = new Map<string, { text: string; pos: number }>();
let handles = 0;
const CHUNK = 5; // tiny chunks: lines and Arabic words split across reads

const native = {
  pickPlaylist: jest.fn(async (): Promise<Record<string, unknown>> => ({ status: 'cancelled' })),
  openPlaylist: jest.fn(async (uri: string) => {
    if (!disk.has(uri)) {
      throw Object.assign(new Error(`java.io.FileNotFoundException: ${uri}`), { code: 'E_NOT_FOUND' });
    }
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
    const size = Math.min(maxChars, CHUNK);
    const text = reader.text.slice(reader.pos, reader.pos + size);
    reader.pos += size;
    return { text, bytes: Buffer.byteLength(reader.text.slice(0, reader.pos)) };
  }),
  closePlaylist: jest.fn((handle: string) => {
    readers.delete(handle);
  }),
};

const URI = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Firaq.m3u';

const PLAYLIST = [
  '﻿#EXTM3U',
  '#EXTINF:-1 tvg-id="iraqia" tvg-logo="http://logo/iq.png" group-title="قنوات عراقية",العراقية',
  'http://srv:8080/live/u/p/1.ts',
  '#EXTINF:-1 group-title="رياضة",بي إن سبورت 1',
  'http://srv:8080/live/u/p/2.ts',
  // A live channel whose name looks like VOD: the /live/ URL keeps it in Lite.
  '#EXTINF:-1 group-title="Movies Channels",beIN Movies',
  'http://srv:8080/live/u/p/3.ts',
  '#EXTINF:-1 group-title="أفلام",فيلم الرسالة',
  'http://srv:8080/movie/u/p/4.mp4',
  '#EXTINF:-1 group-title="مسلسلات",باب الحارة S01E01',
  'http://srv:8080/series/u/p/5.mkv',
  '#EXTINF:-1 group-title="Cinema",A film file',
  'http://cdn.example/files/6.mkv',
].join('\r\n');

const LIVE_NAMES = ['العراقية', 'بي إن سبورت 1', 'beIN Movies'];
const VOD_NAMES = ['فيلم الرسالة', 'باب الحارة S01E01', 'A film file'];

const files: Map<string, string> = (ReactNativeBlobUtil.fs as any).__files;

beforeAll(() => {
  (NativeModules as any).ShashtnaPlaylistPicker = native;
});

beforeEach(() => {
  disk.clear();
  readers.clear();
  files.clear();
  jest.clearAllMocks();
  // The connection screen pings a connectivity endpoint; keep tests offline.
  globalThis.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as any;
});

describe('reading a picked M3U file', () => {
  it('reads content:// through the native ContentResolver reader, not react-native-blob-util', async () => {
    disk.set(URI, PLAYLIST);
    const progress: Array<[number, number]> = [];
    const channels = await loadLocalPlaylist(URI, (r, t) => progress.push([r, t]), undefined, {
      liveOnly: true,
      sizeHint: Buffer.byteLength(PLAYLIST),
    });
    expect(native.openPlaylist).toHaveBeenCalledWith(URI);
    expect((ReactNativeBlobUtil.fs as any).readStream).not.toHaveBeenCalled();
    expect(channels.map(c => c.name)).toEqual(LIVE_NAMES);
    // Every chunk was consumed and the reader closed by the native side.
    expect(readers.size).toBe(0);
    expect(progress[progress.length - 1]).toEqual([Buffer.byteLength(PLAYLIST), Buffer.byteLength(PLAYLIST)]);
  });

  it('parses the same channels, logos, groups and Arabic names as a one-piece parse', async () => {
    disk.set(URI, PLAYLIST);
    const chunked = await loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true });
    const whole = createM3UTextParser({ liveOnly: true });
    whole.push(PLAYLIST);
    expect(chunked).toEqual(whole.end());
    expect(chunked[0]).toMatchObject({ name: 'العراقية', group: 'قنوات عراقية', logo: 'http://logo/iq.png', tvgId: 'iraqia', contentType: 'live' });
  });

  it('Lite keeps live channels only: movies, series and VOD files are dropped', async () => {
    disk.set(URI, PLAYLIST);
    const channels = await loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true });
    expect(channels.every(c => c.contentType === 'live')).toBe(true);
    for (const vod of VOD_NAMES) expect(channels.map(c => c.name)).not.toContain(vod);
  });

  it('Full classification is unchanged (no URL-first rule outside Lite)', () => {
    const parser = createM3UTextParser();
    parser.push(PLAYLIST);
    const byName = new Map(parser.end().map(c => [c.name, c.contentType]));
    expect(byName.get('beIN Movies')).toBe('movie');
    expect(byName.get('A film file')).toBe('movie');
    expect(byName.get('العراقية')).toBe('live');
  });

  it('rejects an empty file', async () => {
    disk.set(URI, '');
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistEmptyError);
    disk.set(URI, ' \r\n \n\t');
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistEmptyError);
  });

  it('rejects a file that is not M3U', async () => {
    disk.set(URI, 'name,url\nقناة,http://x/1.ts\n');
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistFormatError);
  });

  it('rejects a playlist with no live channels (VOD only, or header only)', async () => {
    disk.set(URI, '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n');
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(NoLiveChannelsError);
    disk.set(URI, '#EXTM3U\n');
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(NoLiveChannelsError);
  });

  it('reports a file that can no longer be opened', async () => {
    await expect(loadLocalPlaylist(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistReadError);
  });

  it('gives each failure a clear Arabic message', () => {
    const msg = (e: unknown) => describeImportError(e, true).message;
    expect(msg(new PlaylistReadError('FileNotFoundException', 'E_NOT_FOUND'))).toContain('تعذر قراءة ملف M3U');
    expect(msg(new PlaylistEmptyError())).toContain('الملف فارغ');
    expect(msg(new PlaylistFormatError())).toContain('صيغة الملف غير مدعومة');
    expect(msg(new NoLiveChannelsError())).toContain('لم يتم العثور على قنوات مباشرة داخل الملف');
  });
});

// ---------------------------------------------------------------------------
// The whole Lite flow, rendered: رفع ملف M3U -> read -> parse -> save -> Live TV.

const LiteApp = require('../src/variants/lite/LiteApp').default;
const { importNoticeText } = require('../src/variants/lite/LiteApp');
const { saveConnectionSource } = require('../src/lib/connectionSession');

type Tree = ReactTestRenderer.ReactTestRenderer;

function allText(tree: Tree): string {
  return tree.root
    .findAll(n => typeof n.type === 'string')
    .flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string' || typeof c === 'number'))
    .join(' | ');
}
const labelled = (tree: Tree, label: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === label);
async function press(tree: Tree, label: string) {
  const target = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!target) throw new Error(`Nothing labelled "${label}" to press. Screen: ${allText(tree).slice(0, 400)}`);
  await ReactTestRenderer.act(async () => {
    await target.props.onPress();
  });
}
async function waitFor(tree: Tree, check: () => boolean, what: string) {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await ReactTestRenderer.act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Timed out waiting for ${what}. Screen: ${allText(tree).slice(0, 600)}`);
}
async function mount(element: React.ReactElement = <LiteApp />): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  return tree!;
}
async function unmount(tree: Tree) {
  await ReactTestRenderer.act(async () => tree.unmount());
}
const channelShown = (tree: Tree, name: string) => labelled(tree, name).length > 0;
const pickReturns = (uri: string, text: string, name = 'iraq.m3u') => {
  disk.set(uri, text);
  native.pickPlaylist.mockResolvedValueOnce({ status: 'picked', uri, name, size: Buffer.byteLength(text) });
};
const UPLOAD = 'رفع ملف M3U';
const onImportScreen = (tree: Tree) => labelled(tree, UPLOAD).length > 0;
const ACCOUNT_WORDS = ['بيانات الحساب', 'اسم المستخدم', 'كلمة المرور', 'رابط السيرفر', 'رابط M3U', 'رابط قائمة التشغيل', 'Username', 'Password', 'Server URL'];

describe('Shashtna Player Lite: local M3U file only', () => {
  it('shows only "رفع ملف M3U": no account form, no server/username/password, no M3U link, no text input', async () => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    const text = allText(tree);
    expect(text).toContain('استيراد ملف M3U');
    expect(text).toContain('اختر ملف M3U من جهازك لبدء استخدام القنوات المباشرة.');
    for (const word of ACCOUNT_WORDS) expect(text).not.toContain(word);
    expect(tree.root.findAll(n => typeof n.props.onChangeText === 'function')).toEqual([]);
    expect(tree.root.findAll(n => n.props.accessibilityRole === 'tab')).toEqual([]);
    await unmount(tree);
  });

  it('imports the picked file and opens Live TV with its live channels, a success notice and the count', async () => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    pickReturns(URI, PLAYLIST);
    // One action: رفع ملف M3U. No URL, no account, no extra step, no restart.
    await press(tree, UPLOAD);
    await waitFor(tree, () => LIVE_NAMES.every(name => channelShown(tree, name)), 'the imported channels');

    const text = allText(tree);
    const notice = importNoticeText(LIVE_NAMES.length, true);
    expect(notice.title).toBe('تم تحميل ملف M3U بنجاح');
    expect(text).toContain(notice.title);
    expect(text).toContain(`عدد القنوات: ${(3).toLocaleString('ar-IQ')}`);
    for (const vod of VOD_NAMES) expect(channelShown(tree, vod)).toBe(false);
    expect(text).toContain('البث المباشر');
    for (const banned of ['الأفلام', 'المسلسلات', 'الرئيسية']) expect(labelled(tree, banned)).toEqual([]);
    // No network at all: nothing but the file was read.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await loadConnectionSource()).toBe(URI);
    await unmount(tree);
  });

  it('Settings shows the current file and channel count, and replaces the file', async () => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, UPLOAD);
    await waitFor(tree, () => channelShown(tree, 'العراقية'), 'the imported channels');
    await press(tree, 'الإعدادات');
    await waitFor(tree, () => allText(tree).includes('مصدر المحتوى'), 'the Settings source section');
    let text = allText(tree);
    expect(text).toContain('ملف M3U الحالي');
    expect(text).toContain('iraq.m3u');
    expect(text).toContain(`القنوات: ${(3).toLocaleString('ar-IQ')}`);
    for (const word of [...ACCOUNT_WORDS, 'تغيير المصدر', 'تسجيل الدخول باشتراك']) expect(text).not.toContain(word);

    const OTHER = 'content://com.android.providers.downloads.documents/document/msf%3A42';
    pickReturns(OTHER, '#EXTM3U\n#EXTINF:-1 group-title="أخبار",الشرقية نيوز\nhttp://srv/live/u/p/77.ts\n', 'news.m3u');
    await press(tree, 'استبدال ملف M3U');
    await waitFor(tree, () => channelShown(tree, 'الشرقية نيوز'), 'the replacement channels');
    text = allText(tree);
    expect(text).toContain('تم تحميل ملف M3U بنجاح');
    expect(text).toContain(`عدد القنوات: ${(1).toLocaleString('ar-IQ')}`);
    expect(channelShown(tree, 'العراقية')).toBe(false);
    expect(await loadConnectionSource()).toBe(OTHER);
    await unmount(tree);
  });

  it('a bad replacement file keeps the current playlist and explains why', async () => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, UPLOAD);
    await waitFor(tree, () => channelShown(tree, 'العراقية'), 'the imported channels');
    await press(tree, 'الإعدادات');
    pickReturns('content://docs/empty.m3u', '');
    await press(tree, 'استبدال ملف M3U');
    await waitFor(tree, () => allText(tree).includes('الملف فارغ'), 'the empty-file message');
    expect(allText(tree)).toContain('iraq.m3u');
    expect(await loadConnectionSource()).toBe(URI);
    await unmount(tree);
  });

  it('restores the imported file on the next launch, and returns to "استيراد ملف M3U" when it is gone', async () => {
    let tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    pickReturns(URI, PLAYLIST);
    await press(tree, UPLOAD);
    await waitFor(tree, () => channelShown(tree, 'العراقية'), 'the imported channels');
    await unmount(tree);

    // Next launch: read again from the saved URI (persisted read permission).
    native.openPlaylist.mockClear();
    tree = await mount();
    await waitFor(tree, () => LIVE_NAMES.every(name => channelShown(tree, name)), 'the restored channels');
    expect(native.openPlaylist).toHaveBeenCalledWith(URI);
    expect(allText(tree)).not.toContain('تم تحميل ملف M3U بنجاح'); // only after an import
    await unmount(tree);

    // The file was deleted / access revoked.
    disk.delete(URI);
    tree = await mount();
    await waitFor(tree, () => allText(tree).includes('تعذر قراءة ملف M3U'), 'the read error');
    const text = allText(tree);
    expect(text).toContain('استيراد ملف M3U');
    expect(text).toContain('iraq.m3u');
    expect(onImportScreen(tree)).toBe(true);
    for (const word of ACCOUNT_WORDS) expect(text).not.toContain(word);
    await unmount(tree);
  });

  it('a source saved by an older build (Xtream link) is not loaded: no network, back to the import screen', async () => {
    await saveConnectionSource('http://srv:8080/get.php?username=u&password=p&type=m3u_plus');
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(allText(tree)).not.toContain('تعذر');
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it.each([
    ['an empty file', '', 'الملف فارغ'],
    ['a file that is not M3U', 'just some text\nnot a playlist', 'صيغة الملف غير مدعومة'],
    ['a playlist without live channels', '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n', 'لم يتم العثور على قنوات مباشرة داخل الملف'],
  ])('shows an Arabic error and stays on the import screen for %s', async (_case, content, message) => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    pickReturns(URI, content);
    await press(tree, UPLOAD);
    await waitFor(tree, () => allText(tree).includes(message), `the message "${message}"`);
    expect(allText(tree)).toContain('تعذر استيراد ملف M3U');
    expect(onImportScreen(tree)).toBe(true);
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it('does nothing (and shows no error) when the picker is cancelled', async () => {
    const tree = await mount();
    await waitFor(tree, () => onImportScreen(tree), 'the import screen');
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    await press(tree, UPLOAD);
    expect(native.openPlaylist).not.toHaveBeenCalled();
    expect(allText(tree)).not.toContain('تعذر');
    await unmount(tree);
  });
});

// ---------------------------------------------------------------------------
// Shashtna Player (Full): account/Xtream, M3U link and M3U file all remain.

describe('Shashtna Player (Full) connection screen is unchanged', () => {
  const ConnectionScreen = require('../src/screens/Connection/ConnectionScreen').default;
  const { AppPreferencesProvider } = require('../src/design/AppPreferencesContext');
  const { PLAYLIST_LINK } = require('../src/screens/Connection/playlistLink');
  const { loadXtreamVod } = require('../src/lib/xtreamVod');
  const noop = () => {};
  const prefs = { language: 'ar', setLanguage: noop, themeMode: 'dark', setThemeMode: noop, accent: 'shashtna', customAccent: null, setAccent: noop };
  const FULL = { id: 'full', liveOnly: false, loadVod: loadXtreamVod, playlistLink: PLAYLIST_LINK };
  const full = (onConnected: jest.Mock) => (
    <AppPreferencesProvider value={prefs}>
      <ConnectionScreen onConnected={onConnected} edition={FULL} />
    </AppPreferencesProvider>
  );
  const signIn = async (tree: Tree) => {
    const button = tree.root.findAll(
      n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'تسجيل الدخول').length > 0,
    )[0];
    await ReactTestRenderer.act(async () => {
      await button.props.onPress();
    });
  };
  const type = async (tree: Tree, placeholder: string, value: string) => {
    const input = tree.root.findAll(n => n.props.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
    await ReactTestRenderer.act(async () => input.props.onChangeText(value));
  };

  it('offers account, M3U link and M3U file', async () => {
    const tree = await mount(full(jest.fn()));
    for (const tab of ['بيانات الحساب', 'رابط M3U', 'ملف M3U']) expect(labelled(tree, tab).length).toBeGreaterThan(0);
    await unmount(tree);
  });

  it('still signs in with an Xtream account (live + movies + series)', async () => {
    const actions: string[] = [];
    const BODIES: Record<string, unknown[]> = {
      get_live_categories: [{ category_id: '1', category_name: 'عام' }],
      get_live_streams: [{ stream_id: 7, name: 'قناة', category_id: '1' }],
      get_vod_categories: [{ category_id: '2', category_name: 'أفلام' }],
      get_vod_streams: [{ stream_id: 8, name: 'فيلم', category_id: '2', container_extension: 'mp4' }],
      get_series_categories: [{ category_id: '3', category_name: 'مسلسلات' }],
      get_series: [{ series_id: 9, name: 'مسلسل', category_id: '3' }],
    };
    globalThis.fetch = jest.fn(async (url: string) => {
      const action = /action=([a-z_]+)/.exec(String(url))?.[1] || '';
      if (action) actions.push(action);
      return { ok: true, json: async () => BODIES[action] || [] } as any;
    }) as any;
    const onConnected = jest.fn();
    const tree = await mount(full(onConnected));
    await type(tree, 'http://server:port', 'srv.example:8080');
    await type(tree, 'أدخل اسم المستخدم', 'user');
    await type(tree, 'أدخل كلمة المرور', 'pass');
    await signIn(tree);
    await waitFor(tree, () => onConnected.mock.calls.length > 0, 'the Xtream sign-in');
    const [channels, source] = onConnected.mock.calls[0];
    expect(source).toContain('http://srv.example:8080/get.php?username=user');
    expect(new Set(channels.map((c: any) => c.contentType))).toEqual(new Set(['live', 'movie', 'series']));
    expect(actions).toEqual(expect.arrayContaining(['get_live_streams', 'get_vod_streams', 'get_series']));
    await unmount(tree);
  });

  it('still signs in with an M3U link', async () => {
    const onConnected = jest.fn();
    const playlist = '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n#EXTINF:-1,قناة\nhttp://srv/live/u/p/1.ts\n';
    (ReactNativeBlobUtil as any).config = jest.fn(() => ({
      fetch: jest.fn(async () => {
        files.set('/cache/dl.m3u', playlist);
        return { path: () => '/cache/dl.m3u' };
      }),
    }));
    (ReactNativeBlobUtil.fs as any).stat = jest.fn(async () => ({ size: playlist.length }));
    const tree = await mount(full(onConnected));
    await press(tree, 'رابط M3U');
    await type(tree, 'http://provider.tv/playlist.m3u', 'provider.tv/list.m3u');
    await signIn(tree);
    await waitFor(tree, () => onConnected.mock.calls.length > 0, 'the Full link sign-in');
    const [channels, source] = onConnected.mock.calls[0];
    expect(source).toBe('http://provider.tv/list.m3u');
    expect(channels.map((c: any) => c.contentType).sort()).toEqual(['live', 'movie']);
    await unmount(tree);
  });

  it('still loads a local M3U file (keeping movies and series)', async () => {
    const onConnected = jest.fn();
    const tree = await mount(full(onConnected));
    await press(tree, 'ملف M3U');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    // Full keeps its two-step flow: pick, then sign in.
    expect(onConnected).not.toHaveBeenCalled();
    await signIn(tree);
    await waitFor(tree, () => onConnected.mock.calls.length > 0, 'the Full file sign-in');
    const [channels, source] = onConnected.mock.calls[0];
    expect(source).toBe(URI);
    expect(new Set(channels.map((c: any) => c.contentType))).toEqual(new Set(['live', 'movie', 'series']));
    await unmount(tree);
  });
});
