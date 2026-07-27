/**
 * Step 2 of the L3 pipeline — **call the LLM abstractor** on a cluster
 * of compatible L2 policies and return a ready-to-persist draft.
 *
 * Pure abstraction logic: no DB writes, no events. The caller decides
 * whether to insert a new WM or merge into an existing one.
 */
import { ERROR_CODES, MemosError } from "../../../agent-contract/errors.js";
import { detectDominantLanguage, languageSteeringLine, } from "../../llm/prompts/index.js";
import { L3_ABSTRACTION_PROMPT } from "../../llm/prompts/l3-abstraction.js";
import { reflectionAsText } from "../../capture/types.js";
import { sanitizeDerivedMarkdown, sanitizeDerivedText } from "../../safety/content.js";
import { ids } from "../../id.js";
// ─── Public API ─────────────────────────────────────────────────────────────
export async function abstractDraft(input, deps) {
    const { llm, log, config } = deps;
    if (!config.useLlm || !llm) {
        const reason = !config.useLlm
            ? "useLlm disabled in config"
            : "llm client is null (provider not attached?)";
        log.warn("l3.abstract.llm_unavailable", {
            clusterPolicies: input.cluster.policies.length,
            reason,
            fallback: "skipped",
        });
        return { ok: false, reason: "llm_disabled" };
    }
    const userPayload = packPrompt(input, config);
    // Pick the world-model's rendering language from the underlying
    // policies + trace evidence. A Chinese user generating "docker alpine
    // 依赖" policies should see the environment/inference/constraint bullets
    // written in Chinese; an English user should see them in English.
    const langSamples = [];
    for (const p of input.cluster.policies) {
        langSamples.push(p.title, p.trigger, p.procedure, p.boundary, p.verification);
    }
    for (const traces of input.evidenceByPolicy.values()) {
        for (const t of traces)
            langSamples.push(t.userText, t.agentText, reflectionAsText(t.reflection));
    }
    const evidenceLang = detectDominantLanguage(langSamples);
    try {
        const rsp = await llm.completeJson([
            { role: "system", content: L3_ABSTRACTION_PROMPT.system },
            { role: "system", content: languageSteeringLine(evidenceLang) },
            { role: "user", content: userPayload },
        ], {
            op: `${L3_ABSTRACTION_PROMPT.id}.v${L3_ABSTRACTION_PROMPT.version}`,
            phase: "l3",
            episodeId: input.episodeId,
            temperature: 0.15,
            malformedRetries: 1,
            schemaHint: `{"title":"...","domain_tags":["..."],"environment":[{"label":"...","description":"...","evidenceIds":["..."]}],"inference":[...],"constraints":[...],"body":"markdown","confidence":0..1,"supersedes_world_ids":[]}`,
            validate: (v) => {
                const o = v;
                if (typeof o.title !== "string" || !o.title.trim()) {
                    throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "l3.abstraction: 'title' must be a non-empty string", { got: o.title });
                }
                const triple = ["environment", "inference", "constraints"];
                for (const k of triple) {
                    if (!Array.isArray(o[k])) {
                        throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, `l3.abstraction: '${k}' must be an array`, { got: o[k] });
                    }
                }
            },
        });
        const draft = normaliseDraft(rsp.value);
        if (deps.validate)
            deps.validate(draft);
        return { ok: true, draft };
    }
    catch (err) {
        log.warn("abstract.llm_failed", {
            clusterKey: input.cluster.key,
            err: err instanceof Error ? err.message : String(err),
        });
        return {
            ok: false,
            reason: "llm_failed",
            detail: err instanceof Error ? err.message : String(err),
        };
    }
}
// ─── Convert a draft → WorldModelRow ────────────────────────────────────────
export function buildWorldModelRow(args) {
    const now = args.now ?? Date.now();
    const domainTags = dedupeStrings(args.draft.domainTags.length > 0 ? args.draft.domainTags : args.cluster.domainTags).slice(0, 6);
    // Cohesion-aware confidence shaping. The LLM proposes a `draft.confidence`
    // based on how well its three facets (ℰ / ℐ / 𝒞) cover the evidence; we
    // additionally dampen `loose` clusters proportionally to how spread out
    // their members are in embedding space. Two policies that ended up in the
    // same domain bucket but pull in opposite directions (cohesion ≈ 0.2)
    // shouldn't claim the same retrieval-time confidence as a tight cluster
    // (cohesion ≈ 0.9). The shrinkage is intentionally gentle (down to 0.6×
    // for cohesion=0) so we still surface loose-but-real clusters in
    // Tier-3, just below tighter ones.
    const baseConfidence = clamp01(args.draft.confidence ?? 0.5);
    const cohesionFactor = args.cluster.admission === "loose"
        ? 0.6 + 0.4 * clamp01(args.cluster.cohesion)
        : 1.0;
    const confidence = clamp01(baseConfidence * cohesionFactor);
    return {
        id: (args.id ?? ids.world()),
        title: args.draft.title.slice(0, 160),
        body: buildBody(args.draft),
        structure: {
            environment: args.draft.environment,
            inference: args.draft.inference,
            constraints: args.draft.constraints,
        },
        domainTags,
        confidence,
        policyIds: args.cluster.policies.map((p) => p.id),
        sourceEpisodeIds: Array.from(new Set(args.episodeIds)),
        inducedBy: args.inducedBy,
        vec: (args.cluster.centroidVec ?? null),
        createdAt: now,
        updatedAt: now,
        version: 1,
        status: "active",
    };
}
// ─── Prompt packing ─────────────────────────────────────────────────────────
function packPrompt(input, cfg) {
    const { cluster, evidenceByPolicy } = input;
    // ADMISSION:
    //   strict = every member is within `clusterMinSimilarity` of the centroid.
    //            The world model can confidently describe a single coherent
    //            sub-problem family.
    //   loose  = members share a domain key but their titles/triggers spread
    //            wider in embedding space. The world model should describe the
    //            shared *project / environment*, not a single sub-problem;
    //            facets (ℰ/ℐ/𝒞) should be broader and less prescriptive.
    const cohesionStr = cluster.cohesion.toFixed(2);
    const header = [
        `CLUSTER_KEY: ${cluster.key}`,
        `ADMISSION: ${cluster.admission} (cohesion=${cohesionStr})`,
        `DOMAIN_TAGS: ${cluster.domainTags.join(", ") || "-"}`,
        `POLICIES (${cluster.policies.length}):`,
    ].join("\n");
    const policyBlocks = cluster.policies.map((p) => packPolicy(p, evidenceByPolicy.get(p.id) ?? [], cfg));
    return `${header}\n\n${policyBlocks.join("\n\n")}`;
}
function packPolicy(policy, traces, cfg) {
    const body = truncate([
        `id: ${policy.id}`,
        `title: ${policy.title}`,
        `trigger: ${policy.trigger}`,
        `procedure: ${policy.procedure}`,
        `verification: ${policy.verification}`,
        `boundary: ${policy.boundary}`,
        `support: ${policy.support}  gain: ${policy.gain.toFixed(2)}  status: ${policy.status}`,
    ].join("\n"), cfg.policyCharCap);
    if (cfg.traceEvidencePerPolicy <= 0 || traces.length === 0)
        return body;
    const sample = traces.slice(0, cfg.traceEvidencePerPolicy);
    const traceBlocks = sample.map((t) => truncate([
        `  trace ${t.id} (V=${t.value.toFixed(2)}):`,
        `  tags: ${(t.tags ?? []).join(",") || "-"}`,
        `  user: ${truncate(t.userText, 160)}`,
        `  agent: ${truncate(t.agentText, 240)}`,
        `  reflection: ${truncate(reflectionAsText(t.reflection) ?? "-", 200)}`,
    ].join("\n"), cfg.traceCharCap));
    return `${body}\n\nEVIDENCE_TRACES:\n${traceBlocks.join("\n\n")}`;
}
// ─── Helpers ────────────────────────────────────────────────────────────────
function normaliseDraft(value) {
    const triple = pickTriple(value);
    return {
        title: sanitizeDerivedText(value.title),
        domainTags: normaliseTags(value.domain_tags),
        environment: triple.environment,
        inference: triple.inference,
        constraints: triple.constraints,
        body: typeof value.body === "string" ? sanitizeDerivedMarkdown(value.body) : "",
        confidence: clamp01(typeof value.confidence === "number" ? value.confidence : 0.5),
        supersedesWorldIds: Array.isArray(value.supersedes_world_ids)
            ? value.supersedes_world_ids
                .filter((s) => typeof s === "string")
                .map((s) => s)
            : [],
    };
}
function pickTriple(value) {
    return {
        environment: toEntries(value.environment),
        inference: toEntries(value.inference),
        constraints: toEntries(value.constraints),
    };
}
function toEntries(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((r) => {
        if (!r || typeof r !== "object")
            return null;
        const o = r;
        const label = typeof o.label === "string" ? sanitizeDerivedText(o.label) : "";
        const description = typeof o.description === "string" ? sanitizeDerivedMarkdown(o.description) : "";
        if (!label && !description)
            return null;
        const evidenceIds = Array.isArray(o.evidenceIds)
            ? o.evidenceIds.filter((s) => typeof s === "string")
            : undefined;
        return { label, description, evidenceIds };
    })
        .filter((e) => e !== null)
        .slice(0, 16);
}
function buildBody(draft) {
    if (draft.body && draft.body.length > 0)
        return draft.body;
    const lines = [`# ${draft.title}`, ""];
    if (draft.environment.length > 0) {
        lines.push("## Environment (ℰ)");
        for (const e of draft.environment)
            lines.push(`- **${e.label}** — ${e.description}`);
        lines.push("");
    }
    if (draft.inference.length > 0) {
        lines.push("## Inference rules (ℐ)");
        for (const e of draft.inference)
            lines.push(`- **${e.label}** — ${e.description}`);
        lines.push("");
    }
    if (draft.constraints.length > 0) {
        lines.push("## Constraints (C)");
        for (const e of draft.constraints)
            lines.push(`- **${e.label}** — ${e.description}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
function normaliseTags(raw) {
    if (!Array.isArray(raw))
        return [];
    return dedupeStrings(raw
        .filter((s) => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length < 24)).slice(0, 6);
}
function dedupeStrings(arr) {
    return Array.from(new Set(arr));
}
function clamp01(n) {
    if (!Number.isFinite(n))
        return 0;
    if (n < 0)
        return 0;
    if (n > 1)
        return 1;
    return n;
}
function truncate(s, n) {
    if (!s)
        return "";
    if (s.length <= n)
        return s;
    return s.slice(0, n - 1) + "…";
}
//# sourceMappingURL=abstract.js.map