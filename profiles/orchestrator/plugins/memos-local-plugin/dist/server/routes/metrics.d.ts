/**
 * Analytics endpoints.
 *
 *   GET /api/v1/metrics?days=N
 *     High-level KPIs (totals, daily histogram). Thin adapter over
 *     `core.metrics()`.
 *
 *   GET /api/v1/metrics/tools?minutes=N  (alias: ?days=N)
 *     Per-tool call latency + success-rate table. Data source: the
 *     `api_logs` table, which records every plugin internal operation
 *     (memos_search / memory_add / policy_generate / skill_generate /
 *     world_model_generate / task_done / task_failed) with its
 *     `durationMs` and `success` flag. We also fold in any agent-side
 *     tool invocations recorded on `traces.tool_calls_json` so the
 *     panel covers both plugin subsystems and external tools.
 *
 *     Output shape mirrors the legacy `memos-local-openclaw` plugin so
 *     the frontend `ToolLatencyCard` can consume it unchanged.
 */
import type { ServerDeps } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerMetricsRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=metrics.d.ts.map