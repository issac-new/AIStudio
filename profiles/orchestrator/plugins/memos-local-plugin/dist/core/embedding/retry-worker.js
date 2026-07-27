import { ids } from "../id.js";
const DEFAULT_INTERVAL_MS = 60_000;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const DEFAULT_LEASE_MS = 5 * 60_000;
export function createEmbeddingRetryWorker(deps) {
    const now = deps.now ?? Date.now;
    const batchSize = deps.batchSize ?? 25;
    const workerId = `embedding-retry-${ids.span()}`;
    let timer = null;
    let running = null;
    async function runOnce() {
        if (!deps.embedder)
            return;
        const at = now();
        const jobs = deps.repos.embeddingRetryQueue.claimDue({
            now: at,
            workerId,
            leaseUntil: at + DEFAULT_LEASE_MS,
            limit: batchSize,
        });
        for (const job of jobs) {
            await processJob(job);
        }
    }
    async function processJob(job) {
        if (!deps.embedder)
            return;
        const claim = claimFor(job);
        if (!claim) {
            deps.log.debug("embedding_retry.stale_missing_claim", { jobId: job.id });
            return;
        }
        const attemptNo = job.attempts + 1;
        try {
            const vec = await deps.embedder.embedOne({
                text: job.sourceText || "(empty)",
                role: job.embedRole,
            });
            const completed = deps.repos.embeddingRetryQueue.transact(() => {
                const at = now();
                if (!deps.repos.embeddingRetryQueue.touchClaimHeld(job.id, { ...claim, now: at })) {
                    return { stale: true, updated: false, completed: false };
                }
                const updated = applyVector(job, vec);
                if (!updated) {
                    return { stale: false, updated: false, completed: false };
                }
                return {
                    stale: false,
                    updated: true,
                    completed: deps.repos.embeddingRetryQueue.markSucceededClaimed(job.id, {
                        ...claim,
                        now: at,
                    }),
                };
            });
            if (completed.stale) {
                deps.log.debug("embedding_retry.stale_success_ignored", { jobId: job.id });
                return;
            }
            if (!completed.updated) {
                throw new Error(`embedding retry target not found: ${job.targetKind}:${job.targetId}`);
            }
            if (!completed.completed) {
                deps.log.debug("embedding_retry.stale_success_ignored", { jobId: job.id });
                return;
            }
            deps.log.info("embedding_retry.succeeded", {
                jobId: job.id,
                targetKind: job.targetKind,
                targetId: job.targetId,
                vectorField: job.vectorField,
                attempts: attemptNo,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const at = now();
            const terminal = attemptNo >= job.maxAttempts;
            const recorded = terminal
                ? deps.repos.embeddingRetryQueue.markFailedClaimed(job.id, {
                    ...claim,
                    attempts: attemptNo,
                    error: message,
                    now: at,
                })
                : deps.repos.embeddingRetryQueue.markRetryClaimed(job.id, {
                    ...claim,
                    attempts: attemptNo,
                    nextAttemptAt: at + backoffMs(attemptNo),
                    error: message,
                    now: at,
                });
            if (!recorded) {
                deps.log.debug("embedding_retry.stale_failure_ignored", { jobId: job.id, terminal });
                return;
            }
            emitFailure(job, attemptNo, message, terminal, at);
        }
    }
    function claimFor(job) {
        if (job.claimedBy !== workerId || job.leaseUntil === null)
            return null;
        return { workerId, leaseUntil: job.leaseUntil };
    }
    function applyVector(job, vec) {
        switch (job.targetKind) {
            case "trace":
                return deps.repos.traces.updateVector(job.targetId, job.vectorField === "vec_action" ? "vecAction" : "vecSummary", vec);
            case "policy":
                return deps.repos.policies.updateVector(job.targetId, vec);
            case "world_model":
                return deps.repos.worldModel.updateVector(job.targetId, vec);
            case "skill":
                return deps.repos.skills.updateVector(job.targetId, vec);
        }
    }
    function emitFailure(job, attempts, message, terminal, at) {
        const payload = {
            kind: "embedding.retry_failed",
            jobId: job.id,
            targetKind: job.targetKind,
            targetId: job.targetId,
            vectorField: job.vectorField,
            attempts,
            maxAttempts: job.maxAttempts,
            terminal,
            message,
        };
        deps.log.warn("embedding_retry.failed", payload);
        try {
            deps.repos.apiLogs.insert({
                toolName: "system_error",
                input: { role: "embedding_retry" },
                output: payload,
                durationMs: 0,
                success: false,
                calledAt: at,
            });
        }
        catch {
            /* logging the retry failure is best-effort */
        }
        deps.onSystemError?.(payload, job.targetId);
    }
    function tick() {
        if (running)
            return;
        running = runOnce().finally(() => {
            running = null;
        });
    }
    return {
        start() {
            if (timer || !deps.embedder)
                return;
            tick();
            timer = setInterval(tick, deps.intervalMs ?? DEFAULT_INTERVAL_MS);
        },
        stop() {
            if (timer)
                clearInterval(timer);
            timer = null;
        },
        async flush() {
            tick();
            if (running)
                await running;
        },
    };
}
function backoffMs(attemptNo) {
    return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attemptNo - 1));
}
export function systemErrorEvent(payload, seq, correlationId) {
    return {
        type: "system.error",
        ts: Date.now(),
        seq,
        correlationId,
        payload,
    };
}
//# sourceMappingURL=retry-worker.js.map