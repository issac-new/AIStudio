/**
 * JSON-RPC method dispatcher for the bridge.
 *
 * Given a live `MemoryCore`, returns a function that maps a JSON-RPC
 * method + params to a promise resolving to the method's result (or
 * rejecting with a `MemosError`). The dispatcher is transport-agnostic;
 * stdio and TCP entry points both call into it.
 *
 * Routing follows the registry in `agent-contract/jsonrpc.ts` (`RPC_METHODS`).
 * Unknown methods raise `unknown_method`; malformed params raise
 * `invalid_argument`. Every error carries the stable `ErrorCode` so
 * non-TS adapters can handle them programmatically.
 */
import { type ErrorCode } from "../agent-contract/errors.js";
import type { MemoryCore } from "../agent-contract/memory-core.js";
import type { ToolOutcomeDTO } from "../agent-contract/dto.js";
export interface DispatcherOptions {
    /** Strict schema validation for `params`. Off by default (fast path). */
    strict?: boolean;
}
export interface DispatchContext {
    /** Connection-scoped unique id. Used for cancellation + log correlation. */
    connectionId?: string;
}
export type Dispatcher = (method: string, params: unknown, ctx?: DispatchContext) => Promise<unknown>;
export declare function makeDispatcher(core: MemoryCore, options?: DispatcherOptions): Dispatcher;
export declare function errorCodeOf(err: unknown): ErrorCode;
/** ToolOutcomeDTO is used elsewhere but referenced here for completeness. */
export type { ToolOutcomeDTO };
//# sourceMappingURL=methods.d.ts.map