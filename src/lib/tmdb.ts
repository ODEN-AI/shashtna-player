// Path: src/lib/tmdb.ts
import { M3UChannel } from './m3u';
import { TMDB_ACCESS_TOKEN } from './tmdb.config';

export type TmdbMediaMetadata = {
  id: number;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  releaseDate: string;
};

type MovieResult = {
  id: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
};

type TvResult = {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  first_air_date?: string;
};

type SearchResponse<T> = {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
};

type DiscoverMovieResult = MovieResult & {
  original_language?: string;
  popularity?: number;
};

type DiscoverTvResult = TvResult & {
  original_language?: string;
  popularity?: number;
};

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// In-Memory Cache for fast lookup and avoiding repeated TMDB requests
const metadataCache = new Map<string, TmdbMediaMetadata | null>();
const pending = new Map<string, Promise<TmdbMediaMetadata | null>>();

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean resolution tags, release formats, season/episode tags from media titles
 */
export function cleanTitle(value: string, type: 'movie' | 'series'): string {
  let title = safeDecode(value);

  title = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi, ' ')
    .replace(/\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi, ' ')
    .replace(/\b(?:arabic|english|turkish|korean|hindi|urdu|dub|sub)\b/gi, ' ');

  if (type === 'series') {
    title = title
      .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, ' ')
      .replace(/\bS\d{1,2}\b/gi, ' ')
      .replace(/\bE\d{1,3}\b/gi, ' ')
      .replace(/\b(?:episode|ep|الحلقة|حلقة)\s*\d+\b/gi, ' ')
      .replace(/(^|[\s._-])\d{1,2}x\d{1,3}(\b|[\s._-])/gi, ' ');
  }

  return title
    .replace(/\(([^)]*)\)/g, ' ')
    .replace(/\s*[-|•]\s*/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeYear(value: string): string {
  return value
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract possible search queries from channel object or raw string title
 */
function candidatesFor(
  channelOrTitle: M3UChannel | string,
  type: 'movie' | 'series'
): string[] {
  const values: string[] = [];

  if (typeof channelOrTitle === 'string') {
    values.push(channelOrTitle);
  } else {
    if (channelOrTitle.name) values.push(channelOrTitle.name);
    if (channelOrTitle.tvgName) values.push(channelOrTitle.tvgName);
  }

  const result: string[] = [];

  const add = (value?: string) => {
    if (!value) return;

    const cleaned = cleanTitle(value, type);
    if (cleaned.length < 2) return;

    const exists = result.some((item) => normalize(item) === normalize(cleaned));
    if (!exists) {
      result.push(cleaned);
    }

    const yearRemoved = removeYear(cleaned);
    if (yearRemoved.length >= 2 && normalize(yearRemoved) !== normalize(cleaned)) {
      result.push(yearRemoved);
    }
  };

  for (const value of values) {
    add(value);
  }

  const raw = safeDecode(typeof channelOrTitle === 'string' ? channelOrTitle : channelOrTitle.name || '');
  for (const part of raw.split(/\s*[|•]\s*/).filter(Boolean)) {
    add(part);
  }

  return result.slice(0, 4);
}

/**
 * TMDB API Helper Wrapper
 */
async function api<T>(endpoint: string): Promise<T> {
  if (!TMDB_ACCESS_TOKEN || TMDB_ACCESS_TOKEN.startsWith('PASTE_')) {
    throw new Error('TMDB token is not configured in tmdb.config.ts');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TMDB ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

function mapMovie(item: MovieResult): TmdbMediaMetadata {
  return {
    id: item.id,
    title: item.title || item.original_title || '',
    overview: item.overview || '',
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || null,
    voteAverage: Number(item.vote_average || 0),
    releaseDate: item.release_date || '',
  };
}

function mapSeries(item: TvResult): TmdbMediaMetadata {
  return {
    id: item.id,
    title: item.name || item.original_name || '',
    overview: item.overview || '',
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || null,
    voteAverage: Number(item.vote_average || 0),
    releaseDate: item.first_air_date || '',
  };
}

function extractYear(value: string): number {
  const match = String(value || '').match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function looseTitle(value: string): string {
  return normalize(value)
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '')
    .trim();
}

function titleTokens(value: string): string[] {
  return normalize(value)
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/&/g, 'and')
    .split(/[^a-z0-9\u0600-\u06FF]+/)
    .filter(Boolean);
}

function scoreCandidate(
  query: string,
  names: string[],
  resultDate: string,
): number {
  const queryExact = normalize(query);
  const queryLoose = looseTitle(query);
  const queryYear = extractYear(query);
  let best = 0;

  for (const name of names) {
    const candidateExact = normalize(name);
    const candidateLoose = looseTitle(name);
    const candidateYear = extractYear(name) || extractYear(resultDate);

    if (!candidateLoose) continue;
    if (queryYear && candidateYear && queryYear !== candidateYear) continue;

    if (candidateExact === queryExact) {
      best = Math.max(best, queryYear && candidateYear ? 110 : 105);
      continue;
    }

    if (candidateLoose === queryLoose) {
      best = Math.max(best, queryYear && candidateYear ? 100 : 95);
      continue;
    }

    const queryTokens = titleTokens(query);
    const candidateTokens = titleTokens(name);
    if (!queryTokens.length || !candidateTokens.length) continue;

    const candidateSet = new Set(candidateTokens);
    const shared = queryTokens.filter(token => candidateSet.has(token)).length;
    const coverage = shared / Math.max(queryTokens.length, candidateTokens.length);
    const queryFlat = queryTokens.join('');
    const candidateFlat = candidateTokens.join('');
    const lengthRatio =
      Math.min(queryFlat.length, candidateFlat.length) /
      Math.max(queryFlat.length, candidateFlat.length);

    if (
      coverage >= 0.85 &&
      lengthRatio >= 0.72
    ) {
      best = Math.max(best, queryYear && candidateYear ? 92 : 88);
      continue;
    }

    if (
      coverage >= 0.72 &&
      lengthRatio >= 0.82 &&
      (candidateFlat.includes(queryFlat) || queryFlat.includes(candidateFlat))
    ) {
      best = Math.max(best, queryYear && candidateYear ? 86 : 82);
    }
  }

  return best;
}

function bestMovie(results: MovieResult[], query: string): MovieResult | null {
  if (!results || !results.length) return null;

  let best: MovieResult | null = null;
  let bestScore = 0;

  for (const item of results) {
    const score = scoreCandidate(
      query,
      [item.title || '', item.original_title || ''],
      item.release_date || '',
    );

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 82 ? best : null;
}

function bestSeries(results: TvResult[], query: string): TvResult | null {
  if (!results || !results.length) return null;

  let best: TvResult | null = null;
  let bestScore = 0;

  for (const item of results) {
    const score = scoreCandidate(
      query,
      [item.name || '', item.original_name || ''],
      item.first_air_date || '',
    );

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return bestScore >= 82 ? best : null;
}

async function searchMovie(query: string): Promise<TmdbMediaMetadata | null> {
  try {
    const ar = await api<SearchResponse<MovieResult>>(
      `/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=ar&region=IQ&page=1`
    );

    const arResult = bestMovie(ar.results, query);
    if (arResult) {
      return mapMovie(arResult);
    }

    const en = await api<SearchResponse<MovieResult>>(
      `/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`
    );

    const enResult = bestMovie(en.results, query);
    return enResult ? mapMovie(enResult) : null;
  } catch (e) {
    console.warn('[TMDB] Search movie error:', e);
    return null;
  }
}

async function searchSeries(query: string): Promise<TmdbMediaMetadata | null> {
  try {
    const ar = await api<SearchResponse<TvResult>>(
      `/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=ar&page=1`
    );

    const arResult = bestSeries(ar.results, query);
    if (arResult) {
      return mapSeries(arResult);
    }

    const en = await api<SearchResponse<TvResult>>(
      `/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`
    );

    const enResult = bestSeries(en.results, query);
    return enResult ? mapSeries(enResult) : null;
  } catch (e) {
    console.warn('[TMDB] Search series error:', e);
    return null;
  }
}

/**
 * Main exported function to fetch TMDB Metadata with Caching and Fallbacks
 */
export async function getTmdbMetadata(
  channelOrTitle: M3UChannel | string,
  type: 'movie' | 'series'
): Promise<TmdbMediaMetadata | null> {
  const candidates = candidatesFor(channelOrTitle, type);

  if (candidates.length === 0) {
    return null;
  }

  const key = `${type}:${normalize(candidates[0])}`;

  const cached = metadataCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const active = pending.get(key);
  if (active) {
    return active;
  }

  const request = (async () => {
    for (const query of candidates) {
      try {
        const result =
          type === 'movie' ? await searchMovie(query) : await searchSeries(query);

        if (result) {
          metadataCache.set(key, result);
          return result;
        }
      } catch (error) {
        console.warn('TMDB request candidate failed:', error);
      }
    }

    metadataCache.set(key, null);
    return null;
  })();

  pending.set(key, request);

  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

export type TmdbRecentItem = TmdbMediaMetadata & {
  type: 'movie' | 'series';
  originalLanguage: string;
  popularity: number;
};

type RecentCacheEntry = {
  expiresAt: number;
  items: TmdbRecentItem[];
};

const recentCatalogCache = new Map<'movie' | 'series', RecentCacheEntry>();
const recentCatalogPending = new Map<'movie' | 'series', Promise<TmdbRecentItem[]>>();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Discover recent TMDB releases. TMDB determines recency; the IPTV library
 * remains the playable source and is matched against this catalog in Home.
 */
export async function getRecentTmdbCatalog(
  type: 'movie' | 'series',
): Promise<TmdbRecentItem[]> {
  const now = Date.now();
  const cached = recentCatalogCache.get(type);

  if (cached && cached.expiresAt > now) {
    return cached.items;
  }

  const active = recentCatalogPending.get(type);
  if (active) {
    return active;
  }

  const request = (async () => {
    const items: TmdbRecentItem[] = [];
    const cutoff = daysAgoIso(365);
    const today = todayIso();

    for (let page = 1; page <= 2; page += 1) {
      const endpoint =
        type === 'movie'
          ? `/discover/movie?include_adult=false&include_video=false&language=en-US&page=${page}&sort_by=primary_release_date.desc&primary_release_date.gte=${cutoff}&primary_release_date.lte=${today}&vote_count.gte=3`
          : `/discover/tv?include_adult=false&language=en-US&page=${page}&sort_by=first_air_date.desc&first_air_date.gte=${cutoff}&first_air_date.lte=${today}&vote_count.gte=3`;

      try {
        const response =
          type === 'movie'
            ? await api<SearchResponse<DiscoverMovieResult>>(endpoint)
            : await api<SearchResponse<DiscoverTvResult>>(endpoint);

        for (const result of response.results || []) {
          const originalLanguage = String(result.original_language || '').toLowerCase();

          // Exclude Arabic titles from the foreign catalog.
          if (originalLanguage === 'ar') {
            continue;
          }

          const mapped =
            type === 'movie'
              ? mapMovie(result)
              : mapSeries(result);

          if (!mapped.releaseDate || (!mapped.posterPath && !mapped.backdropPath)) {
            continue;
          }

          items.push({
            ...mapped,
            type,
            originalLanguage,
            popularity: Number(result.popularity || 0),
          });
        }
      } catch (error) {
        console.warn(`[TMDB] Recent ${type} discovery error:`, error);
        break;
      }
    }

    const unique = Array.from(
      new Map(items.map(item => [item.id, item])).values(),
    ).sort(
      (a, b) =>
        Date.parse(b.releaseDate || '') -
        Date.parse(a.releaseDate || ''),
    );

    recentCatalogCache.set(type, {
      expiresAt: now + 10 * 60 * 1000,
      items: unique,
    });

    return unique;
  })();

  recentCatalogPending.set(type, request);

  try {
    return await request;
  } finally {
    recentCatalogPending.delete(type);
  }
}

/**
 * Construct full TMDB Poster / Backdrop image URL
 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null {
  if (!path) {
    return null;
  }

  const formattedPath = path.startsWith('/') ? path : `/${path}`;
  return `${IMAGE_BASE}/${size}${formattedPath}`;
}
