/**
 * In-memory LRU cache for embedding vectors.
 *
 * Keys are `sha256(provider|model|role|text)` → 64-char hex.
 * Values are `Float32Array` references (shared, immutable by convention).
 *
 * We deliberately don't persist this to disk: re-embedding on restart is
 * cheap for local models and OK for cloud ones. Keeping it in-memory avoids
 * one more place where secret-ish text could leak to disk.
 */
import type { EmbeddingVector } from "../types.js";
import type { EmbedRole, EmbeddingProviderName } from "./types.js";
export interface EmbedCacheStats {
    size: number;
    maxItems: number;
    hits: number;
    misses: number;
    evictions: number;
}
export interface EmbedCacheKey {
    provider: EmbeddingProviderName;
    model: string;
    role: EmbedRole;
    text: string;
}
export declare function makeCacheKey(k: EmbedCacheKey): string;
export interface EmbedCache {
    get(key: string): EmbeddingVector | undefined;
    set(key: string, vec: EmbeddingVector): void;
    has(key: string): boolean;
    clear(): void;
    stats(): EmbedCacheStats;
}
/**
 * Simple LRU backed by `Map` (insertion-ordered) + promote-on-hit.
 */
export declare class LruEmbedCache implements EmbedCache {
    private readonly map;
    private readonly maxItems;
    private hits;
    private misses;
    private evictions;
    constructor(maxItems: number);
    get(key: string): EmbeddingVector | undefined;
    set(key: string, vec: EmbeddingVector): void;
    has(key: string): boolean;
    clear(): void;
    stats(): EmbedCacheStats;
}
/**
 * No-op cache; used when `cache.enabled: false` to keep call sites uniform.
 */
export declare class NullEmbedCache implements EmbedCache {
    get(_key: string): EmbeddingVector | undefined;
    set(_key: string, _vec: EmbeddingVector): void;
    has(_key: string): boolean;
    clear(): void;
    stats(): EmbedCacheStats;
}
//# sourceMappingURL=cache.d.ts.map