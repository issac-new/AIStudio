import type { MemoryCore } from "../agent-contract/memory-core.js";
export interface StdioServerOptions {
    core: MemoryCore;
    /** Default: `process.stdin`. Testable via a custom readable. */
    stdin?: NodeJS.ReadableStream;
    /** Default: `process.stdout`. */
    stdout?: NodeJS.WritableStream;
    /** Print diagnostics to stderr (default on). */
    logToStderr?: boolean;
    /** Enable strict param validation. */
    strict?: boolean;
    /** Close the stdio transport after this many milliseconds without input. */
    idleTimeoutMs?: number;
}
export interface StdioServerHandle {
    readonly connected: boolean;
    /** Close the subscription + stop processing lines. Idempotent. */
    close: () => Promise<void>;
    /** Resolve once stdin ends. */
    done: Promise<void>;
    /**
     * Send a JSON-RPC request **from the bridge to the client** and wait
     * for the matching response. Used by the host LLM bridge to ask the
     * adapter (e.g. the Hermes Python provider) to run a fallback LLM
     * call using the agent's own model.
     *
     * IDs use the `"srv-N"` prefix so they cannot collide with the
     * client's numeric request IDs.
     */
    serverRequest<R = unknown>(method: string, params?: unknown, options?: {
        timeoutMs?: number;
    }): Promise<R>;
}
export declare function startStdioServer(options: StdioServerOptions): StdioServerHandle;
export interface StdioClient {
    request<R = unknown>(method: string, params?: unknown): Promise<R>;
    close(): void;
    notifications: AsyncIterable<{
        method: string;
        params: unknown;
    }>;
}
export declare function createStdioClient(reader: NodeJS.ReadableStream, writer: NodeJS.WritableStream): StdioClient;
/** Convenience: await both the core's shutdown AND stdin ending. */
export declare function waitForShutdown(core: MemoryCore, handle: StdioServerHandle): Promise<void>;
//# sourceMappingURL=stdio.d.ts.map