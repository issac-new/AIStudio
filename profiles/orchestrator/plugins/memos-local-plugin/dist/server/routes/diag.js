import { parseJson, writeError } from "./registry.js";
export function registerDiagRoutes(routes, deps) {
    routes.set("GET /api/v1/diag/counts", async () => {
        const core = deps.core;
        const [traces, episodes, policies, worldModels, skills, logs] = await Promise.all([
            core.listTraces({ limit: 1, offset: 0 }),
            core.listEpisodeRows({ limit: 1, offset: 0, includeAllNamespaces: true }),
            core.listPolicies({ limit: 1, offset: 0, includeAllNamespaces: true }),
            core.listWorldModels({ limit: 1, offset: 0 }),
            core.listSkills({ limit: 1, includeAllNamespaces: true }),
            core.listApiLogs({ limit: 1, offset: 0 }),
        ]);
        // We use `listXxx` just to get *a* row — the actual per-layer
        // counts come from the `metrics()` call + per-layer API totals.
        const m = await core.metrics({ days: 365 });
        return {
            traces: m.total,
            traces_today: m.writesToday,
            episodes: episodes.length > 0 ? await countEpisodes(core) : 0,
            policies: policies.length > 0 ? await countPolicies(core) : 0,
            worldModels: worldModels.length > 0 ? await countWorldModels(core) : 0,
            skills: skills.length > 0 ? await countSkills(core) : 0,
            apiLogs: logs.total,
            sessionsHave: m.sessions,
            embeddings: m.embeddings,
        };
    });
    routes.set("GET /api/v1/diag/namespace", async () => {
        const health = await deps.core.health();
        const [traces, episodes, policies, worldModels, skills] = await Promise.all([
            deps.core.listTraces({ limit: 200, offset: 0, includeAllNamespaces: true }),
            deps.core.listEpisodeRows({ limit: 200, offset: 0, includeAllNamespaces: true }),
            deps.core.listPolicies({ limit: 200, offset: 0, includeAllNamespaces: true }),
            deps.core.listWorldModels({ limit: 200, offset: 0 }),
            deps.core.listSkills({ limit: 200, includeAllNamespaces: true }),
        ]);
        const namespaces = new Map();
        for (const row of [...traces, ...episodes, ...policies, ...worldModels, ...skills]) {
            const agentKind = row.ownerAgentKind ?? "unknown";
            const profileId = row.ownerProfileId ?? "default";
            const key = `${agentKind}/${profileId}`;
            const current = namespaces.get(key) ?? { agentKind, profileId, count: 0 };
            current.count++;
            namespaces.set(key, current);
        }
        return {
            current: health.namespace ?? { agentKind: health.agent, profileId: "default" },
            db: health.paths.db,
            namespaces: [...namespaces.values()].sort((a, b) => b.count - a.count),
        };
    });
    routes.set("POST /api/v1/diag/simulate-turn", async (ctx) => {
        // Safety lock: accept only when explicitly opted-in with
        // `?allow=1`. Without this header the endpoint returns 403 — we
        // don't want random web traffic driving synthetic turns into the
        // user's memory store.
        if (ctx.url.searchParams.get("allow") !== "1") {
            writeError(ctx, 403, "forbidden", "use ?allow=1 to enable this endpoint");
            return;
        }
        const body = parseJson(ctx);
        if (!body.user || !body.assistant) {
            writeError(ctx, 400, "invalid_argument", "user and assistant are required");
            return;
        }
        const agent = body.agent ?? "openclaw";
        const sessionId = body.sessionId ??
            (await deps.core.openSession({ agent }));
        const ts = Date.now();
        const turnIn = {
            agent,
            sessionId,
            userText: body.user,
            ts,
        };
        const packet = await deps.core.onTurnStart(turnIn);
        const episodeId = (packet.query.episodeId ?? null);
        if (!episodeId) {
            writeError(ctx, 500, "internal", "onTurnStart did not return an episodeId");
            return;
        }
        const now = Date.now();
        const turnOut = {
            agent,
            sessionId,
            episodeId,
            agentText: body.assistant,
            toolCalls: (body.toolCalls ?? []).map((tc, i) => ({
                id: `sim_${now}_${i}`,
                name: tc.name,
                input: tc.input ?? {},
                output: tc.output ?? "",
                startedAt: now,
                endedAt: (now + 1),
                errorCode: tc.errorCode,
            })),
            ts: now,
        };
        const res = await deps.core.onTurnEnd(turnOut);
        return {
            ok: true,
            sessionId,
            episodeId,
            traceId: res.traceId,
            hits: packet.hits.length,
        };
    });
}
// Poor-man's counters — we walk batches of 500 until the list turns
// up short. Safe for viewer-scale datasets; don't run on millions of
// rows (use SQL directly in that case).
async function countEpisodes(core) {
    return walkAll((limit, offset) => core.listEpisodeRows({ limit, offset, includeAllNamespaces: true }));
}
async function countPolicies(core) {
    return walkAll((limit, offset) => core.listPolicies({ limit, offset, includeAllNamespaces: true }));
}
async function countWorldModels(core) {
    return walkAll((limit, offset) => core.listWorldModels({ limit, offset }));
}
async function countSkills(core) {
    return walkAll((limit, offset) => core.listSkills({ limit, includeAllNamespaces: true }));
    void countSkills; // the offset is unused for listSkills; it returns
    // everything up to `limit` — fine for our cap.
}
async function walkAll(fetcher) {
    const BATCH = 500;
    let offset = 0;
    let total = 0;
    for (let safety = 0; safety < 40; safety++) {
        const rows = await fetcher(BATCH, offset);
        total += rows.length;
        if (rows.length < BATCH)
            break;
        offset += BATCH;
    }
    return total;
}
//# sourceMappingURL=diag.js.map