import React from 'react';
import { NativeModules, Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

/**
 * عامر IPTV on Android TV: the "ملف M3U" picker must never leave the app stuck.
 * Runs the real Amer sign-in screen (the same module swap metro.amer.config.js
 * does) against a stand-in for PlaylistPickerModule's JS contract.
 */
jest.mock('../src/design/brand', () => jest.requireActual('../src/variants/amer/brand'));

const AmerSignInScreen = require('../src/variants/amer/AmerSignInScreen').default;
const { AppPreferencesProvider } = require('../src/design/AppPreferencesContext');

const native = {
  pickPlaylist: jest.fn(),
  openPlaylist: jest.fn(),
  readPlaylistChunk: jest.fn(),
  closePlaylist: jest.fn(),
};
const noop = () => {};
const prefs = { language: 'ar', setLanguage: noop, themeMode: 'dark', setThemeMode: noop, accent: 'shashtna', customAccent: null, setAccent: noop };
type Tree = ReactTestRenderer.ReactTestRenderer;
// On a device View instances carry requestTVFocus() (react-native-tvos). Under
// Jest, View is a mock class component, so the spy goes on its prototype.
const focusCalls = jest.fn();
(require('react-native').View as any).prototype.requestTVFocus = focusCalls;

const allText = (tree: Tree) =>
  tree.root
    .findAll(n => typeof n.type === 'string')
    .flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string'))
    .join(' | ');
const labelled = (tree: Tree, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
async function press(tree: Tree, label: string) {
  const target = labelled(tree, label)[0];
  if (!target) throw new Error(`Nothing labelled "${label}". Screen: ${allText(tree).slice(0, 300)}`);
  await ReactTestRenderer.act(async () => {
    await target.props.onPress();
  });
}
async function flush() {
  await ReactTestRenderer.act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}
async function mount(onImport = jest.fn(async () => {})): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <AppPreferencesProvider value={prefs}>
        <AmerSignInScreen onImport={onImport} />
      </AppPreferencesProvider>,
      { createNodeMock: () => ({}) },
    );
  });
  await press(tree!, 'ملف M3U');
  return tree!;
}
const setTV = (value: boolean) => Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });

beforeAll(() => {
  (NativeModules as any).ShashtnaPlaylistPicker = native;
});
beforeEach(() => {
  jest.clearAllMocks();
  setTV(true);
  globalThis.fetch = jest.fn(async () => {
    throw new Error('offline');
  }) as any;
});
afterAll(() => setTV(false));

