import { feedbackText } from "./feedback-builder.js";
/** How far (ms) feedback.ts may sit from an anchored trace.ts and still count as "at turn end". */
const AT_TURN_END_MS = 5_000;
export function buildCorrectiveSignalsForSink(episodeId, traces, feedbacks) {
    const ordered = [...traces].sort((a, b) => a.ts - b.ts);
    const turns = buildTurnBuckets(ordered);
    const turnById = new Map(turns.map((t) => [t.turnId, t]));
    const traceById = new Map(ordered.map((t) => [t.id, t]));
    const episodeStart = ordered[0]?.ts ?? 0;
    const episodeEnd = ordered[ordered.length - 1]?.ts ?? episodeStart;
    const substantive = feedbacks
        .filter(isSubstantiveFeedback)
        .sort((a, b) => a.ts - b.ts);
    const corrective_signals = substantive.map((fb) => anchorFeedback(fb, turns, turnById, traceById, episodeStart, episodeEnd));
    return {
        episode_timeline: {
            episode_id: episodeId,
            trace_span: { first_ts: episodeStart, last_ts: episodeEnd },
            turns: turns.map((t) => ({
                turn_index: t.turnIndex,
                turn_id: t.turnId,
                trace_ids: t.traceIds,
                started_at: t.startedAt,
                ended_at: t.endedAt,
                user_preview: trimPreview(t.userPreview, 120),
            })),
        },
        corrective_signals,
    };
}
function buildTurnBuckets(ordered) {
    const byTurn = new Map();
    for (const t of ordered) {
        const key = t.turnId;
        const list = byTurn.get(key) ?? [];
        list.push(t);
        byTurn.set(key, list);
    }
    const turnIds = [...byTurn.keys()].sort((a, b) => {
        const minA = Math.min(...(byTurn.get(a) ?? []).map((t) => t.ts));
        const minB = Math.min(...(byTurn.get(b) ?? []).map((t) => t.ts));
        return minA - minB;
    });
    return turnIds.map((turnId, idx) => {
        const group = (byTurn.get(turnId) ?? []).sort((a, b) => a.ts - b.ts);
        const userPreview = group.find((t) => t.userText.trim().length > 0)?.userText.trim() ?? "";
        return {
            turnIndex: idx + 1,
            turnId,
            traceIds: group.map((t) => t.id),
            startedAt: group[0]?.ts ?? 0,
            endedAt: group[group.length - 1]?.ts ?? 0,
            userPreview,
        };
    });
}
function anchorFeedback(fb, turns, turnById, traceById, episodeStart, episodeEnd) {
    const text = trimPreview(feedbackText(fb), 800);
    const kind = detectKind(fb);
    const deltaEpisode = fb.ts - episodeStart;
    let bucket = null;
    let nearestTrace = null;
    if (fb.traceId) {
        nearestTrace = traceById.get(fb.traceId) ?? null;
        if (nearestTrace)
            bucket = turnById.get(nearestTrace.turnId) ?? null;
    }
    if (!bucket && turns.length > 0) {
        bucket = inferTurnByTimestamp(fb.ts, turns);
        if (bucket && !nearestTrace) {
            nearestTrace =
                traceById.get(bucket.traceIds[bucket.traceIds.length - 1]) ?? null;
        }
    }
    const turn_index = bucket?.turnIndex ?? null;
    const { timing, delta_ms_after_turn_end } = resolveTiming(fb.ts, bucket, nearestTrace, turns, episodeEnd);
    return {
        feedback_id: fb.id,
        submitted_at: fb.ts,
        channel: fb.channel,
        polarity: fb.polarity,
        kind,
        text,
        trace_id: fb.traceId,
        turn_index,
        timing,
        timing_label: formatTimingLabel({
            timing,
            turn_index,
            delta_ms_after_turn_end,
            delta_ms_after_episode_start: deltaEpisode,
            submitted_at: fb.ts,
            trace_id: fb.traceId,
        }),
        delta_ms_after_turn_end,
        delta_ms_after_episode_start: deltaEpisode,
        nearest_trace_id: nearestTrace?.id ?? null,
        nearest_trace_ts: nearestTrace?.ts ?? null,
    };
}
function inferTurnByTimestamp(ts, turns) {
    for (const t of turns) {
        if (ts >= t.startedAt && ts <= t.endedAt)
            return t;
    }
    let lastBefore = null;
    for (const t of turns) {
        if (t.endedAt <= ts)
            lastBefore = t;
        else
            break;
    }
    return lastBefore ?? turns[0] ?? null;
}
function resolveTiming(feedbackTs, bucket, nearestTrace, turns, episodeEnd) {
    if (!bucket || turns.length === 0) {
        return { timing: "unanchored", delta_ms_after_turn_end: null };
    }
    const deltaAfterTurnEnd = feedbackTs - bucket.endedAt;
    if (feedbackTs < turns[0].startedAt) {
        return { timing: "before_first_turn", delta_ms_after_turn_end: null };
    }
    const next = turns.find((t) => t.turnIndex === bucket.turnIndex + 1);
    if (next &&
        feedbackTs > bucket.endedAt &&
        feedbackTs < next.startedAt) {
        return { timing: "between_turns", delta_ms_after_turn_end: deltaAfterTurnEnd };
    }
    if (nearestTrace &&
        Math.abs(feedbackTs - nearestTrace.ts) <= AT_TURN_END_MS &&
        feedbackTs <= bucket.endedAt) {
        return { timing: "at_turn_end", delta_ms_after_turn_end: feedbackTs - nearestTrace.ts };
    }
    if (feedbackTs >= bucket.startedAt && feedbackTs <= bucket.endedAt) {
        return {
            timing: "at_turn_end",
            delta_ms_after_turn_end: feedbackTs - bucket.endedAt,
        };
    }
    if (feedbackTs > bucket.endedAt) {
        const last = turns[turns.length - 1];
        if (bucket.turnIndex === last.turnIndex &&
            feedbackTs > episodeEnd + AT_TURN_END_MS) {
            return { timing: "after_last_turn", delta_ms_after_turn_end: deltaAfterTurnEnd };
        }
        return { timing: "after_turn", delta_ms_after_turn_end: deltaAfterTurnEnd };
    }
    return { timing: "before_first_turn", delta_ms_after_turn_end: null };
}
function formatTimingLabel(args) {
    const turn = args.turn_index ?? "?";
    const dTurn = args.delta_ms_after_turn_end != null
        ? `${args.delta_ms_after_turn_end}ms after turn ${turn} ended`
        : "no turn-end delta";
    const dEp = `${args.delta_ms_after_episode_start}ms after episode start`;
    const trace = args.trace_id ? ` trace=${args.trace_id}` : "";
    return `${args.timing} @ turn ${turn} (submitted_at=${args.submitted_at}; ${dTurn}; ${dEp})${trace}`;
}
function detectKind(fb) {
    const raw = fb.raw;
    if (!raw || typeof raw !== "object")
        return "human_feedback";
    const rec = raw;
    if (rec.verifier && typeof rec.verifier === "object")
        return "verifier_directives";
    const keys = ["must", "must_not", "mustNot", "MUST", "MUST_NOT", "passed", "total"];
    if (keys.some((k) => k in rec))
        return "verifier_directives";
    const lower = feedbackText(fb).toLowerCase();
    if (lower.includes("verifier"))
        return "verifier_directives";
    return "human_feedback";
}
export function isSubstantiveFeedback(feedback) {
    if (feedbackText(feedback).length > 0)
        return true;
    const raw = feedback.raw;
    if (!raw || typeof raw !== "object")
        return false;
    const record = raw;
    const direct = ["text", "message", "reason", "content", "directive"]
        .map((k) => record[k])
        .find((v) => typeof v === "string" && v.trim().length > 0);
    if (typeof direct === "string" && direct.trim().length > 0)
        return true;
    const must = ["must", "must_not", "mustNot", "MUST", "MUST_NOT"]
        .map((k) => record[k])
        .find((v) => typeof v === "string" && v.trim().length > 0);
    return typeof must === "string" && must.trim().length > 0;
}
function trimPreview(text, max) {
    const t = text.trim();
    if (t.length <= max)
        return t;
    return `${t.slice(0, max - 1)}…`;
}
//# sourceMappingURL=corrective-signals.js.map