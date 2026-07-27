/**
 * In-database vector storage + brute-force search.
 *
 * Design:
 *   - Vectors are stored as BLOB columns holding a little-endian Float32 buffer.
 *     Encoding: `encodeVector(Float32Array) -> Buffer`.
 *   - Each row additionally stores its squared L2 norm² (cached) so cosine
 *     similarity can be computed without recomputing sqrt on every query.
 *   - Search is brute-force: `SELECT id, vec, norm2 FROM <table> WHERE vec IS NOT NULL`
 *     then we compute cosine(q, v) in JS and keep top-K with a small heap.
 *   - We *intentionally* don't rely on sqlite-wasm or vss. Pure JS brute is
 *     ~1 M × 384 in <50ms on a laptop, which is plenty for local plugin use.
 *
 * When usage grows past, say, 100K rows per table, this module is the single
 * place to swap in an ANN index (e.g. hnswlib-node or faiss).
 */
import type { EmbeddingVector } from "../types.js";
import type { StorageDb } from "./types.js";
/** Float32Array → Buffer (little-endian, zero-copy when possible). */
export declare function encodeVector(vec: EmbeddingVector): Buffer;
/** Buffer → Float32Array. Copies so callers can't mutate the underlying DB blob. */
export declare function decodeVector(buf: Buffer | Uint8Array | null | undefined): EmbeddingVector | null;
export declare function dot(a: EmbeddingVector, b: EmbeddingVector): number;
export declare function norm2(a: EmbeddingVector): number;
export declare function cosine(a: EmbeddingVector, b: EmbeddingVector): number;
/**
 * Cosine similarity using pre-computed norm² of `b`. Saves one sqrt + one pass
 * per candidate when the query side is fixed.
 */
export declare function cosinePrenormed(a: EmbeddingVector, aNorm: number, b: EmbeddingVector, bNorm2: number): number;
export interface VectorRow<TId = string, TMeta = undefined> {
    id: TId;
    vec: EmbeddingVector;
    /** Pre-computed L2 norm². If absent we compute + cache. */
    norm2?: number;
    meta?: TMeta;
}
export interface VectorHit<TId = string, TMeta = undefined> {
    id: TId;
    score: number;
    meta?: TMeta;
}
/**
 * Brute-force top-K cosine search over an in-memory array of rows. Stable
 * (ties ordered by input order). Mutates `rows[i].norm2` if it was missing.
 */
export declare function topKCosine<TId = string, TMeta = undefined>(query: EmbeddingVector, rows: Array<VectorRow<TId, TMeta>>, k: number): Array<VectorHit<TId, TMeta>>;
export interface VectorScanOptions {
    /** Name of the BLOB column holding the vector. */
    vecColumn: string;
    /** Name of the REAL column caching norm². If absent we compute per-row. */
    norm2Column?: string;
    /** Optional WHERE clause (without the "WHERE"). */
    where?: string;
    /** Parameters for the WHERE clause. */
    params?: Record<string, unknown>;
    /** Optional LIMIT to cap candidates fetched from SQLite. */
    hardCap?: number;
}
export interface ScanRow {
    id: string;
    vec: Buffer | null;
    norm2?: number | null;
    [k: string]: unknown;
}
/**
 * Stream rows from `table`, decode vectors, and run top-K cosine against
 * `query`. `selectExtra` lets callers bring along columns that will surface in
 * `VectorHit.meta`.
 */
export declare function scanAndTopK<TMeta = undefined>(db: StorageDb, table: string, selectExtra: string[], query: EmbeddingVector, k: number, opts: VectorScanOptions): Array<VectorHit<string, TMeta>>;
//# sourceMappingURL=vector.d.ts.map