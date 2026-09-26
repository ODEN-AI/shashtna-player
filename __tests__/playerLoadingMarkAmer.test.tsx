import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

/**
 * عامر IPTV player: no «ش» (Shashtna's mark) anywhere while a channel opens or
 * while zapping; only the channel's real logo, when the playlist has one.
 * Same module swap as metro.amer.config.js.
 */
jest.mock('../src/design/brand', () => jest.requireActual('../src/variants/amer/brand'));

const PlayerScreen = require('../src/screens/Player/PlayerScreen').default;
const ChannelBanner = require('../src/features/player/ChannelBanner').default;
const { AppPreferencesProvider } = require('../src/design/AppPreferencesContext');

const noop = () => {};
const prefs = { language: 'ar', setLanguage: noop, themeMode: 'dark', setThemeMode: noop, accent: 'shashtna', customAccent: null, setAccent: noop };
const ch = (i: number, name: string, logo = '') =>
  ({ id: `live-${i}`, name, url: `http://srv/live/u/p/${i}.ts`, group: 'أخبار', logo, tvgId: '', tvgName: '', contentType: 'live' } as any);
// A channel whose own name starts with «ش», and one with a real logo.
const QUEUE = [ch(1, 'شبكة الإعلام'), ch(2, 'قناة بشعار', 'http://logo/2.png'), ch(3, 'قناة 3')];

type Tree = ReactTestRenderer.ReactTestRenderer;
const texts = (tree: Tree) =>
  tree.root.findAll(n => typeof n.type === 'string').flatMap(n => [].concat(n.props.children).filter(c => typeof c === 'string'));
const render = (element: React.ReactElement): Tree => {
  let tree: Tree | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppPreferencesProvider value={prefs}>{element}</AppPreferencesProvider>);
  });
  return tree!;
};

describe('عامر IPTV: no «ش» in the player', () => {
  it('opening a channel without a logo: spinner, no «ش» badge, no placeholder', () => {
    const tree = render(<PlayerScreen channel={QUEUE[0]} liveQueue={QUEUE} onBack={noop} />);
    const shown = texts(tree);
    expect(shown).not.toContain('ش');
    expect(tree.root.findAll(n => n.props.testID === 'player-loading-spinner').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.props.testID === 'player-loading-channel-logo')).toEqual([]);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('opening a channel with a real logo: the logo is shown instead', () => {
    const tree = render(<PlayerScreen channel={QUEUE[1]} liveQueue={QUEUE} onBack={noop} />);
    expect(texts(tree)).not.toContain('ش');
    expect(tree.root.findAll(n => n.props.testID === 'player-loading-channel-logo').length).toBeGreaterThan(0);
    expect(tree.root.findAll(n => n.props.source?.uri === 'http://logo/2.png').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('zap banner: no initials placeholder («شب») when the channel has no logo; real logos still show', () => {
    let tree = render(<ChannelBanner state={{ channel: QUEUE[0], number: 1, total: 3, pending: false }} loading={false} ar />);
    expect(texts(tree)).not.toContain('شب');
    expect(texts(tree)).toContain('شبكة الإعلام'); // the channel's own name stays
    ReactTestRenderer.act(() => tree.unmount());
    tree = render(<ChannelBanner state={{ channel: QUEUE[1], number: 2, total: 3, pending: false }} loading={false} ar />);
    expect(tree.root.findAll(n => n.props.source?.uri === 'http://logo/2.png').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });
});
