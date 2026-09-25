import { M3UChannel } from '../../lib/m3u';
import { Builder, CatalogItem, MediaKind, MediaIndexer, pushToGroup } from './catalog';

/**
 * Movie and series indexing for the catalog (Shashtna Player Full only).
 * Passed to buildCatalog as `indexMedia`; Shashtna Player Lite never imports
 * this module.
 */

const TAG_BRACKETS = /\[[^\]]*\]/g;
const TAG_QUALITY = /\b(?:2160p|1080p|720p|576p|480p|4k|2k|fhd|uhd|hd|sd)\b/gi;
const TAG_RELEASE = /\b(?:web[- ]?dl|web[- ]?rip|webrip|bluray|blu[- ]?ray|hdr|hevc|h264|h265|x264|x265|aac|dubbed|dual[- ]?audio)\b/gi;
const TAG_EPISODE = /\b(?:S\d{1,2}E\d{1,3}|S\d{1,2}|E\d{1,3})\b/gi;
const SEPARATORS = /[_.]+/g;
const SPACES = /\s+/g;
const ARABIC = /[؀-ۿ]/;

/** Display title used by the library cards (same rules the grid always used). */
export function cleanMediaTitle(value: string): string {
  return String(value || '')
    .replace(TAG_BRACKETS, ' ')
    .replace(TAG_QUALITY, ' ')
    .replace(TAG_RELEASE, ' ')
    .replace(TAG_EPISODE, ' ')
    .replace(SEPARATORS, ' ')
    .replace(SPACES, ' ')
    .trim();
}

export const indexMedia: MediaIndexer = (b: Builder, channel: M3UChannel, group: string) => {
  if (channel.contentType === 'live') return;
  const c = b.catalog;
  const type: MediaKind = channel.contentType;
  const title = cleanMediaTitle(channel.name) || channel.name;

  if (type === 'series') {
    // Plain M3U lists carry one line per episode: merge them into one card.
    const mergeKey = title.toLowerCase();
    const existing = b.seriesByTitle.get(mergeKey);
    if (existing) {
      existing.episodeCount += 1;
      if (!existing.channel.logo && channel.logo) existing.channel = channel;
      return;
    }
    const item = makeItem(channel, type, title, group);
    b.seriesByTitle.set(mergeKey, item);
    c.series.push(item);
    c.itemsByKey.set(item.key, item);
    if (group) {
      pushToGroup(c.seriesByGroup, group, item);
      b.groupCounts.series.set(group, (b.groupCounts.series.get(group) || 0) + 1);
    }
    return;
  }

  const item = makeItem(channel, type, title, group);
  c.movies.push(item);
  c.itemsByKey.set(item.key, item);
  if (group) {
    pushToGroup(c.moviesByGroup, group, item);
    b.groupCounts.movie.set(group, (b.groupCounts.movie.get(group) || 0) + 1);
  }
}


function makeItem(channel: M3UChannel, type: MediaKind, title: string, group: string): CatalogItem {
  return {
    key: `${type}:${String(channel.id)}`,
    channel,
    type,
    title,
    group,
    episodeCount: 1,
    search: `${title} ${group}`.toLowerCase(),
    foreign: !ARABIC.test(title),
  };
}

