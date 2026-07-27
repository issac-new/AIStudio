/**
 * JSON-RPC 2.0 envelope + canonical method names. Used by `bridge.cts` and
 * any non-TypeScript adapter (e.g. Hermes' Python client).
 *
 * Adding a method here is non-breaking. Renaming or removing one is breaking
 * (see ARCHITECTURE.md §8).
 */
import type { ErrorCode, SerializedMemosError } from "./errors.js";
export type JsonRpcId = number | string;
export interface JsonRpcRequest<P = unknown> {
    jsonrpc: "2.0";
    id: JsonRpcId;
    method: string;
    params?: P;
}
export interface JsonRpcNotification<P = unknown> {
    jsonrpc: "2.0";
    method: string;
    params?: P;
}
export interface JsonRpcSuccess<R = unknown> {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result: R;
}
export interface JsonRpcFailure {
    jsonrpc: "2.0";
    id: JsonRpcId | null;
    error: {
        /** Numeric code per JSON-RPC 2.0; we always use -32000 for app errors. */
        code: number;
        message: string;
        /** Our stable application-level error. */
        data?: SerializedMemosError;
    };
}
export type JsonRpcResponse<R = unknown> = JsonRpcSuccess<R> | JsonRpcFailure;
export declare const JSONRPC_PARSE_ERROR = -32700;
export declare const JSONRPC_INVALID_REQUEST = -32600;
export declare const JSONRPC_METHOD_NOT_FOUND = -32601;
export declare const JSONRPC_INVALID_PARAMS = -32602;
export declare const JSONRPC_INTERNAL_ERROR = -32603;
export declare const JSONRPC_APPLICATION_ERROR = -32000;
/**
 * The complete method registry. Group prefixes match `core/` modules so the
 * `bridge/methods.ts` dispatcher can route mechanically.
 */
export declare const RPC_METHODS: {
    readonly CORE_INIT: "core.init";
    readonly CORE_SHUTDOWN: "core.shutdown";
    readonly CORE_HEALTH: "core.health";
    readonly SESSION_OPEN: "session.open";
    readonly SESSION_CLOSE: "session.close";
    readonly EPISODE_OPEN: "episode.open";
    readonly EPISODE_CLOSE: "episode.close";
    readonly TURN_START: "turn.start";
    readonly TURN_END: "turn.end";
    readonly FEEDBACK_SUBMIT: "feedback.submit";
    readonly MEMORY_SEARCH: "memory.search";
    readonly MEMORY_GET_TRACE: "memory.get_trace";
    readonly MEMORY_GET_POLICY: "memory.get_policy";
    readonly MEMORY_GET_WORLD: "memory.get_world";
    readonly MEMORY_LIST_EPISODES: "memory.list_episodes";
    readonly MEMORY_TIMELINE: "memory.timeline";
    readonly MEMORY_LIST_TRACES: "memory.list_traces";
    readonly MEMORY_LIST_WORLDS: "memory.list_world_models";
    readonly SKILL_LIST: "skill.list";
    readonly SKILL_GET: "skill.get";
    readonly SKILL_ARCHIVE: "skill.archive";
    readonly RETRIEVAL_QUERY: "retrieval.query";
    readonly SUBAGENT_RECORD: "subagent.record";
    readonly CONFIG_GET: "config.get";
    readonly CONFIG_PATCH: "config.patch";
    readonly HUB_STATUS: "hub.status";
    readonly HUB_PUBLISH: "hub.publish";
    readonly HUB_PULL: "hub.pull";
    readonly LOGS_TAIL: "logs.tail";
    /** Notification: forward a log line from a non-TS adapter back into our sinks. */
    readonly LOGS_FORWARD: "logs.forward";
    /** Notification: subscribe; the server then sends `events.notify` notifications. */
    readonly EVENTS_SUBSCRIBE: "events.subscribe";
    readonly EVENTS_UNSUBSCRIBE: "events.unsubscribe";
    readonly EVENTS_NOTIFY: "events.notify";
};
export type RpcMethodName = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];
export declare function isRpcMethodName(s: string): s is RpcMethodName;
/** Map an internal `MemosError.code` to a numeric JSON-RPC code we'll report. */
export declare function rpcCodeForError(code: ErrorCode | undefined): number;
//# sourceMappingURL=jsonrpc.d.ts.map