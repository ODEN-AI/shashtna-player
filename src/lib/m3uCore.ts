import ReactNativeBlobUtil from 'react-native-blob-util';

import { NoLiveChannelsError, PlaylistEmptyError, PlaylistFormatError } from './playlistErrors';
import { hasNativePlaylistReader, readPlaylistFile } from './playlistPicker';

/**
 * M3U core: the channel model, the streaming M3U text parser (live/VOD
 * classification, liveOnly filtering) and reading a playlist file picked on
 * the device.
 *
 * No network code and no Xtream: Shashtna Player Lite (local M3U files only)
 * imports this module alone. Xtream accounts and M3U links live in m3u.ts
 * (Shashtna Player / Full), which re-exports everything here.
 */

export type M3UContentType =
  | 'live'
  | 'movie'
  | 'series';

export type M3UChannel = {
  id: string;
  name: string;
  group: string;
  url: string;
  logo: string;
  tvgId: string;
  tvgName: string;
  contentType: M3UContentType;
  seasonNumber?: number;
  episodeNumber?: number;
  contentKey?: string;
};

export type DownloadProgress = (
  received: number,
  total: number,
) => void;

export function hashString(
  value: string,
): string {
  let hash = 0;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash =
      (hash * 31 +
        value.charCodeAt(index)) |
      0;
  }

  return Math.abs(
    hash,
  ).toString(36);
}

const ATTRIBUTE_PATTERNS: Record<string, RegExp> = {
  'group-title': /group-title="([^"]*)"/i,
  'tvg-logo': /tvg-logo="([^"]*)"/i,
  'tvg-id': /tvg-id="([^"]*)"/i,
  'tvg-name': /tvg-name="([^"]*)"/i,
};

function parseAttribute(
  line: string,
  attribute: string,
): string {
  const regex =
    ATTRIBUTE_PATTERNS[attribute] ||
    new RegExp(`${attribute}="([^"]*)"`, 'i');

  return (
    line.match(regex)?.[1] ?? ''
  );
}

/**
 * What the stream URL itself says the entry is, when it says it clearly:
 * Xtream-style /live/, /movie/, /series/ paths, `.ts` live streams, or a
 * video-file extension. null when the URL gives no signal.
 */
