/**
 * `HostLlmBridge` is the adapter-injected escape hatch for "use the host
 * agent's LLM." OpenClaw has one via its sharing API; Hermes typically does
 * not.
 *
 * The bridge is intentionally simple: one `complete(prompt, opts)` entry
 * point. Streaming is deliberately not supported — hosts usually don't
 * expose streaming over their sharing APIs, and our streaming call sites
 * only ever target the primary provider.
 */
import type { LlmMessage, LlmUsage } from "./types.js";
export interface HostLlmCompleteInput {
    messages: LlmMessage[];
    /** Optional override, in case the host supports multiple models. */
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface HostLlmCompletion {
    text: string;
    model: string;
    usage?: LlmUsage;
    durationMs: number;
}
export interface HostLlmBridge {
    /** Stable provider id the host reports (e.g. "openclaw.host.v1"). */
    readonly id: string;
    complete(input: HostLlmCompleteInput): Promise<HostLlmCompletion>;
}
export declare function registerHostLlmBridge(bridge: HostLlmBridge | null): void;
export declare function getHostLlmBridge(): HostLlmBridge | null;
/** Clear on shutdown / test teardown. */
export declare function __resetHostLlmBridgeForTests(): void;
//# sourceMappingURL=host-bridge.d.ts.map