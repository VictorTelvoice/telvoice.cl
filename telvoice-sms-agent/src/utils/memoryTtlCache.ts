type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/** Caché en memoria con TTL fijo (no persiste entre reinicios). */
export function createMemoryTtlCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) {
        return undefined;
      }
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key: string, value: T): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}
