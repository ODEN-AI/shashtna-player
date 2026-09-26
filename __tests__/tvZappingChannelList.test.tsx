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
const key = (eventType: string) => ReactTestRenderer.act(() => mockRemote.tv?.({ eventType, eventKeyAction: 0 }));
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
