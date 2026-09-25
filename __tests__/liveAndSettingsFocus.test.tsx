import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { AppPreferencesProvider } from '../src/design/AppPreferencesContext';
import { buildCatalog } from '../src/features/catalog/catalog';
import { screenMemory } from '../src/navigation/tvFocus';
import LiveScreen from '../src/screens/Live/LiveScreen';
import SettingsScreen from '../src/screens/Settings/SettingsScreen';

/** Live TV and Settings exactly as Shashtna Player Lite renders them. */

const CHANNELS = [
  { id: 1, name: 'العراقية', url: 'http://s/1.ts', group: 'أخبار', contentType: 'live' },
  { id: 2, name: 'الشرقية', url: 'http://s/2.ts', group: 'أخبار', contentType: 'live' },
  { id: 3, name: 'بي إن سبورت', url: 'http://s/3.ts', group: 'رياضة', contentType: 'live' },
] as any[];

const catalog = buildCatalog(CHANNELS, { liveOnly: true });
const noop = () => {};
const PREFS = {
  language: 'ar' as const,
  setLanguage: noop,
  themeMode: 'dark' as const,
  setThemeMode: noop,
  accent: 'gold' as any,
  customAccent: null,
  setAccent: noop,
};

function render(element: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppPreferencesProvider value={PREFS}>{element}</AppPreferencesProvider>);
  });
  return tree!;
}

const byLabel = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.accessibilityLabel === label);
const press = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
  ReactTestRenderer.act(() =>
    tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress(),
  );
const channelNames = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll(n => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string')
    .map(n => n.props.accessibilityLabel as string)
    .filter(l => CHANNELS.some(c => c.name === l));

describe('Live TV in Lite', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    screenMemory.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('switches live category and reports it, with no Favorites category or Home shortcut', () => {
    const onGroupChange = jest.fn();
    const tree = render(<LiveScreen catalog={catalog} onOpenPlayer={noop} onGroupChange={onGroupChange} />);
    expect(channelNames(tree).sort()).toEqual(['العراقية', 'الشرقية', 'بي إن سبورت'].sort());
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'المفضلة' || n.props.accessibilityLabel === 'Favorites')).toEqual([]);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'الرئيسية' || n.props.accessibilityLabel === 'Home')).toEqual([]);

    press(tree, 'رياضة');
    expect(onGroupChange).toHaveBeenLastCalledWith('رياضة');
    expect(channelNames(tree)).toEqual(['بي إن سبورت']);

    press(tree, 'أخبار');
    expect(channelNames(tree).sort()).toEqual(['العراقية', 'الشرقية'].sort());
    // After a category change focus stays on the categories, not a channel.
    expect(byLabel(tree, 'أخبار').props.hasTVPreferredFocus).toBe(true);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('restores focus to the channel that was playing', () => {
    const tree = render(
      <LiveScreen catalog={catalog} onOpenPlayer={noop} initialGroup="أخبار" focusChannelId="2" />,
    );
    expect(byLabel(tree, 'الشرقية').props.hasTVPreferredFocus).toBe(true);
    expect(byLabel(tree, 'العراقية').props.hasTVPreferredFocus).toBe(false);
    expect(byLabel(tree, 'أخبار').props.hasTVPreferredFocus).toBe(false);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('focuses the active category when there is no channel to return to', () => {
    const tree = render(<LiveScreen catalog={catalog} onOpenPlayer={noop} />);
    expect(byLabel(tree, 'كل القنوات').props.hasTVPreferredFocus).toBe(true);
    ReactTestRenderer.act(() => tree.unmount());
  });
});

describe('Settings in Lite', () => {
  it('gives first focus to the first option (not Back) and uses live-only wording', () => {
    const tree = render(
      <SettingsScreen
        preferredQuality="auto"
        setPreferredQuality={noop}
        autoplay
        setAutoplay={noop}
        subtitles={false}
        setSubtitles={noop}
        language="ar"
        setLanguage={noop}
        themeMode="dark"
        setThemeMode={noop}
        onChangeSource={noop}
        onRefreshLibrary={async () => {}}
        liveOnly
        onBack={noop}
      />,
    );
    const focusables = tree.root.findAll(n => n.props.focusable === true && typeof n.type === 'string');
    const preferred = focusables.filter(n => n.props.hasTVPreferredFocus === true);
    // Exactly one first-focus target: the first option (Arabic), right after the Back button.
    expect(preferred).toHaveLength(1);
    expect(focusables.indexOf(preferred[0])).toBe(1);
    const optionText = preferred[0].findAll(n => typeof n.props.children === 'string').map(n => n.props.children);
    expect(optionText).toContain('العربية');
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toMatch(/الأفلام|المسلسلات/);
    expect(text).toContain('شاشتنا Lite');
    ReactTestRenderer.act(() => tree.unmount());
  });
});
