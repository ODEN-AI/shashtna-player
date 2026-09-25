/// <reference types="node" />
import React from 'react';
import { NativeModules } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import ReactTestRenderer from 'react-test-renderer';

import { loadConnectionSource } from '../src/lib/connectionSession';
import {
  createM3UTextParser,
  downloadAndParseM3U,
  NoLiveChannelsError,
  PlaylistEmptyError,
  PlaylistFormatError,
} from '../src/lib/m3u';
import { PlaylistReadError } from '../src/lib/playlistPicker';
import { describeConnectionError } from '../src/screens/Connection/connectionErrors';

/**
 * Shashtna Player Lite: importing a local M3U file.
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
  pickPlaylist: jest.fn(async (): Promise<{ uri: string; name: string; size: number } | null> => null),
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
    const channels = await downloadAndParseM3U(URI, (r, t) => progress.push([r, t]), undefined, {
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
    const chunked = await downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true });
    const whole = createM3UTextParser({ liveOnly: true });
    whole.push(PLAYLIST);
    expect(chunked).toEqual(whole.end());
    expect(chunked[0]).toMatchObject({ name: 'العراقية', group: 'قنوات عراقية', logo: 'http://logo/iq.png', tvgId: 'iraqia', contentType: 'live' });
  });

  it('Lite keeps live channels only: movies, series and VOD files are dropped', async () => {
    disk.set(URI, PLAYLIST);
    const channels = await downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true });
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
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistEmptyError);
    disk.set(URI, ' \r\n \n\t');
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistEmptyError);
  });

  it('rejects a file that is not M3U', async () => {
    disk.set(URI, 'name,url\nقناة,http://x/1.ts\n');
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistFormatError);
  });

  it('rejects a playlist with no live channels (VOD only, or header only)', async () => {
    disk.set(URI, '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n');
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(NoLiveChannelsError);
    disk.set(URI, '#EXTM3U\n');
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(NoLiveChannelsError);
  });

  it('reports a file that can no longer be opened', async () => {
    await expect(downloadAndParseM3U(URI, undefined, undefined, { liveOnly: true })).rejects.toBeInstanceOf(PlaylistReadError);
  });

  it('gives each failure a clear Arabic message', () => {
    const msg = (e: unknown) => describeConnectionError(e, true).message;
    expect(msg(new PlaylistReadError('FileNotFoundException', 'E_NOT_FOUND'))).toContain('تعذر قراءة ملف M3U');
    expect(msg(new PlaylistEmptyError())).toContain('الملف فارغ');
    expect(msg(new PlaylistFormatError())).toContain('صيغة الملف غير مدعومة');
    expect(msg(new NoLiveChannelsError())).toContain('لم يتم العثور على قنوات مباشرة داخل الملف');
  });
});

// ---------------------------------------------------------------------------
// The whole Lite flow, rendered: pick -> read -> parse -> store -> Live TV.

const LiteApp = require('../src/variants/lite/LiteApp').default;
const { importNoticeText } = require('../src/variants/lite/LiteApp');

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
async function mount(): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<LiteApp />);
  });
  return tree!;
}
async function unmount(tree: Tree) {
  await ReactTestRenderer.act(async () => tree.unmount());
}
const channelShown = (tree: Tree, name: string) => labelled(tree, name).length > 0;
const pickReturns = (uri: string, text: string) => {
  disk.set(uri, text);
  native.pickPlaylist.mockResolvedValueOnce({ uri, name: 'iraq.m3u', size: Buffer.byteLength(text) });
};

describe('Shashtna Player Lite: M3U file import flow', () => {
  it('has no M3U URL field: only the account and the M3U file options', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'ملف M3U').length > 0, 'the connection screen');
    expect(labelled(tree, 'رابط M3U')).toEqual([]);
    expect(labelled(tree, 'بيانات الحساب').length).toBeGreaterThan(0);
    await press(tree, 'ملف M3U');
    expect(allText(tree)).not.toMatch(/رابط قائمة التشغيل|Playlist link/);
    expect(tree.root.findAll(n => n.props.placeholder === 'http://provider.tv/playlist.m3u')).toEqual([]);
    await unmount(tree);
  });

  it('imports the picked file right away and shows its live channels, with a success notice and count', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'ملف M3U').length > 0, 'the connection screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, PLAYLIST);
    // One action: choose the file. No URL, no extra sign-in step, no restart.
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => LIVE_NAMES.every(name => channelShown(tree, name)), 'the imported channels');

    const text = allText(tree);
    const notice = importNoticeText(LIVE_NAMES.length, true);
    expect(notice.title).toBe('تم تحميل ملف M3U بنجاح');
    expect(text).toContain(notice.title);
    expect(text).toContain(`عدد القنوات: ${(3).toLocaleString('ar-IQ')}`);
    for (const vod of VOD_NAMES) expect(channelShown(tree, vod)).toBe(false);
    // Still Live TV only.
    expect(text).toContain('البث المباشر');
    for (const banned of ['الأفلام', 'المسلسلات', 'الرئيسية']) expect(labelled(tree, banned)).toEqual([]);
    // The source is saved for the next launch.
    expect(await loadConnectionSource()).toBe(URI);
    await unmount(tree);
  });

  it('restores the imported file on the next launch, and explains when the file is gone', async () => {
    let tree = await mount();
    await waitFor(tree, () => labelled(tree, 'ملف M3U').length > 0, 'the connection screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, PLAYLIST);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => channelShown(tree, 'العراقية'), 'the imported channels');
    await unmount(tree);

    // Next launch: read again from the saved URI (persisted read permission).
    native.openPlaylist.mockClear();
    tree = await mount();
    await waitFor(tree, () => LIVE_NAMES.every(name => channelShown(tree, name)), 'the restored channels');
    expect(native.openPlaylist).toHaveBeenCalledWith(URI);
    expect(allText(tree)).not.toContain('تم تحميل ملف M3U بنجاح'); // only after an import
    await unmount(tree);

    // The file was deleted / access revoked: back to the file tab with a clear message.
    disk.delete(URI);
    tree = await mount();
    await waitFor(tree, () => allText(tree).includes('تعذر قراءة ملف M3U'), 'the read error');
    const fileTab = labelled(tree, 'ملف M3U')[0];
    expect(fileTab.props.accessibilityState).toMatchObject({ selected: true });
    await unmount(tree);
  });

  it.each([
    ['an empty file', '', 'الملف فارغ'],
    ['a file that is not M3U', 'just some text\nnot a playlist', 'صيغة الملف غير مدعومة'],
    ['a playlist without live channels', '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n', 'لم يتم العثور على قنوات مباشرة داخل الملف'],
  ])('shows an Arabic error and stays on the import screen for %s', async (_case, content, message) => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'ملف M3U').length > 0, 'the connection screen');
    await press(tree, 'ملف M3U');
    pickReturns(URI, content);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await waitFor(tree, () => allText(tree).includes(message), `the message "${message}"`);
    expect(allText(tree)).toContain('تعذر استيراد ملف M3U');
    expect(await loadConnectionSource()).toBeNull();
    await unmount(tree);
  });

  it('does nothing (and shows no error) when the picker is cancelled', async () => {
    const tree = await mount();
    await waitFor(tree, () => labelled(tree, 'ملف M3U').length > 0, 'the connection screen');
    await press(tree, 'ملف M3U');
    native.pickPlaylist.mockResolvedValueOnce(null);
    await press(tree, 'اختيار ملف قائمة التشغيل');
    expect(native.openPlaylist).not.toHaveBeenCalled();
    expect(allText(tree)).not.toContain('تعذر');
    await unmount(tree);
  });
});

describe('Shashtna Player (Full) connection screen is unchanged', () => {
  it('still offers account, M3U link and M3U file, and the link still connects', async () => {
    const ConnectionScreen = require('../src/screens/Connection/ConnectionScreen').default;
    const { AppPreferencesProvider } = require('../src/design/AppPreferencesContext');
    const { PLAYLIST_LINK } = require('../src/screens/Connection/playlistLink');
    const noop = () => {};
    const prefs = { language: 'ar', setLanguage: noop, themeMode: 'dark', setThemeMode: noop, accent: 'shashtna', customAccent: null, setAccent: noop };
    const onConnected = jest.fn();
    const playlist = '#EXTM3U\n#EXTINF:-1 group-title="أفلام",فيلم\nhttp://srv/movie/u/p/9.mp4\n#EXTINF:-1,قناة\nhttp://srv/live/u/p/1.ts\n';
    (ReactNativeBlobUtil as any).config = jest.fn(() => ({
      fetch: jest.fn(async () => {
        files.set('/cache/dl.m3u', playlist);
        return { path: () => '/cache/dl.m3u' };
      }),
    }));
    (ReactNativeBlobUtil.fs as any).stat = jest.fn(async () => ({ size: playlist.length }));
    let tree: Tree | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppPreferencesProvider value={prefs}>
          <ConnectionScreen onConnected={onConnected} edition={{ id: 'full', liveOnly: false, playlistLink: PLAYLIST_LINK }} />
        </AppPreferencesProvider>,
      );
    });
    for (const tab of ['بيانات الحساب', 'رابط M3U', 'ملف M3U']) expect(labelled(tree!, tab).length).toBeGreaterThan(0);
    await press(tree!, 'رابط M3U');
    const input = tree!.root.findAll(n => n.props.placeholder === 'http://provider.tv/playlist.m3u' && typeof n.props.onChangeText === 'function')[0];
    await ReactTestRenderer.act(async () => input.props.onChangeText('provider.tv/list.m3u'));
    await press(tree!, 'رابط M3U'); // re-select: keeps the typed link
    const button = tree!.root.findAll(
      n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'تسجيل الدخول').length > 0,
    )[0];
    await ReactTestRenderer.act(async () => {
      await button.props.onPress();
    });
    await waitFor(tree!, () => onConnected.mock.calls.length > 0, 'the Full link sign-in');
    const [channels, source] = onConnected.mock.calls[0];
    expect(source).toBe('http://provider.tv/list.m3u');
    // Full keeps movies too.
    expect(channels.map((c: any) => c.contentType).sort()).toEqual(['live', 'movie']);
    await unmount(tree!);
  });
});
