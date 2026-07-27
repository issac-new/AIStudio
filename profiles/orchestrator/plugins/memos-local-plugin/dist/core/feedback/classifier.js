/**
 * V7 §2.4.3 + §2.4.6 — classify a raw user feedback string into one of
 * eight shapes. The output drives whether the repair orchestrator needs
 * to run and what fields it can extract.
 *
 * We keep this deterministic + rule-based first. The feedback pipeline
 * must run in degraded mode (no LLM, no network) and tests must stay
 * trivially stable.
 *
 * Priority order (first hit wins):
 *
 *   1. `preference`  — explicit "use X instead of Y" / 用 X 代替 Y / ...
 *   2. `correction`  — "it should be X, not Y" / "应该是 X 不是 Y"
 *   3. `constraint`  — "also make sure N" / "还要 …" / "must keep …"
 *   4. `negative`    — blanket rejection ("wrong", "不对", "no")
 *   5. `positive`    — clear approval
 *   6. `confusion`   — user didn't understand ("what do you mean?" / "???")
 *   7. `instruction` — imperative next step
 *   8. `unknown`     — no signal
 */
export function classifyFeedback(raw, opts = {}) {
    const text = (raw ?? "").trim();
    if (!text) {
        return {
            shape: "unknown",
            confidence: 0,
            text: "",
        };
    }
    const normalized = text.toLowerCase();
    const preference = detectPreference(text, normalized);
    if (preference)
        return { text, ...preference };
    const correction = detectCorrection(text, normalized);
    if (correction)
        return { text, ...correction };
    const constraint = detectConstraint(text, normalized);
    if (constraint)
        return { text, ...constraint };
    if (matchesAny(normalized, NEGATIVE_PATTERNS)) {
        return {
            shape: "negative",
            confidence: 0.75,
            text,
        };
    }
    if (matchesAny(normalized, POSITIVE_PATTERNS)) {
        return {
            shape: "positive",
            confidence: 0.75,
            text,
        };
    }
    if (matchesAny(normalized, CONFUSION_PATTERNS)) {
        return {
            shape: "confusion",
            confidence: 0.7,
            text,
        };
    }
    if (looksLikeInstruction(text, normalized)) {
        return {
            shape: "instruction",
            confidence: 0.55,
            text,
        };
    }
    return { shape: "unknown", confidence: 0.3, text };
}
// ─── Preference extraction ────────────────────────────────────────────────
function detectPreference(raw, normalized) {
    for (const pattern of PREFERENCE_PATTERNS) {
        const match = raw.match(pattern.regex);
        if (!match)
            continue;
        const prefer = pattern.prefer ? clean(match[pattern.prefer]) : undefined;
        const avoid = pattern.avoid ? clean(match[pattern.avoid]) : undefined;
        if (!prefer && !avoid)
            continue;
        return {
            shape: "preference",
            confidence: 0.8,
            prefer,
            avoid,
        };
    }
    // No capture groups, but still a soft preference signal
    if (/(prefer|instead|should use|下次用|改用|而不是)/.test(normalized)) {
        return { shape: "preference", confidence: 0.55 };
    }
    return null;
}
function clean(s) {
    if (!s)
        return undefined;
    return s.trim().replace(/^["'`]|["'`]$/g, "").trim() || undefined;
}
// ─── Patterns ─────────────────────────────────────────────────────────────
const PREFERENCE_PATTERNS = [
    // "use X instead of Y"
    {
        regex: /use\s+(?<prefer>.+?)\s+instead\s+of\s+(?<avoid>.+?)([.。!?\n]|$)/i,
        prefer: 1,
        avoid: 2,
    },
    // "prefer X over Y"
    {
        regex: /prefer\s+(?<prefer>.+?)\s+over\s+(?<avoid>.+?)([.。!?\n]|$)/i,
        prefer: 1,
        avoid: 2,
    },
    // "X instead of Y" (no leading verb)
    {
        regex: /([^,.!?\n]+)\s+instead\s+of\s+([^,.!?\n]+)/i,
        prefer: 1,
        avoid: 2,
    },
    // Chinese: "用 X 代替 Y" / "用 X 而不是 Y"
    {
        regex: /用\s*(.+?)\s*(代替|而不是)\s*(.+?)([。!?\n]|$)/,
        prefer: 1,
        avoid: 3,
    },
    // Chinese: "别/不要 Y，用 X"
    {
        regex: /(别|不要|不能)\s*(.+?)[，,]\s*(要)?\s*(用|改用)\s*(.+?)([。!?\n]|$)/,
        prefer: 5,
        avoid: 2,
    },
    // "next time: do X"
    {
        regex: /next time\s*[:：]?\s*(.+)/i,
        prefer: 1,
    },
];
const NEGATIVE_PATTERNS = [
    /\bwrong\b/,
    /\bnot\s+(right|correct|what|that)\b/,
    /\bdon't\s+do\b/,
    /\bdo\s+not\s+do\b/,
    /\bstop\s+that\b/,
    /\bno[,.!? ]/,
    /^(no|nope|nah)$/,
    /不对/,
    /错(了)?/,
    /不要这样/,
    /别这样/,
];
const POSITIVE_PATTERNS = [
    /\b(great|perfect|awesome|nice work|well done|works|fixed)\b/,
    /\bthanks?\b/,
    /^(yes|ok|okay|sure)[.!?]?$/,
    /好的|太棒了|不错|完美|搞定/,
];
/**
 * V7 §2.4.3 — user expresses confusion or asks why the agent did
 * something. Drives a UI "explain-further" path, not decision repair.
 */
const CONFUSION_PATTERNS = [
    /\bwhat\s+(do\s+you\s+mean|are\s+you\s+(doing|saying))\b/,
    /\bwhy\s+(did|are)\s+you\b/,
    /\bi\s+don'?t\s+(understand|get|follow)\b/,
    /\bnot\s+sure\s+what\b/,
    /\bconfus(ed|ing)\b/,
    /什么意思/,
    /没(看|搞)懂/,
    /为什么(这样|要)/,
    /\?{2,}\s*$/,
];
/**
 * V7 §2.4.3 — user corrects a specific part of the answer ("it should be X,
 * not Y"). Captured separately from `preference` because corrections
 * target the PREVIOUS answer whereas preferences target FUTURE behavior.
 */
const CORRECTION_PATTERNS = [
    // "it should be X" / "should be X" / "actually X"
    { regex: /\b(?:it\s+should\s+be|should\s+be|it\s*'?s?\s+actually)\s+(?<should>.{3,120})/i, should: 1 },
    // "not X, (it's) Y" — take Y as correction
    { regex: /\bnot\s+.{2,80}[,，]\s*(?:it'?s\s+|its\s+|actually\s+)?(?<should>.{3,120})/i, should: 1 },
    // "the answer is X" right after negation
    { regex: /\b(?:answer|result|value|output)\s+(?:is|=)\s+(?<should>.{2,120})/i, should: 1 },
    // Chinese: "应该是 X"
    { regex: /应该是\s*(?<should>.{2,80})/, should: 1 },
    // Chinese: "不是 X 是 Y" → take Y as correction
    { regex: /不是\s*.{1,40}\s*[，,]?\s*是\s*(?<should>.{2,80})/, should: 1 },
];
/**
 * V7 §2.4.3 — user keeps the direction but tightens scope ("also add N",
 * "keep X but also Y", "but it must …"). Constraints flow into L2/L3
 * scope refinement, so we need to capture them separately from
 * preferences (which are about *which tool* to pick).
 */
const CONSTRAINT_PATTERNS = [
    { regex: /\b(?:also|additionally|on top of that)\s+(?<c>.{3,120})/i, constraint: 1 },
    { regex: /\b(?:must|has to|needs to)\s+(?<c>.{3,120})/i, constraint: 1 },
    { regex: /\bmake sure (?:to |that )?(?<c>.{3,120})/i, constraint: 1 },
    { regex: /\bbut\s+(?:make sure|don'?t forget|keep)\s+(?<c>.{3,120})/i, constraint: 1 },
    // Chinese
    { regex: /还要\s*(?<c>.{2,80})/, constraint: 1 },
    { regex: /别忘了\s*(?<c>.{2,80})/, constraint: 1 },
    { regex: /加(一个|个)?\s*(?<c>.{2,80}(条件|限制|要求|约束))/, constraint: 1 },
    { regex: /必须\s*(?<c>.{2,80})/, constraint: 1 },
];
function detectCorrection(raw, normalized) {
    for (const pat of CORRECTION_PATTERNS) {
        const m = raw.match(pat.regex);
        if (!m)
            continue;
        const correction = clean(m[pat.should]);
        if (!correction)
            continue;
        return {
            shape: "correction",
            confidence: 0.75,
            correction,
        };
    }
    // Softer signal: "not quite" / "close but" — correction intent without
    // an explicit "should be X".
    if (/\b(?:not quite|close but|almost|kind of)\b/.test(normalized)) {
        return { shape: "correction", confidence: 0.5 };
    }
    return null;
}
function detectConstraint(raw, _normalized) {
    for (const pat of CONSTRAINT_PATTERNS) {
        const m = raw.match(pat.regex);
        if (!m)
            continue;
        const c = clean(m[pat.constraint]);
        if (!c)
            continue;
        return {
            shape: "constraint",
            confidence: 0.7,
            constraint: c,
        };
    }
    return null;
}
// ─── Helpers ──────────────────────────────────────────────────────────────
function matchesAny(s, patterns) {
    for (const p of patterns)
        if (p.test(s))
            return true;
    return false;
}
function looksLikeInstruction(raw, normalized) {
    // Heuristic: starts with an imperative verb OR contains a "then/also"
    // connective with a verb.
    const firstWord = (raw.match(/[A-Za-z\u4e00-\u9fff]+/)?.[0] ?? "").toLowerCase();
    if (IMPERATIVE_VERBS.has(firstWord))
        return true;
    return /\b(then|also|next)\s+(run|delete|create|install|try|use|call)\b/.test(normalized);
}
const IMPERATIVE_VERBS = new Set([
    "run",
    "delete",
    "create",
    "install",
    "try",
    "use",
    "call",
    "build",
    "deploy",
    "test",
    "add",
    "remove",
    "restart",
    "停止",
    "启动",
    "运行",
    "删除",
    "创建",
    "安装",
    "试试",
    "改成",
]);
//# sourceMappingURL=classifier.js.map