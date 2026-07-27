/**
 * Telemetry module — anonymous usage analytics via Aliyun ARMS RUM.
 *
 * Privacy-first design:
 * - Enabled by default; opt-out via config.yaml `telemetry.enabled: false`
 * - Uses a random anonymous ID persisted locally (no PII)
 * - Never sends memory content, queries, or any user data
 * - Only sends aggregate counts, tool names, latencies, and version info
 *
 * Differentiator: uses event group `memos_local_hermes_v2` to cleanly
 * separate from v1 (`memos_local_hermes`) in ARMS dashboards.
 */
import type { Logger } from "../logger/types.js";
export interface TelemetryConfig {
    enabled?: boolean;
}
export declare class Telemetry {
    private distinctId;
    private enabled;
    private pluginVersion;
    private log;
    private buffer;
    private flushTimer;
    private sessionId;
    private firstSeenDate;
    private dailyPingFile;
    private armsEndpoint;
    private armsPid;
    private armsEnv;
    constructor(config: TelemetryConfig, stateDir: string, pluginVersion: string, log: Logger, pluginDir?: string);
    private loadOrCreateAnonymousId;
    private loadOrCreateSessionId;
    private touchSession;
    private loadOrCreateFirstSeen;
    private capture;
    private buildPayload;
    private flush;
    trackPluginStarted(agentName: string): void;
    trackTurnStart(agentName: string, latencyMs: number, hitCount: number): void;
    trackTurnEnd(agentName: string, traceCount: number): void;
    trackMemorySearch(agentName: string, latencyMs: number, hitCount: number): void;
    trackFeedback(agentName: string, feedbackType: string): void;
    trackViewerOpened(): void;
    trackError(source: string, errorType: string): void;
    /**
     * Emit `daily_active` at most once per UTC day per home directory.
     *
     * The de-dup state lives on disk (`<stateDir>/memos-local/.last-daily-ping`)
     * so it survives process restarts. Without this, every `bridge.cts` /
     * OpenClaw adapter spawn would emit a fresh ping (Hermes spawns one
     * subprocess per `hermes chat`), turning `daily_active` into a
     * "process started" counter and breaking DAU dashboards.
     *
     * Read failures are treated as "first time today" — that means at
     * worst we over-report by one event after a corrupt file, never
     * under-report. Write failures are swallowed; the next launch will
     * just send another ping (still better than the silent in-memory
     * failure mode the previous implementation had).
     */
    private maybeSendDailyPing;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=sender.d.ts.map