describe('عامر IPTV: ملف M3U picker on Android TV', () => {
  it('no usable file picker: clear Arabic error, and the app stays usable', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_UNAVAILABLE', reason: 'only platform stubs' });
    const tree = await mount();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(allText(tree)).toContain('تعذر فتح مدير الملفات على هذا الجهاز');
    expect(focusCalls).toHaveBeenCalled(); // remote focus back on the file field
    // Still usable: the picker can be tried again, and the account tab works.
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    await press(tree, 'اختيار ملف قائمة التشغيل');
    expect(native.pickPlaylist).toHaveBeenCalledTimes(2);
    await press(tree, 'بيانات الحساب');
    expect(tree.root.findAll(n => n.props.placeholder === 'أدخل اسم المستخدم').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a picker that could not be started shows the same message', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_LAUNCH_FAILED', reason: 'SecurityException' });
    const tree = await mount();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(allText(tree)).toContain('تعذر فتح مدير الملفات على هذا الجهاز');
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('coming back without a file (cancel / TV stub): no error, focus returns to the file field', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    const tree = await mount();
    focusCalls.mockClear();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(allText(tree)).not.toContain('تعذر');
    expect(focusCalls).toHaveBeenCalled();
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('phones and tablets are left alone: no focus requests', async () => {
    setTV(false);
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    const tree = await mount();
    focusCalls.mockClear();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(focusCalls).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a double tap while the picker opens (E_BUSY) is ignored, not shown as an error', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'PICKER_BUSY', reason: 'already_open' });
    const tree = await mount();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(allText(tree)).not.toContain('تعذر');
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('while the picked file loads, the field and button stay focusable (not disabled) and ignore presses', async () => {
    let finishRead: (value: { text: string | null; bytes: number }) => void = () => {};
    native.pickPlaylist.mockResolvedValueOnce({ status: 'picked', uri: 'file:///data/user/0/com.ameriptv.player/files/playlists/import-1.m3u', name: 'tv.m3u', size: 64, original: 'content://docs/tv.m3u' });
    native.openPlaylist.mockResolvedValueOnce('h1');
    native.readPlaylistChunk.mockImplementationOnce(() => new Promise(resolve => (finishRead = resolve)));
    const tree = await mount();
    // Not awaited: the import stays in progress until finishRead().
    const pick = labelled(tree, 'اختيار ملف قائمة التشغيل')[0];
    let done: Promise<unknown> = Promise.resolve();
    ReactTestRenderer.act(() => {
      done = pick.props.onPress();
    });
    await flush();
    // Loading: the picked file is being read.
    // The Pressable itself (its onPress is off while loading).
    const field = tree.root.findAll(n => n.props.accessibilityLabel === 'tv.m3u' && n.props.focusable === true && typeof n.type !== 'string')[0];
    expect(field).toBeDefined();
    expect(field.props.disabled).toBeUndefined();
    expect(field.props.onPress).toBeUndefined();
    const buttons = tree.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.accessibilityState?.busy === true);
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const b of buttons) expect(b.props.disabled).toBeUndefined();
    // Nothing to press while loading: no second picker.
    expect(native.pickPlaylist).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => {
      finishRead({ text: null, bytes: 0 });
      await done;
    });
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('عامر IPTV: the upload button while the system picker is open', () => {
  it('shows a loading state, ignores a second press, and recovers cleanly on cancel', async () => {
    let answer: (value: unknown) => void = () => {};
    native.pickPlaylist.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));
    const tree = await mount();
    const field = () => labelled(tree, 'اختيار ملف قائمة التشغيل')[0] ?? tree.root.findAll(n => n.props.accessibilityLabel === 'اختيار ملف قائمة التشغيل')[0];
    let first: Promise<unknown> = Promise.resolve();
    ReactTestRenderer.act(() => {
      first = field().props.onPress();
    });
    await flush();
    expect(allText(tree)).toContain('جاري فتح مدير الملفات…');
    expect(tree.root.findAll(n => n.props.testID === 'file-picker-busy').length).toBeGreaterThan(0);
    // Remote double press: the field ignores presses while busy, so no second picker.
    expect(field().props.onPress).toBeUndefined();
    expect(native.pickPlaylist).toHaveBeenCalledTimes(1);
    focusCalls.mockClear();
    await ReactTestRenderer.act(async () => {
      answer({ status: 'cancelled' });
      await first;
    });
    // Never stuck: loading is gone, no error, focus back on the field, and it works again.
    expect(allText(tree)).not.toContain('جاري فتح مدير الملفات…');
    expect(allText(tree)).not.toContain('تعذر');
    expect(focusCalls).toHaveBeenCalled();
    native.pickPlaylist.mockResolvedValueOnce({ status: 'cancelled' });
    await press(tree, 'اختيار ملف قائمة التشغيل');
    expect(native.pickPlaylist).toHaveBeenCalledTimes(2);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('an error from the picker also ends the loading state (never stuck)', async () => {
    native.pickPlaylist.mockResolvedValueOnce({ status: 'error', code: 'FILE_READ_FAILED', reason: 'permission' });
    const tree = await mount();
    await press(tree, 'اختيار ملف قائمة التشغيل');
    await flush();
    expect(allText(tree)).not.toContain('جاري فتح مدير الملفات…');
    expect(allText(tree)).toContain('تعذر قراءة ملف M3U');
    ReactTestRenderer.act(() => tree.unmount());
  });
});
