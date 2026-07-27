/**
 * V7 §2.4.6 — collect decision guidance for the current retrieval.
 *
 * Inputs:
 *   - Ranked Tier-2 trace candidates (we use their `episodeId` to find
 *     the policies that share evidence with the trace).
 *   - Ranked Tier-1 skill candidates. When a skill carries its own
 *     `procedureJson.decisionGuidance`, that skill-local guidance is
 *     authoritative; we only fall back to source policies for legacy
 *     skills without embedded guidance.
 *
 * Output: a deduped list of `{ preference, antiPattern, sourcePolicyIds/sourceSkillIds }`
 * entries, ordered by frequency-of-attachment then alphabetically.
 *
 * Why dedupe at this stage and not later: a policy may surface against
 * multiple retrieved traces (typical when several traces share an
 * episode), and its `@repair {…}` block is a single coherent unit; we
 * never want to inject the same "Avoid: don't run sed -i on macOS" three
 * times.
 *
 * This is intentionally a pure function — no LLM, no network, no IO
 * beyond what the repos do. Cheap to call on every retrieval.
 */
const EMPTY = Object.freeze({
    preference: [],
    antiPattern: [],
    policyIdsTouched: [],
    skillIdsTouched: [],
});
export function collectDecisionGuidance(input) {
    const { ranked, repos, perListCap = 3 } = input;
    if (ranked.length === 0)
        return EMPTY;
    // Gather the (episodeId, refKind) pairs we care about.
    const traceEpisodeIds = new Set();
    const policyIds = new Set();
    const skillGuidance = new Map();
    for (const r of ranked) {
        const c = r.candidate;
        if (c.tier === "tier2" && c.refKind === "trace") {
            traceEpisodeIds.add(c.episodeId);
        }
        else if (c.tier === "tier2" && c.refKind === "episode") {
            traceEpisodeIds.add(c.refId);
        }
        else if (c.tier === "tier2" && c.refKind === "experience") {
            policyIds.add(c.refId);
        }
        else if (c.tier === "tier1") {
            const skill = c;
            if (hasGuidance(skill.decisionGuidance)) {
                skillGuidance.set(skill.refId, skill.decisionGuidance);
            }
            else {
                for (const id of skill.sourcePolicyIds ?? []) {
                    policyIds.add(id);
                }
            }
        }
    }
    if (traceEpisodeIds.size === 0 && policyIds.size === 0 && skillGuidance.size === 0) {
        return EMPTY;
    }
    // Map each policy to {preference[], antiPattern[]} once.
    const policyGuidance = new Map();
    if (repos.policies && (traceEpisodeIds.size > 0 || policyIds.size > 0)) {
        const activePolicies = repos.policies.list({ status: "active" });
        for (const p of activePolicies) {
            let matched = 0;
            for (const ep of p.sourceEpisodeIds) {
                if (traceEpisodeIds.has(ep))
                    matched += 1;
            }
            if (policyIds.has(p.id))
                matched += 1;
            if (matched === 0)
                continue; // policy isn't connected to anything we retrieved
            const dg = p.decisionGuidance;
            if (dg.preference.length === 0 && dg.antiPattern.length === 0) {
                continue; // policy has no learned guidance yet
            }
            policyGuidance.set(p.id, { ...dg, matchedEpisodes: matched });
        }
    }
    if (policyGuidance.size === 0 && skillGuidance.size === 0)
        return EMPTY;
    // Build dedupe maps keyed by normalized text.
    const prefDedupe = new Map();
    const avoidDedupe = new Map();
    for (const [sid, g] of skillGuidance) {
        for (const text of g.preference) {
            const key = normaliseKey(text);
            if (!key)
                continue;
            const existing = prefDedupe.get(key);
            if (existing) {
                existing.sourceSkillIds.push(sid);
            }
            else {
                prefDedupe.set(key, {
                    kind: "preference",
                    text: text.trim(),
                    sourcePolicyIds: [],
                    sourceSkillIds: [sid],
                });
            }
        }
        for (const text of g.antiPattern) {
            const key = normaliseKey(text);
            if (!key)
                continue;
            const existing = avoidDedupe.get(key);
            if (existing) {
                existing.sourceSkillIds.push(sid);
            }
            else {
                avoidDedupe.set(key, {
                    kind: "antiPattern",
                    text: text.trim(),
                    sourcePolicyIds: [],
                    sourceSkillIds: [sid],
                });
            }
        }
    }
    for (const [pid, g] of policyGuidance) {
        for (const text of g.preference) {
            const key = normaliseKey(text);
            if (!key)
                continue;
            const existing = prefDedupe.get(key);
            if (existing) {
                existing.sourcePolicyIds.push(pid);
            }
            else {
                prefDedupe.set(key, {
                    kind: "preference",
                    text: text.trim(),
                    sourcePolicyIds: [pid],
                    sourceSkillIds: [],
                });
            }
        }
        for (const text of g.antiPattern) {
            const key = normaliseKey(text);
            if (!key)
                continue;
            const existing = avoidDedupe.get(key);
            if (existing) {
                existing.sourcePolicyIds.push(pid);
            }
            else {
                avoidDedupe.set(key, {
                    kind: "antiPattern",
                    text: text.trim(),
                    sourcePolicyIds: [pid],
                    sourceSkillIds: [],
                });
            }
        }
    }
    // Sort: more cross-policy support first, then alphabetic for stability.
    const sortByFreq = (a, b) => {
        const aSupport = a.sourcePolicyIds.length + a.sourceSkillIds.length;
        const bSupport = b.sourcePolicyIds.length + b.sourceSkillIds.length;
        if (aSupport !== bSupport) {
            return bSupport - aSupport;
        }
        return a.text.localeCompare(b.text);
    };
    return {
        preference: Array.from(prefDedupe.values()).sort(sortByFreq).slice(0, perListCap),
        antiPattern: Array.from(avoidDedupe.values()).sort(sortByFreq).slice(0, perListCap),
        policyIdsTouched: Array.from(policyGuidance.keys()),
        skillIdsTouched: Array.from(skillGuidance.keys()),
    };
}
// ─── Helpers ───────────────────────────────────────────────────────────────
/**
 * Canonical key used for dedupe — lowercase + collapse whitespace +
 * strip trailing punctuation. We don't fold near-duplicates (that's a
 * future improvement); the repair pipeline already normalises with
 * `dedupeKeep` per policy, so cross-policy duplicates are usually
 * literal repeats.
 */
function normaliseKey(s) {
    const k = s
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[\s.。!！?？,，;；:：]+$/g, "")
        .trim();
    return k;
}
function hasGuidance(dg) {
    return !!dg && (dg.preference.length > 0 || dg.antiPattern.length > 0);
}
//# sourceMappingURL=decision-guidance.js.map