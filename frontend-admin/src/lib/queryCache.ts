type CacheEntry<T> = {
  expiresAt: number;
  promise?: Promise<T>;
  value?: T;
  hasValue: boolean;
};

const queryCache = new Map<string, CacheEntry<unknown>>();

export function cachedQuery<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = queryCache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (existing?.promise) return existing.promise;
  if (existing?.hasValue && existing.expiresAt > now) return Promise.resolve(existing.value as T);

  const entry: CacheEntry<T> = {
    expiresAt: 0,
    hasValue: false,
  };
  entry.promise = loader()
    .then((value) => {
      // Do not restore stale data if a mutation invalidated this key while the
      // request was still running.
      if (queryCache.get(key) === entry) {
        entry.value = value;
        entry.hasValue = true;
        entry.expiresAt = Date.now() + Math.max(0, ttlMs);
        entry.promise = undefined;
      }
      return value;
    })
    .catch((error) => {
      if (queryCache.get(key) === entry) queryCache.delete(key);
      throw error;
    });

  queryCache.set(key, entry as CacheEntry<unknown>);
  return entry.promise;
}

export function invalidateQuery(key: string): void {
  queryCache.delete(key);
}

export function invalidateQueryPrefix(prefix: string): void {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}

export function clearQueryCache(): void {
  queryCache.clear();
}
