/**
 * V7 §2.4.6 — Decision Repair orchestrator.
 *
 * Entry points:
 *
 *   - `runRepair(input, deps)` — imperative API. Called by the subscriber
 *     whenever a failure burst is detected or a user message is classified
 *     as `negative` / `preference`.
 *
 *   - `attachRepairToPolicies(draft, deps)` — append the draft's
 *     preference / anti-pattern onto the `decisionGuidance` field of each
 *     referenced policy. Only runs when `config.attachToPolicy === true`.
 *
 * The orchestrator never mutates state on its own unless it decides to
 * persist: every write is a single atomic insert into `decision_repairs`
 * plus, optionally, per-policy `update`s. Failures are always scoped:
 * logged, emitted as `repair.skipped`, and the orchestrator returns a
 * skip result.
 */
import { ids } from "../id.js";
import { now as nowMs } from "../time.js";
import { classifyFeedback } from "./classifier.js";
import { gatherRepairEvidence } from "./evidence.js";
import { synthesizeDraft } from "./synthesize.js";
// ─── Main orchestrator ─────────────────────────────────────────────────────
export async function runRepair(input, deps) {
    const startedAt = nowMs();
    const log = deps.log;
    const { bus, repos, config } = deps;
    log.info("repair.run.start", {
        trigger: input.trigger,
        contextHash: input.contextHash,
        toolId: input.toolId,
    });
    // Cooldown guard — same context, quickly reissued triggers are squelched.
    if (isOnCooldown(repos, input.contextHash, config, startedAt)) {
        log.info("repair.cooldown", { contextHash: input.contextHash });
        bus.emit({
            kind: "repair.skipped",
            at: startedAt,
            contextHash: input.contextHash,
            trigger: input.trigger,
            reason: "cooldown",
        });
        return skip(input, startedAt, "cooldown");
    }
    // Classify the user text if the caller provided one.
    const classified = input.userText
        ? classifyFeedback(input.userText)
        : undefined;
    if (classified) {
        bus.emit({
            kind: "feedback.classified",
            at: startedAt,
            shape: classified.shape,
            confidence: classified.confidence,
        });
    }
    if (!sessionKnown(input)) {
        bus.emit({
            kind: "repair.skipped",
            at: startedAt,
            contextHash: input.contextHash,
            trigger: input.trigger,
            reason: "no-session",
        });
        return skip(input, startedAt, "no-session");
    }
    // Gather evidence from recent traces in the same session.
    const evidence = gatherRepairEvidence({
        sessionId: input.sessionId,
        keyword: input.toolId ?? classified?.prefer ?? classified?.avoid,
        limit: config.evidenceLimit,
    }, { repos, config, log: log.child({ channel: "core.feedback.evidence" }) });
    const valueDiff = computeValueDiff(evidence.highValue, evidence.lowValue);
    if (valueDiff < config.valueDelta && !classified) {
        // Without an explicit user signal, small deltas aren't worth persisting.
        log.info("repair.valueDiff.below_threshold", {
            contextHash: input.contextHash,
            valueDiff,
            threshold: config.valueDelta,
        });
        bus.emit({
            kind: "repair.skipped",
            at: startedAt,
            contextHash: input.contextHash,
            trigger: input.trigger,
            reason: "value-delta-low",
        });
        return skip(input, startedAt, "value-delta-low");
    }
    // Look up any policies that both high- and low-value evidence point to
    // so we can attach the draft to them.
    const candidatePolicies = collectCandidatePolicies([...evidence.highValue, ...evidence.lowValue], repos);
    bus.emit({
        kind: "repair.triggered",
        at: startedAt,
        contextHash: input.contextHash,
        trigger: input.trigger,
        failureCount: input.failures?.length,
    });
    const synth = await synthesizeDraft({
        trigger: input.trigger,
        contextHash: input.contextHash,
        highValue: evidence.highValue,
        lowValue: evidence.lowValue,
        classifiedFeedback: classified,
        toolId: input.toolId,
        candidatePolicies,
    }, {
        llm: deps.llm,
        log: log.child({ channel: "core.feedback.synthesize" }),
        config,
    });
    if (!synth.ok) {
        log.info("repair.skipped", {
            contextHash: input.contextHash,
            reason: synth.reason,
            highValue: evidence.highValue.length,
            lowValue: evidence.lowValue.length,
        });
        bus.emit({
            kind: "repair.skipped",
            at: startedAt,
            contextHash: input.contextHash,
            trigger: input.trigger,
            reason: synth.reason,
        });
        return skip(input, startedAt, synth.reason);
    }
    const row = persistRepair(repos, synth.draft, startedAt);
    log.info("repair.persisted", {
        id: row.id,
        contextHash: row.contextHash,
        confidence: synth.draft.confidence,
        severity: synth.draft.severity,
    });
    bus.emit({
        kind: "repair.persisted",
        at: nowMs(),
        contextHash: row.contextHash,
        repairId: row.id,
        confidence: synth.draft.confidence,
        severity: synth.draft.severity,
    });
    if (config.attachToPolicy && synth.draft.attachToPolicyIds.length > 0) {
        const attached = attachRepairToPolicies(synth.draft, deps);
        if (attached.length > 0) {
            bus.emit({
                kind: "repair.attached",
                at: nowMs(),
                repairId: row.id,
                policyIds: attached,
            });
        }
    }
    return {
        trigger: input.trigger,
        contextHash: input.contextHash,
        repairId: row.id,
        draft: synth.draft,
        skipped: false,
        startedAt,
        completedAt: nowMs(),
    };
}
// ─── Helpers ──────────────────────────────────────────────────────────────
function sessionKnown(input) {
    if (!input.sessionId)
        return false;
    return Boolean(input.sessionId);
}
function computeValueDiff(high, low) {
    if (high.length === 0 || low.length === 0) {
        // Any single-side signal is already noteworthy — return a neutral
        // value that still allows the user-triggered branch to fire.
        return Infinity;
    }
    const meanHigh = mean(high.map((t) => t.value));
    const meanLow = mean(low.map((t) => t.value));
    return Math.abs(meanHigh - meanLow);
}
function mean(xs) {
    if (xs.length === 0)
        return 0;
    let sum = 0;
    for (const x of xs)
        sum += x;
    return sum / xs.length;
}
function collectCandidatePolicies(traces, repos) {
    // Policies whose sourceEpisodeIds intersect the evidence trace episodes
    // are the policies we want to tag. Fetch the small window of active
    // policies and filter.
    const episodeIds = new Set();
    for (const t of traces)
        episodeIds.add(t.episodeId);
    if (episodeIds.size === 0)
        return [];
    const policies = repos.policies.list({ status: "active", limit: 200 });
    return policies.filter((p) => p.sourceEpisodeIds.some((eid) => episodeIds.has(eid)));
}
function isOnCooldown(repos, contextHash, cfg, now) {
    if (cfg.cooldownMs <= 0)
        return false;
    const recent = repos.decisionRepairs.recentForContext(contextHash);
    if (recent.length === 0)
        return false;
    const last = recent[0];
    return now - last.ts < cfg.cooldownMs;
}
function persistRepair(repos, draft, ts) {
    const owner = ownerFromRepairEvidence(repos, draft);
    const row = {
        id: ids.decisionRepair(),
        ...owner,
        ts,
        contextHash: draft.contextHash,
        preference: draft.preference,
        antiPattern: draft.antiPattern,
        highValueTraceIds: [...draft.highValueTraceIds],
        lowValueTraceIds: [...draft.lowValueTraceIds],
        validated: false,
    };
    repos.decisionRepairs.insert(row);
    return row;
}
function ownerFromRepairEvidence(repos, draft) {
    const traceId = draft.highValueTraceIds[0] ?? draft.lowValueTraceIds[0];
    const trace = traceId ? repos.traces.getById(traceId) : null;
    return {
        ownerAgentKind: trace?.ownerAgentKind ?? "unknown",
        ownerProfileId: trace?.ownerProfileId ?? "default",
        ownerWorkspaceId: trace?.ownerWorkspaceId ?? null,
    };
}
function skip(input, startedAt, reason) {
    return {
        trigger: input.trigger,
        contextHash: input.contextHash,
        repairId: null,
        draft: null,
        skipped: true,
        skippedReason: reason,
        startedAt,
        completedAt: nowMs(),
    };
}
/**
 * Append the repair draft's preference / anti-pattern onto the candidate
 * policies' decision_guidance metadata. Returns the list of policy IDs
 * that were actually updated.
 */
