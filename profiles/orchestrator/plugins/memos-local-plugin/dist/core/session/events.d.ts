/**
 * `SessionEventBus` — a deliberately tiny in-process pub/sub.
 *
 * We don't use Node's built-in `EventEmitter` because:
 *   - we want one subscribe API that returns an unsubscribe function,
 *   - we want a "wildcard" `onAny` channel to make it easy to forward
 *     events to the viewer (via SSE), the Phase 15 pipeline orchestrator,
 *     and future telemetry sinks,
 *   - we want synchronous delivery so the orchestrator can keep ordering.
 *
 * Listener exceptions are caught and routed to `rootLogger.warn` — one bad
 * subscriber must never break another.
 */
import type { SessionEventBus } from "./types.js";
export declare function createSessionEventBus(): SessionEventBus;
//# sourceMappingURL=events.d.ts.map