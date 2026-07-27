/**
 * `core/pipeline` — public types.
 *
 * The pipeline is the only module the adapters touch. It owns the
 * dependency graph that wires L1 capture → reward → L2 → L3 → skill →
 * feedback → retrieval into a single cohesive object. Adapters receive a
 * `MemoryCore` facade (see `memory-core.ts`) that delegates to these
 * orchestrator entry points.
 *
 * Every field here crosses module boundaries, so we keep the shape JSON-
 * friendly (plain objects, ms epochs, no class instances).
 */
export {};
//# sourceMappingURL=types.js.map