export function attachRepairToPolicies(draft, deps) {
    const updated = [];
    for (const policyId of draft.attachToPolicyIds) {
        const policy = deps.repos.policies.getById(policyId);
        if (!policy)
            continue;
        const next = mergePolicyGuidance(policy, draft);
        if (!next)
            continue;
        deps.repos.policies.upsert(next);
        updated.push(policyId);
        deps.log.debug("repair.attached.policy", { policyId });
    }
    return updated;
}
/**
 * Update a policy's structured `decisionGuidance` column with the new
 * preference / anti-pattern lines from a repair draft. Returns `null`
 * when the merge would be a no-op (every line already present), which
 * lets the caller skip the write entirely.
 *
 * Stored in `policies.decision_guidance_json` (migration 001) — no more
 * regex-parsing the boundary text.
 */
function mergePolicyGuidance(policy, draft) {
    const current = policy.decisionGuidance;
    const nextPref = dedupeKeep(current.preference.concat(draft.preference));
    const nextAvoid = dedupeKeep(current.antiPattern.concat(draft.antiPattern));
    if (arraysEqual(nextPref, current.preference) &&
        arraysEqual(nextAvoid, current.antiPattern)) {
        return null;
    }
    return {
        ...policy,
        decisionGuidance: { preference: nextPref, antiPattern: nextAvoid },
        updatedAt: nowMs(),
    };
}
function dedupeKeep(xs) {
    const out = [];
    const seen = new Set();
    for (const x of xs) {
        const key = x.trim();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i += 1)
        if (a[i] !== b[i])
            return false;
    return true;
}
//# sourceMappingURL=feedback.js.map