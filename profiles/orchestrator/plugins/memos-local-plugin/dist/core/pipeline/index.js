/**
 * Public surface of `core/pipeline/`.
 *
 * Anything an adapter or server module needs lives here. The individual
 * files carry their own docs; this module-level re-export keeps imports
 * stable across refactors.
 */
export { createPipeline } from "./orchestrator.js";
export { bridgeToCoreEvents } from "./event-bridge.js";
export { wrapRetrievalRepos } from "./retrieval-repos.js";
export { buildPipelineBuses, buildPipelineSession, buildPipelineSubscribers, buildRetrievalDeps, extractAlgorithmConfig, pipelineLogger, } from "./deps.js";
export { createMemoryCore, bootstrapMemoryCore, bootstrapMemoryCoreFull, } from "./memory-core.js";
//# sourceMappingURL=index.js.map