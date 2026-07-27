/**
 * Line-delimited JSON-RPC over stdio.
 *
 * Message framing: one JSON object per line (UTF-8), as per the
 * Language Server Protocol convention but without the Content-Length
 * header — the bridge speaks with well-behaved local clients only.
 *
 * The transport:
 *   • Reads stdin as UTF-8 text, splits by \n.
 *   • Parses each line as JSON, dispatches via `Dispatcher`.
 *   • Writes responses as JSON followed by \n on stdout.
 *   • Forwards `LogRecord` and `CoreEvent` as JSON-RPC notifications
 *     (method = `logs.forward` / `events.notify`).
 *
 * Clients that can't do full-duplex framing can still use `request(...)`
 * through any JSON-RPC library (Python's jsonrpc-websocket, VS Code's
 * client, etc.) as long as they send \n-delimited messages.
 */
import { once } from "node:events";
import { JSONRPC_PARSE_ERROR, JSONRPC_INVALID_REQUEST, RPC_METHODS, rpcCodeForError, } from "../agent-contract/jsonrpc.js";
import { MemosError } from "../agent-contract/errors.js";
import { errorCodeOf, makeDispatcher } from "./methods.js";
// ─── Server ─────────────────────────────────────────────────────────────────
export function startStdioServer(options) {
    const stdin = options.stdin ?? process.stdin;
    const stdout = options.stdout ?? process.stdout;
    const logToStderr = options.logToStderr ?? true;
    const idleTimeoutMs = options.idleTimeoutMs;
    const dispatch = makeDispatcher(options.core, { strict: !!options.strict });
    let closed = false;
    let idleTimer = null;
    let resolveDone = null;
    let activeDispatches = 0;
    const eventsHandlers = new Set();
    const logsHandlers = new Set();
    // ─── Server-initiated RPC bookkeeping ──
    // Reverse-direction requests (bridge → client) live in their own
    // ID namespace ("srv-1", "srv-2", …) so they never collide with the
    // numeric IDs the Python client uses for forward requests.
    let serverRequestSeq = 0;
    const serverPending = new Map();
    const eventsUnsubscribe = options.core.subscribeEvents((e) => {
        writeNotification(RPC_METHODS.EVENTS_NOTIFY, e);
    });
    const logsUnsubscribe = options.core.subscribeLogs((r) => {
        writeNotification(RPC_METHODS.LOGS_FORWARD, r);
    });
    function finishTransport(err) {
        if (closed)
            return;
        closed = true;
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        try {
            eventsUnsubscribe();
        }
        catch {
            /* ignore */
        }
        try {
            logsUnsubscribe();
        }
        catch {
            /* ignore */
        }
        for (const [id, entry] of serverPending) {
            if (entry.timer)
                clearTimeout(entry.timer);
            entry.reject(err ?? new Error("stdio bridge closed"));
            serverPending.delete(id);
        }
        resolveDone?.();
    }
    function armIdleTimer() {
        if (!idleTimeoutMs || idleTimeoutMs <= 0 || closed)
            return;
        if (idleTimer)
            clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (serverPending.size > 0 || activeDispatches > 0) {
                armIdleTimer();
                return;
            }
            if (logToStderr) {
                process.stderr.write(`bridge.stdio.idle: closing after ${idleTimeoutMs}ms without input\n`);
            }
            finishTransport(new Error("stdio bridge idle timeout"));
            stdin.pause?.();
        }, idleTimeoutMs);
        idleTimer.unref?.();
    }
    function writeLine(obj) {
        try {
            stdout.write(JSON.stringify(obj) + "\n");
        }
        catch (err) {
            if (logToStderr) {
                process.stderr.write(`bridge.stdio.write.err: ${err instanceof Error ? err.message : String(err)}\n`);
            }
        }
    }
    function writeNotification(method, params) {
        writeLine({ jsonrpc: "2.0", method, params });
    }
    function errorResponse(id, code, message, data) {
        return {
            jsonrpc: "2.0",
            id: id ?? null,
            error: { code, message, data: data },
        };
    }
    async function handleLine(line) {
        if (closed)
            return;
        const trimmed = line.trim();
        if (trimmed.length === 0)
            return;
        armIdleTimer();
        let msg = null;
        try {
            msg = JSON.parse(trimmed);
        }
        catch (err) {
            writeLine(errorResponse(null, JSONRPC_PARSE_ERROR, "invalid JSON", {
                text: err instanceof Error ? err.message : String(err),
            }));
            return;
        }
        // Reverse-direction response: the client is replying to a request
        // we previously sent via `serverRequest`. Match by `srv-` ID and
        // resolve / reject the matching pending promise.
        const raw = msg;
        if (raw &&
            typeof raw === "object" &&
            typeof raw.id === "string" &&
            raw.id.startsWith("srv-") &&
            (raw.result !== undefined || raw.error !== undefined)) {
            const id = raw.id;
            const pending = serverPending.get(id);
            if (pending) {
                serverPending.delete(id);
                if (pending.timer)
                    clearTimeout(pending.timer);
                if (raw.error != null) {
                    pending.reject(raw.error);
                }
                else {
                    pending.resolve(raw.result);
                }
            }
            return;
        }
        if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || !msg.method) {
            writeLine(errorResponse(msg?.id ?? null, JSONRPC_INVALID_REQUEST, "not JSON-RPC 2.0"));
            return;
        }
        try {
            activeDispatches++;
            const result = await dispatch(msg.method, msg.params);
            if (msg.id !== undefined && msg.id !== null) {
                const ok = {
                    jsonrpc: "2.0",
                    id: msg.id,
                    result,
                };
                writeLine(ok);
            }
        }
        catch (err) {
            const code = rpcCodeForError(errorCodeOf(err));
            const mErr = err instanceof MemosError
                ? err
                : new MemosError("internal", err instanceof Error ? err.message : String(err));
            writeLine(errorResponse(msg.id ?? null, code, mErr.message, mErr.toJSON()));
            if (logToStderr) {
                process.stderr.write(`bridge.stdio.dispatch.err ${msg.method}: ${mErr.message}\n`);
            }
        }
        finally {
            activeDispatches = Math.max(0, activeDispatches - 1);
            armIdleTimer();
        }
    }
    // ─── Read loop ──
    let buffer = "";
    stdin.setEncoding?.("utf8");
    const donePromise = new Promise((resolve) => {
        resolveDone = resolve;
        armIdleTimer();
        stdin.on("data", (chunk) => {
            if (closed)
                return;
            buffer += String(chunk);
            let nl = buffer.indexOf("\n");
            while (nl >= 0) {
                const line = buffer.slice(0, nl);
                buffer = buffer.slice(nl + 1);
                void handleLine(line);
                nl = buffer.indexOf("\n");
            }
        });
        stdin.on("end", () => {
            if (buffer.length > 0) {
                void handleLine(buffer);
                buffer = "";
            }
            finishTransport();
        });
        stdin.on("error", (err) => {
            if (logToStderr) {
                process.stderr.write(`bridge.stdio.read.err: ${err.message}\n`);
            }
            finishTransport(err);
        });
    });
    function serverRequest(method, params, options) {
        const id = `srv-${++serverRequestSeq}`;
        const timeoutMs = options?.timeoutMs ?? 60_000;
        return new Promise((resolve, reject) => {
            if (closed) {
                reject(new Error("stdio bridge closed"));
                return;
            }
            const timer = setTimeout(() => {
                if (serverPending.delete(id)) {
                    reject(new Error(`serverRequest ${method} timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);
            serverPending.set(id, {
                resolve: resolve,
                reject,
                timer,
            });
            writeLine({ jsonrpc: "2.0", id, method, params });
        });
    }
    return {
        get connected() {
            return !closed;
        },
        async close() {
            if (closed)
                return;
            finishTransport();
            stdin.pause?.();
        },
        done: donePromise,
        serverRequest,
    };
}
export function createStdioClient(reader, writer) {
    let nextId = 1;
    const pending = new Map();
    const notificationQueue = [];
    let notificationWaiters = [];
    let done = false;
    let buffer = "";
    reader.setEncoding?.("utf8");
    reader.on("data", (chunk) => {
        buffer += String(chunk);
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line)
                handleClientLine(line);
            nl = buffer.indexOf("\n");
        }
    });
    reader.on("end", () => {
        done = true;
        while (notificationWaiters.length) {
            const w = notificationWaiters.shift();
            w?.({ value: undefined, done: true });
        }
    });
    function handleClientLine(line) {
        try {
            const msg = JSON.parse(line);
            if ("method" in msg && !("id" in msg)) {
                const n = { method: msg.method, params: msg.params };
                const waiter = notificationWaiters.shift();
                if (waiter)
                    waiter({ value: n, done: false });
                else
                    notificationQueue.push(n);
                return;
            }
            const resp = msg;
            if (typeof resp.id === "number") {
                const entry = pending.get(resp.id);
                if (!entry)
                    return;
                pending.delete(resp.id);
                if ("error" in resp) {
                    entry.reject(Object.assign(new Error(resp.error.message), { data: resp.error.data, code: resp.error.code }));
                }
                else {
                    entry.resolve(resp.result);
                }
            }
        }
        catch {
            /* ignore malformed server lines */
        }
    }
    return {
        request(method, params) {
            return new Promise((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve: resolve, reject });
                writer.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
            });
        },
        close() {
            for (const entry of pending.values())
                entry.reject(new Error("closed"));
            pending.clear();
            done = true;
        },
        notifications: {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        if (notificationQueue.length > 0) {
                            return { value: notificationQueue.shift(), done: false };
                        }
                        if (done)
                            return { value: undefined, done: true };
                        return new Promise((resolve) => notificationWaiters.push(resolve));
                    },
                };
            },
        },
    };
}
/** Convenience: await both the core's shutdown AND stdin ending. */
export async function waitForShutdown(core, handle) {
    await handle.close();
    try {
        await core.shutdown();
    }
    catch {
        /* swallow */
    }
    if (process.stdout.writableNeedDrain) {
        await once(process.stdout, "drain").catch(() => { });
    }
}
//# sourceMappingURL=stdio.js.map