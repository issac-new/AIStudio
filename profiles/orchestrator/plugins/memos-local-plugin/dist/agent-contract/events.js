/**
 * Exhaustive list of core event types. Every observable thing the algorithm
 * does emits one of these. Adding or renaming a literal is a versioned change
 * (see ARCHITECTURE.md §8) — also update docs/EVENTS.md in the same commit.
 */
export const CORE_EVENTS = [
    // ─── Sessions / Episodes ───
    "session.opened",
    "session.closed",
    "episode.opened",
    "episode.closed",
    // ─── L1 traces ───
    "trace.created",
    "trace.value_updated",
    "trace.priority_decayed",
    // ─── L2 policies ───
    "l2.candidate_added",
    "l2.candidate_expired",
    "l2.associated",
    "l2.induced",
    "l2.revised",
    "l2.boundary_shrunk",
    // ─── L3 world models ───
    "l3.abstracted",
    "l3.revised",
    // ─── Feedback ───
    "feedback.received",
    "feedback.classified",
    "reward.computed",
    // ─── Skills ───
    "skill.crystallized",
    "skill.eta_updated",
    "skill.boundary_updated",
    "skill.archived",
    "skill.repaired",
    // ─── Decision repair ───
    "decision_repair.generated",
    "decision_repair.validated",
    // ─── Retrieval ───
    "retrieval.triggered",
    "retrieval.tier1.hit",
    "retrieval.tier2.hit",
    "retrieval.tier3.hit",
    "retrieval.empty",
    // ─── Hub (team sharing) ───
    "hub.client_connected",
    "hub.client_disconnected",
    "hub.share_published",
    "hub.share_received",
    // ─── System ───
    "system.started",
    "system.shutdown",
    "system.error",
    "system.config_changed",
    "system.update_available",
];
export function isCoreEventType(s) {
    return CORE_EVENTS.includes(s);
}
//# sourceMappingURL=events.js.map