/**
 * Public entry for `core/session`.
 */
export { createSessionManager, } from "./manager.js";
export { createEpisodeManager, } from "./episode-manager.js";
export { createIntentClassifier, listHeuristicRules, } from "./intent-classifier.js";
export { createRelationClassifier, listRelationRules, } from "./relation-classifier.js";
export { HEURISTIC_RULES, matchFirst, retrievalFor, } from "./heuristics.js";
export { createSessionEventBus } from "./events.js";
export { adaptEpisodesRepo, adaptSessionsRepo, } from "./persistence.js";
//# sourceMappingURL=index.js.map