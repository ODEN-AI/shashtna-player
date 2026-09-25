import { M3UChannel, M3UContentType, XtreamSession } from '../../lib/m3u';
import { deleteJsonFile, readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';

/**
 * On-disk cache of a parsed Xtream library.
 *
 * Every launch used to download and parse the whole library again (six
 * player_api requests, often tens of MB of JSON) before the home screen
 * appeared. A fresh cache now restores the library without any network
 * request; it is refreshed when it is older than CACHE_TTL_MS, when the
 * source changes, or when the user refreshes the library.
 *
 * Security: stream URLs embed the username and password. They are stored as
 * templates (`{u}`/`{p}` placeholders) and completed from the Keystore-
 * encrypted session on read, so the cache file never contains credentials.
 * Only Xtream sources are cached: plain M3U links can carry tokens in any
 * form, and imported files are local and quick to re-read.
 */

const FILE = 'shashtna-library-cache.json';
const FORMAT = 2;
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const TYPE_CODE: Record<M3UContentType, number> = { live: 0, movie: 1, series: 2 };
const CODE_TYPE: M3UContentType[] = ['live', 'movie', 'series'];

/** [type, id, name, group, logo, tvgId, tvgName, contentKey, urlTemplate] */
type Row = [number, string, string, string, string, string, string, string, string];

type CacheFile = {
  format: number;
  /** Non-reversible fingerprint of the source (it contains credentials). */
  sourceId: string;
  liveOnly: boolean;
  savedAt: number;
  rows: Row[];
};

export function fingerprint(value: string): string {
  // FNV-1a, 2 x 32 bit. Identifies the source; cannot recover the credentials.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x5bd1e995) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

function credentialSegment(session: XtreamSession): string {
  return `/${encodeURIComponent(session.username)}/${encodeURIComponent(session.password)}/`;
}

export function toRows(channels: M3UChannel[], session: XtreamSession): Row[] {
  const secret = credentialSegment(session);
  const rows: Row[] = new Array(channels.length);
  for (let i = 0; i < channels.length; i += 1) {
    const c = channels[i];
    rows[i] = [
      TYPE_CODE[c.contentType],
      c.id,
      c.name,
      c.group,
      c.logo,
      c.tvgId,
      c.tvgName,
      c.contentKey || '',
      c.url ? c.url.split(secret).join('/{u}/{p}/') : '',
    ];
  }
  return rows;
}

export function fromRows(rows: Row[], session: XtreamSession): M3UChannel[] {
  const secret = credentialSegment(session);
  const channels: M3UChannel[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const channel: M3UChannel = {
      contentType: CODE_TYPE[r[0]] || 'live',
      id: r[1],
      name: r[2],
      group: r[3],
      logo: r[4],
      tvgId: r[5],
      tvgName: r[6],
      url: r[8] ? r[8].split('/{u}/{p}/').join(secret) : '',
    };
    if (r[7]) channel.contentKey = r[7];
    channels[i] = channel;
  }
  return channels;
}

export async function saveLibraryCache(
  source: string,
  session: XtreamSession,
  channels: M3UChannel[],
  liveOnly: boolean,
): Promise<void> {
  const file: CacheFile = {
    format: FORMAT,
    sourceId: fingerprint(source),
    liveOnly,
    savedAt: Date.now(),
    rows: toRows(channels, session),
  };
  await writeJsonFile(FILE, file);
}

/** The cached channels for this source, or null when missing, stale or for another source. */
export async function loadLibraryCache(
  source: string,
  session: XtreamSession,
  liveOnly: boolean,
  now = Date.now(),
): Promise<M3UChannel[] | null> {
  const file = await readJsonFile<CacheFile | null>(FILE, null);
  if (!file || file.format !== FORMAT || !Array.isArray(file.rows)) return null;
  if (file.sourceId !== fingerprint(source) || file.liveOnly !== liveOnly) return null;
  if (!(now - file.savedAt < CACHE_TTL_MS)) return null;
  return fromRows(file.rows, session);
}

export function clearLibraryCache(): Promise<void> {
  return deleteJsonFile(FILE);
}
