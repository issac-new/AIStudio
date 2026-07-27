/**
 * The single facade exposed by the algorithm core.
 *
 * Adapters call these methods (TypeScript adapters import the implementation
 * directly; non-TS adapters dispatch via JSON-RPC method names defined in
 * `jsonrpc.ts`).
 *
 * Implementation lives in `core/pipeline/memory-core.ts`. Tests mock this
 * interface; SDK consumers depend only on this file.
 */
export {};
//# sourceMappingURL=memory-core.js.map