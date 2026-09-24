import { normalizeAdvertisements } from '../src/features/ads/advertisementRepository';
import { Advertisement } from '../src/features/ads/types';
import { createProgressStore, formatClock } from '../src/features/player/progressStore';
import { describePlaybackError } from '../src/features/player/playbackErrors';

const ad = (over: Partial<Advertisement>): Advertisement => ({
  id: 'x',
  title: { ar: 'ع', en: 'e' },
  description: { ar: '', en: '' },
  action: { type: 'none' },
  order: 1,
  active: true,
  ...over,
});

describe('advertisements', () => {
  test('filters inactive/out-of-schedule ads and sorts by order', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    const list = normalizeAdvertisements(
      [
        ad({ id: 'c', order: 3 }),
        ad({ id: 'a', order: 1 }),
        ad({ id: 'off', order: 0, active: false }),
        ad({ id: 'future', order: 0, startsAt: '2026-10-01T00:00:00Z' }),
        ad({ id: 'expired', order: 0, endsAt: '2026-09-01T00:00:00Z' }),
      ],
      now,
    );
    expect(list.map(item => item.id)).toEqual(['a', 'c']);
  });

  test('clamps durations and disables external actions without a URL', () => {
    const [item] = normalizeAdvertisements([ad({ displayDuration: 100, action: { type: 'external', url: '' } })]);
    expect(item.displayDuration).toBe(4000);
    expect(item.action).toEqual({ type: 'none' });
  });
});

describe('progress store', () => {
  test('notifies only on real changes', () => {
    const store = createProgressStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.set({ currentTime: 5 });
    store.set({ currentTime: 5 });
    store.set({ playableDuration: 9 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ currentTime: 5, playableDuration: 9 });
  });

  test('formats clock values', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('playback errors', () => {
  test('maps HTTP 403 to a subscription message in Arabic', () => {
    const info = describePlaybackError({ error: { errorString: 'Response code: 403' } }, true);
    expect(info.message).toContain('الاشتراك');
    expect(info.technical).toContain('403');
  });

  test('falls back to a generic message', () => {
    const info = describePlaybackError(undefined, false);
    expect(info.message).toMatch(/could not be played/);
  });
});

import { describeConnectionError, redactSecrets, ValidationError } from '../src/screens/Connection/connectionErrors';

describe('connection errors', () => {
  test('never leaks credentials in diagnostics', () => {
    const raw = 'Network request failed for http://srv.example:8080/get.php?username=bob&password=s3cret&type=m3u_plus';
    const info = describeConnectionError(new Error(raw), true);
    expect(info.technical).not.toContain('s3cret');
    expect(info.technical).not.toContain('bob');
    expect(redactSecrets('http://h:1/series/alice/pw123/55.mkv')).toBe('http://h:1/…');
    expect(info.message).toContain('تعذر الوصول');
  });

  test('validation errors are shown as-is without diagnostics', () => {
    const info = describeConnectionError(new ValidationError('أكمل بياناتك'), true);
    expect(info).toEqual({ message: 'أكمل بياناتك', technical: '' });
  });
});

test('playback diagnostics are redacted too', () => {
  const info = describePlaybackError({ error: { errorString: 'Source error http://srv:80/live/bob/s3cret/1.ts' } }, false);
  expect(info.technical).not.toContain('s3cret');
});
