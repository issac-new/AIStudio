/**
 * Post-processing helpers for raw provider output:
 *   - pad / truncate to declared dimensionality
 *   - L2-normalize for cosine-friendly storage
 *   - convert to Float32Array
 */
import type { EmbeddingVector } from "../types.js";
export declare function toFloat32(v: number[]): EmbeddingVector;
/**
 * Enforce the configured dimensionality.
 *
 * - `expected <= 0` means "auto": preserve the provider's native length.
 * - If the provider returns *more* dimensions than configured, truncate (the
 *   old project did this so callers could safely switch to a smaller model).
 * - If fewer, throw. Silently zero-padding would poison downstream cosine.
 */
export declare function enforceDim(v: number[], expected: number, ctx: {
    provider: string;
    model: string;
    index?: number;
}): number[];
export declare function l2Normalize(v: Float32Array): Float32Array;
/**
 * Process a raw provider result (arrays of numbers) into the `EmbeddingVector`
 * shape the storage layer expects. Respects `normalize` (default true).
 */
export declare function postProcess(raw: number[][], opts: {
    dimensions: number;
    provider: string;
    model: string;
    normalize: boolean;
}): EmbeddingVector[];
//# sourceMappingURL=normalize.d.ts.map