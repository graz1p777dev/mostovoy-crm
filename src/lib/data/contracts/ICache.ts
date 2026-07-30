// ─── Contract: Cache ──────────────────────────────────────────────────────────
// Интерфейс кеша. Любая реализация (Memory, Redis, Vercel KV) обязана его соблюдать.

export interface ICache {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs: number): void
  invalidate(key: string): void
  invalidatePattern(prefix: string): void
}
