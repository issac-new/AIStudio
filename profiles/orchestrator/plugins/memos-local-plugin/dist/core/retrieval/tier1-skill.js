/**
 * Tier 1 — Skill retrieval (V7 §2.6).
 *
 * Skills are the "crystallised" layer. Three channels run in parallel:
 *
 *   - vec       — cosine over `skills.vec`     (semantic)
 *   - fts       — FTS5 trigram MATCH on `skills_fts(name, invocation_guide)`
 *   - pattern   — LIKE %term% fallback for short / CJK queries
 *
 * Each channel returns a ranked list; we merge by `skillId` and let the
 * `ranker` fuse them via RRF. A candidate that surfaces in multiple
 * channels gets a strong lift and is much harder to be a false positive.
 *
 * Filtering rules (cheap, mechanical — happens *before* ranking):
 *   - Only `active` + `candidate` statuses (V7 §2.6 hides `archived`).
 *   - Skill `η ≥ minSkillEta` (config).
 *   - Vector hits also need `cosine ≥ minTraceSim` (we reuse the trace
 *     floor as a conservative lower bound).
 *
 * The "should this snippet be injected?" decision lives in `ranker.ts`
 * (relative threshold + smart MMR seed) and `llm-filter.ts` (precision
 * pass), so this file stays mechanical.
 */
