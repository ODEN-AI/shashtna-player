import ReactNativeBlobUtil from 'react-native-blob-util';

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

export type XtreamSeriesInfo = {
  name?: string;
  cover?: string;
  cover_big?: string;
  plot?: string;
  description?: string;
  rating?: string | number;
  rating_5based?: string | number;
  releaseDate?: string;
  release_date?: string;
  year?: string | number;
  genre?: string;
  backdrop_path?: string[];
  cast?: string;
  director?: string;
};

export type XtreamSeriesSeason = {
  season_number?: string | number;
  name?: string;
  episode_count?: string | number;
  overview?: string;
  id?: string | number;
};

export type XtreamSeriesDetails = {
  info: XtreamSeriesInfo;
  seasons: XtreamSeriesSeason[];
  episodes: M3UChannel[];
};

type DownloadProgress = (
  received: number,
  total: number,
) => void;

type XtreamSession = {
  baseUrl: string;
  username: string;
  password: string;
};

type XtreamCategory = {
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

type XtreamMovieStream = {
  num?: number;
  name?: string;
  stream_type?: string;
  stream_id?: string | number;
  stream_icon?: string;
  category_id?: string | number;
  direct_source?: string;
  container_extension?: string;
};

export type XtreamMovieInfo = {
  movie_image?: string;
  cover_big?: string;
  cover?: string;
  plot?: string;
  description?: string;
  releasedate?: string;
  releaseDate?: string;
  genre?: string;
  rating?: string | number;
  duration?: string | number;
  duration_secs?: string | number;
  director?: string;
  cast?: string;
  backdrop_path?: string[] | string;
};

type XtreamSeries = {
  num?: number;
  name?: string;
  series_id?: string | number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  rating?: string | number;
  rating_5based?: string | number;
  category_id?: string | number;
  backdrop_path?: string[] | string;
  last_modified?: string;
};

type XtreamEpisodeInfo = {
  movie_image?: string;
  cover_big?: string;
  cover?: string;
  plot?: string;
  releasedate?: string;
  releaseDate?: string;
  duration?: number | string;
  duration_secs?: number | string;
  bitrate?: number | string;
};

type XtreamEpisode = {
  id?: string | number;
  episode_id?: string | number;
  episode_num?: string | number;
  episode_number?: string | number;
  title?: string;
  name?: string;
  container_extension?: string;
  info?: XtreamEpisodeInfo;
  season?: string | number;
};

type XtreamSeriesInfoResponse = {
  info?: XtreamSeriesInfo;
  episodes?: Record<
    string,
    XtreamEpisode[]
  >;
  seasons?: XtreamSeriesSeason[];
};

let currentXtreamSession:
  | XtreamSession
  | null = null;

const DEFAULT_USER_AGENT =
  'ShashtnaPlayer/1.0';

function cleanBaseUrl(
  input: string,
): string {
  return input
    .trim()
    .replace(/\/+$/, '');
}

function safeString(
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

function encode(
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

function extractSeriesId(
  channel: M3UChannel,
): string {
  const contentKey =
    channel.contentKey ?? '';

  if (
    !contentKey.startsWith(
      'xtream-series:',
    )
  ) {
    return '';
  }

  return contentKey.replace(
    'xtream-series:',
    '',
  );
}

function extractMovieId(
  channel: M3UChannel,
): string {
  const contentKey =
    channel.contentKey ?? '';

  if (contentKey.startsWith('xtream-movie:')) {
    return contentKey.replace(
      'xtream-movie:',
      '',
    );
  }

  const id = safeString(channel.id);
  if (id.startsWith('xtream-movie:')) {
    return id.replace(
      'xtream-movie:',
      '',
    );
  }

  const match = channel.url.match(
    /\/movie\/[^/]+\/[^/]+\/([^./?#]+)(?:\.[^/?#]+)?/i,
  );

  return match?.[1] ?? '';
}

function hashString(
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

async function xtreamRequestWithParams<T>(
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

async function xtreamRequest<T>(
  session: XtreamSession,
  action: string,
): Promise<T> {
  return xtreamRequestWithParams<T>(
    session,
    action,
  );
}

function parseAttribute(
  line: string,
  attribute: string,
): string {
  const regex =
    new RegExp(
      `${attribute}="([^"]*)"`,
      'i',
    );

  return (
    line.match(regex)?.[1] ?? ''
  );
}

function classifyPlainM3UEntry(
  name: string,
  group: string,
  url: string,
): M3UContentType {
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

function createPlainM3UChannel(
  line: string,
  url: string,
  index: number,
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

async function parsePlainM3UFile(
  filePath: string,
  onChannelCount?: (
    count: number,
  ) => void,
): Promise<M3UChannel[]> {
  const channels: M3UChannel[] =
    [];

  const stream =
    await ReactNativeBlobUtil.fs.readStream(
      filePath,
      'utf8',
      64 * 1024,
      100,
    );

  let buffer = '';
  let pendingExtInf = '';

  const handleText = (
    text: string,
  ) => {
    buffer += text;

    const lines =
      buffer.split(/\r?\n/);

    buffer =
      lines.pop() ?? '';

    for (
      const rawLine of lines
    ) {
      const line =
        rawLine.trim();

      if (!line) {
        continue;
      }

      if (
        line.startsWith(
          '#EXTINF:',
        )
      ) {
        pendingExtInf = line;
        continue;
      }

      if (
        line.startsWith('#')
      ) {
        continue;
      }

      if (
        pendingExtInf
      ) {
        channels.push(
          createPlainM3UChannel(
            pendingExtInf,
            line,
            channels.length,
          ),
        );

        pendingExtInf = '';

        if (
          channels.length %
            100 ===
          0
        ) {
          onChannelCount?.(
            channels.length,
          );
        }
      }
    }
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
          if (buffer) {
            handleText(
              '\n',
            );
          }

          onChannelCount?.(
            channels.length,
          );

          resolve(
            channels,
          );
        } catch (error) {
          reject(error);
        }
      });
    },
  );
}

function getCategoryNameMap(
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

function getMovieExtension(
  movie: XtreamMovieStream,
): string {
  return (
    safeString(
      movie.container_extension,
    ) || 'mp4'
  );
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

async function loadXtream(
  session: XtreamSession,
  onChannelCount?: (
    count: number,
  ) => void,
): Promise<M3UChannel[]> {
  currentXtreamSession =
    session;

  const [
    liveCategories,
    movieCategories,
    seriesCategories,
    liveStreams,
    movieStreams,
    seriesStreams,
  ] =
    await Promise.all([
      xtreamRequest<
        XtreamCategory[]
      >(
        session,
        'get_live_categories',
      ),
      xtreamRequest<
        XtreamCategory[]
      >(
        session,
        'get_vod_categories',
      ),
      xtreamRequest<
        XtreamCategory[]
      >(
        session,
        'get_series_categories',
      ),
      xtreamRequest<
        XtreamLiveStream[]
      >(
        session,
        'get_live_streams',
      ),
      xtreamRequest<
        XtreamMovieStream[]
      >(
        session,
        'get_vod_streams',
      ),
      xtreamRequest<
        XtreamSeries[]
      >(
        session,
        'get_series',
      ),
    ]);

  const liveMap =
    getCategoryNameMap(
      Array.isArray(
        liveCategories,
      )
        ? liveCategories
        : [],
    );

  const movieMap =
    getCategoryNameMap(
      Array.isArray(
        movieCategories,
      )
        ? movieCategories
        : [],
    );

  const seriesMap =
    getCategoryNameMap(
      Array.isArray(
        seriesCategories,
      )
        ? seriesCategories
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

  // Movies
  (
    Array.isArray(
      movieStreams,
    )
      ? movieStreams
      : []
  ).forEach(
    (movie, index) => {
      const streamId =
        safeString(
          movie.stream_id,
        );

      if (!streamId) {
        return;
      }

      const categoryId =
        safeString(
          movie.category_id,
        );

      channels.push({
        id:
          `xtream-movie:${streamId}`,

        name:
          safeString(
            movie.name,
          ) ||
          `Movie ${index + 1}`,

        group:
          movieMap.get(
            categoryId,
          ) ||
          'Movies',

        url:
          safeString(movie.direct_source) ||
          (`${session.baseUrl}/movie/` +
            `${encode(
              session.username,
            )}/` +
            `${encode(
              session.password,
            )}/` +
            `${streamId}.` +
            `${getMovieExtension(
              movie,
            )}`),

        logo:
          safeString(
            movie.stream_icon,
          ),

        tvgId: '',
        tvgName: '',

        contentType: 'movie',

        contentKey:
          `xtream-movie:${streamId}`,
      });
    },
  );

  onChannelCount?.(
    channels.length,
  );

  // Series
  (
    Array.isArray(
      seriesStreams,
    )
      ? seriesStreams
      : []
  ).forEach(
    (series, index) => {
      const seriesId =
        safeString(
          series.series_id,
        );

      if (!seriesId) {
        return;
      }

      const categoryId =
        safeString(
          series.category_id,
        );

      channels.push({
        id:
          `xtream-series:${seriesId}`,

        name:
          safeString(
            series.name,
          ) ||
          `Series ${index + 1}`,

        group:
          seriesMap.get(
            categoryId,
          ) ||
          'Series',

        url: '',

        logo:
          safeString(
            series.cover,
          ),

        tvgId: '',
        tvgName: '',

        contentType: 'series',

        contentKey:
          `xtream-series:${seriesId}`,
      });
    },
  );

  onChannelCount?.(
    channels.length,
  );

  return channels;
}

export async function downloadAndParseM3U(
  url: string,
  onProgress?: DownloadProgress,
  onChannelCount?: (
    count: number,
  ) => void,
): Promise<M3UChannel[]> {
  const xtreamSession =
    parseXtreamUrl(url);

  if (xtreamSession) {
    return loadXtream(
      xtreamSession,
      onChannelCount,
    );
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

export async function getXtreamMovieInfo(
  channel: M3UChannel,
): Promise<XtreamMovieInfo | null> {
  const session = currentXtreamSession;

  if (!session) {
    return null;
  }

  const vodId = extractMovieId(channel);
  if (!vodId) {
    return null;
  }

  const response = await xtreamRequestWithParams<{
    info?: XtreamMovieInfo;
  }>(
    session,
    'get_vod_info',
    {
      vod_id: vodId,
    },
  );

  return response?.info ?? null;
}

export async function getSeriesDetails(
  channel: M3UChannel,
): Promise<XtreamSeriesDetails> {
  const session =
    currentXtreamSession;

  if (!session) {
    throw new Error(
      'لا توجد جلسة Xtream فعالة.',
    );
  }

  const seriesId =
    extractSeriesId(channel);

  if (!seriesId) {
    throw new Error(
      'معرف المسلسل غير موجود.',
    );
  }

  const response =
    await xtreamRequestWithParams<
      XtreamSeriesInfoResponse
    >(
      session,
      'get_series_info',
      {
        series_id:
          seriesId,
      },
    );

  const info =
    response?.info ?? {};

  const episodes: M3UChannel[] =
    [];

  const episodeGroups =
    response?.episodes ?? {};

  Object.entries(
    episodeGroups,
  ).forEach(
    ([
      seasonKey,
      seasonEpisodes,
    ]) => {
      if (
        !Array.isArray(
          seasonEpisodes,
        )
      ) {
        return;
      }

      seasonEpisodes.forEach(
        episode => {
          const episodeId =
            safeString(
              episode.id ??
                episode.episode_id,
            );

          if (!episodeId) {
            return;
          }

          const episodeNumber =
            Number(
              episode.episode_num ??
                episode.episode_number ??
                0,
            ) || 0;

          const seasonNumber =
            Number(
              episode.season ??
                seasonKey ??
                1,
            ) || 1;

          const title =
            safeString(
              episode.title ??
                episode.name,
            ) ||
            `الحلقة ${episodeNumber || 1}`;

          const extension =
            safeString(
              episode.container_extension,
            ) ||
            'mp4';

          const logo =
            safeString(
              episode.info
                ?.movie_image ??
                episode.info
                  ?.cover_big ??
                episode.info
                  ?.cover ??
                info.cover_big ??
                info.cover ??
                channel.logo,
            );

          episodes.push({
            id:
              `xtream-episode:${episodeId}`,

            name: title,

            group:
              channel.group,

            url:
              `${session.baseUrl}/series/` +
              `${encode(
                session.username,
              )}/` +
              `${encode(
                session.password,
              )}/` +
              `${episodeId}.` +
              extension,

            logo,

            tvgId: '',
            tvgName: '',

            contentType:
              'series',

            seasonNumber,

            episodeNumber,

            contentKey:
              `xtream-series:${seriesId}`,
          });
        },
      );
    },
  );

  episodes.sort(
    (a, b) => {
      const seasonDifference =
        Number(
          a.seasonNumber ??
            0,
        ) -
        Number(
          b.seasonNumber ??
            0,
        );

      if (
        seasonDifference !== 0
      ) {
        return seasonDifference;
      }

      return (
        Number(
          a.episodeNumber ??
            0,
        ) -
        Number(
          b.episodeNumber ??
            0,
        )
      );
    },
  );

  const seasons: XtreamSeriesSeason[] =
    Array.isArray(
      response?.seasons,
    )
      ? response.seasons.map(
          season => ({
            season_number:
              season.season_number,
            name:
              season.name ||
              `الموسم ${safeString(
                season.season_number ??
                  '',
              )}`,
            episode_count:
              season.episode_count ??
              episodes.filter(
                episode =>
                  Number(
                    episode.seasonNumber ??
                      0,
                  ) ===
                  Number(
                    season.season_number ??
                      0,
                  ),
              ).length,
            overview:
              season.overview,
            id: season.id,
          }),
        )
      : [];

  if (
    seasons.length === 0
  ) {
    const seasonNumbers =
      Array.from(
        new Set(
          episodes.map(
            episode =>
              Number(
                episode.seasonNumber ??
                  1,
              ),
          ),
        ),
      ).sort(
        (a, b) =>
          a - b,
      );

    seasonNumbers.forEach(
      seasonNumber => {
        seasons.push({
          season_number:
            seasonNumber,
          name:
            `الموسم ${seasonNumber}`,
          episode_count:
            episodes.filter(
              episode =>
                Number(
                  episode.seasonNumber ??
                    1,
                ) ===
                seasonNumber,
            ).length,
        });
      },
    );
  }

  const backdrop =
    Array.isArray(
      info.backdrop_path,
    )
      ? info.backdrop_path
      : safeString(
          info.backdrop_path,
        )
        ? [
            safeString(
              info.backdrop_path,
            ),
          ]
        : [];

  return {
    info: {
      ...info,
      backdrop_path:
        backdrop,
    },

    seasons,

    episodes,
  };
}

export async function getSeriesEpisodes(
  channel: M3UChannel,
): Promise<M3UChannel[]> {
  const details =
    await getSeriesDetails(
      channel,
    );

  return details.episodes;
}

export async function getSeriesFirstEpisode(
  channel: M3UChannel,
): Promise<M3UChannel | null> {
  const seriesId =
    extractSeriesId(channel);

  if (!seriesId) {
    return null;
  }

  return {
    ...channel,
    url:
      `shashtna-series-detail://` +
      encodeURIComponent(
        seriesId,
      ),
  };
}

export function clearXtreamSession(): void {
  currentXtreamSession =
    null;
}

export function getCurrentXtreamSession():
  | XtreamSession
  | null {
  return currentXtreamSession;
}
