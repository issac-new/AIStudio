/**
 * Shared episode-status derivation.
 *
 * Both the viewer (Tasks list filter chips) and the HTTP server
 * (`GET /api/v1/episodes?status=…`) need to classify an
 * `EpisodeListItemDTO` into a coarse task-level status: one of
 * `active | completed | skipped | failed`. Without a shared source of
 * truth the two sides drift — e.g. server-side "failed" filtering
 * leaves rows the client renders as "completed" — so this module is
 * the single derivation point.
 *
 * Keep this file framework-free: it's imported by the Vite-bundled
 * viewer, the Node HTTP server, and unit tests. No DOM, no Node
 * built-ins.
 */
import type { EpisodeListItemDTO } from "./dto.ts";
/**
 * Filter slug accepted by `GET /api/v1/episodes?status=…` and the
 * viewer's task-status chip group.
 *
 * - `""`         → no filter (default).
 * - `"active"`   → ongoing episodes (open or recently finalised).
 * - `"completed"`→ closed and credited as useful.
 * - `"skipped"`  → closed but the reward pipeline opted out.
 * - `"failed"`   → closed with a clearly-negative R_task.
 */
export type TaskStatusFilter = "" | "active" | "completed" | "skipped" | "failed";
/** Concrete derived status (excludes the empty "no filter" sentinel). */
export type DerivedTaskStatus = Exclude<TaskStatusFilter, "">;
/**
 * Reward floor below which an episode counts as "failed". Slight
 * negatives or below-threshold positives still read as "completed" in
 * the task list — the soft-fail framing (未达沉淀阈值) lives on the
 * skill pipeline pill, not the main task status.
 */
export declare const R_NEGATIVE_FLOOR = -0.15;
/**
 * Recently-finalized grace window: a closed-but-just-ended episode
 * may still be reopened by the next user turn, so we keep showing it
 * as "active" for two minutes.
 */
export declare const ACTIVE_GRACE_WINDOW_MS: number;
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
export declare function deriveEpisodeStatus(row: EpisodeListItemDTO, now?: number): DerivedTaskStatus;
/**
 * Type-guard for the `status` query param. Anything outside the
 * accepted set collapses to `""` (no filter), matching the viewer's
 * default chip.
 */
export declare function parseTaskStatusFilter(raw: string | null | undefined): TaskStatusFilter;
//# sourceMappingURL=episode-status.d.ts.map