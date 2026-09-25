import ReactNativeBlobUtil from 'react-native-blob-util';

import { BRAND } from '../design/brand';
import {
  DownloadProgress,
  isLocalPlaylistSource,
  loadLocalPlaylist,
  M3UChannel,
  ParseOptions,
  parsePlainM3UFile,
} from './m3uCore';

/**
 * Shashtna Player (Full) sources: Xtream accounts (player_api.php) and M3U
 * playlist links, on top of the shared M3U core (m3uCore.ts, re-exported
 * below). Shashtna Player Lite never imports this module.
 */
export * from './m3uCore';


type XtreamSession = {
  baseUrl: string;
  username: string;
  password: string;
};

export type XtreamCategory = {
  category_id?: string | number;
  category_name?: string;
  parent_id?: string | number;
};

type XtreamLiveStream = {
  num?: number;
  name?: string;
  stream_type?: string;
  stream_id?: string | number;
  stream_icon?: string;
  epg_channel_id?: string;
  tvg_name?: string;
  tvg_id?: string;
  category_id?: string | number;
  direct_source?: string;
  container_extension?: string;
};

let currentXtreamSession:
  | XtreamSession
  | null = null;

// Sent to IPTV servers; each edition identifies itself (src/design/brand.ts).
const DEFAULT_USER_AGENT = BRAND.userAgent;

function cleanBaseUrl(
  input: string,
): string {
  return input
    .trim()
    .replace(/\/+$/, '');
}

export function safeString(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value);
}

export function encode(
  value: string,
): string {
  return encodeURIComponent(
    value,
  );
}

function getQueryParam(
  input: string,
  key: string,
): string {
  const questionMark =
    input.indexOf('?');

  if (questionMark === -1) {
    return '';
  }

  const query =
    input
      .slice(questionMark + 1)
      .split('#')[0];

  const pairs =
    query.split('&');

  for (
    const pair of pairs
  ) {
    if (!pair) {
      continue;
    }

    const equalsIndex =
      pair.indexOf('=');

    const rawKey =
      equalsIndex === -1
        ? pair
        : pair.slice(
            0,
            equalsIndex,
          );

    const rawValue =
      equalsIndex === -1
        ? ''
        : pair.slice(
            equalsIndex + 1,
          );

    try {
      const decodedKey =
        decodeURIComponent(
          rawKey.replace(
            /\+/g,
            ' ',
          ),
        );

      if (
        decodedKey === key
      ) {
        return decodeURIComponent(
          rawValue.replace(
            /\+/g,
            ' ',
          ),
        );
      }
    } catch {
      return rawValue;
    }
  }

  return '';
}

