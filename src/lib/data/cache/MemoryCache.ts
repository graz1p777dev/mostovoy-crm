// ─── MemoryCache ──────────────────────────────────────────────────────────────
// Реализует ICache через Map + TTL (expires_at).
// Используется в Repository для предотвращения дублирующихся запросов.
//
// Заменяется на Redis или Vercel KV без изменения Repository:
//   new DecompositionRepository(adapter, new RedisCache(client))

import type { ICache } from '../contracts/ICache'

interface CacheEntry<T> {
  value:     T
  expiresAt: number   // Date.now() + ttlMs
}

export class MemoryCache implements ICache {
  private store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  invalidatePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }
}

// Singleton — один экземпляр на всё приложение (Next.js hot module boundary)
export const globalCache = new MemoryCache()
