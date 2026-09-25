import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { buildCatalog, emptyCatalog } from '../src/features/catalog/catalog';
import type { LitePlaylistSession } from '../src/variants/lite/useLitePlaylist';

/**
 * Renders the real Lite root with a stubbed playlist session, so the test is
 * about what Lite shows: the M3U import screen when nothing is imported, then
 * Live TV (and only Live TV + Settings in the sidebar) once a file is loaded.
 */

const mockSession: { current: LitePlaylistSession } = { current: null as any };
jest.mock('../src/variants/lite/useLitePlaylist', () => ({
  ...jest.requireActual('../src/variants/lite/useLitePlaylist'),
  useLitePlaylist: () => mockSession.current,
}));

const LiteApp = require('../src/variants/lite/LiteApp').default;

const base = { playlist: null, failure: null, importFile: jest.fn(), reload: jest.fn() };

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(TextInput as any)
    .map(() => '<input>')
    .concat(
      tree.root
        .findAll(node => typeof node.type === 'string')
        .flatMap(node => [].concat(node.props.children).filter(c => typeof c === 'string')),
    );
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

  it('without a file shows only the M3U import screen: no account form, no link, no text fields', () => {
    mockSession.current = { ...base, status: 'import', catalog: emptyCatalog() };
    const tree = render();
    const shown = texts(tree).join(' | ');
    expect(shown).toContain('SHASHTNA PLAYER LITE');
    expect(shown).toContain('استيراد ملف M3U');
    expect(shown).toContain('اختر ملف M3U من جهازك لبدء استخدام القنوات المباشرة.');
    expect(shown).toContain('رفع ملف M3U');
    for (const banned of ['بيانات الحساب', 'اسم المستخدم', 'كلمة المرور', 'رابط السيرفر', 'رابط M3U', 'تسجيل الدخول', 'أفلام', 'مسلسلات']) {
      expect(shown).not.toContain(banned);
    }
    expect(tree.root.findAllByType(TextInput as any)).toEqual([]);
    expect(tree.root.findAll(n => n.props.testID === 'shashtna-edition:lite').length).toBeGreaterThan(0);
    ReactTestRenderer.act(() => tree.unmount());
  });

  it('with a file shows Live TV, with only Live TV and Settings in the navigation', () => {
    const catalog = buildCatalog(
      [{ id: 1, name: 'قناة العراق', url: 'http://s/live/1.ts', group: 'أخبار', contentType: 'live' } as any],
      { liveOnly: true },
    );
    mockSession.current = { ...base, status: 'ready', catalog, playlist: { uri: 'content://x/iraq.m3u', name: 'iraq.m3u' } };
    const tree = render();
    const shown = texts(tree);
    expect(shown).toContain('قناة العراق');
    expect(shown).toContain('البث المباشر');
    expect(shown).toContain('الإعدادات');
    for (const banned of ['الرئيسية', 'الأفلام', 'المسلسلات', 'المفضلة', 'Home', 'Movies', 'Series', 'Favorites', 'تغيير المصدر']) {
      expect(shown).not.toContain(banned);
    }
    ReactTestRenderer.act(() => tree.unmount());
  });
});
