// Path: src/lib/xtream.ts

export interface XtreamSession {
  baseUrl: string;
  username: string;
  password: string;
}

export interface M3UChannel {
  id: string;
  name: string;
  group: string;
  url: string;
  logo: string;
  tvgId: string;
  tvgName: string;
  contentType: 'live' | 'movie' | 'series';
  seasonNumber?: number;
  episodeNumber?: number;
  contentKey?: string;
  rating?: number;
  year?: string;
  containerExtension?: string;
  seriesId?: string;
}

export interface XtreamEpisode {
  id: string;
  episodeNum: number;
  seasonNum: number;
  title: string;
  containerExtension: string;
  info?: any;
}

export interface XtreamSeason {
  seasonNumber: number;
  episodes: XtreamEpisode[];
}

/**
  * Parse URL without relying on global URL or URLSearchParams objects
  */
export function parseXtreamUrl(inputUrl: string): XtreamSession | null {
  try {
    const trimmed = inputUrl.trim();
    const isGetPhp = trimmed.includes('get.php');
    const isPlayerApi = trimmed.includes('player_api.php');

    if (!isGetPhp && !isPlayerApi) {
      return null;
    }

    // Extract Base URL (protocol + host + port)
    const protocolMatch = trimmed.match(/^(https?:\/\/[^\/]+)/i);
    if (!protocolMatch) return null;
    const baseUrl = protocolMatch[1];

    // Extract username
    const userMatch = trimmed.match(/[?&]username=([^&]+)/i);
    const username = userMatch ? decodeURIComponent(userMatch[1]) : '';

    // Extract password
    const passMatch = trimmed.match(/[?&]password=([^&]+)/i);
    const password = passMatch ? decodeURIComponent(passMatch[1]) : '';

    if (!baseUrl || !username || !password) {
      return null;
    }

    return {
      baseUrl,
      username,
      password,
    };
  } catch (e) {
    console.error('[Xtream Parser] Error parsing URL:', e);
    return null;
  }
}

/**
  * Build player_api.php URL
  */
export function buildPlayerApiUrl(session: XtreamSession, action?: string, extraParams: Record<string, string> = {}): string {
  let url = `${session.baseUrl}/player_api.php?username=${encodeURIComponent(session.username)}&password=${encodeURIComponent(session.password)}`;
  if (action) {
    url += `&action=${encodeURIComponent(action)}`;
  }
  for (const key of Object.keys(extraParams)) {
    url += `&${encodeURIComponent(key)}=${encodeURIComponent(extraParams[key])}`;
  }
  return url;
}

/**
  * Fetch streams from Xtream API
  */
export async function fetchXtreamCategoryData(session: XtreamSession): Promise<{
  live: M3UChannel[];
  movies: M3UChannel[];
  series: M3UChannel[];
}> {
  const result: { live: M3UChannel[]; movies: M3UChannel[]; series: M3UChannel[] } = {
    live: [],
    movies: [],
    series: [],
  };

  try {
    // 1. Fetch Live Streams
    const liveUrl = buildPlayerApiUrl(session, 'get_live_streams');
    const liveRes = await fetch(liveUrl);
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      if (Array.isArray(liveData)) {
        result.live = liveData.map((item: any) => ({
          id: `live-${item.stream_id}`,
          name: item.name || 'قناة مباشرة',
          group: item.category_name || 'البث المباشر',
          url: `${session.baseUrl}/live/${session.username}/${session.password}/${item.stream_id}.ts`,
          logo: item.stream_icon || '',
          tvgId: item.epg_channel_id || '',
          tvgName: item.name || '',
          contentType: 'live',
        }));
      }
    }

    // 2. Fetch Movies (VOD)
    const vodUrl = buildPlayerApiUrl(session, 'get_vod_streams');
    const vodRes = await fetch(vodUrl);
    if (vodRes.ok) {
      const vodData = await vodRes.json();
      if (Array.isArray(vodData)) {
        result.movies = vodData.map((item: any) => {
          const ext = item.container_extension || 'mp4';
          return {
            id: `movie-${item.stream_id}`,
            name: item.name || 'فيلم',
            group: item.category_name || 'الأفلام',
            url: `${session.baseUrl}/movie/${session.username}/${session.password}/${item.stream_id}.${ext}`,
            logo: item.stream_icon || '',
            tvgId: '',
            tvgName: item.name || '',
            contentType: 'movie',
            rating: item.rating ? parseFloat(item.rating) : undefined,
            year: item.added ? new Date(parseInt(item.added, 10) * 1000).getFullYear().toString() : undefined,
            containerExtension: ext,
          };
        });
      }
    }

    // 3. Fetch Series
    const seriesUrl = buildPlayerApiUrl(session, 'get_series');
    const seriesRes = await fetch(seriesUrl);
    if (seriesRes.ok) {
      const seriesData = await seriesRes.json();
      if (Array.isArray(seriesData)) {
        result.series = seriesData.map((item: any) => ({
          id: `series-${item.series_id}`,
          seriesId: String(item.series_id),
          name: item.name || 'مسلسل',
          group: item.category_name || 'المسلسلات',
          url: '', // Loaded upon selecting an episode
          logo: item.cover || item.stream_icon || '',
          tvgId: '',
          tvgName: item.name || '',
          contentType: 'series',
          rating: item.rating ? parseFloat(item.rating) : undefined,
          year: item.releaseDate ? item.releaseDate.substring(0, 4) : undefined,
          contentKey: `xtream-series:${item.series_id}`,
        }));
      }
    }
  } catch (e) {
    console.error('[Xtream API] Error fetching streams:', e);
  }

  return result;
}

/**
  * Get full details for a series including seasons and episodes
  */
export async function getSeriesDetails(session: XtreamSession, seriesId: string): Promise<{
  seasons: Record<string, XtreamEpisode[]>;
  info: any;
} | null> {
  try {
    const url = buildPlayerApiUrl(session, 'get_series_info', { series_id: seriesId });
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const episodesData = data.episodes || {};
    const formattedSeasons: Record<string, XtreamEpisode[]> = {};

    for (const seasonNum of Object.keys(episodesData)) {
      const epList = episodesData[seasonNum];
      if (Array.isArray(epList)) {
        formattedSeasons[seasonNum] = epList.map((ep: any) => ({
          id: String(ep.id),
          episodeNum: parseInt(ep.episode_num, 10) || 1,
          seasonNum: parseInt(ep.season, 10) || parseInt(seasonNum, 10) || 1,
          title: ep.title || `الحلقة ${ep.episode_num}`,
          containerExtension: ep.container_extension || 'mp4',
          info: ep.info || {},
        }));
      }
    }

    return {
      seasons: formattedSeasons,
      info: data.info || {},
    };
  } catch (e) {
    console.error('[Xtream API] Error getting series details:', e);
    return null;
  }
}

/**
  * Build play URL for a specific episode
  */
export function buildEpisodePlayUrl(session: XtreamSession, episodeId: string, extension: string = 'mp4'): string {
  return `${session.baseUrl}/series/${session.username}/${session.password}/${episodeId}.${extension}`;
}