/**
 * Five retrieval entry points corresponding to the V7 injection triggers
 * (ARCHITECTURE.md §4.3). Each picks the right mix of tiers + knob values:
 *
 *  ┌─────────────────┬──────────────────────────────────────────────────┐
 *  │ Trigger         │ Tiers       │ Size               │ Notes         │
 *  ├─────────────────┼─────────────┼────────────────────┼───────────────┤
 *  │ turn_start      │ 1 + 2 + 3   │ full               │ "before user" │
 *  │ tool_driven     │ 2 (+ 3)     │ shrunk             │ on memory_* call
 *  │ skill_invoke    │ 1 primary   │ shrunk             │ just-in-time  │
 *  │ sub_agent       │ 2 + 3       │ shrunk, no tier1   │ sub-agent ctx │
 *  │ decision_repair │ 1 + 2       │ includeLowValue=ON │ unblock loops │
 *  └─────────────────┴─────────────┴────────────────────┴───────────────┘
 *
 * Each entry is a pure async function: it does storage reads, zero writes.
 * Events (`retrieval.started/.done/.failed`) are emitted via the provided
 * bus so callers can stream packets to the viewer or persist audit trails.
 */
import type { InjectionPacket, EpochMs } from "../../agent-contract/dto.js";
import type { RetrievalEventBus } from "./events.js";
import type { RetrievalCtx, RetrievalDeps, RetrievalResult } from "./types.js";
export type TurnStartRetrieveCtx = Extract<RetrievalCtx, {
    reason: "turn_start";
}>;
export type ToolDrivenRetrieveCtx = Extract<RetrievalCtx, {
    reason: "tool_driven";
}>;
export type SkillInvokeRetrieveCtx = Extract<RetrievalCtx, {
    reason: "skill_invoke";
}>;
export type SubAgentRetrieveCtx = Extract<RetrievalCtx, {
    reason: "sub_agent";
}>;
export type RepairRetrieveCtx = Extract<RetrievalCtx, {
    reason: "decision_repair";
}>;
export interface RetrieveOptions {
    /** Event bus for `retrieval.*` events (optional — tests pass none). */
    events?: RetrievalEventBus;
    /** Override `limit` default (tier totals honored when unspecified). */
    limit?: number;
    /** Turn-start scheduler override. V1 uses this for intent tier gating. */
    plan?: RetrievePlanOverride;
    /**
     * Return mechanically ranked candidates without the local LLM pass.
     * Used when the caller will merge another retrieval route, then run
     * one unified final LLM filter across all routes.
     */
    skipLlmFilter?: boolean;
}
export declare function taskProtocolOnlyPacket(ctx: TurnStartRetrieveCtx, now: EpochMs): InjectionPacket | null;
export interface RetrievePlanOverride {
    scenarioId?: string;
    wantTier1?: boolean;
    wantTier2?: boolean;
    wantTier3?: boolean;
    /** Tier2: only policy/experience hits — skip trace + episode recall. */
    experienceOnly?: boolean;
    limit?: number;
}
export declare function turnStartRetrieve(deps: RetrievalDeps, ctx: TurnStartRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
export declare function toolDrivenRetrieve(deps: RetrievalDeps, ctx: ToolDrivenRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
export declare function skillInvokeRetrieve(deps: RetrievalDeps, ctx: SkillInvokeRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
export declare function subAgentRetrieve(deps: RetrievalDeps, ctx: SubAgentRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
export declare function repairRetrieve(deps: RetrievalDeps, ctx: RepairRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult | null>;
/** Thin façade so pipelines can `new Retriever(deps)` if they prefer OO. */
export declare class Retriever {
    private readonly deps;
    constructor(deps: RetrievalDeps);
    turnStart(ctx: TurnStartRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
    toolDriven(ctx: ToolDrivenRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
    skillInvoke(ctx: SkillInvokeRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
    subAgent(ctx: SubAgentRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult>;
    repair(ctx: RepairRetrieveCtx, opts?: RetrieveOptions): Promise<RetrievalResult | null>;
}
//# sourceMappingURL=retrieve.d.ts.map