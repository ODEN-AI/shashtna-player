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
