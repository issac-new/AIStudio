/**
 * Exhaustive list of core event types. Every observable thing the algorithm
 * does emits one of these. Adding or renaming a literal is a versioned change
 * (see ARCHITECTURE.md §8) — also update docs/EVENTS.md in the same commit.
 */
export declare const CORE_EVENTS: readonly ["session.opened", "session.closed", "episode.opened", "episode.closed", "trace.created", "trace.value_updated", "trace.priority_decayed", "l2.candidate_added", "l2.candidate_expired", "l2.associated", "l2.induced", "l2.revised", "l2.boundary_shrunk", "l3.abstracted", "l3.revised", "feedback.received", "feedback.classified", "reward.computed", "skill.crystallized", "skill.eta_updated", "skill.boundary_updated", "skill.archived", "skill.repaired", "decision_repair.generated", "decision_repair.validated", "retrieval.triggered", "retrieval.tier1.hit", "retrieval.tier2.hit", "retrieval.tier3.hit", "retrieval.empty", "hub.client_connected", "hub.client_disconnected", "hub.share_published", "hub.share_received", "system.started", "system.shutdown", "system.error", "system.config_changed", "system.update_available"];
export type CoreEventType = (typeof CORE_EVENTS)[number];
export declare function isCoreEventType(s: string): s is CoreEventType;
/**
 * Generic event envelope. Every emitted event has the same shape so SSE
 * clients can parse uniformly without dispatching on `type` first.
 */
export interface CoreEvent<T = unknown> {
    /** Stable event type (one of `CORE_EVENTS`). */
    type: CoreEventType;
    /** Millisecond UTC epoch when the event was created. */
    ts: number;
    /** Monotonically increasing per-process sequence number (for ordering). */
    seq: number;
    /** Optional correlation id (e.g. traceId / sessionId) for stitching. */
    correlationId?: string;
    /** Event-specific payload. Strongly typed in `docs/EVENTS.md`. */
    payload: T;
}
//# sourceMappingURL=events.d.ts.map