import { rootLogger } from "../logger/index.js";
const log = rootLogger.child({ channel: "core.retrieval.tier1" });
const DEFAULT_KEYWORD_TOPK = 20;
export async function runTier1(deps, input) {
    const { repos, config } = deps;
    const startedAt = Date.now();
    try {
        const queryVec = await resolveVec(deps, input);
        const ftsMatch = "ftsMatch" in input ? input.ftsMatch ?? null : null;
        const patternTerms = "patternTerms" in input ? input.patternTerms ?? [] : [];
        const haveVec = !!queryVec && queryVec.length > 0;
        const haveFts = !!ftsMatch && !!repos.skills.searchByText;
        const havePattern = patternTerms.length > 0 && !!repos.skills.searchByPattern;
        if (!haveVec && !haveFts && !havePattern) {
            log.debug("empty_query", { reason: "no channels armed" });
            return [];
        }
        const vecPoolSize = Math.max(config.tier1TopK, Math.ceil(config.tier1TopK * config.candidatePoolFactor));
        const keywordPoolSize = Math.max(config.tier1TopK, config.keywordTopK ?? DEFAULT_KEYWORD_TOPK);
        const statusIn = ["active", "candidate"];
        const merged = new Map();
        if (haveVec) {
            const vecHits = repos.skills.searchByVector(queryVec, vecPoolSize, { statusIn });
            vecHits.forEach((h, idx) => {
                if (h.score < config.minTraceSim)
                    return;
                upsertCandidate(merged, h.id, {
                    cosine: h.score,
                    channel: "vec",
                    rank: idx,
                    score: h.score,
                    meta: h.meta,
                    vec: queryVec,
                });
            });
        }
        if (haveFts) {
            const ftsHits = repos.skills.searchByText(ftsMatch, keywordPoolSize, { statusIn });
            ftsHits.forEach((h, idx) => {
                upsertCandidate(merged, h.id, {
                    cosine: 0,
                    channel: "fts",
                    rank: idx,
                    score: h.score,
                    meta: h.meta,
                    vec: queryVec ?? null,
                });
            });
        }
        if (havePattern) {
            const patternHits = repos.skills.searchByPattern(patternTerms, keywordPoolSize, {
                statusIn,
            });
            patternHits.forEach((h, idx) => {
                upsertCandidate(merged, h.id, {
                    cosine: 0,
                    channel: "pattern",
                    rank: idx,
                    score: h.score,
                    meta: h.meta,
                    vec: queryVec ?? null,
                });
            });
        }
        if (merged.size === 0) {
            log.info("done", {
                candidates: 0,
                kept: 0,
                latencyMs: Date.now() - startedAt,
            });
            return [];
        }
        // Hydrate each candidate into a `SkillCandidate`.
        const kept = [];
        for (const [id, state] of merged) {
            const meta = state.meta;
            // Hard floor on η — applies regardless of which channel surfaced
            // the row. Stale skills shouldn't sneak back via the keyword path.
            if (!meta || meta.eta < config.minSkillEta)
                continue;
            const sk = repos.skills.getById(id);
            if (!sk)
                continue;
            kept.push({
                tier: "tier1",
                refKind: "skill",
                refId: sk.id,
                cosine: state.cosine,
                ts: Date.now(),
                vec: state.vec,
                skillName: sk.name,
                eta: sk.eta,
                status: sk.status,
                invocationGuide: sk.invocationGuide,
                decisionGuidance: normaliseDecisionGuidance(sk),
                sourcePolicyIds: sk.sourcePolicyIds ?? [],
                updatedAt: sk.updatedAt,
                channels: state.channels,
                debug: { matchedChannels: state.channels.map((c) => c.channel) },
            });
        }
        // Rough order — final ranking happens in `ranker.ts` via RRF + MMR.
        kept.sort((a, b) => bestChannelScore(b) - bestChannelScore(a));
        const trimmed = kept.slice(0, vecPoolSize);
        log.info("done", {
            candidates: merged.size,
            kept: trimmed.length,
            channels: {
                vec: haveVec,
                fts: haveFts,
                pattern: havePattern,
            },
            latencyMs: Date.now() - startedAt,
        });
        return trimmed;
    }
    catch (err) {
        log.error("failed", {
            err: { message: err instanceof Error ? err.message : String(err) },
            latencyMs: Date.now() - startedAt,
        });
        return [];
    }
}
function normaliseDecisionGuidance(row) {
    if (row.decisionGuidance) {
        return {
            preference: row.decisionGuidance.preference.map(String).filter(Boolean),
            antiPattern: row.decisionGuidance.antiPattern.map(String).filter(Boolean),
        };
    }
    const proc = (row.procedureJson ?? {});
    const dg = proc.decisionGuidance;
    const snakeDg = proc.decision_guidance;
    return {
        preference: dg && Array.isArray(dg.preference)
            ? dg.preference.map((s) => String(s)).filter(Boolean)
            : snakeDg && Array.isArray(snakeDg.preference)
                ? snakeDg.preference.map((s) => String(s)).filter(Boolean)
                : [],
        antiPattern: dg && Array.isArray(dg.antiPattern)
            ? dg.antiPattern.map((s) => String(s)).filter(Boolean)
            : snakeDg && Array.isArray(snakeDg.anti_pattern)
                ? snakeDg.anti_pattern.map((s) => String(s)).filter(Boolean)
                : [],
    };
}
// ─── Helpers ────────────────────────────────────────────────────────────────
function upsertCandidate(into, id, patch) {
    const entry = into.get(id);
    if (!entry) {
        if (!patch.meta)
            return;
        into.set(id, {
            cosine: patch.cosine,
            channels: [{ channel: patch.channel, rank: patch.rank, score: patch.score }],
            meta: patch.meta,
            vec: patch.vec,
        });
        return;
    }
    entry.channels.push({ channel: patch.channel, rank: patch.rank, score: patch.score });
    if (patch.cosine > entry.cosine)
        entry.cosine = patch.cosine;
    if (!entry.vec && patch.vec)
        entry.vec = patch.vec;
}
function bestChannelScore(c) {
    const channels = c.channels ?? [];
    if (channels.length === 0)
        return c.cosine;
    return channels.reduce((m, ch) => Math.max(m, ch.score), c.cosine);
}
async function resolveVec(deps, input) {
    if (input.kind === "embedded")
        return input.queryVec;
    if (!deps.embedder)
        return null;
    try {
        return await deps.embedder.embed(input.text, "query");
    }
    catch (err) {
        log.warn("embed_failed", { err: String(err) });
        return null;
    }
}
//# sourceMappingURL=tier1-skill.js.map