import type { StorageDb } from "../types.js";
export type EmbeddingRetryTargetKind = "trace" | "policy" | "world_model" | "skill";
export type EmbeddingRetryVectorField = "vec_summary" | "vec_action" | "vec";
export type EmbeddingRetryStatus = "pending" | "in_progress" | "failed" | "succeeded";
export interface EmbeddingRetryJob {
    id: string;
    targetKind: EmbeddingRetryTargetKind;
    targetId: string;
    vectorField: EmbeddingRetryVectorField;
    sourceText: string;
    embedRole: "document" | "query";
    status: EmbeddingRetryStatus;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: number;
    claimedBy: string | null;
    leaseUntil: number | null;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
}
export interface EmbeddingRetryClaim {
    workerId: string;
    leaseUntil: number;
}
export declare function makeEmbeddingRetryQueueRepo(db: StorageDb): {
    enqueue(input: {
        id: string;
        targetKind: EmbeddingRetryTargetKind;
        targetId: string;
        vectorField: EmbeddingRetryVectorField;
        sourceText: string;
        embedRole?: "document" | "query";
        maxAttempts?: number;
        now: number;
    }): void;
    claimDue(input: {
        now: number;
        workerId: string;
        leaseUntil: number;
        limit?: number;
    }): EmbeddingRetryJob[];
    listDue(now: number, limit?: number): EmbeddingRetryJob[];
    transact<T>(fn: () => T): T;
    touchClaimHeld(id: string, input: EmbeddingRetryClaim & {
        now: number;
    }): boolean;
    isClaimHeld(id: string, input: EmbeddingRetryClaim): boolean;
    markRetry(id: string, input: {
        attempts: number;
        nextAttemptAt: number;
        error: string;
        now: number;
    }): void;
    markRetryClaimed(id: string, input: EmbeddingRetryClaim & {
        attempts: number;
        nextAttemptAt: number;
        error: string;
        now: number;
    }): boolean;
    markFailed(id: string, input: {
        attempts: number;
        error: string;
        now: number;
    }): void;
    markFailedClaimed(id: string, input: EmbeddingRetryClaim & {
        attempts: number;
        error: string;
        now: number;
    }): boolean;
    markSucceeded(id: string, now: number): void;
    markSucceededClaimed(id: string, input: EmbeddingRetryClaim & {
        now: number;
    }): boolean;
    countByStatus(status: EmbeddingRetryStatus): number;
};
//# sourceMappingURL=embedding_retry_queue.d.ts.map