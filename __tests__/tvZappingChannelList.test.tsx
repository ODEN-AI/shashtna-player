import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

/**
 * Live TV on Android TV / TV box: D-pad zapping and the in-player channel list.
 *
 * The real PlayerScreen is rendered; react-native is wrapped only to capture
 * the TV-remote handler (useTVEventHandler) and BACK (BackHandler) so the test
 * can press keys the way a remote does.
 */
const mockRemote: { tv: ((evt: any) => void) | null; back: Array<() => boolean> } = { tv: null, back: [] };
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return Object.setPrototypeOf(
    {
      useTVEventHandler: (handler: (evt: any) => void) => {
        mockRemote.tv = handler;
      },
      BackHandler: {
        addEventListener: (_: string, fn: () => boolean) => {
          mockRemote.back.push(fn);
          return { remove: () => (mockRemote.back = mockRemote.back.filter(f => f !== fn)) };
        },
      },
    },
    RN,
  );
});

const { Platform } = require('react-native');
const setTV = (value: boolean) => Object.defineProperty(Platform, 'isTV', { configurable: true, get: () => value });
setTV(true); // before the player module loads (its TV-only row container is picked at import)

const PlayerScreen = require('../src/screens/Player/PlayerScreen').default;
const { AppPreferencesProvider } = require('../src/design/AppPreferencesContext');

const noop = () => {};
const prefs = { language: 'ar', setLanguage: noop, themeMode: 'dark', setThemeMode: noop, accent: 'shashtna', customAccent: null, setAccent: noop };
const ch = (i: number, group = 'أخبار', logo = '') =>
  ({ id: `live-${i}`, name: `قناة ${i}`, url: `http://srv/live/u/p/${i}.ts`, group, logo, tvgId: '', tvgName: '', contentType: 'live' } as any);
const QUEUE = [ch(1), ch(2), ch(3, 'رياضة', 'http://logo/3.png'), ch(4, 'رياضة'), ch(5, 'رياضة')];

type Tree = ReactTestRenderer.ReactTestRenderer;
const wait = (ms: number) => ReactTestRenderer.act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
const playing = (tree: Tree) => tree.root.findAll(n => n.props.source?.uri && n.props.paused !== undefined)[0]?.props.source.uri;
const texts = (tree: Tree) =>
  tree.root
    .findAll(n => typeof n.type === 'string')
    .flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string'))
    .join(' | ');
const byLabel = (tree: Tree, label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function' && typeof n.type !== 'string')[0];
// One physical press, exactly as React Native tvOS delivers it on Android
// (ReactAndroidHWInputDeviceHelper): a single onHWKeyEvent with ACTION_UP (1).
// Key-down (0) is not sent unless ReactFeatureFlags.enableKeyDownEvents is on.
// The earlier version of this helper fired 0, which a real TV never sends, so
// the tests passed while the remote did nothing (see "real Android key contract").
const KEY_UP = 1;
const KEY_DOWN = 0;
const key = (eventType: string) => ReactTestRenderer.act(() => mockRemote.tv?.({ eventType, eventKeyAction: KEY_UP }));
const keyRaw = (eventType: string, eventKeyAction: number) => ReactTestRenderer.act(() => mockRemote.tv?.({ eventType, eventKeyAction }));
const back = () => ReactTestRenderer.act(() => {
  for (let i = mockRemote.back.length - 1; i >= 0; i -= 1) if (mockRemote.back[i]()) return;
});
const COMMIT = 520; // > ZAP_COMMIT_MS (450): the zap has been applied

async function mount(start = 1, onBack = jest.fn()): Promise<Tree> {
  let tree: Tree | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <AppPreferencesProvider value={prefs}>
        <PlayerScreen channel={QUEUE[start]} liveQueue={QUEUE} onBack={onBack} />
      </AppPreferencesProvider>,
    );
  });
  return tree!;
}

beforeEach(() => {
  setTV(true);
  mockRemote.back = [];
});

