import type { CoreEvent } from "../../agent-contract/events.js";
import type { Embedder } from "./types.js";
import type { Logger } from "../logger/types.js";
import type { Repos } from "../storage/repos/index.js";
export interface EmbeddingRetryWorker {
    start(): void;
    stop(): void;
    flush(): Promise<void>;
}
export interface EmbeddingRetryWorkerDeps {
    repos: Repos;
    embedder: Embedder | null;
    log: Logger;
    now?: () => number;
    intervalMs?: number;
    batchSize?: number;
    onSystemError?: (payload: Record<string, unknown>, correlationId?: string) => void;
}
export declare function createEmbeddingRetryWorker(deps: EmbeddingRetryWorkerDeps): EmbeddingRetryWorker;
export declare function systemErrorEvent(payload: Record<string, unknown>, seq: number, correlationId?: string): CoreEvent;
//# sourceMappingURL=retry-worker.d.ts.map