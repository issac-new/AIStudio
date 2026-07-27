/**
 * `SessionManager` — the only surface adapters and the orchestrator see.
 *
 * Responsibilities:
 *   - Open / close sessions. A session is the long-lived logical
 *     connection between an agent and this plugin.
 *   - Start episodes (classifies intent, writes the row, emits events).
 *   - Add turns to the currently-open episode for a session.
 *   - Finalize / abandon episodes.
 *   - Prune idle sessions / force-close open episodes on shutdown.
 *   - Provide small readers for the viewer (listSessions, listEpisodes).
 *
 * The manager is per-process. There is no distributed coordination —
 * OpenClaw / Hermes run one plugin instance at a time.
 */
import { ERROR_CODES, MemosError } from "../../agent-contract/errors.js";
import { ids } from "../id.js";
import { withCtx } from "../logger/context.js";
import { rootLogger } from "../logger/index.js";
import { createEpisodeManager } from "./episode-manager.js";
import { createSessionEventBus } from "./events.js";
export function createSessionManager(deps) {
    const now = deps.now ?? Date.now;
    const log = rootLogger.child({ channel: "core.session" });
    const bus = deps.bus ?? createSessionEventBus();
    const epm = deps.episodeManager ?? createEpisodeManager({
        sessionsRepo: deps.sessionsRepo,
        episodesRepo: deps.episodesRepo,
        now,
        bus,
    });
    // Known-alive sessions (includes ones we've only seen via touch / DB row
    // reloads). Populated on demand in `getSession` too.
    const live = new Map();
    function snapshotFor(row) {
        return {
            id: row.id,
            agent: row.agent,
            startedAt: row.startedAt,
            lastSeenAt: row.lastSeenAt,
            meta: row.meta,
            openEpisodeCount: epm.listForSession(row.id).filter((e) => e.status === "open").length,
        };
    }
    function openSession(input) {
        const ts = now();
        const id = input.id ?? ids.session();
        deps.sessionsRepo.upsertIfMissing({
            id,
            agent: input.agent,
            ownerAgentKind: stringMeta(input.meta, "ownerAgentKind") ?? input.agent,
            ownerProfileId: stringMeta(input.meta, "ownerProfileId") ?? "default",
            ownerWorkspaceId: stringMeta(input.meta, "ownerWorkspaceId") ?? null,
            startedAt: ts,
            lastSeenAt: ts,
            meta: input.meta ?? {},
        });
        if (input.meta && Object.keys(input.meta).length > 0) {
            deps.sessionsRepo.touchLastSeen(id, ts, input.meta);
        }
        const row = deps.sessionsRepo.getById(id);
        if (!row) {
            throw new MemosError(ERROR_CODES.INTERNAL, "sessions.upsert inserted row but getById returned null", {
                sessionId: id,
            });
        }
        const snap = snapshotFor(row);
        live.set(id, snap);
        log.info("session.opened", {
            sessionId: id,
            agent: input.agent,
            startedAt: row.startedAt,
            new: row.startedAt === ts,
        });
        bus.emit({ kind: "session.started", session: snap });
        return { ...snap };
    }
    function closeSession(id, reason = "explicit") {
        for (const ep of epm.listForSession(id)) {
            if (ep.status !== "open")
                continue;
            // V7 §0.2 — a user-initiated session close (`/new`, `/quit`, the
            // host shutting down cleanly) is **normal lifecycle**, NOT
            // episode abandonment. Finalize the episode so the capture +
            // reward pipelines run as if the user had completed their task:
            //
            //   - substantial conversations get LLM-scored → "已完成" badge
            //   - trivial / single-turn episodes get re-stamped to
            //     `closeReason="abandoned"` by reward.ts itself with a clear
            //     human-readable `abandonReason` ("对话轮次不足，N 轮…")
            //
            // Crucially, this keeps the technical `session_closed:client`
            // string out of the user-facing TasksView "已跳过" badge — that
            // string was the source of the "为什么 /new 后立刻显示已跳过"
            // confusion. True crash-orphans get a separate recovery path
            // at plugin bootstrap (see `recoverOrphanedEpisodes` in
            // `core/pipeline/memory-core.ts`).
            if (deps.lightweightMemory && ep.meta.lightweightMemory === true) {
                epm.finalize(ep.id, {
                    patchMeta: {
                        lightweightMemory: true,
                        sessionCloseReason: reason,
                    },
                });
                continue;
            }
            if (reason.startsWith("shutdown:")) {
                epm.patchMeta(ep.id, {
                    topicState: "paused",
                    pauseReason: `session_closed:${reason}`,
                    sessionCloseReason: reason,
                    pausedAt: now(),
                });
                continue;
            }
            if (isCompletedExchange(ep)) {
                epm.finalize(ep.id, {
                    patchMeta: { sessionCloseReason: reason },
                });
                continue;
            }
            epm.patchMeta(ep.id, {
                topicState: "paused",
                pauseReason: `session_closed:${reason}`,
                sessionCloseReason: reason,
                pausedAt: now(),
            });
        }
        live.delete(id);
        log.info("session.closed", { sessionId: id, reason });
        bus.emit({ kind: "session.closed", sessionId: id, reason });
    }
    function getSession(id) {
        const cached = live.get(id);
        if (cached)
            return { ...cached };
        const row = deps.sessionsRepo.getById(id);
        if (!row)
            return null;
        const snap = snapshotFor(row);
        live.set(id, snap);
        return { ...snap };
    }
    function listSessions(limit = 50) {
        return deps.sessionsRepo.listRecent(limit).map((r) => snapshotFor(r));
    }
    function pruneIdle(nowTs = now()) {
        const cutoff = nowTs - (deps.idleCutoffMs ?? 24 * 60 * 60 * 1000);
        const stale = [];
        for (const [id, snap] of live.entries()) {
            if (snap.lastSeenAt < cutoff) {
                const openEps = epm.listForSession(id).filter((e) => e.status === "open");
                if (openEps.length > 0)
                    continue; // don't evict while we're mid-episode
                stale.push(id);
            }
        }
        for (const id of stale) {
            live.delete(id);
            bus.emit({ kind: "session.idle_pruned", sessionId: id, idleMs: nowTs - (getSession(id)?.lastSeenAt ?? nowTs) });
        }
        if (stale.length > 0)
            log.info("session.pruned", { count: stale.length });
        return stale;
    }
    async function startEpisode(input) {
        const session = getSession(input.sessionId);
        if (!session) {
            throw new MemosError(ERROR_CODES.SESSION_NOT_FOUND, `session ${input.sessionId} not found`, {
                sessionId: input.sessionId,
            });
        }
        // Pre-allocate the episode id BEFORE the intent classifier runs so
        // its LLM call (`session.intent.classify`) can stamp the resulting
        // `system_model_status` audit row with this episode. Without this,
        // the call fires before any id exists and the row shows up as a
        // stand-alone entry in the Logs viewer chain view, divorced from
        // the rest of the episode's pipeline activity.
        //
        // Safety:
        //   - id minting is a pure string generation (no DB write yet);
        //     the row is inserted later by `epm.start` which honours the
        //     pre-supplied id (`input.id ?? ids.episode()` in
        //     `episode-manager.ts:start`), so there is no double-mint.
        //   - `IntentClassifier.classify` catches all internal errors and
        //     returns a fallback decision instead of throwing, so the
        //     pre-allocated id will reach the insert path on every
        //     happy-path completion.
        //   - Wall-clock timing of the `episodes` insert is unchanged —
        //     the classify await dominates either way.
        const episodeId = (input.id ?? ids.episode());
        const intent = await deps.intentClassifier.classify(input.userMessage, {
            episodeId,
        });
        // Wrap the write+emit in a log context so downstream listeners inherit
        // the correlation ids without having to know them.
        return withCtx({ sessionId: input.sessionId, episodeId }, () => {
            const startInput = {
                sessionId: input.sessionId,
                id: episodeId,
                initialTurn: { role: "user", content: input.userMessage, ts: input.ts, meta: input.meta },
                meta: input.meta,
            };
            const snap = epm.start(startInput, intent);
            // Update cached open count.
            const cached = live.get(input.sessionId);
            if (cached)
                cached.openEpisodeCount++;
            log.info("episode.begun", {
                episodeId,
                sessionId: input.sessionId,
                intent: intent.kind,
                intentConfidence: intent.confidence,
                retrieval: intent.retrieval,
            });
            return snap;
        });
    }
    function decrementOpenCount(sessionId) {
        const cached = live.get(sessionId);
        if (cached && cached.openEpisodeCount > 0)
            cached.openEpisodeCount--;
    }
    function finalizeEpisode(id, input) {
        const snap = epm.finalize(id, input);
        decrementOpenCount(snap.sessionId);
        return snap;
    }
    function abandonEpisode(id, reason) {
        const snap = epm.abandon(id, reason);
        decrementOpenCount(snap.sessionId);
        return snap;
    }
    function discardEmptyEpisode(id, reason) {
        const before = epm.get(id);
        const snap = epm.discardEmpty(id, reason);
        if (before)
            decrementOpenCount(before.sessionId);
        return snap;
    }
    function reopenEpisode(id, reason) {
        const before = epm.get(id);
        const snap = epm.reopen(id, reason);
        // If we reopened a closed one, bump the open count back up.
        if (before && before.status === "closed" && snap.status === "open") {
            const cached = live.get(snap.sessionId);
            if (cached)
                cached.openEpisodeCount++;
        }
        return snap;
    }
    function hydrateEpisode(snapshot) {
        const snap = epm.hydrate(snapshot);
        const session = getSession(snap.sessionId);
        if (session && snap.status === "open") {
            const cached = live.get(snap.sessionId);
            if (cached) {
                cached.openEpisodeCount = epm
                    .listForSession(snap.sessionId)
                    .filter((e) => e.status === "open").length;
            }
        }
        return snap;
    }
    function shutdown(reason) {
        log.info("shutdown.begin", { reason });
        // Process-wide shutdown is normal lifecycle (host stopping cleanly,
        // not a topic boundary). Pause open episodes so a restarted host can
        // classify the next user turn against the same topic instead of
        // prematurely triggering reflect/reward.
        //
        // First catch episodes whose session was already pruned from
        // `live` (race: idle prune → process exit). closeSession's per-
        // session loop wouldn't find them otherwise.
        for (const ep of epm.listOpen()) {
            if (!live.has(ep.sessionId)) {
                if (isCompletedExchange(ep)) {
                    if (deps.lightweightMemory && ep.meta.lightweightMemory === true) {
                        finalizeEpisode(ep.id, {
                            patchMeta: {
                                lightweightMemory: true,
                                sessionCloseReason: `shutdown:${reason}`,
                            },
                        });
                        continue;
                    }
                    finalizeEpisode(ep.id, {
                        patchMeta: { sessionCloseReason: `shutdown:${reason}` },
                    });
                    continue;
                }
                if (isDiscardableEmptyEpisode(ep)) {
                    epm.discardEmpty(ep.id, `shutdown:${reason}`);
                    continue;
                }
                epm.patchMeta(ep.id, {
                    topicState: "paused",
                    pauseReason: `shutdown:${reason}`,
                    sessionCloseReason: `shutdown:${reason}`,
                    pausedAt: now(),
                });
            }
        }
        // Then close every still-live session — closeSession's loop
        // finalizes any remaining open episodes.
        for (const id of Array.from(live.keys())) {
            closeSession(id, `shutdown:${reason}`);
        }
        log.info("shutdown.done", { reason });
    }
    function isCompletedExchange(ep) {
        if (ep.traceIds.length > 0)
            return true;
        return ep.turns.some((t) => t.role === "assistant" && t.content.trim().length > 0);
    }
    return {
        bus,
        openSession,
        closeSession,
        getSession,
        listSessions,
        pruneIdle,
        startEpisode,
        addTurn: epm.addTurn,
        finalizeEpisode,
        abandonEpisode,
        discardEmptyEpisode,
        reopenEpisode,
        hydrateEpisode,
        attachTraceIds: epm.attachTraceIds,
        patchEpisodeMeta: epm.patchMeta,
        getEpisode: epm.get,
        listEpisodes: epm.listForSession,
        listOpenEpisodes: epm.listOpen,
        shutdown,
    };
}
function stringMeta(meta, key) {
    const value = meta?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function isDiscardableEmptyEpisode(ep) {
    if (ep.traceIds.length > 0)
        return false;
    return !ep.turns.some((t) => t.role === "assistant" && t.content.trim().length > 0);
}
//# sourceMappingURL=manager.js.map