import { useEffect, useSyncExternalStore } from 'react';

import { readJsonFile, writeJsonFile } from '../../lib/jsonFileStore';

/**
 * Favorites persistence.
 *
 * Favorites are keyed `${contentType}:${id}` (movies, series and channels).
 * The file is written atomically by jsonFileStore and validated on read, so a
 * corrupted or legacy file degrades to "no favorites" instead of crashing.
 */
const FILE = 'shashtna-favorites.json';
const MAX_FAVORITES = 5000;
const KEY_PATTERN = /^(live|movie|series):.+$/;

type StoredFavorites = { version: 1; keys: string[] };

export function sanitizeFavoriteKeys(value: unknown): string[] {
  const keys = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as StoredFavorites).keys)
      ? (value as StoredFavorites).keys
      : [];
  const unique = new Set<string>();
  for (const key of keys) {
    if (typeof key === 'string' && KEY_PATTERN.test(key)) unique.add(key);
    if (unique.size >= MAX_FAVORITES) break;
  }
  return Array.from(unique);
}

export async function loadFavorites(): Promise<string[]> {
  return sanitizeFavoriteKeys(await readJsonFile<unknown>(FILE, null));
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Debounced so rapid toggling writes once. */
export function saveFavorites(keys: Iterable<string>, delayMs = 400): void {
  const snapshot: StoredFavorites = { version: 1, keys: sanitizeFavoriteKeys(Array.from(keys)) };
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void writeJsonFile(FILE, snapshot);
  }, delayMs);
}

/*
 * In-memory store with per-key subscriptions.
 *
 * Favorites used to live in App state as a Set that was copied into a new
 * array (`Array.from`) on every App render and passed down to every screen,
 * so toggling one heart re-rendered App, the page and every visible card.
 * Cards now subscribe to their own key: a toggle re-renders that card (and
 * the Favorites page, which subscribes to the whole list) and nothing else.
 */
let keys = new Set<string>();
let snapshot: readonly string[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish() {
  snapshot = Array.from(keys);
  listeners.forEach(listener => listener());
  if (loaded) saveFavorites(keys);
}

export function ensureFavoritesLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = loadFavorites().then(stored => {
      // Keep anything toggled before the file was read.
      const toggledEarly = keys.size > 0;
      keys = new Set([...stored, ...keys]);
      loaded = true;
      snapshot = Array.from(keys);
      listeners.forEach(listener => listener());
      if (toggledEarly) saveFavorites(keys);
    });
  }
  return loading;
}

export function isFavorite(key: string): boolean {
  return keys.has(key);
}

export function toggleFavorite(key: string): void {
  if (keys.has(key)) keys.delete(key);
  else keys.add(key);
  keys = new Set(keys);
  publish();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders only when this key's state flips. */
export function useIsFavorite(key: string): boolean {
  return useSyncExternalStore(subscribe, () => keys.has(key), () => keys.has(key));
}

/** All favorite keys (Favorites page, counts). */
export function useFavoriteKeys(): readonly string[] {
  useEffect(() => {
    void ensureFavoritesLoaded();
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Test helper. */
export function __resetFavoritesForTests() {
  keys = new Set();
  snapshot = [];
  loaded = false;
  loading = null;
}
