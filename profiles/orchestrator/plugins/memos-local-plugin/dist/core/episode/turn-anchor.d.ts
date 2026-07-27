/**
 * Stable per-episode turn grouping for capture + trace dedupe.
 *
 * `anchorTurnId` is stamped when an episode opens (first user message ts).
 * All L1 traces in that episode share it so content signatures do not drift
 * when tool rows carry historical timestamps from gateway replay.
 *
 * `captureLiteTurnCount` records how many in-memory turns were processed by
 * the last successful lite capture so we only extract steps from new turns.
 */
import type { EpisodeSnapshot } from "../session/types.js";
import type { EpochMs } from "../types.js";
import type { StepCandidate } from "../capture/types.js";
import type { TraceRow } from "../types.js";
export declare const ANCHOR_TURN_ID_META = "anchorTurnId";
export declare const CAPTURE_LITE_TURN_CURSOR_META = "captureLiteTurnCount";
/** Anchor stamped on episode open (`episode-manager.start`). */
export declare function readAnchorTurnId(episode: EpisodeSnapshot): EpochMs | undefined;
/** Anchor for persist/dedupe; falls back for legacy episodes missing meta. */
export declare function resolveAnchorTurnId(episode: EpisodeSnapshot): EpochMs;
export declare function anchorTurnIdFromFirstUserTs(ts: EpochMs): EpochMs;
export declare function liteCaptureTurnCursor(episode: EpisodeSnapshot): number;
/** Resolve the display/grouping turn id for a concrete step/trace row. */
export declare function pickTurnId(meta: Record<string, unknown> | undefined, fallbackTs: number): number;
export declare function episodeAlreadyHasUserTextTrace(existing: readonly Pick<TraceRow, "turnId" | "userText">[], anchorTurnId: number): boolean;
export declare function stripRepeatedEpisodeUserText(rows: TraceRow[], existing: readonly TraceRow[], _anchorTurnId: number): TraceRow[];
/** Content signature for a not-yet-persisted step (matches persisted trace rows). */
export declare function stepIdentitySignature(step: Pick<StepCandidate, "toolCalls" | "ts" | "userText" | "agentText" | "meta">, anchorTurnId?: number): string;
//# sourceMappingURL=turn-anchor.d.ts.map