/**
 * Search and sort helpers for large catalog lists.
 *
 * Search keys are precomputed (see catalog.ts), so matching is a plain
 * `includes` on lowercase strings. A searcher also remembers its previous
 * result: while the user keeps typing (the new query extends the old one on
 * the same list) it filters the previous matches instead of the whole list,
 * so each keystroke gets cheaper instead of rescanning tens of thousands of
 * entries.
 */

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export type Searcher<T> = (items: readonly T[], query: string) => readonly T[];

export function createSearcher<T>(keyOf: (item: T) => string): Searcher<T> {
  let lastItems: readonly T[] | null = null;
  let lastQuery = '';
  let lastResult: readonly T[] = [];

  return (items, rawQuery) => {
    const query = normalizeQuery(rawQuery);
    if (!query) {
      lastItems = items;
      lastQuery = '';
      lastResult = items;
      return items;
    }
    const base = items === lastItems && lastQuery && query.startsWith(lastQuery) ? lastResult : items;
    const result = base.filter(item => keyOf(item).includes(query));
    lastItems = items;
    lastQuery = query;
    lastResult = result;
    return result;
  };
}

let collator: { compare: (a: string, b: string) => number } | null = null;

function getCollator(): { compare: (a: string, b: string) => number } {
  if (!collator) {
    try {
      // One collator for all sorts; `localeCompare` per comparison is far slower.
      collator = new Intl.Collator(['ar', 'en'], { sensitivity: 'base', numeric: true });
    } catch {
      collator = { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) };
    }
  }
  return collator;
}

const sortCache = new WeakMap<readonly object[], Map<string, readonly object[]>>();

/**
 * A-Z sort of `items` by `titleOf`, cached per (list, sort id). The catalog's
 * lists never change after they are built, so a category sorted once stays
 * sorted for the whole session.
 */
export function sortedByTitle<T extends object>(
  items: readonly T[],
  titleOf: (item: T) => string,
  cacheId = 'title',
): readonly T[] {
  let perList = sortCache.get(items);
  if (!perList) {
    perList = new Map();
    sortCache.set(items, perList);
  }
  const cached = perList.get(cacheId) as readonly T[] | undefined;
  if (cached) return cached;
  const compare = getCollator().compare;
  const sorted = [...items].sort((a, b) => compare(titleOf(a), titleOf(b)));
  perList.set(cacheId, sorted);
  return sorted;
}
