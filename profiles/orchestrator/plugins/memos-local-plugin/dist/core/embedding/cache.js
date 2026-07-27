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
import { createHash } from "node:crypto";
import { rootLogger } from "../logger/index.js";
const log = rootLogger.child({ channel: "embedding.cache" });
export function makeCacheKey(k) {
    const h = createHash("sha256");
    h.update(k.provider);
    h.update("|");
    h.update(k.model);
    h.update("|");
    h.update(k.role);
    h.update("|");
    h.update(k.text);
    return h.digest("hex");
}
/**
 * Simple LRU backed by `Map` (insertion-ordered) + promote-on-hit.
 */
export class LruEmbedCache {
    map = new Map();
    maxItems;
    hits = 0;
    misses = 0;
    evictions = 0;
    constructor(maxItems) {
        if (!Number.isFinite(maxItems) || maxItems < 0) {
            throw new Error(`[embedding.cache] invalid maxItems: ${maxItems}`);
        }
        this.maxItems = Math.floor(maxItems);
    }
    get(key) {
        const v = this.map.get(key);
        if (v === undefined) {
            this.misses++;
            return undefined;
        }
        // Promote: delete + re-set moves the entry to the "most recent" slot.
        this.map.delete(key);
        this.map.set(key, v);
        this.hits++;
        return v;
    }
    set(key, vec) {
        if (this.maxItems === 0)
            return;
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        this.map.set(key, vec);
        while (this.map.size > this.maxItems) {
            const oldest = this.map.keys().next().value;
            if (oldest === undefined)
                break;
            this.map.delete(oldest);
            this.evictions++;
        }
    }
    has(key) {
        return this.map.has(key);
    }
    clear() {
        const hadSize = this.map.size;
        this.map.clear();
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        if (hadSize > 0)
            log.debug("cleared", { hadSize });
    }
    stats() {
        return {
            size: this.map.size,
            maxItems: this.maxItems,
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions,
        };
    }
}
/**
 * No-op cache; used when `cache.enabled: false` to keep call sites uniform.
 */
export class NullEmbedCache {
    get(_key) {
        return undefined;
    }
    set(_key, _vec) {
        /* no-op */
    }
    has(_key) {
        return false;
    }
    clear() { }
    stats() {
        return { size: 0, maxItems: 0, hits: 0, misses: 0, evictions: 0 };
    }
}
//# sourceMappingURL=cache.js.map