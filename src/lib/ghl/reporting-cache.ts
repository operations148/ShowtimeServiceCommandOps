interface CacheEntry<T> {
  data: T
  expiresAt: number
  fetchedAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

export function setCached<T>(key: string, data: T, ttlSeconds: number = 300): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
    fetchedAt: Date.now(),
  })
}

export function getCacheAge(key: string): number {
  const entry = cache.get(key)
  if (!entry) return 0
  return Math.round((Date.now() - entry.fetchedAt) / 1000)
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
