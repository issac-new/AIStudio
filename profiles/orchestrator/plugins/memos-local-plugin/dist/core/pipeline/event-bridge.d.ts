/**
 * Aggregates every internal event bus into the unified `CoreEvent`
 * stream exposed through `MemoryCore.subscribeEvents`.
 *
 * The bridge is intentionally *additive*: it never mutates the source
 * events, never suppresses them, and translates shape to the shared
 * envelope (`type` / `ts` / `seq` / `correlationId` / `payload`).
 *
 * Unknown event shapes still pass through as `system.error` when we
 * truly can't classify them — this is only a safety net; new events
 * should always get a dedicated branch in this file. Adding one is a
 * three-line change:
 *
 *   1. Pick the `CORE_EVENTS` type literal (see `agent-contract/events.ts`).
 *   2. Emit via `emit({ type, ts, seq, correlationId?, payload })`.
 *   3. Document it in `docs/EVENTS.md`.
 */
import type { Logger } from "../logger/types.js";
import type { AgentKind } from "../../agent-contract/dto.js";
import type { CoreEvent } from "../../agent-contract/events.js";
import type { PipelineBuses } from "./types.js";
export interface EventBridgeDeps {
    buses: PipelineBuses;
    agent: AgentKind;
    log: Logger;
    emit: (evt: CoreEvent) => void;
}
export interface EventBridgeHandle {
    dispose(): void;
    /** Internal seq counter, exposed for tests. */
    currentSeq(): number;
}
export declare function bridgeToCoreEvents(deps: EventBridgeDeps): EventBridgeHandle;
//# sourceMappingURL=event-bridge.d.ts.map