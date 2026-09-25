import { useEffect, useState } from 'react';

import { readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';

import { ADS_REMOTE_URL, DEFAULT_AD_DURATION_MS } from './adsConfig';
import { LOCAL_ADVERTISEMENTS } from './localAdvertisements';
import { AdAction, AdPage, Advertisement } from './types';

/**
 * Source of Home hero advertisements.
 *
 *   Shashtna website / admin → JSON endpoint (ADS_REMOTE_URL)
 *        → remote fetch ──ok──→ cache file ─┐
 *        └─ fails → cached ads → bundled ───┴→ useAdvertisements → HeroCarousel
 *
 * The app never waits on the network to show the hero: bundled (or cached)
 * ads render immediately and are replaced when a fresh list arrives. Publishing
 * a new ad on the website therefore reaches installed apps without a new APK.
 * The JSON contract is documented in docs/ADVERTISEMENTS_API.md.
 */
export interface AdvertisementRepository {
  list(): Promise<Advertisement[]>;
}

export class LocalAdvertisementRepository implements AdvertisementRepository {
  constructor(private readonly ads: Advertisement[]) {}

  async list(): Promise<Advertisement[]> {
    return normalizeAdvertisements(this.ads);
  }
}

const CACHE_FILE = 'shashtna-ads-cache.json';

/** Last successful remote list (dates re-checked on every read). */
export async function readCachedAdvertisements(): Promise<Advertisement[]> {
  const cached = await readJsonFile<{ ads?: unknown[] } | null>(CACHE_FILE, null);
  const list = Array.isArray(cached?.ads) ? cached!.ads.map(parseRemoteAd).filter(isAd) : [];
  return normalizeAdvertisements(list);
}

export class RemoteAdvertisementRepository implements AdvertisementRepository {
  constructor(
    private readonly url: string,
    private readonly fallback: AdvertisementRepository,
    private readonly timeoutMs = 6000,
  ) {}

  private async fromCacheOrFallback(): Promise<Advertisement[]> {
    const cached = await readCachedAdvertisements();
    return cached.length ? cached : this.fallback.list();
  }

  async list(): Promise<Advertisement[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const raw = Array.isArray(payload) ? payload : payload?.advertisements;
      const parsed = (Array.isArray(raw) ? raw : []).map(parseRemoteAd).filter(isAd);
      if (!parsed.length) return this.fromCacheOrFallback();
      await writeJsonFile(CACHE_FILE, { savedAt: Date.now(), ads: parsed });
      return normalizeAdvertisements(parsed);
    } catch (error) {
      console.warn('[Shashtna] Remote advertisements unavailable, using cache/bundled list:', error);
      return this.fromCacheOrFallback();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Active, in-schedule ads sorted by `order`, with a sane display duration. */
export function normalizeAdvertisements(ads: Advertisement[], now = Date.now()): Advertisement[] {
  return ads
    .filter(ad => ad.active)
    .filter(ad => !ad.startsAt || Date.parse(ad.startsAt) <= now)
    .filter(ad => !ad.endsAt || Date.parse(ad.endsAt) > now)
    .map(ad => ({
      ...ad,
      displayDuration: Math.max(4000, Math.min(30000, ad.displayDuration || DEFAULT_AD_DURATION_MS)),
      // An external action without a URL would be a dead button.
      action: ad.action.type === 'external' && !ad.action.url ? { type: 'none' as const } : ad.action,
      // A finished-banner ad without its banner would be empty; show the regular layout instead.
      presentation: ad.presentation === 'artwork' && ad.image ? ('artwork' as const) : ('overlay' as const),
    }))
    .sort((a, b) => a.order - b.order);
}

function text(value: any): { ar: string; en: string } | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return { ar: value, en: value };
  const ar = String(value.ar || value.en || '');
  const en = String(value.en || value.ar || '');
  return ar || en ? { ar, en } : undefined;
}

const PAGE_TYPES = ['home', 'live', 'movies', 'series', 'favorites', 'settings'];

/**
 * Accepts `{ type, page|group|url }` or the flat admin-panel form
 * `actionType` + `actionTarget` (home | movies | series | live | favorites |
 * settings | liveCategory | external).
 */
function parseAction(value: any, flatType?: unknown, flatTarget?: unknown): AdAction {
  if (!value && typeof flatType === 'string') {
    const target = typeof flatTarget === 'string' ? flatTarget : '';
    if (PAGE_TYPES.includes(flatType)) return { type: 'navigate', page: flatType as AdPage };
    if (flatType === 'navigate') return parseAction({ type: 'navigate', page: target });
    if (flatType === 'liveCategory') return parseAction({ type: 'liveCategory', group: target });
    if (flatType === 'external') return parseAction({ type: 'external', url: target });
    return { type: 'none' };
  }
  switch (value?.type) {
    case 'navigate':
      return PAGE_TYPES.includes(value.page)
        ? { type: 'navigate', page: value.page }
        : { type: 'none' };
    case 'liveCategory':
      return value.group ? { type: 'liveCategory', group: String(value.group) } : { type: 'none' };
    case 'external':
      return /^https?:\/\//i.test(String(value.url || '')) ? { type: 'external', url: String(value.url) } : { type: 'none' };
    default:
      return { type: 'none' };
  }
}

function parseRemoteAd(value: any): Advertisement | null {
  const title = text(value?.title);
  if (!value?.id || !title) return null;
  return {
    id: String(value.id),
    title,
    description: text(value.description) || { ar: '', en: '' },
    cta: text(value.cta),
    action: parseAction(value.action, value.actionType, value.actionTarget),
    image: typeof value.image === 'string' && /^https?:\/\//i.test(value.image) ? value.image : undefined,
    accent: typeof value.accent === 'string' ? value.accent : undefined,
    presentation: value.presentation === 'artwork' ? 'artwork' : 'overlay',
    displayUrl: typeof value.displayUrl === 'string' ? value.displayUrl : undefined,
    // `priority`: higher shows first; `order`: lower shows first.
    order: value.priority !== undefined ? -Number(value.priority) || 0 : Number(value.order) || 0,
    active: value.active !== false,
    displayDuration: Number(value.displayDuration) || undefined,
    startsAt: typeof value.startsAt === 'string' ? value.startsAt : undefined,
    endsAt: typeof value.endsAt === 'string' ? value.endsAt : undefined,
  };
}

const isAd = (ad: Advertisement | null): ad is Advertisement => ad !== null;

const localRepository = new LocalAdvertisementRepository(LOCAL_ADVERTISEMENTS);

export const advertisementRepository: AdvertisementRepository = ADS_REMOTE_URL
  ? new RemoteAdvertisementRepository(ADS_REMOTE_URL, localRepository)
  : localRepository;

export function useAdvertisements(repository: AdvertisementRepository = advertisementRepository) {
  // Bundled ads render on the first frame; cached/remote ones replace them.
  const [ads, setAds] = useState<Advertisement[]>(() => normalizeAdvertisements(LOCAL_ADVERTISEMENTS));

  useEffect(() => {
    let alive = true;
    if (repository instanceof RemoteAdvertisementRepository) {
      readCachedAdvertisements().then(cached => {
        if (alive && cached.length) setAds(cached);
      });
    }
    repository.list().then(list => {
      if (alive && list.length) setAds(list);
    });
    return () => {
      alive = false;
    };
  }, [repository]);

  return ads;
}