function parseXtreamUrl(
  input: string,
): XtreamSession | null {
  const value =
    input.trim();

  const username =
    getQueryParam(
      value,
      'username',
    );

  const password =
    getQueryParam(
      value,
      'password',
    );

  if (
    !username ||
    !password
  ) {
    return null;
  }

  const match =
    value.match(
      /^(https?):\/\/([^/?#]+)/i,
    );

  if (!match) {
    return null;
  }

  const baseUrl =
    `${match[1]}://${match[2]}`;

  return {
    baseUrl:
      cleanBaseUrl(baseUrl),
    username,
    password,
  };
}


export function buildXtreamM3UUrl(
  baseUrl: string,
  username: string,
  password: string,
): string {
  const root =
    cleanBaseUrl(baseUrl);

  return (
    `${root}/get.php?` +
    `username=${encode(username)}` +
    `&password=${encode(password)}` +
    `&type=m3u_plus` +
    `&output=ts`
  );
}

export async function xtreamRequestWithParams<T>(
  session: XtreamSession,
  action: string,
  params: Record<
    string,
    string
  > = {},
): Promise<T> {
  const queryParts = [
    `username=${encode(
      session.username,
    )}`,
    `password=${encode(
      session.password,
    )}`,
    `action=${encode(
      action,
    )}`,
  ];

  Object.entries(
    params,
  ).forEach(
    ([key, value]) => {
      queryParts.push(
        `${encode(key)}=${encode(
          value,
        )}`,
      );
    },
  );

  const url =
    `${session.baseUrl}/player_api.php?` +
    queryParts.join('&');

  const response =
    await fetch(url, {
      headers: {
        Accept:
          'application/json',
        'User-Agent':
          DEFAULT_USER_AGENT,
      },
    });

  if (!response.ok) {
    throw new Error(
      `Xtream HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export async function xtreamRequest<T>(
  session: XtreamSession,
  action: string,
): Promise<T> {
  return xtreamRequestWithParams<T>(
    session,
    action,
  );
}

/*
 * Attribute patterns are compiled once. Building a RegExp per attribute per
 * line cost four regex compilations for every playlist entry.
 */

export function getCategoryNameMap(
  categories: XtreamCategory[],
): Map<string, string> {
  const map =
    new Map<string, string>();

  categories.forEach(
    category => {
      if (
        category.category_id ===
        undefined
      ) {
        return;
      }

      map.set(
        String(
          category.category_id,
        ),
        safeString(
          category.category_name,
        ),
      );
    },
  );

  return map;
}

function getLiveExtension(
  stream: XtreamLiveStream,
): string {
  return (
    safeString(
      stream.container_extension,
    ) || 'ts'
  );
}

/**
 * Loads the Xtream movies + series part of a library. Supplied by the Full
 * edition (src/lib/xtreamVod.ts); Shashtna Player Lite never passes one, so
 * its bundle contains no VOD request code and never downloads VOD data.
 */
export type XtreamVodLoader = (
  session: XtreamSession,
) => Promise<M3UChannel[]>;

async function loadXtream(
  session: XtreamSession,
  onChannelCount?: (
    count: number,
  ) => void,
  options: LoadOptions = {},
): Promise<M3UChannel[]> {
  currentXtreamSession =
    session;

  // Live TV: live categories + live streams. Movies and series are requested
  // only when the edition supplies a VOD loader (in parallel with live).
  const [
    [liveCategories, liveStreams],
    vodChannels,
  ] =
    await Promise.all([
      Promise.all([
        xtreamRequest<
          XtreamCategory[]
        >(
          session,
          'get_live_categories',
        ),
        xtreamRequest<
          XtreamLiveStream[]
        >(
          session,
          'get_live_streams',
        ),
      ]),
      options.loadVod && !options.liveOnly
        ? options.loadVod(session)
        : Promise.resolve([] as M3UChannel[]),
    ]);

  const liveMap =
    getCategoryNameMap(
      Array.isArray(
        liveCategories,
      )
        ? liveCategories
        : [],
    );

  const channels: M3UChannel[] =
    [];

  // Live
  (
    Array.isArray(
      liveStreams,
    )
      ? liveStreams
      : []
  ).forEach(
    (stream, index) => {
      const streamId =
        safeString(
          stream.stream_id,
        );

      if (!streamId) {
        return;
      }

      const categoryId =
        safeString(
          stream.category_id,
        );

      channels.push({
        id:
          `xtream-live:${streamId}`,

        name:
          safeString(
            stream.name,
          ) ||
          `Live ${index + 1}`,

        group:
          liveMap.get(
            categoryId,
          ) ||
          'Live TV',

        url:
          safeString(stream.direct_source) ||
          (`${session.baseUrl}/live/` +
            `${encode(
              session.username,
            )}/` +
            `${encode(
              session.password,
            )}/` +
            `${streamId}.` +
            `${getLiveExtension(
              stream,
            )}`),

        logo:
          safeString(
            stream.stream_icon,
          ),

        tvgId:
          safeString(
            stream.epg_channel_id ??
              stream.tvg_id,
          ),

        tvgName:
          safeString(
            stream.tvg_name,
          ),

        contentType: 'live',
      });
    },
  );

  onChannelCount?.(
    channels.length,
  );

  for (const channel of vodChannels) {
    channels.push(channel);
  }

  onChannelCount?.(
    channels.length,
  );

  return channels;
}


export type LoadOptions = ParseOptions & {
  /** Size of a local file in bytes, when known, for progress reporting. */
  sizeHint?: number;
  /** Xtream movies/series loader (Full edition only). */
  loadVod?: XtreamVodLoader;
};

export async function downloadAndParseM3U(
  url: string,
  onProgress?: DownloadProgress,
  onChannelCount?: (
    count: number,
  ) => void,
  options: LoadOptions = {},
): Promise<M3UChannel[]> {
  const xtreamSession =
    parseXtreamUrl(url);

  if (xtreamSession) {
    return loadXtream(
      xtreamSession,
      onChannelCount,
      options,
    );
  }

  if (isLocalPlaylistSource(url)) {
    return loadLocalPlaylist(url, onProgress, onChannelCount, options);
  }

  const response =
    await ReactNativeBlobUtil.config({
      fileCache: true,
      appendExt: 'm3u',
    }).fetch(
      'GET',
      url,
      {
        Accept: '*/*',
        'User-Agent':
          DEFAULT_USER_AGENT,
      },
    );

  const filePath =
    response.path();

  try {
    const stat =
      await ReactNativeBlobUtil.fs.stat(
        filePath,
      );

    const total =
      Number(
        stat.size || 0,
      );

    onProgress?.(
      0,
      total,
    );

    const channels =
      await parsePlainM3UFile(
        filePath,
        onChannelCount,
        options,
      );

    onProgress?.(
      total,
      total,
    );

    return channels;
  } finally {
    try {
      await ReactNativeBlobUtil.fs.unlink(
        filePath,
      );
    } catch {
      // Ignore cleanup errors.
    }
  }
}

/** Xtream credentials embedded in a saved source, or null for other sources. */
export function getXtreamSessionFromSource(source: string): XtreamSession | null {
  return parseXtreamUrl(source);
}

/** Makes detail/episode requests work for a library restored from cache. */
export function activateXtreamSession(session: XtreamSession | null): void {
  currentXtreamSession = session;
}

export type { XtreamSession };

export function clearXtreamSession(): void {
  currentXtreamSession =
    null;
}

export function getCurrentXtreamSession():
  | XtreamSession
  | null {
  return currentXtreamSession;
}