describe('TV remote: UP/DOWN zap directly', () => {
  it('UP switches to the next channel, with the control bar showing and no OK first', async () => {
    const tree = await mount(1);
    expect(playing(tree)).toBe(QUEUE[1].url);
    expect(byLabel(tree, 'قائمة القنوات')).toBeDefined(); // controls are up
    await key('up');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('DOWN switches to the previous channel', async () => {
    const tree = await mount(2);
    await key('down');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[1].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('rapid presses are coalesced (existing zap debounce): one switch, to the final channel', async () => {
    const tree = await mount(0);
    await key('up');
    await key('up');
    await key('up');
    await wait(150);
    expect(playing(tree)).toBe(QUEUE[0].url); // still coalescing
    expect(texts(tree)).toContain('قناة 4'); // banner already names the target
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[3].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('no wrap-around: first/last channel stay put and say so', async () => {
    let tree = await mount(QUEUE.length - 1);
    await key('up');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[QUEUE.length - 1].url);
    expect(texts(tree)).toContain('هذه آخر قناة في القائمة');
    ReactTestRenderer.act(() => tree.unmount());

    tree = await mount(0);
    await key('down');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[0].url);
    expect(texts(tree)).toContain('هذه أول قناة في القائمة');
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('vertical focus cannot leave the control row on TV (so one key never zaps AND moves focus)', async () => {
    const tree = await mount(1);
    const backButton = byLabel(tree, 'رجوع');
    expect(backButton.props.focusable).toBe(false);
    const row = tree.root.findAll(n => n.props.trapFocusUp === true && n.props.trapFocusDown === true);
    expect(row.length).toBeGreaterThan(0);
    // Initial TV focus is on play/pause in the row, not on the top bar.
    expect(byLabel(tree, 'إيقاف').props.hasTVPreferredFocus).toBe(true);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('CH+/CH- keep working', async () => {
    const tree = await mount(1);
    await key('channelUp');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('TV remote: «قائمة القنوات» inside the player', () => {
  it('opens over the playing channel (playback continues), marks and focuses the playing channel', async () => {
    const tree = await mount(2);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    expect(playing(tree)).toBe(QUEUE[2].url);
    const video = tree.root.findAll(n => n.props.source?.uri && n.props.paused !== undefined)[0];
    expect(video.props.paused).toBe(false);
    const current = tree.root.findAll(n => n.props.accessibilityLabel === 'قناة 3' && n.props.accessibilityState)[0];
    expect(current.props.accessibilityState).toMatchObject({ selected: true });
    expect(current.props.hasTVPreferredFocus).toBe(true);
    const text = texts(tree);
    expect(text).toContain('قائمة القنوات');
    expect(text).toContain('يعرض الآن');
    // Real groups from the playlist, no invented ones. The list opens scrolled to
    // the playing channel, so the first header may sit above the rendered window:
    // check the virtualized list's data rather than only what is on screen.
    expect(text).toContain('رياضة');
    const list = tree.root.findAll(n => Array.isArray(n.props.data) && n.props.getItemLayout)[0];
    const headers = list.props.data.filter((r: { kind: string }) => r.kind === 'group');
    expect(headers.map((h: { label: string }) => h.label)).toEqual(['أخبار', 'رياضة']);
    expect(list.props.initialScrollIndex).toBeGreaterThan(0);
    // A real logo is shown; channels without one get no placeholder.
    expect(tree.root.findAll(n => n.props.source?.uri === 'http://logo/3.png').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('UP/DOWN inside the list do not zap', async () => {
    const tree = await mount(2);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    await key('up');
    await key('down');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('selecting a channel tunes to it at once and closes the list', async () => {
    const tree = await mount(0);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    await ReactTestRenderer.act(async () => byLabel(tree, 'قناة 5').props.onPress());
    expect(playing(tree)).toBe(QUEUE[4].url); // no coalescing delay
    expect(texts(tree)).not.toContain('يعرض الآن');
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('BACK closes the list, stays in the player, and focus returns to «قائمة القنوات»', async () => {
    const onBack = jest.fn();
    const tree = await mount(1, onBack);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    await back();
    expect(onBack).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('يعرض الآن');
    expect(playing(tree)).toBe(QUEUE[1].url);
    expect(byLabel(tree, 'قائمة القنوات').props.hasTVPreferredFocus).toBe(true);
    // A second BACK leaves the player as before.
    await back();
    expect(onBack).toHaveBeenCalled();
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('phones and tablets (touch, not TV)', () => {
  it('arrow keys do not zap while controls show; touch buttons still switch channels', async () => {
    setTV(false);
    const tree = await mount(1);
    await key('up');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[1].url);
    expect(byLabel(tree, 'رجوع').props.focusable).toBe(true);
    await ReactTestRenderer.act(async () => byLabel(tree, 'القناة التالية').props.onPress());
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('loading badge (Shashtna editions)', () => {
  it('keeps the «ش» mark (unchanged); عامر IPTV is covered in playerLoadingMarkAmer.test.tsx', async () => {
    const tree = await mount(1);
    expect(texts(tree)).toMatch(/(^|\|\s)ش(\s\||$)/);
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('channel list grouping', () => {
  const { buildChannelRows } = require('../src/features/player/ChannelListPanel');
  const c = (i: number, group: string) => ({ id: `c${i}`, name: `c${i}`, url: '', group, logo: '', tvgId: '', tvgName: '', contentType: 'live' });

  it('group blocks (normal playlist order) get one header per group', () => {
    const { rows, grouped } = buildChannelRows([c(1, 'أخبار'), c(2, 'أخبار'), c(3, 'رياضة'), c(4, 'رياضة')]);
    expect(grouped).toBe(true);
    expect(rows.filter((r: any) => r.kind === 'group').map((r: any) => [r.label, r.count])).toEqual([['أخبار', 2], ['رياضة', 2]]);
  });

  it('interleaved groups stay a flat list (no header on every row)', () => {
    const { rows, grouped } = buildChannelRows([c(1, 'أ'), c(2, 'ب'), c(3, 'أ'), c(4, 'ب'), c(5, 'أ'), c(6, 'ب')]);
    expect(grouped).toBe(false);
    expect(rows.every((r: any) => r.kind === 'channel')).toBe(true);
  });

  it('no groups in the playlist: no invented headers', () => {
    const { rows, grouped } = buildChannelRows([c(1, ''), c(2, '')]);
    expect(grouped).toBe(false);
    expect(rows.length).toBe(2);
  });

  it('handles thousands of channels quickly', () => {
    const many = Array.from({ length: 20000 }, (_, i) => c(i, `g${Math.floor(i / 500)}`));
    const t = Date.now();
    const { rows } = buildChannelRows(many);
    expect(rows.length).toBe(20000 + 40);
    expect(Date.now() - t).toBeLessThan(500);
  });
});

/* ------------------------------------------------------------------------- */
/* Real-device regressions (Amer TV test build): the contract, not the mocks. */
/* ------------------------------------------------------------------------- */

const { setDiagnosticsSink } = require('../src/lib/tvDiagnostics');
function captureDiag(): { lines: string[]; of: (tag: string) => any[]; stop: () => void } {
  const lines: string[] = [];
  setDiagnosticsSink((line: string) => lines.push(line));
  return {
    lines,
    of: (tag: string) => lines.filter(l => l.startsWith(`${tag} `)).map(l => JSON.parse(l.slice(tag.length + 1))),
    stop: () => setDiagnosticsSink(null),
  };
}

describe('real Android key contract (the physical-remote bug)', () => {
  it('the installed React Native TV layer only emits D-pad/CH keys on ACTION_UP (key-down needs a flag this app does not set)', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.dirname(require.resolve('react-native/package.json'));
    const helper = fs.readFileSync(path.join(root, 'ReactAndroid/src/main/java/com/facebook/react/modules/core/ReactAndroidHWInputDeviceHelper.java'), 'utf8');
    const rootView = fs.readFileSync(path.join(root, 'ReactAndroid/src/main/java/com/facebook/react/ReactRootView.java'), 'utf8');
    // ReactRootView uses this helper for every key...
    expect(rootView).toContain('import com.facebook.react.modules.core.ReactAndroidHWInputDeviceHelper;');
    expect(rootView).toMatch(/mAndroidHWInputDeviceHelper\.handleKeyEvent\(ev, context\);\s*}\s*return super\.dispatchKeyEvent\(ev\);/);
    // ...which sends ACTION_UP, and ACTION_DOWN only with enableKeyDownEvents (or a long press).
    expect(helper).toMatch(/\(eventKeyAction == KeyEvent\.ACTION_UP\) \|\|\s*\(eventKeyAction == KeyEvent\.ACTION_DOWN && !longPressEventActive && ReactFeatureFlags\.enableKeyDownEvents\)/);
    expect(helper).toContain('.put(KeyEvent.KEYCODE_DPAD_UP, "up")');
    expect(helper).toContain('.put(KeyEvent.KEYCODE_DPAD_DOWN, "down")');
    // The app never turns key-down events on, so a press reaches JS as eventKeyAction 1 only.
    const javaDir = path.join(__dirname, '../android/app/src/main/java');
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: any) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(javaDir)) expect(fs.readFileSync(file, 'utf8')).not.toContain('enableKeyDownEvents');
  });

  it('channelStepFor: key-up steps, key-down halves never do, one step per press', () => {
    const { channelStepFor } = require('../src/lib/tvRemote');
    expect(channelStepFor({ eventType: 'up', eventKeyAction: 1 })).toBe(1);
    expect(channelStepFor({ eventType: 'down', eventKeyAction: 1 })).toBe(-1);
    expect(channelStepFor({ eventType: 'channelUp', eventKeyAction: 1 })).toBe(1);
    expect(channelStepFor({ eventType: 'channelDown', eventKeyAction: 1 })).toBe(-1);
    expect(channelStepFor({ eventType: 'longUp', eventKeyAction: 1 })).toBe(1);
    expect(channelStepFor({ eventType: 'up', eventKeyAction: 0 })).toBeNull();
    expect(channelStepFor({ eventType: 'longDown', eventKeyAction: 0 })).toBeNull();
    expect(channelStepFor({ eventType: 'left', eventKeyAction: 1 })).toBeNull();
    expect(channelStepFor({ eventType: 'select', eventKeyAction: 1 })).toBeNull();
    expect(channelStepFor(null)).toBeNull();
  });

  it('a physical UP (key-up only, as the TV sends it) zaps; before the fix this event was dropped', async () => {
    const tree = await mount(1);
    await keyRaw('up', KEY_UP);
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('key-down + key-up of one press (enableKeyDownEvents on) is still exactly one step', async () => {
    const tree = await mount(1);
    await keyRaw('down', KEY_DOWN);
    await keyRaw('down', KEY_UP);
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[0].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('a held key (longUp: down once, up on release) is one step, not two', async () => {
    const tree = await mount(1);
    await keyRaw('longUp', KEY_DOWN);
    await keyRaw('longUp', KEY_UP);
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('SeekBar LEFT/RIGHT use the same contract (they were dropped on key-up too)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../src/features/player/SeekBar'), 'utf8');
    expect(src).toContain('isPressCompletion(evt)');
    expect(src).not.toMatch(/eventKeyAction === 1\) return/);
  });

  it('list closed: UP/DOWN zap; list open: UP/DOWN are list navigation only; closed again: zap again', async () => {
    const tree = await mount(1);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    await key('up');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[1].url); // open: no zap
    await back(); // close
    await key('up');
    await wait(COMMIT);
    expect(playing(tree)).toBe(QUEUE[2].url); // closed: zap
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('AMER_TV_INPUT traces event → decision → zap → tuneTo start → tuneTo complete, with no URLs', async () => {
    const diag = captureDiag();
    try {
      const tree = await mount(1);
      await key('up');
      await wait(COMMIT);
      const video = tree.root.findAll(n => n.props.source?.uri && typeof n.props.onLoad === 'function')[0];
      await ReactTestRenderer.act(async () => video.props.onLoad({ duration: 0, audioTracks: [], textTracks: [], videoTracks: [] }));
      const input = diag.of('AMER_TV_INPUT');
      expect(input[0]).toMatchObject({ stage: 'event', eventType: 'up', eventKeyAction: 1, reachedPlayer: true, index: 1, count: 5, decision: 'zap', showControls: true });
      expect(input.map(e => e.stage)).toEqual(['event', 'zap:pending', 'tuneTo:start', 'tuneTo:complete']);
      expect(input[2]).toMatchObject({ source: 'remote:up', fromIndex: 1, targetIndex: 2, targetId: 'live-3' });
      expect(diag.lines.join('\n')).not.toMatch(/http|srv\/live/);
      ReactTestRenderer.act(() => tree.unmount());
    } finally {
      diag.stop();
    }
  });
});

describe('channel list: one live queue, rendered in the player (the empty-list bug)', () => {
  it('is an overlay in the player tree (no Modal window), with no subview clipping', async () => {
    const tree = await mount(2);
    await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
    const { Modal } = jest.requireActual('react-native');
    const panel = tree.root.findAll(n => n.props.testID === 'channel-list-panel')[0];
    expect(panel).toBeDefined();
    let node: any = panel;
    while (node) {
      expect(node.type).not.toBe(Modal);
      node = node.parent;
    }
    const list = tree.root.findAll(n => Array.isArray(n.props.data) && n.props.getItemLayout)[0];
    expect(list.props.removeClippedSubviews).toBe(false);
    expect(list.props.data.filter((r: any) => r.kind === 'channel').length).toBe(QUEUE.length);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('lists exactly the queue UP/DOWN zaps through, marks the zapped-to channel, and selects via tuneTo', async () => {
    const diag = captureDiag();
    try {
      const tree = await mount(1);
      await key('up'); // zap to index 2 through the remote path
      await wait(COMMIT);
      await key('up'); // and index 3
      await wait(COMMIT);
      // A zap hides the control bar (as before); bring it back like a viewer does.
      await ReactTestRenderer.act(async () => byLabel(tree, 'إظهار عناصر التحكم').props.onPress());
      await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
      const list = tree.root.findAll(n => Array.isArray(n.props.data) && n.props.getItemLayout)[0];
      const channels = list.props.data.filter((r: any) => r.kind === 'channel').map((r: any) => r.channel);
      expect(channels).toEqual(QUEUE); // same objects, same order
      const current = tree.root.findAll(n => n.props.accessibilityState?.selected === true && n.props.accessibilityLabel)[0];
      expect(current.props.accessibilityLabel).toBe('قناة 4');
      await ReactTestRenderer.act(async () => byLabel(tree, 'قناة 3').props.onPress());
      expect(playing(tree)).toBe(QUEUE[2].url);
      const tune = diag.of('AMER_TV_INPUT').filter(e => e.stage === 'tuneTo:start');
      expect(tune.map(e => e.source)).toEqual(['remote:up', 'remote:up', 'channel-list']);
      const open = diag.of('AMER_TV_CHANNELS').find(e => e.stage === 'open');
      expect(open).toMatchObject({ currentIndex: 3, queueCount: 5, firstId: 'live-1', lastId: 'live-5', firstName: 'قناة 1', lastName: 'قناة 5' });
      const mounted = diag.of('AMER_TV_CHANNELS').find(e => e.stage === 'panel:mount');
      expect(mounted).toMatchObject({ receivedCount: 5, rowCount: 7, currentIndex: 3 });
      expect(diag.lines.join('\n')).not.toMatch(/http|srv\/live/);
      ReactTestRenderer.act(() => tree.unmount());
    } finally {
      diag.stop();
    }
  });

  it('an empty queue shows a real message, never a blank panel', async () => {
    const ChannelListPanel = require('../src/features/player/ChannelListPanel').default;
    let tree: Tree | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppPreferencesProvider value={prefs}>
          <ChannelListPanel channels={[]} currentIndex={-1} ar onSelect={noop} onClose={noop} />
        </AppPreferencesProvider>,
      );
    });
    expect(tree!.root.findAll(n => n.props.testID === 'channel-list-empty').length).toBeGreaterThan(0);
    expect(texts(tree!)).toContain('لا توجد قنوات في هذه القائمة');
    ReactTestRenderer.act(() => tree!.unmount());
  });

  it('logs the list viewport and the rows that really became visible (what the TV reports)', async () => {
    const diag = captureDiag();
    try {
      const tree = await mount(2);
      await ReactTestRenderer.act(async () => byLabel(tree, 'قائمة القنوات').props.onPress());
      const list = tree.root.findAll(n => Array.isArray(n.props.data) && n.props.getItemLayout)[0];
      await ReactTestRenderer.act(async () => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 480, height: 0 } } }));
      await ReactTestRenderer.act(async () => list.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 480, height: 620 } } }));
      await ReactTestRenderer.act(async () => list.props.onViewableItemsChanged({ viewableItems: [{ index: 2 }, { index: 3 }, { index: 4 }], changed: [] }));
      const stages = diag.of('AMER_TV_CHANNELS').map(e => e.stage);
      expect(stages).toEqual(expect.arrayContaining(['open', 'panel:mount', 'panel:zero-height', 'panel:layout', 'panel:rows-visible']));
      expect(diag.of('AMER_TV_CHANNELS').find(e => e.stage === 'panel:rows-visible')).toMatchObject({ renderedRows: 3, firstVisibleRow: 2 });
      ReactTestRenderer.act(() => tree.unmount());
    } finally {
      diag.stop();
    }
  });
});
