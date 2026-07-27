/**
 * Candidate-pool management for L2 incremental induction.
 *
 * A candidate row = "this trace is a likely example of a sub-problem but we
 * don't yet have a policy for it". Rows are bucketed by `PatternSignature`.
 * When a bucket accumulates traces from ≥ N distinct episodes we run the
 * induction prompt (see `induce.ts`).
 *
 * Responsibilities:
 *   - generate candidate ids (`cand_<signature_hash>_<traceId>`)
 *   - add / dedupe rows, extending `evidenceTraceIds`
 *   - list buckets ready for induction
 *   - prune expired rows
 *   - promote (write `policy_id`) when induction succeeds
 */
import { signatureOf } from "./signature.js";
export function signatureHash(sig) {
    // DJB2 — stable, tiny, collision-tolerant given our bucket size.
    let h = 5381;
    for (let i = 0; i < sig.length; i++) {
        h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
export function candidateIdFor(sig, traceId) {
    return `cand_${signatureHash(sig)}_${traceId.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 24)}`;
}
export function makeCandidatePool(deps) {
    const { db, repos } = deps;
    function addCandidate(input) {
        const now = input.now ?? Date.now();
        const signature = signatureOf(input.trace);
        const id = candidateIdFor(signature, input.trace.id);
        const existing = repos.candidatePool.getById(id);
        const expiresAt = now + input.ttlMs;
        if (existing) {
            // Refresh TTL + similarity (in case reward changed V).
            repos.candidatePool.upsert({
                id,
                ownerAgentKind: input.trace.ownerAgentKind,
                ownerProfileId: input.trace.ownerProfileId,
                ownerWorkspaceId: input.trace.ownerWorkspaceId,
                policyId: existing.policyId,
                evidenceTraceIds: unique([...existing.evidenceTraceIds, input.trace.id]),
                signature,
                similarity: Math.max(existing.similarity, input.similarity ?? 0),
                expiresAt,
            });
            return { candidateId: id, signature, created: false };
        }
        repos.candidatePool.insert({
            id,
            ownerAgentKind: input.trace.ownerAgentKind,
            ownerProfileId: input.trace.ownerProfileId,
            ownerWorkspaceId: input.trace.ownerWorkspaceId,
            policyId: null,
            evidenceTraceIds: [input.trace.id],
            signature,
            similarity: input.similarity ?? 0,
            expiresAt,
        });
        return { candidateId: id, signature, created: true };
    }
    function bucketsReadyForInduction(opts) {
        const now = opts.now ?? Date.now();
        const rows = db
            .prepare(`SELECT id, policy_id, evidence_trace_ids_json, signature, similarity, expires_at
         FROM l2_candidate_pool
         WHERE policy_id IS NULL AND expires_at >= @now`)
            .all({ now });
        const bySig = new Map();
        for (const r of rows) {
            const sig = r.signature;
            let b = bySig.get(sig);
            if (!b) {
                b = { signature: sig, candidateIds: [], evidenceTraceIds: [], episodeIds: [] };
                bySig.set(sig, b);
            }
            b.candidateIds.push(r.id);
            const traceIds = safeArray(r.evidence_trace_ids_json);
            for (const tid of traceIds)
                if (!b.evidenceTraceIds.includes(tid))
                    b.evidenceTraceIds.push(tid);
        }
        // Enrich each bucket with distinct episodeIds so the induction threshold
        // ("≥ N distinct episodes") is correct.
        for (const b of bySig.values()) {
            const eps = new Set();
            for (const tid of b.evidenceTraceIds) {
                const tr = repos.traces.getById(tid);
                if (tr?.episodeId)
                    eps.add(tr.episodeId);
            }
            b.episodeIds = Array.from(eps);
        }
        const ready = [];
        for (const b of bySig.values()) {
            if (b.episodeIds.length >= opts.minDistinctEpisodes)
                ready.push(b);
        }
        // Stable ordering: more evidence first, then signature string.
        ready.sort((a, b) => {
            if (b.evidenceTraceIds.length !== a.evidenceTraceIds.length) {
                return b.evidenceTraceIds.length - a.evidenceTraceIds.length;
            }
            return a.signature.localeCompare(b.signature);
        });
        return ready;
    }
    function promote(candidateIds, policyId) {
        for (const id of candidateIds) {
            repos.candidatePool.promote(id, policyId);
        }
    }
    function prune(now = Date.now()) {
        return repos.candidatePool.prune(now);
    }
    function deleteBucket(signature) {
        const rows = db
            .prepare(`SELECT id FROM l2_candidate_pool WHERE signature=@sig`)
            .all({ sig: signature });
        for (const r of rows)
            repos.candidatePool.delete(r.id);
        return rows.length;
    }
    return { addCandidate, bucketsReadyForInduction, promote, prune, deleteBucket };
}
function unique(xs) {
    const seen = new Set();
    const out = [];
    for (const x of xs) {
        if (!seen.has(x)) {
            seen.add(x);
            out.push(x);
        }
    }
    return out;
}
function safeArray(jsonText) {
    try {
        const v = JSON.parse(jsonText);
        if (Array.isArray(v))
            return v;
    }
    catch {
        // fall through
    }
    return [];
}
//# sourceMappingURL=candidate-pool.js.map