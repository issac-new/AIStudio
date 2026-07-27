/**
 * Reward floor below which an episode counts as "failed". Slight
 * negatives or below-threshold positives still read as "completed" in
 * the task list — the soft-fail framing (未达沉淀阈值) lives on the
 * skill pipeline pill, not the main task status.
 */
export const R_NEGATIVE_FLOOR = -0.15;
/**
 * Recently-finalized grace window: a closed-but-just-ended episode
 * may still be reopened by the next user turn, so we keep showing it
 * as "active" for two minutes.
 */
export const ACTIVE_GRACE_WINDOW_MS = 2 * 60 * 1000;
/**
 * Derive the coarse task status of an episode row.
 *
 * The order below is significant — earlier branches win. Keep this
 * in lock-step with the legacy plugin's task list and with the
 * `pill--<status>` styling on the viewer.
 *
 * @param row episode list item DTO
 * @param now optional override for the current epoch (used in tests
 *            so the grace window is deterministic).
 */
export function deriveEpisodeStatus(row, now = Date.now()) {
    if (row.status === "open")
        return "active";
    if (row.closeReason === "finalized" && row.endedAt != null) {
        if (now - row.endedAt < ACTIVE_GRACE_WINDOW_MS)
            return "active";
    }
    // Reward-scored episodes are classified by R_task regardless of
    // how they were closed (finalized or abandoned).
    if (row.rTask != null && row.rTask <= R_NEGATIVE_FLOOR)
        return "failed";
    if (row.rTask != null)
        return "completed";
    if (row.rewardSkipped)
        return "skipped";
    // Skill pipeline produced a skill → the task contributed
    // meaningful knowledge even when rTask is null (e.g. plugin
    // crashed after skill generation but before rTask was persisted).
    if (row.skillStatus === "generated" || row.skillStatus === "upgraded") {
        return "completed";
    }
    if (row.closeReason === "abandoned")
        return "skipped";
    if ((row.turnCount ?? 0) >= 2)
        return "completed";
    return "skipped";
}
/**
 * Type-guard for the `status` query param. Anything outside the
 * accepted set collapses to `""` (no filter), matching the viewer's
 * default chip.
 */
export function parseTaskStatusFilter(raw) {
    if (raw == null)
        return "";
    const trimmed = raw.trim();
    switch (trimmed) {
        case "active":
        case "completed":
        case "skipped":
        case "failed":
            return trimmed;
        case "":
        default:
            return "";
    }
}
//# sourceMappingURL=episode-status.js.map