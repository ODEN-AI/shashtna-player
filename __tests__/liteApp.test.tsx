import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { emptyCatalog, buildCatalog } from '../src/features/catalog/catalog';
import type { LibrarySession } from '../src/app/useLibrarySession';

/**
 * Renders the real Lite root with a stubbed library session, so the test is
 * about what Lite shows: the connection screen while disconnected, then Live
 * TV (and only Live TV + Settings in the sidebar) once a source is connected.
 */

const mockSession: { current: LibrarySession } = { current: null as any };
jest.mock('../src/app/useLibrarySession', () => ({
  useLibrarySession: (edition: unknown) => {
    (mockSession as any).edition = edition;
    return mockSession.current;
  },
}));

const LiteApp = require('../src/variants/lite/LiteApp').default;

const base = { source: '', failure: null, connect: jest.fn(), disconnect: jest.fn(), refresh: jest.fn() };

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map(node => [].concat(node.props.children).filter(c => typeof c === 'string').join(''))
    .filter(Boolean);
}

function render(): ReactTestRenderer.ReactTestRenderer {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<LiteApp />);
  });
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(3000);
  });
  return tree!;
}

describe('Shashtna Player Lite root', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the Lite login without Movies/Series, and passes the live-only edition', () => {
    mockSession.current = { ...base, status: 'disconnected', catalog: emptyCatalog() };
    const tree = render();
    const shown = texts(tree).join(' | ');
    expect(shown).toContain('SHASHTNA PLAYER LITE');
    expect(shown).not.toMatch(/أفلام|مسلسلات|Movies|Series/);
    expect((mockSession as any).edition).toEqual({ id: 'lite', liveOnly: true });
    expect(tree.root.findAll(n => n.props.testID === 'shashtna-edition:lite').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('opens Live TV right after connecting, with only Live TV and Settings in the navigation', () => {
    mockSession.current = { ...base, status: 'disconnected', catalog: emptyCatalog() };
    const tree = render();
    const catalog = buildCatalog(
      [{ id: 1, name: 'قناة العراق', url: 'http://s/live/1.ts', group: 'أخبار', contentType: 'live' } as any],
      { liveOnly: true },
    );
    mockSession.current = { ...base, status: 'ready', catalog, source: 'http://s' };
    ReactTestRenderer.act(() => tree.update(<LiteApp />));
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(3000);
    });
    const shown = texts(tree);
    expect(shown).toContain('قناة العراق');
    expect(shown).toContain('البث المباشر');
    expect(shown).toContain('الإعدادات');
    for (const banned of ['الرئيسية', 'الأفلام', 'المسلسلات', 'المفضلة', 'Home', 'Movies', 'Series', 'Favorites']) {
      expect(shown).not.toContain(banned);
    }
    ReactTestRenderer.act(() => tree.unmount());
  });
});
