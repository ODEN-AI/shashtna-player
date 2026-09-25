/**
 * IPTV server / playlist address normalisation.
 *
 * Users type the server the way providers hand it out, usually without a
 * scheme ("example.com:8080"). normalizeServerUrl turns that into a usable
 * base URL and is the single place this happens: the connection form shows
 * the normalised value, validates it, builds the connection with it, and the
 * saved source (used to reconnect) is built from it.
 *
 *   " example.com:8080/ "        -> "http://example.com:8080"
 *   "http://example.com:8080"    -> unchanged
 *   "https://example.com:8080"   -> unchanged
 *   "//example.com"              -> "http://example.com"
 *   "example.com/path/"          -> "http://example.com/path"
 *
 * Existing schemes are never replaced (https stays https; other protocols are
 * left as typed and reported by validateServerUrl). Ports, paths, queries and
 * fragments are kept; only trailing slashes at the end of the path are
 * removed, because the app appends "/player_api.php" etc. itself.
 */

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function normalizeServerUrl(input: string): string {
  let value = String(input ?? '').trim();
  if (!value) return '';

  // Spaces never belong in a host name (a common copy/paste artefact).
  value = value.replace(/\s+/g, '');

  if (value.startsWith('//')) value = `http:${value}`;
  else if (!SCHEME.test(value)) value = `http://${value}`;

  // Split off ?query / #fragment so only the path's trailing slashes go.
  const cut = value.search(/[?#]/);
  const head = cut === -1 ? value : value.slice(0, cut);
  const tail = cut === -1 ? '' : value.slice(cut);
  const schemeEnd = head.indexOf('://') + 3;
  let trimmedHead = head;
  while (trimmedHead.length > schemeEnd && trimmedHead.endsWith('/')) trimmedHead = trimmedHead.slice(0, -1);

  return trimmedHead + tail;
}

export type ServerUrlProblem = 'empty' | 'unsupported-scheme' | 'missing-host' | 'bad-port';

/** Validates a value returned by normalizeServerUrl. Returns null when usable. */
export function validateServerUrl(normalized: string): ServerUrlProblem | null {
  if (!normalized) return 'empty';
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(normalized);
  if (!match) return 'missing-host';
  const scheme = match[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return 'unsupported-scheme';

  let authority = match[2];
  const at = authority.lastIndexOf('@');
  if (at !== -1) authority = authority.slice(at + 1);

  let host = authority;
  let port = '';
  if (authority.startsWith('[')) {
    // IPv6 literal: [::1]:8080
    const close = authority.indexOf(']');
    if (close === -1) return 'missing-host';
    host = authority.slice(0, close + 1);
    const rest = authority.slice(close + 1);
    if (rest) {
      if (!rest.startsWith(':')) return 'missing-host';
      port = rest.slice(1);
    }
  } else {
    const colon = authority.lastIndexOf(':');
    if (colon !== -1) {
      host = authority.slice(0, colon);
      port = authority.slice(colon + 1);
    }
  }

  if (!host || host === '[]') return 'missing-host';
  if (authority.endsWith(':') || (port && !/^\d{1,5}$/.test(port))) return 'bad-port';
  if (port && (Number(port) < 1 || Number(port) > 65535)) return 'bad-port';
  return null;
}

export function describeServerUrlProblem(problem: ServerUrlProblem, ar: boolean): string {
  switch (problem) {
    case 'empty':
      return ar ? 'أدخل رابط السيرفر.' : 'Enter the server address.';
    case 'unsupported-scheme':
      return ar ? 'رابط السيرفر لازم يبدأ بـ http:// أو https://' : 'The server address must use http:// or https://.';
    case 'bad-port':
      return ar ? 'رقم المنفذ (Port) غير صحيح.' : 'The port number is not valid.';
    default:
      return ar ? 'رابط السيرفر غير صحيح.' : 'The server address is not valid.';
  }
}
