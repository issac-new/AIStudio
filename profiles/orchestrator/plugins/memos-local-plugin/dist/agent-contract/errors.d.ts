/**
 * Stable error codes returned across module + bridge boundaries. Adapters in
 * any language should pattern-match on `code`, never on `message` text.
 *
 * Adding a code here is non-breaking. Removing or repurposing one is breaking.
 */
export declare const ERROR_CODES: {
    readonly INVALID_ARGUMENT: "invalid_argument";
    readonly NOT_FOUND: "not_found";
    readonly ALREADY_EXISTS: "already_exists";
    readonly CONFLICT: "conflict";
    readonly INTERNAL: "internal";
    readonly UNSUPPORTED: "unsupported";
    readonly NOT_INITIALIZED: "not_initialized";
    readonly ALREADY_SHUT_DOWN: "already_shut_down";
    readonly CONFIG_INVALID: "config_invalid";
    readonly CONFIG_MISSING: "config_missing";
    readonly CONFIG_WRITE_FAILED: "config_write_failed";
    readonly PATH_NOT_WRITABLE: "path_not_writable";
    readonly SESSION_NOT_FOUND: "session_not_found";
    readonly EPISODE_NOT_FOUND: "episode_not_found";
    readonly TRACE_NOT_FOUND: "trace_not_found";
    readonly POLICY_NOT_FOUND: "policy_not_found";
    readonly WORLD_MODEL_NOT_FOUND: "world_model_not_found";
    readonly SKILL_NOT_FOUND: "skill_not_found";
    readonly FEEDBACK_NOT_FOUND: "feedback_not_found";
    readonly LLM_UNAVAILABLE: "llm_unavailable";
    readonly LLM_RATE_LIMITED: "llm_rate_limited";
    readonly LLM_TIMEOUT: "llm_timeout";
    readonly LLM_OUTPUT_MALFORMED: "llm_output_malformed";
    readonly EMBEDDING_UNAVAILABLE: "embedding_unavailable";
    readonly INSUFFICIENT_EVIDENCE: "insufficient_evidence";
    readonly VERIFICATION_FAILED: "verification_failed";
    readonly UNKNOWN_METHOD: "unknown_method";
    readonly PROTOCOL_ERROR: "protocol_error";
    readonly TRANSPORT_CLOSED: "transport_closed";
    readonly HUB_AUTH_FAILED: "hub_auth_failed";
    readonly HUB_UNREACHABLE: "hub_unreachable";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
export interface SerializedMemosError {
    name: "MemosError";
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
}
export declare class MemosError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message: string, details?: Record<string, unknown>);
    toJSON(): SerializedMemosError;
    static is(err: unknown): err is MemosError;
}
//# sourceMappingURL=errors.d.ts.map