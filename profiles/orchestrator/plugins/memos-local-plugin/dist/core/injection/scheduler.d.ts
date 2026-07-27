import type { SessionId, EpisodeId } from "../../agent-contract/dto.js";
import type { IntentDecision, TurnRelation } from "../session/types.js";
export type InjectionScenarioId = "CHITCHAT" | "META" | "MEMORY_PROBE" | "NEW_TASK" | "FOLLOW_UP" | "TASK" | "UNKNOWN_SAFE";
export interface SchedulerContext {
    userText: string;
    sessionId: SessionId;
    episodeId: EpisodeId;
    intent: IntentDecision;
    relation?: TurnRelation | "bootstrap" | "lightweight_memory";
}
export interface RetrievePlan {
    scenarioId: InjectionScenarioId;
    entry: "turn_start" | "turn_start_skip";
    wantTier1: boolean;
    wantTier2: boolean;
    wantTier3: boolean;
    prepend: boolean;
}
export declare function scheduleInjection(ctx: SchedulerContext): RetrievePlan;
//# sourceMappingURL=scheduler.d.ts.map