export function contentTypeFromUrl(url: string): M3UContentType | null {
  const path = url.trim().split(/[?#]/)[0].toLowerCase();
  if (/\/live\//.test(path) || /\.ts$/.test(path)) return 'live';
  if (/\/series\//.test(path)) return 'series';
  if (/\/movies?\//.test(path) || /\.(mp4|mkv|avi|mov|wmv|flv|webm)$/.test(path)) return 'movie';
  return null;
}

function classifyPlainM3UEntry(
  name: string,
  group: string,
  url: string,
  urlFirst = false,
): M3UContentType {
  // Lite trusts a clear URL over name keywords, so live channels such as
  // "beIN Movies" (…/live/…/12.ts) are kept and VOD files are dropped.
  if (urlFirst) {
    const fromUrl = contentTypeFromUrl(url);
    if (fromUrl) return fromUrl;
  }

  const text =
    `${name} ${group} ${url}`.toLowerCase();

  const seriesWords = [
    'series',
    'serie',
    'مسلسل',
    'مسلسلات',
    'season',
    'episode',
    'الحلقة',
    'حلقات',
  ];

  const movieWords = [
    'movie',
    'movies',
    'film',
    'films',
    'فيلم',
    'افلام',
    'أفلام',
    'vod',
  ];

  if (
    seriesWords.some(
      word =>
        text.includes(word),
    )
  ) {
    return 'series';
  }

  if (
    movieWords.some(
      word =>
        text.includes(word),
    )
  ) {
    return 'movie';
  }

  return 'live';
}

export function createPlainM3UChannel(
  line: string,
  url: string,
  index: number,
  urlFirst = false,
): M3UChannel {
  const name =
    line
      .replace(
        /^#EXTINF:[^,]*,/i,
        '',
      )
      .trim() ||
    `Channel ${index + 1}`;

  const group =
    parseAttribute(
      line,
      'group-title',
    );

  const logo =
    parseAttribute(
      line,
      'tvg-logo',
    );

  const tvgId =
    parseAttribute(
      line,
      'tvg-id',
    );

  const tvgName =
    parseAttribute(
      line,
      'tvg-name',
    );

  const contentType =
    classifyPlainM3UEntry(
      name,
      group,
      url,
      urlFirst,
    );

  return {
    id:
      `m3u-${index}-` +
      hashString(url),
    name,
    group,
    url: url.trim(),
    logo,
    tvgId,
    tvgName,
    contentType,
  };
}

export type ParseOptions = {
  /** Keep live channels only (Shashtna Player Lite). */
  liveOnly?: boolean;
};

/**
 * Incremental M3U text parser: feed it chunks in order, then `end()`.
 * Lines split across chunks are carried over, so any chunk size works.
 * Shared by URL downloads and imported files.
 */
export function createM3UTextParser(
  options: ParseOptions = {},
  onChannelCount?: (count: number) => void,
) {
  const channels: M3UChannel[] = [];
  let entryIndex = 0;
  let buffer = '';
  let pendingExtInf = '';
  let sawHeaderOrEntry = false;
  let sawText = false;

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    sawText = true;
    if (line.startsWith('#EXTINF:')) {
      pendingExtInf = line;
      sawHeaderOrEntry = true;
      return;
    }
    if (line.startsWith('#')) {
      if (line.startsWith('#EXTM3U')) sawHeaderOrEntry = true;
      return;
    }
    if (!pendingExtInf) return;
    const channel = createPlainM3UChannel(pendingExtInf, line, entryIndex, options.liveOnly);
    entryIndex += 1;
    pendingExtInf = '';
    if (options.liveOnly && channel.contentType !== 'live') return;
    channels.push(channel);
    if (channels.length % 500 === 0) onChannelCount?.(channels.length);
  };

  return {
    push(text: string) {
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    },
    end(): M3UChannel[] {
      if (buffer) handleLine(buffer);
      buffer = '';
      onChannelCount?.(channels.length);
      return channels;
    },
    /** True once an #EXTM3U header or #EXTINF entry was seen. */
    looksLikeM3U: () => sawHeaderOrEntry,
    /** Entries read (before liveOnly filtering), channels kept, any non-blank text. */
    stats: () => ({ entries: entryIndex, kept: channels.length, sawText }),
  };
}

type TextParser = ReturnType<typeof createM3UTextParser>;

// Parse errors live in playlistErrors.ts (shared with the picker without an import cycle).
export { NoLiveChannelsError, PlaylistEmptyError, PlaylistFormatError } from './playlistErrors';

/**
 * Ends a parse and turns "nothing usable" into a specific error: an empty
 * file, text that is not M3U, or (Lite) a playlist without live channels.
 */
function finishPlaylist(parser: TextParser, options: ParseOptions): M3UChannel[] {
  const channels = parser.end();
  const stats = parser.stats();
  if (!stats.sawText) throw new PlaylistEmptyError();
  if (!channels.length && !parser.looksLikeM3U()) throw new PlaylistFormatError();
  if (options.liveOnly && !channels.length) throw new NoLiveChannelsError();
  return channels;
}

/*
 * Reads a playlist from a file path or content:// URI as a UTF-8 stream
 * (react-native-blob-util decodes with an InputStreamReader, so multi-byte
 * Arabic characters are never split between chunks). The file is never
 * loaded into memory whole.
 *
 * Chunks were 64 KB with a 100 ms sleep between them, so a 50 MB playlist
 * spent ~80 s just waiting. 256 KB chunks with a 4 ms pause read the same
 * file in about a second of waiting while still yielding to the UI thread.
 */
export async function parsePlainM3UFile(
  filePath: string,
  onChannelCount?: (
    count: number,
  ) => void,
  options: ParseOptions = {},
  onBytes?: (received: number) => void,
): Promise<M3UChannel[]> {
  const parser = createM3UTextParser(options, onChannelCount);

  const stream =
    await ReactNativeBlobUtil.fs.readStream(
      filePath,
      'utf8',
      256 * 1024,
      4,
    );

  let received = 0;

  const handleText = (
    text: string,
  ) => {
    parser.push(text);
    received += text.length;
    onBytes?.(received);
  };

  return new Promise(
    (resolve, reject) => {
      stream.open();

      stream.onData(
        chunk => {
          try {
            /*
             * react-native-blob-util types this
             * callback as string | number[] even
             * when utf8 is requested. Runtime is
             * expected to provide a string here.
             */
            handleText(
              chunk as unknown as string,
            );
          } catch (error) {
            reject(error);
          }
        },
      );

      stream.onError(
        error => {
          reject(error);
        },
      );

      stream.onEnd(() => {
        try {
          resolve(finishPlaylist(parser, options));
        } catch (error) {
          reject(error);
        }
      });
    },
  );
}

/**
 * Reads a picked playlist through the app's own ContentResolver reader
 * (playlistPicker.readPlaylistFile). content:// URIs must not go through
 * react-native-blob-util: it rewrites them to file paths that do not exist or
 * cannot be opened (see PlaylistPickerModule.kt).
 */
export async function parseLocalPlaylist(
  uri: string,
  onChannelCount?: (count: number) => void,
  options: ParseOptions = {},
  onBytes?: (received: number) => void,
): Promise<M3UChannel[]> {
  const parser = createM3UTextParser(options, onChannelCount);
  await readPlaylistFile(uri, (text, bytesRead) => {
    parser.push(text);
    onBytes?.(bytesRead);
  });
  return finishPlaylist(parser, options);
}

/** A playlist picked from the device (Android content:// or file://). */
export function isLocalPlaylistSource(source: string): boolean {
  return /^(content|file):\/\//i.test(source.trim());
}

export type LocalLoadOptions = ParseOptions & {
  /** Size of the file in bytes, when known, for progress reporting. */
  sizeHint?: number;
};

/**
 * Reads and parses a playlist picked on the device (content:// or file://).
 * Read straight from the document; nothing is copied or buffered whole.
 */
export async function loadLocalPlaylist(
  uri: string,
  onProgress?: DownloadProgress,
  onChannelCount?: (count: number) => void,
  options: LocalLoadOptions = {},
): Promise<M3UChannel[]> {
  const total = options.sizeHint || 0;
  onProgress?.(0, total);
  const report = (received: number) => onProgress?.(total ? Math.min(received, total) : received, total);
  const channels = hasNativePlaylistReader()
    ? await parseLocalPlaylist(uri.trim(), onChannelCount, options, report)
    : await parsePlainM3UFile(uri.trim(), onChannelCount, options, report);
  onProgress?.(total, total);
  return channels;
}
