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
import { MemosError } from "../agent-contract/errors.js";
import { RPC_METHODS, isRpcMethodName, } from "../agent-contract/jsonrpc.js";
// ─── Param helpers ──────────────────────────────────────────────────────────
function asRecord(p, method) {
    if (p == null)
        return {};
    if (typeof p !== "object" || Array.isArray(p)) {
        throw new MemosError("invalid_argument", `${method}: params must be an object, got ${typeof p}`);
    }
    return p;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function namespaceParam(p) {
    return isRecord(p.namespace) ? p.namespace : undefined;
}
function requireString(obj, key, method) {
    const v = obj[key];
    if (typeof v !== "string" || v.length === 0) {
        throw new MemosError("invalid_argument", `${method}: '${key}' must be a non-empty string`);
    }
    return v;
}
// ─── Dispatcher factory ─────────────────────────────────────────────────────
export function makeDispatcher(core, options = {}) {
    const strict = options.strict ?? false;
    return async function dispatch(method, params, _ctx) {
        if (!isRpcMethodName(method)) {
            throw new MemosError("unknown_method", `unknown JSON-RPC method: ${method}`);
        }
        switch (method) {
            // ── lifecycle ──
            case RPC_METHODS.CORE_INIT:
                await core.init();
                return { ok: true };
            case RPC_METHODS.CORE_SHUTDOWN:
                await core.shutdown();
                return { ok: true };
            case RPC_METHODS.CORE_HEALTH:
                return await core.health();
            // ── session / episode ──
            case RPC_METHODS.SESSION_OPEN: {
                const p = asRecord(params, method);
                const agent = requireString(p, "agent", method);
                const sessionId = typeof p.sessionId === "string" && p.sessionId.length > 0
                    ? p.sessionId
                    : undefined;
                const meta = isRecord(p.meta) ? p.meta : undefined;
                const out = await core.openSession({ agent, sessionId, meta, namespace: namespaceParam(p) });
                return { sessionId: out };
            }
            case RPC_METHODS.SESSION_CLOSE: {
                const p = asRecord(params, method);
                await core.closeSession(requireString(p, "sessionId", method));
                return { ok: true };
            }
            case RPC_METHODS.EPISODE_OPEN: {
                const p = asRecord(params, method);
                const sessionId = requireString(p, "sessionId", method);
                const episodeId = typeof p.episodeId === "string" ? p.episodeId : undefined;
                const userMessage = typeof p.userMessage === "string" ? p.userMessage : undefined;
                const out = await core.openEpisode({ sessionId, episodeId, userMessage });
                return { episodeId: out };
            }
            case RPC_METHODS.EPISODE_CLOSE: {
                const p = asRecord(params, method);
                await core.closeEpisode(requireString(p, "episodeId", method));
                return { ok: true };
            }
            // ── turn lifecycle ──
            case RPC_METHODS.TURN_START: {
                const p = asRecord(params, method);
                if (strict)
                    validateTurnInput(p);
                return await core.onTurnStart(p);
            }
            case RPC_METHODS.TURN_END: {
                const p = asRecord(params, method);
                if (strict)
                    validateTurnResult(p);
                return await core.onTurnEnd(p);
            }
            case RPC_METHODS.FEEDBACK_SUBMIT: {
                const p = asRecord(params, method);
                const fb = {
                    episodeId: p.episodeId,
                    traceId: p.traceId,
                    channel: p.channel,
                    polarity: p.polarity,
                    magnitude: typeof p.magnitude === "number" ? p.magnitude : 0,
                    rationale: typeof p.rationale === "string" ? p.rationale : undefined,
                    raw: p.raw,
                    ts: typeof p.ts === "number" ? p.ts : undefined,
                };
                return await core.submitFeedback(fb);
            }
            // ── memory queries ──
            case RPC_METHODS.MEMORY_SEARCH: {
                const p = asRecord(params, method);
                const q = {
                    agent: (typeof p.agent === "string" ? p.agent : "openclaw"),
                    namespace: namespaceParam(p),
                    sessionId: p.sessionId ?? undefined,
                    episodeId: p.episodeId ?? undefined,
                    query: requireString(p, "query", method),
                    filters: p.filters ?? undefined,
                    topK: p.topK ?? undefined,
                };
                return await core.searchMemory(q);
            }
            case RPC_METHODS.MEMORY_GET_TRACE: {
                const p = asRecord(params, method);
                const id = requireString(p, "id", method);
                const ns = namespaceParam(p);
                return ns ? await core.getTrace(id, ns) : await core.getTrace(id);
            }
            case RPC_METHODS.MEMORY_GET_POLICY: {
                const p = asRecord(params, method);
                const id = requireString(p, "id", method);
                const ns = namespaceParam(p);
                return ns ? await core.getPolicy(id, ns) : await core.getPolicy(id);
            }
            case RPC_METHODS.MEMORY_GET_WORLD: {
                const p = asRecord(params, method);
                const id = requireString(p, "id", method);
                const ns = namespaceParam(p);
                return ns ? await core.getWorldModel(id, ns) : await core.getWorldModel(id);
            }
            case RPC_METHODS.MEMORY_LIST_EPISODES: {
                const p = asRecord(params, method);
                const out = await core.listEpisodes({
                    sessionId: p.sessionId ?? undefined,
                    limit: typeof p.limit === "number" ? p.limit : undefined,
                    offset: typeof p.offset === "number" ? p.offset : undefined,
                });
                return { episodeIds: out };
            }
            case RPC_METHODS.MEMORY_TIMELINE: {
                const p = asRecord(params, method);
                const out = await core.timeline({
                    episodeId: requireString(p, "episodeId", method),
                    namespace: namespaceParam(p),
                });
                return { traces: out };
            }
            case RPC_METHODS.MEMORY_LIST_TRACES: {
                const p = asRecord(params, method);
                const out = await core.listTraces({
                    limit: typeof p.limit === "number" ? p.limit : undefined,
                    offset: typeof p.offset === "number" ? p.offset : undefined,
                    sessionId: p.sessionId ?? undefined,
                    q: typeof p.q === "string" ? p.q : undefined,
                });
                return { traces: out };
            }
            case RPC_METHODS.MEMORY_LIST_WORLDS: {
                const p = asRecord(params, method);
                const input = {
                    limit: typeof p.limit === "number" ? p.limit : undefined,
                    offset: typeof p.offset === "number" ? p.offset : undefined,
                    q: typeof p.q === "string" ? p.q : undefined,
                };
                const ns = namespaceParam(p);
                if (ns)
                    input.namespace = ns;
                const out = await core.listWorldModels(input);
                return { worldModels: out };
            }
            // ── skills ──
            case RPC_METHODS.SKILL_LIST: {
                const p = asRecord(params, method);
                const input = {
                    status: p.status ?? undefined,
                    limit: typeof p.limit === "number" ? p.limit : undefined,
                };
                const ns = namespaceParam(p);
                if (ns)
                    input.namespace = ns;
                const out = await core.listSkills(input);
                return { skills: out };
            }
            case RPC_METHODS.SKILL_GET: {
                const p = asRecord(params, method);
                const opts = {};
                const hasOptions = p.recordTrial !== undefined ||
                    p.sessionId !== undefined ||
                    p.episodeId !== undefined ||
                    p.traceId !== undefined ||
                    p.turnId !== undefined ||
                    p.toolCallId !== undefined ||
                    p.namespace !== undefined;
                if (hasOptions) {
                    opts.recordUse = true;
                    opts.recordTrial = p.recordTrial !== false;
                }
                if (typeof p.sessionId === "string")
                    opts.sessionId = p.sessionId;
                if (typeof p.episodeId === "string")
                    opts.episodeId = p.episodeId;
                if (typeof p.traceId === "string")
                    opts.traceId = p.traceId;
                if (typeof p.turnId === "number")
                    opts.turnId = p.turnId;
                if (typeof p.toolCallId === "string")
                    opts.toolCallId = p.toolCallId;
                const ns = namespaceParam(p);
                if (ns)
                    opts.namespace = ns;
                const id = requireString(p, "id", method);
                return hasOptions ? await core.getSkill(id, opts) : await core.getSkill(id);
            }
            case RPC_METHODS.SKILL_ARCHIVE: {
                const p = asRecord(params, method);
                await core.archiveSkill(requireString(p, "id", method), typeof p.reason === "string" ? p.reason : undefined);
                return { ok: true };
            }
            // ── retrieval ──
            case RPC_METHODS.RETRIEVAL_QUERY: {
                // Delegated to `memory.search` for V1 — the dedicated triggers
                // (tool_driven, skill_invoke, sub_agent, decision_repair) will
                // land in V1.1 once adapters grow explicit entry points.
                const p = asRecord(params, method);
                return await core.searchMemory({
                    agent: (typeof p.agent === "string" ? p.agent : "openclaw"),
                    query: requireString(p, "query", method),
                });
            }
            // ── subagents ──
            case RPC_METHODS.SUBAGENT_RECORD: {
                const p = asRecord(params, method);
                const input = {
                    agent: (typeof p.agent === "string" ? p.agent : "hermes"),
                    sessionId: requireString(p, "sessionId", method),
                    episodeId: typeof p.episodeId === "string" && p.episodeId.length > 0
                        ? p.episodeId
                        : undefined,
                    childSessionId: typeof p.childSessionId === "string" && p.childSessionId.length > 0
                        ? p.childSessionId
                        : null,
                    task: requireString(p, "task", method),
                    result: typeof p.result === "string" ? p.result : "",
                    toolCalls: Array.isArray(p.toolCalls)
                        ? p.toolCalls
                        : undefined,
                    outcome: typeof p.outcome === "string" ? p.outcome : undefined,
                    error: typeof p.error === "string" ? p.error : undefined,
                    ts: typeof p.ts === "number" ? p.ts : undefined,
                    meta: p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
                        ? p.meta
                        : undefined,
                };
                return await core.recordSubagentOutcome(input);
            }
            // ── tool-outcome ──
            // Not registered as a public RPC yet — the core exposes the method
            // but we route it via a notification on the events stream instead.
            // Leaving a branch here would be dead code; we intentionally drop.
            // ── config / hub ──
            case RPC_METHODS.CONFIG_GET:
            case RPC_METHODS.CONFIG_PATCH:
            case RPC_METHODS.HUB_STATUS:
            case RPC_METHODS.HUB_PUBLISH:
            case RPC_METHODS.HUB_PULL:
                throw new MemosError("unknown_method", `${method}: not implemented yet in V1`);
            // ── logs + events ──
            case RPC_METHODS.LOGS_TAIL:
            case RPC_METHODS.LOGS_FORWARD:
            case RPC_METHODS.EVENTS_SUBSCRIBE:
            case RPC_METHODS.EVENTS_UNSUBSCRIBE:
                // Handled by the transport layer (SSE / notification channels).
                throw new MemosError("protocol_error", `${method}: must be handled by the transport, not the dispatcher`);
            default:
                throw new MemosError("unknown_method", `unsupported method: ${method}`);
        }
    };
}
// ─── Validators (strict mode) ───────────────────────────────────────────────
function validateTurnInput(p) {
    requireKey(p, "agent", "string", "turn.start");
    requireKey(p, "sessionId", "string", "turn.start");
    requireKey(p, "userText", "string", "turn.start");
    requireKey(p, "ts", "number", "turn.start");
}
function validateTurnResult(p) {
    requireKey(p, "agent", "string", "turn.end");
    requireKey(p, "sessionId", "string", "turn.end");
    requireKey(p, "episodeId", "string", "turn.end");
    requireKey(p, "agentText", "string", "turn.end");
    if (!Array.isArray(p.toolCalls)) {
        throw new MemosError("invalid_argument", "turn.end: 'toolCalls' must be an array");
    }
    requireKey(p, "ts", "number", "turn.end");
}
function requireKey(p, key, type, method) {
    const v = p[key];
    if (typeof v !== type) {
        throw new MemosError("invalid_argument", `${method}: '${key}' must be a ${type}`);
    }
}
// ─── Error code helpers (re-exported for transports) ────────────────────────
export function errorCodeOf(err) {
    if (err instanceof MemosError)
        return err.code;
    return "internal";
}
//# sourceMappingURL=methods.js.map