/**
 * `createMemoryCore` — the adapter-facing façade.
 *
 * The pipeline (see `orchestrator.ts`) owns every algorithm subscriber,
 * every event bus, every runner; it is intentionally richer than the
 * adapter contract. Adapters should never reach into that shape.
 *
 * This file implements the `MemoryCore` interface (see
 * `agent-contract/memory-core.ts`) on top of a `PipelineHandle`:
 *
 *   • Translates JSON-friendly DTOs ↔ core rows.
 *   • Serializes lifecycle transitions (`init` → `shutdown`).
 *   • Maps every error to a stable `MemosError` code so bridges
 *     (JSON-RPC or TCP) can surface them cleanly.
 *
 * Two constructors are exposed:
 *
 *   • `createMemoryCore(handle, home, pkgVersion)` — wrap an already-built
 *     `PipelineHandle`. Keeps the façade trivially mockable in tests.
 *
 *   • `bootstrapMemoryCore(options)` — opens storage, runs migrations,
 *     loads providers + config, and constructs the pipeline from a
 *     minimal `{ agent, home?, config? }` input. Used by adapters.
 */
import type { AgentKind, EpisodeListItemDTO, PolicyDTO, SkillDTO, SkillId, TraceDTO, WorldModelDTO, RuntimeNamespace } from "../../agent-contract/dto.js";
import type { MemoryCore } from "../../agent-contract/memory-core.js";
import type { EpisodeRow, PolicyRow, SkillRow, TraceRow, WorldModelRow } from "../types.js";
import type { ResolvedConfig, ResolvedHome } from "../config/index.js";
import { type HostLlmBridge } from "../llm/host-bridge.js";
import type { PipelineHandle } from "./types.js";
export interface BootstrapOptions {
    agent: AgentKind;
    namespace?: RuntimeNamespace;
    /** Optional pre-resolved home. If omitted, derived from `resolveHome`. */
    home?: ResolvedHome;
    /** Optional pre-resolved config. If omitted, we load from disk. */
    config?: ResolvedConfig;
    /** Override `Date.now` — useful for deterministic tests. */
    now?: () => number;
    /** Plugin package version (surfaced via `health()`). */
    pkgVersion?: string;
    /**
     * Optional adapter-supplied LLM bridge. When set, registered on the
     * shared host-bridge singleton **before** the LLM clients are
     * created so `shouldFallback()` can see it on the very first call.
     *
     * Wiring this through bootstrap (rather than asking the adapter to
     * call `registerHostLlmBridge` itself) avoids a subtle ESM module-
     * identity bug: when the adapter dynamically imports
     * `core/llm/host-bridge.ts` from a different URL than the static
     * `import` chain inside `core/llm/client.ts`, Node's module loader
     * treats them as two separate modules with two independent
     * `currentBridge` slots — register hits one, get sees the other,
     * fallback never engages. Routing through bootstrap forces the
     * register call to happen via the same module instance the LLM
     * client closes over.
     */
    hostLlmBridge?: HostLlmBridge | null;
    /** Optional telemetry instance for ARMS RUM reporting. */
    telemetry?: import("../telemetry/index.js").Telemetry | null;
}
export interface BootstrapResult {
    core: MemoryCore;
    home: ResolvedHome;
    config: ResolvedConfig;
}
/**
 * Build a `MemoryCore` from the ground up. Opens SQLite, runs migrations,
 * constructs the LLM/embedder (if configured) and wires the pipeline.
 *
 * The returned core is **already initialized** — `init()` is a no-op after
 * bootstrapping; callers can still await it if they want the stable contract.
 *
 * Adapters should prefer {@link bootstrapPlugin} instead — it additionally
 * starts the HTTP viewer on the configured port and returns a shutdown
 * handle that tears both down together.
 */
export declare function bootstrapMemoryCore(options: BootstrapOptions): Promise<MemoryCore>;
export declare function bootstrapMemoryCoreFull(options: BootstrapOptions): Promise<BootstrapResult>;
export interface CreateMemoryCoreOptions {
    /** Called after the pipeline has shut down. */
    onShutdown?: () => void | Promise<void>;
    /** Optional telemetry instance for ARMS RUM reporting. */
    telemetry?: import("../telemetry/index.js").Telemetry | null;
}
/**
 * Wrap a pre-built `PipelineHandle` with the `MemoryCore` contract.
 *
 * Lifecycle semantics:
 *   • `init()` is idempotent; once called the core accepts turn events.
 *   • `shutdown()` drains the pipeline, fires `onShutdown`, and refuses
 *     subsequent calls with `MemosError("ALREADY_SHUT_DOWN")`.
 */
export declare function createMemoryCore(handle: PipelineHandle, home: ResolvedHome, pkgVersion: string, options?: CreateMemoryCoreOptions): MemoryCore;
export declare function traceRowToDTO(row: TraceRow, episode?: EpisodeRow | null): TraceDTO;
export declare function policyRowToDTO(row: PolicyRow): PolicyDTO;
export declare function worldModelRowToDTO(row: WorldModelRow): WorldModelDTO;
export declare function skillRowToDTO(row: SkillRow): SkillDTO;
export declare function inferTier(kind: "skill" | "trace" | "episode" | "experience" | "world-model" | "preference" | "anti-pattern"): 1 | 2 | 3;
/**
 * Derive a human-readable skill-crystallisation status for an
 * episode ("task") from the raw episode row + its related policies /
 * skills. Mirrors the legacy `tasks.skill_status` / `skill_reason`
 * fields so the Tasks page can show the user *why* a completed task
 * produced no skill.
 *
 * Order matters: we return the first matching branch.
 */
/**
 * Derive a meaningful user-turn count for the viewer's task list.
 *
 * L1 traces are step-level rows: one user request can produce many tool
 * traces plus a final assistant trace. `turnId` is the stable group key
 * stamped on every trace created from the same user message, so the Tasks
 * tab should count distinct `turnId`s rather than raw trace ids.
 */
export declare function deriveTurnCount(r: EpisodeRow, traces?: readonly Pick<TraceRow, "turnId">[]): number;
export declare const R_NEGATIVE_FLOOR = -0.15;
export declare const R_BELOW_THRESHOLD = 0.15;
export declare function deriveSkillStatus(ep: EpisodeRow, relatedPolicies: readonly PolicyRow[], skillsByPolicy: ReadonlyMap<string, readonly SkillRow[]>, thresholds?: {
    minEpisodesForInduction: string;
    minTraceValue: string;
    skillMinSupport: string;
    skillMinGain: string;
}): {
    status: EpisodeListItemDTO["skillStatus"];
    reason: string | null;
    reasonKey: string | null;
    reasonParams: Record<string, string> | null;
    linkedSkillId: SkillId | null;
};
//# sourceMappingURL=memory-core.d.ts.map