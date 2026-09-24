import { useEffect, useState } from 'react';

import { ADS_REMOTE_URL, DEFAULT_AD_DURATION_MS } from './adsConfig';
import { LOCAL_ADVERTISEMENTS } from './localAdvertisements';
import { AdAction, Advertisement } from './types';

/**
 * Source of Home hero advertisements.
 *
 *   Admin / website  →  JSON endpoint (ADS_REMOTE_URL)  ┐
 *                                                       ├→ repository → useAdvertisements → HeroCarousel
 *   Bundled list (localAdvertisements.ts)  ─────────────┘
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

export class RemoteAdvertisementRepository implements AdvertisementRepository {
  constructor(
    private readonly url: string,
    private readonly fallback: AdvertisementRepository,
    private readonly timeoutMs = 6000,
  ) {}

  async list(): Promise<Advertisement[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const raw = Array.isArray(payload) ? payload : payload?.advertisements;
      const ads = normalizeAdvertisements((Array.isArray(raw) ? raw : []).map(parseRemoteAd).filter(isAd));
      return ads.length ? ads : this.fallback.list();
    } catch (error) {
      console.warn('[Shashtna] Remote advertisements unavailable, using bundled list:', error);
      return this.fallback.list();
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

function parseAction(value: any): AdAction {
  switch (value?.type) {
    case 'navigate':
      return ['home', 'live', 'movies', 'series', 'favorites', 'settings'].includes(value.page)
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
    action: parseAction(value.action),
    image: typeof value.image === 'string' && /^https?:\/\//i.test(value.image) ? value.image : undefined,
    accent: typeof value.accent === 'string' ? value.accent : undefined,
    displayUrl: typeof value.displayUrl === 'string' ? value.displayUrl : undefined,
    order: Number(value.order) || 0,
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
  const [ads, setAds] = useState<Advertisement[]>([]);

  useEffect(() => {
    let alive = true;
    repository.list().then(list => {
      if (alive) setAds(list);
    });
    return () => {
      alive = false;
    };
  }, [repository]);

  return ads;
}
