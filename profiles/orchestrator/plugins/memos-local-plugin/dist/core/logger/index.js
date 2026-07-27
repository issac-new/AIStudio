/**
 * Logger factory + global root logger.
 *
 *   const log = rootLogger.child({ channel: "core.l2.cross-task" });
 *   log.info("induce.start", { episodes: ids.length });
 *
 * On first import, the module starts in a "console-only" pre-init mode so
 * even early imports can log safely. Once the runtime has resolved a config,
 * call `initLogger(config, paths)` to wire up file/SSE/audit/llm/perf/events
 * sinks.
 *
 * `initLogger` is idempotent — re-init swaps the active root in place so
 * existing `child()` instances keep working.
 */
import { hostname } from "node:os";
import { join } from "node:path";
import { LOG_LEVEL_ORDER, parseLevel, resolveLevelForChannel } from "./levels.js";
import { Redactor } from "./redact.js";
import { ConsoleTransport } from "./transports/console.js";
import { FileRotatingTransport } from "./transports/file-rotating.js";
import { JsonlEventsTransport } from "./transports/jsonl-events.js";
import { SseBroadcastTransport } from "./transports/sse-broadcast.js";
import { MemoryBufferTransport } from "./transports/memory-buffer.js";
import { NullTransport } from "./transports/null.js";
import { AppLogSink } from "./sinks/app-log.js";
import { ErrorLogSink } from "./sinks/error-log.js";
import { AuditLogSink } from "./sinks/audit-log.js";
import { LlmLogSink } from "./sinks/llm-log.js";
import { PerfLogSink } from "./sinks/perf-log.js";
import { EventsLogSink } from "./sinks/events-log.js";
import { createSpan } from "./timer.js";
import { now as nowMs } from "../time.js";
import { getCtx } from "./context.js";
let core = bootstrapConsoleOnly();
/** Console-only logger with a memory buffer. Always safe to use. */
function bootstrapConsoleOnly() {
    const memBuffer = new MemoryBufferTransport({ capacity: 512 });
    const console_ = new ConsoleTransport({ pretty: true });
    const broadcast = new SseBroadcastTransport();
    const transports = [console_, memBuffer, broadcast];
    const sinks = [
        new AppLogSink(transports),
        new ErrorLogSink(transports),
    ];
    return {
        level: "info",
        channels: {},
        sinks,
        memBuffer,
        redactor: new Redactor({ extraKeys: [], extraPatterns: [] }),
        perfSampleRate: 1,
        llmRedactPrompts: false,
        llmRedactCompletions: false,
        pid: process.pid,
        host: hostname(),
        seq: 0,
        filesActive: false,
    };
}
export function initLogger(config, home, opts = {}) {
    const { logging } = config;
    const filesEnabled = opts.filesEnabled ?? logging.file.enabled;
    const broadcastEnabled = opts.broadcastEnabled ?? true;
    // Close prior file transports cleanly before swap.
    void shutdownLogger();
    const memBuffer = new MemoryBufferTransport({ capacity: 2048 });
    const broadcast = broadcastEnabled ? new SseBroadcastTransport() : new NullTransport();
    const console_ = logging.console.enabled
        ? new ConsoleTransport({ pretty: logging.console.pretty, format: "json" })
        : new NullTransport();
    // ── per-sink transports ──
    const appTransports = [console_, memBuffer, broadcast];
    const errorTransports = [memBuffer, broadcast];
    const auditTransports = [memBuffer, broadcast];
    const llmTransports = [memBuffer, broadcast];
    const perfTransports = [memBuffer, broadcast];
    const eventsTransports = [memBuffer, broadcast];
    if (filesEnabled) {
        appTransports.push(new FileRotatingTransport({
            filePath: join(home.logsDir, "memos.log"),
            format: logging.file.format,
            maxSizeMb: logging.file.rotate.maxSizeMb,
            maxFiles: logging.file.retentionDays,
            gzip: logging.file.rotate.gzip,
        }));
        errorTransports.push(new FileRotatingTransport({
            filePath: join(home.logsDir, "error.log"),
            format: logging.file.format,
            maxSizeMb: logging.file.rotate.maxSizeMb,
            maxFiles: logging.file.retentionDays,
            gzip: logging.file.rotate.gzip,
        }));
        if (logging.audit.enabled) {
            auditTransports.push(new FileRotatingTransport({
                filePath: join(home.logsDir, "audit.log"),
                format: "json",
                maxSizeMb: 0,
                maxFiles: 0, // 永不删除
                gzip: logging.audit.rotate.gzip,
                mode: "audit",
            }));
        }
        if (logging.llmLog.enabled) {
            llmTransports.push(new JsonlEventsTransport({
                filePath: join(home.logsDir, "llm.jsonl"),
                keepForever: true,
                gzip: logging.file.rotate.gzip,
            }));
        }
        if (logging.perfLog.enabled) {
            perfTransports.push(new JsonlEventsTransport({
                filePath: join(home.logsDir, "perf.jsonl"),
                keepForever: true,
                gzip: logging.file.rotate.gzip,
            }));
        }
        if (logging.eventsLog.enabled) {
            eventsTransports.push(new JsonlEventsTransport({
                filePath: join(home.logsDir, "events.jsonl"),
                keepForever: true,
                gzip: logging.file.rotate.gzip,
            }));
        }
    }
    const sinks = [
        new AppLogSink(appTransports),
        new ErrorLogSink(errorTransports),
        new AuditLogSink(auditTransports),
        new LlmLogSink(llmTransports),
        new PerfLogSink(perfTransports),
        new EventsLogSink(eventsTransports),
    ];
    core = {
        level: parseLevel(logging.level),
        channels: logging.channels ?? {},
        sinks,
        memBuffer,
        redactor: new Redactor({
            extraKeys: logging.redact.extraKeys,
            extraPatterns: logging.redact.extraPatterns,
        }),
        perfSampleRate: logging.perfLog.sampleRate,
        llmRedactPrompts: logging.llmLog.redactPrompts,
        llmRedactCompletions: logging.llmLog.redactCompletions,
        pid: process.pid,
        host: hostname(),
        seq: 0,
        filesActive: filesEnabled,
    };
    hookProcessExit();
}
/** Switch to a silent test logger. */
export function initTestLogger() {
    void shutdownLogger();
    const memBuffer = new MemoryBufferTransport({ capacity: 256 });
    const sinks = [
        new AppLogSink([memBuffer]),
        new ErrorLogSink([memBuffer]),
        new AuditLogSink([memBuffer]),
        new LlmLogSink([memBuffer]),
        new PerfLogSink([memBuffer]),
        new EventsLogSink([memBuffer]),
    ];
    core = {
        level: "trace",
        channels: {},
        sinks,
        memBuffer,
        redactor: new Redactor({ extraKeys: [], extraPatterns: [] }),
        perfSampleRate: 1,
        llmRedactPrompts: false,
        llmRedactCompletions: false,
        pid: process.pid,
        host: hostname(),
        seq: 0,
        filesActive: false,
    };
}
export async function flushLogger() {
    for (const s of core.sinks)
        await s.flush?.();
}
export async function shutdownLogger() {
    for (const s of core.sinks) {
        try {
            await s.flush?.();
        }
        catch { /* ignore */ }
        try {
            await s.close?.();
        }
        catch { /* ignore */ }
    }
}
export function memoryBuffer() {
    return core.memBuffer;
}
// ─── The Logger class returned to callers ──────────────────────────────────
class LoggerImpl {
    channel;
    defaultCtx;
    constructor(channel, defaultCtx = {}) {
        this.channel = channel;
        this.defaultCtx = defaultCtx;
    }
    child(opts) {
        return new LoggerImpl(opts.channel, { ...this.defaultCtx, ...(opts.ctx ?? {}) });
    }
    trace(msg, data) { this.emit("trace", "app", msg, data); }
    debug(msg, data) { this.emit("debug", "app", msg, data); }
    info(msg, data) { this.emit("info", "app", msg, data); }
    warn(msg, data) { this.emit("warn", "app", msg, data); }
    error(msg, data) {
        const err = data?.err;
        const rest = stripErr(data);
        this.emit("error", "error", msg, rest, err);
    }
    fatal(msg, data) {
        const err = data?.err;
        const rest = stripErr(data);
        this.emit("fatal", "error", msg, rest, err);
    }
    audit(msg, data) {
        this.emit("info", "audit", msg, data);
    }
    llm(payload) {
        const data = {
            provider: payload.provider,
            model: payload.model,
            op: payload.op,
            ms: payload.ms,
            promptTokens: payload.promptTokens,
            completionTokens: payload.completionTokens,
            totalTokens: payload.totalTokens,
            costUsd: payload.costUsd,
            status: payload.status ?? "ok",
        };
        if (payload.prompt && !core.llmRedactPrompts)
            data["prompt"] = payload.prompt;
        if (payload.completion && !core.llmRedactCompletions)
            data["completion"] = payload.completion;
        this.emit("info", "llm", payload.op, data, payload.error);
    }
    timer(op, extra) {
        const channel = this.channel;
        const ctx = this.defaultCtx;
        return createSpan({
            channel,
            op,
            extra,
            sampleRate: core.perfSampleRate,
            emit: ({ ms, channel: c, op: o, extra: e }) => {
                const data = { op: o, ms: round2(ms), ...e };
                emitToCore({
                    ts: nowMs(),
                    level: "info",
                    kind: "perf",
                    channel: c,
                    msg: o,
                    data,
                    ctx: combineCtx(ctx),
                });
            },
        });
    }
    forward(record) {
        // Mark source so consumers can tell where it came from.
        emitToCore({ ...record, src: record.src ?? "fwd" }, /* skipLevelGate */ true);
    }
    async flush() { await flushLogger(); }
    async close() { await shutdownLogger(); }
    // ─── internals ───
    emit(level, kind, msg, data, err) {
        const effective = resolveLevelForChannel(this.channel, core.level, core.channels);
        if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[effective])
            return;
        emitToCore({
            ts: nowMs(),
            level,
            kind,
            channel: this.channel,
            msg,
            ctx: combineCtx(this.defaultCtx),
            data,
            err: err ? serializeError(err) : undefined,
        });
    }
}
function emitToCore(record, skipLevelGate = false) {
    if (!skipLevelGate) {
        const effective = resolveLevelForChannel(record.channel, core.level, core.channels);
        if (LOG_LEVEL_ORDER[record.level] < LOG_LEVEL_ORDER[effective])
            return;
    }
    const enriched = {
        pid: core.pid,
        host: core.host,
        src: "ts",
        seq: ++core.seq,
        ...record,
    };
    const safe = core.redactor.redact(enriched);
    for (const s of core.sinks) {
        if (s.accepts(safe)) {
            try {
                s.write(safe);
            }
            catch { /* never throw */ }
        }
    }
}
function combineCtx(staticCtx) {
    const ambient = getCtx();
    if (!ambient && Object.keys(staticCtx).length === 0)
        return undefined;
    return { ...staticCtx, ...(ambient ?? {}) };
}
function stripErr(d) {
    if (!d)
        return undefined;
    const { err: _err, ...rest } = d;
    return Object.keys(rest).length > 0 ? rest : undefined;
}
function serializeError(err) {
    if (!err)
        return { name: "Error", message: String(err) };
    if (err instanceof Error) {
        const out = {
            name: err.name,
            message: err.message,
            stack: err.stack,
        };
        const code = err.code;
        if (typeof code === "string")
            out.code = code;
        const details = err.details;
        if (details && typeof details === "object")
            out.details = details;
        const cause = err.cause;
        if (cause)
            out.cause = serializeError(cause);
        return out;
    }
    return { name: "Error", message: typeof err === "string" ? err : JSON.stringify(err) };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
// ─── Process-exit hooks (only register once) ──────────────────────────────
let exitHooked = false;
function hookProcessExit() {
    if (exitHooked)
        return;
    exitHooked = true;
    const onExit = () => { void shutdownLogger(); };
    process.once("beforeExit", onExit);
    process.once("SIGINT", () => { onExit(); process.exit(130); });
    process.once("SIGTERM", () => { onExit(); process.exit(143); });
}
// ─── Public root logger ────────────────────────────────────────────────────
export const rootLogger = new LoggerImpl("root");
//# sourceMappingURL=index.js.map