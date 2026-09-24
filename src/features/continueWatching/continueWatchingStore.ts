import { useEffect, useSyncExternalStore } from 'react';

import { M3UChannel } from '../../lib/m3u';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';

/**
 * Continue Watching — isolated persistence for VOD playback positions.
 *
 * Stored per playable item (movie or episode). The player writes progress;
 * Home reads the list. Nothing else depends on this module, so it can be
 * removed or swapped for a server-backed store without touching the player.
 */
export type ContinueWatchingEntry = {
  key: string;
  /** The playable item (movie or episode) exactly as the player received it. */
  item: M3UChannel;
  /** For episodes: the series channel used to open the details page. */
  parent?: M3UChannel;
  position: number;
  duration: number;
  updatedAt: number;
};

const FILE = 'shashtna-continue-watching.json';
const MAX_ENTRIES = 30;
/** Ignore the first seconds (accidental opens) and treat ≥95% as finished. */
export const RESUME_MIN_SECONDS = 20;
export const FINISHED_RATIO = 0.95;

/**
 * Stream URLs embed the subscription username/password, so they are never
 * written here. On resume the app resolves a fresh URL from the current
 * session (see App.handleResume). Internal detail-page URLs are kept.
 */
export function stripStreamUrl<T extends M3UChannel | undefined>(item: T): T {
  if (!item) return item;
  const keep = item.url?.startsWith('shashtna-series-detail://');
  return keep || !item.url ? item : ({ ...item, url: '' } as T);
}

let entries: ContinueWatchingEntry[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void writeJsonFile(FILE, entries);
  }, 1500);
}

export function continueWatchingKey(item: M3UChannel): string {
  return `${item.contentType}:${String(item.id)}`;
}

export function ensureContinueWatchingLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = readJsonFile<ContinueWatchingEntry[]>(FILE, []).then(value => {
      const valid = Array.isArray(value) ? value.filter(e => e && e.item && e.key) : [];
      entries = valid.map(e => ({ ...e, item: stripStreamUrl(e.item), parent: stripStreamUrl(e.parent) }));
      loaded = true;
      emit();
      // Files from earlier versions stored full URLs: rewrite them without.
      if (valid.some(e => e.item.url && !e.item.url.startsWith('shashtna-series-detail://'))) {
        scheduleWrite();
      }
    });
  }
  return loading;
}

export function getResumePosition(item: M3UChannel): number {
  const entry = entries.find(e => e.key === continueWatchingKey(item));
  if (!entry || entry.duration <= 0) return 0;
  const ratio = entry.position / entry.duration;
  return entry.position >= RESUME_MIN_SECONDS && ratio < FINISHED_RATIO ? entry.position : 0;
}

export function recordProgress(
  item: M3UChannel,
  position: number,
  duration: number,
  parent?: M3UChannel,
) {
  if (!loaded || item.contentType === 'live' || !(duration > 0)) return;
  const key = continueWatchingKey(item);
  const rest = entries.filter(e => e.key !== key);

  if (position < RESUME_MIN_SECONDS || position / duration >= FINISHED_RATIO) {
    if (rest.length !== entries.length) {
      entries = rest;
      emit();
      scheduleWrite();
    }
    return;
  }

  entries = [
    { key, item: stripStreamUrl(item), parent: stripStreamUrl(parent), position, duration, updatedAt: Date.now() },
    ...rest,
  ].slice(0, MAX_ENTRIES);
  emit();
  scheduleWrite();
}

export function removeContinueWatching(key: string) {
  entries = entries.filter(e => e.key !== key);
  emit();
  scheduleWrite();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => entries;

export function useContinueWatching(): ContinueWatchingEntry[] {
  useEffect(() => {
    void ensureContinueWatchingLoaded();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Saved progress for one item (movie or episode), or null. */
export function getProgress(item: M3UChannel): { position: number; duration: number; ratio: number } | null {
  const entry = entries.find(e => e.key === continueWatchingKey(item));
  if (!entry || entry.duration <= 0) return null;
  return { position: entry.position, duration: entry.duration, ratio: Math.min(1, entry.position / entry.duration) };
}

/** Most recently watched episode of a series (matched by the series channel id). */
export function getLatestEpisodeFor(series: M3UChannel): ContinueWatchingEntry | null {
  return entries.find(e => e.parent && String(e.parent.id) === String(series.id)) || null;
}
