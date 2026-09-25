import {
  encode,
  getCategoryNameMap,
  getCurrentXtreamSession,
  M3UChannel,
  safeString,
  XtreamCategory,
  xtreamRequest,
  xtreamRequestWithParams,
  XtreamSession,
} from './m3u';

/**
 * Xtream movies and series: the VOD part of a library, movie info, series
 * seasons and episodes.
 *
 * Only Shashtna Player (Full) imports this module; it hands loadXtreamVod to
 * downloadAndParseM3U. Shashtna Player Lite never imports it, so none of this
 * code is in the Lite bundle and Lite never requests VOD endpoints.
 */

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

function getMovieExtension(
  movie: XtreamMovieStream,
): string {
  return (
    safeString(
      movie.container_extension,
    ) || 'mp4'
  );
}

/** Movie + series lists of an Xtream account (4 requests, run in parallel). */
export async function loadXtreamVod(
  session: XtreamSession,
): Promise<M3UChannel[]> {
  const [
    movieCategories,
    seriesCategories,
    movieStreams,
    seriesStreams,
  ] =
    await Promise.all([
      xtreamRequest<XtreamCategory[]>(session, 'get_vod_categories'),
      xtreamRequest<XtreamCategory[]>(session, 'get_series_categories'),
      xtreamRequest<XtreamMovieStream[]>(session, 'get_vod_streams'),
      xtreamRequest<XtreamSeries[]>(session, 'get_series'),
    ]);

  const movieMap =
    getCategoryNameMap(
      Array.isArray(movieCategories) ? movieCategories : [],
    );

  const seriesMap =
    getCategoryNameMap(
      Array.isArray(seriesCategories) ? seriesCategories : [],
    );

  const channels: M3UChannel[] = [];

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

  return channels;
}

export async function getXtreamMovieInfo(
  channel: M3UChannel,
): Promise<XtreamMovieInfo | null> {
  const session = getCurrentXtreamSession();

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
    getCurrentXtreamSession();

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

