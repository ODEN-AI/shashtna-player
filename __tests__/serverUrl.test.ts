import { normalizeServerUrl, validateServerUrl } from '../src/lib/serverUrl';

describe('normalizeServerUrl', () => {
  it.each([
    ['example.com:8080', 'http://example.com:8080'],
    ['example.com', 'http://example.com'],
    ['http://example.com:8080', 'http://example.com:8080'],
    ['https://example.com:8080', 'https://example.com:8080'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
    ['  example.com:8080  ', 'http://example.com:8080'],
    ['\texample.com:8080\n', 'http://example.com:8080'],
    ['example.com:8080/', 'http://example.com:8080'],
    ['http://example.com:8080///', 'http://example.com:8080'],
    ['example.com/iptv/', 'http://example.com/iptv'],
    ['example.com:8080/c/player', 'http://example.com:8080/c/player'],
    ['//example.com:25461', 'http://example.com:25461'],
    ['192.168.1.20:25461', 'http://192.168.1.20:25461'],
    ['[::1]:8080', 'http://[::1]:8080'],
    ['example.com/get.php?username=a&password=b/', 'http://example.com/get.php?username=a&password=b/'],
    ['example.com/path/#top', 'http://example.com/path#top'],
    ['rtmp://example.com/live', 'rtmp://example.com/live'],
    ['exa mple.com:80', 'http://example.com:80'],
    ['', ''],
    ['   ', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const input of ['example.com:8080', 'https://a.b/c/', '//x.y']) {
      const once = normalizeServerUrl(input);
      expect(normalizeServerUrl(once)).toBe(once);
    }
  });
});

describe('validateServerUrl', () => {
  it.each([
    ['http://example.com:8080', null],
    ['https://example.com', null],
    ['http://[::1]:8080', null],
    ['http://user:pw@example.com:8080', null],
    ['', 'empty'],
    ['rtmp://example.com', 'unsupported-scheme'],
    ['http://', 'missing-host'],
    ['http://example.com:99999', 'bad-port'],
    ['http://example.com:80a', 'bad-port'],
    ['http://example.com:', 'bad-port'],
  ])('%j -> %j', (input, expected) => {
    expect(validateServerUrl(input)).toBe(expected);
  });

  it('accepts everything normalizeServerUrl makes from a bare host and port', () => {
    expect(validateServerUrl(normalizeServerUrl('provider.tv:2095'))).toBeNull();
  });
});
