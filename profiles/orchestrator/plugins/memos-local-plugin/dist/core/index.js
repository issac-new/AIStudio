/**
 * Public entry point for `core/`.
 *
 * Right now this re-exports the foundational utilities (config, logger, ids,
 * time). Subsequent phases will plug `createMemoryCore` and the algorithm
 * pipeline in here.
 */
export * from "./id.js";
export * from "./time.js";
export { loadConfig, loadConfigForAgent, resolveConfig, resolveHome, DEFAULT_CONFIG, SECRET_FIELD_PATHS, } from "./config/index.js";
export { rootLogger, initLogger, initTestLogger, flushLogger, shutdownLogger, memoryBuffer, } from "./logger/index.js";
export { openDb, runMigrations, runMigrationsForPath, makeRepos, encodeVector, decodeVector, cosine, topKCosine, scanAndTopK, } from "./storage/index.js";
export { withCtx, getCtx, ensureTraceId } from "./logger/context.js";
export { runSelfCheck } from "./logger/self-check.js";
export { createLlmClient, createLlmClientWithProvider, makeProviderFor as makeLlmProviderFor, parseLlmJson, buildJsonSystemHint, registerHostLlmBridge, getHostLlmBridge, OpenAiLlmProvider, AnthropicLlmProvider, GeminiLlmProvider, BedrockLlmProvider, HostLlmProvider, LocalOnlyLlmProvider, REWARD_R_HUMAN_PROMPT, L2_INDUCTION_PROMPT, L3_ABSTRACTION_PROMPT, DECISION_REPAIR_PROMPT, SKILL_CRYSTALLIZE_PROMPT, languageSteeringLine, } from "./llm/index.js";
export { createEmbedder, createEmbedderWithProvider, makeProviderFor, LruEmbedCache, NullEmbedCache, makeCacheKey, l2Normalize, enforceDim, postProcess, toFloat32, LocalEmbeddingProvider, OpenAiEmbeddingProvider, GeminiEmbeddingProvider, CohereEmbeddingProvider, VoyageEmbeddingProvider, MistralEmbeddingProvider, } from "./embedding/index.js";
export { createSessionManager, createEpisodeManager, createIntentClassifier, createSessionEventBus, listHeuristicRules, HEURISTIC_RULES, matchFirst, retrievalFor, adaptSessionsRepo, adaptEpisodesRepo, } from "./session/index.js";
export { createCaptureRunner, attachCaptureSubscriber, createCaptureEventBus, extractSteps as extractCaptureSteps, normalizeSteps as normalizeCaptureSteps, embedSteps as embedCaptureSteps, } from "./capture/index.js";
export { createRewardRunner, attachRewardSubscriber, createRewardEventBus, backprop, priorityFor, scoreHuman, heuristicScore, buildTaskSummary, } from "./reward/index.js";
export { turnStartRetrieve, toolDrivenRetrieve, skillInvokeRetrieve, subAgentRetrieve, repairRetrieve, Retriever, createRetrievalEventBus, buildQuery as buildRetrievalQuery, extractTags as extractRetrievalTags, } from "./retrieval/index.js";
// ─── core/memory/l2 public surface ────────────────────────────────────────
export { runL2, attachL2Subscriber, createL2EventBus, signatureOf, parseSignature, componentsOf, bucketKeyOf, tracePolicySimilarity, valueWeightedMean, arithmeticMeanValue, centroid, induceDraft, buildPolicyRow, computeGain, nextStatus, applyGain, partition as partitionTraces, makeCandidatePool, candidateIdFor, signatureHash, } from "./memory/l2/index.js";
// ─── core/memory/l3 public surface ────────────────────────────────────────
export { runL3, adjustConfidence as adjustWorldModelConfidence, attachL3Subscriber, createL3EventBus, abstractDraft, buildWorldModelRow, clusterPolicies, domainKeyOf, chooseMergeTarget, gatherMergeCandidates, mergeForUpdate, } from "./memory/l3/index.js";
// ─── core/skill public surface ─────────────────────────────────────────────
export { attachSkillSubscriber, applyFeedback as applySkillLifecycleFeedback, applySkillFeedback, buildSkillRow, createSkillEventBus, crystallizeDraft, defaultDraftValidator as defaultSkillDraftValidator, evaluateEligibility as evaluateSkillEligibility, gatherEvidence as gatherSkillEvidence, recomputeEta as recomputeSkillEta, runSkill, shouldArchiveIdle as shouldArchiveIdleSkill, verifyDraft as verifySkillDraft, } from "./skill/index.js";
// ─── core/feedback public surface ──────────────────────────────────────────
export { attachFeedbackSubscriber, attachRepairToPolicies, classifyFeedback, contextHashOf, createFailureSignals, createFeedbackEventBus, gatherRepairEvidence, runRepair, synthesizeDraft, } from "./feedback/index.js";
export { LOG_LEVELS, LOG_LEVEL_ORDER, levelGte } from "./logger/levels.js";
// ─── core/pipeline public surface ──────────────────────────────────────────
export { createPipeline, createMemoryCore, bootstrapMemoryCore, bridgeToCoreEvents, wrapRetrievalRepos, extractAlgorithmConfig, buildPipelineBuses, buildPipelineSession, buildPipelineSubscribers, buildRetrievalDeps, pipelineLogger, } from "./pipeline/index.js";
//# sourceMappingURL=index.js.map