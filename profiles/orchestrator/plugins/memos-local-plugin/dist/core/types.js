/**
 * Internal types used inside `core/`. These are richer than the public DTOs
 * (which live in `agent-contract/dto.ts`) because they include things adapters
 * shouldn't see — e.g. raw embeddings, internal scores, lifecycle counters.
 *
 * If you need to expose something to adapters, mirror it into `agent-contract/`
 * first and then re-export from there.
 */
export {};
//# sourceMappingURL=types.js.map