import { decodeVector, encodeVector, norm2 } from "../vector.js";
const AUTH_STATE_KEY = "hub.auth";
const CLIENT_JOIN_CONFIG_KEY = "hub.client.join_config";
export const HUB_SHARED_MEMORY_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export function makeHubRepo(db, kv) {
    return {
        getAuthState() {
            return kv.get(AUTH_STATE_KEY, null);
        },
        setAuthState(state) {
            kv.set(AUTH_STATE_KEY, state);
        },
        upsertUser(user) {
            db.prepare(`INSERT INTO hub_users (
           id, username, device_name, role, status, token_hash, identity_key,
           created_at, approved_at, rejected_at, left_at, removed_at,
           last_ip, last_active_at, rejoin_requested_at
         ) VALUES (
           @id, @username, @device_name, @role, @status, @token_hash, @identity_key,
           @created_at, @approved_at, @rejected_at, @left_at, @removed_at,
           @last_ip, @last_active_at, @rejoin_requested_at
         )
         ON CONFLICT(id) DO UPDATE SET
           username=excluded.username,
           device_name=excluded.device_name,
           role=excluded.role,
           status=excluded.status,
           token_hash=excluded.token_hash,
           identity_key=excluded.identity_key,
           approved_at=excluded.approved_at,
           rejected_at=excluded.rejected_at,
           left_at=excluded.left_at,
           removed_at=excluded.removed_at,
           last_ip=excluded.last_ip,
           last_active_at=excluded.last_active_at,
           rejoin_requested_at=excluded.rejoin_requested_at`).run(userToParams(user));
        },
        getUser(id) {
            const row = db.prepare(`SELECT * FROM hub_users WHERE id=@id`).get({ id });
            return row ? rowToUser(row) : null;
        },
        findUserByIdentityKey(identityKey) {
            if (!identityKey)
                return null;
            const row = db.prepare(`SELECT * FROM hub_users WHERE identity_key=@identity_key`).get({ identity_key: identityKey });
            return row ? rowToUser(row) : null;
        },
        listUsers(status) {
            const rows = status
                ? db.prepare(`SELECT * FROM hub_users WHERE status=@status ORDER BY created_at DESC`).all({ status })
                : db.prepare(`SELECT * FROM hub_users ORDER BY created_at DESC`).all();
            return rows.map(rowToUser);
        },
        updateUserActivity(userId, ip, at = Date.now()) {
            db.prepare(`UPDATE hub_users SET last_ip=@last_ip, last_active_at=@last_active_at WHERE id=@id`).run({ id: userId, last_ip: ip, last_active_at: at });
        },
        setClientConnection(conn) {
            db.prepare(`INSERT INTO client_hub_connection (
           id, hub_url, user_id, username, user_token, role, connected_at,
           identity_key, last_known_status, hub_instance_id
         ) VALUES (
           1, @hub_url, @user_id, @username, @user_token, @role, @connected_at,
           @identity_key, @last_known_status, @hub_instance_id
         )
         ON CONFLICT(id) DO UPDATE SET
           hub_url=excluded.hub_url,
           user_id=excluded.user_id,
           username=excluded.username,
           user_token=excluded.user_token,
           role=excluded.role,
           connected_at=excluded.connected_at,
           identity_key=excluded.identity_key,
           last_known_status=excluded.last_known_status,
           hub_instance_id=excluded.hub_instance_id`).run({
                hub_url: conn.hubUrl,
                user_id: conn.userId,
                username: conn.username,
                user_token: conn.userToken,
                role: conn.role,
                connected_at: conn.connectedAt,
                identity_key: conn.identityKey,
                last_known_status: conn.lastKnownStatus,
                hub_instance_id: conn.hubInstanceId,
            });
        },
        getClientConnection() {
            const row = db.prepare(`SELECT * FROM client_hub_connection WHERE id=1`).get();
            return row ? rowToClientConnection(row) : null;
        },
        clearClientConnection() {
            db.prepare(`DELETE FROM client_hub_connection WHERE id=1`).run();
        },
        getClientJoinConfig() {
            return kv.get(CLIENT_JOIN_CONFIG_KEY, null);
        },
        setClientJoinConfig(config) {
            kv.set(CLIENT_JOIN_CONFIG_KEY, config);
        },
        clearClientJoinConfig() {
            kv.del(CLIENT_JOIN_CONFIG_KEY);
        },
        upsertSharedMemory(memory) {
            db.prepare(`INSERT INTO hub_shared_memories (
           id, source_trace_id, source_user_id, source_agent, kind,
           summary, content, embedding, embedding_norm2, visible, deleted_at,
           created_at, updated_at
         ) VALUES (
           @id, @source_trace_id, @source_user_id, @source_agent, @kind,
           @summary, @content, @embedding, @embedding_norm2, @visible, @deleted_at,
           @created_at, @updated_at
         )
         ON CONFLICT(source_user_id, source_trace_id) DO UPDATE SET
           summary=excluded.summary,
           content=excluded.content,
           kind=excluded.kind,
           source_agent=excluded.source_agent,
           embedding=excluded.embedding,
           embedding_norm2=excluded.embedding_norm2,
           visible=excluded.visible,
           deleted_at=excluded.deleted_at,
           updated_at=excluded.updated_at`).run({
                id: memory.id,
                source_trace_id: memory.sourceTraceId,
                source_user_id: memory.sourceUserId,
                source_agent: memory.sourceAgent,
                kind: memory.kind,
                summary: memory.summary,
                content: memory.content,
                embedding: memory.embedding ? encodeVector(memory.embedding) : null,
                embedding_norm2: memory.embedding
                    ? (memory.embeddingNorm2 ?? norm2(memory.embedding))
                    : null,
                visible: memory.visible ? 1 : 0,
                deleted_at: memory.deletedAt,
                created_at: memory.createdAt,
                updated_at: memory.updatedAt,
            });
        },
        getSharedMemoryBySource(sourceUserId, sourceTraceId) {
            const row = db.prepare(`SELECT * FROM hub_shared_memories
         WHERE source_user_id=@source_user_id AND source_trace_id=@source_trace_id`).get({ source_user_id: sourceUserId, source_trace_id: sourceTraceId });
            return row ? rowToSharedMemory(row) : null;
        },
        hideSharedMemoryBySource(sourceUserId, sourceTraceId, deletedAt = Date.now()) {
            db.prepare(`UPDATE hub_shared_memories
         SET visible=0,
             deleted_at=COALESCE(deleted_at, @deleted_at),
             updated_at=@deleted_at
         WHERE source_user_id=@source_user_id AND source_trace_id=@source_trace_id`).run({ source_user_id: sourceUserId, source_trace_id: sourceTraceId, deleted_at: deletedAt });
        },
        deleteSharedMemoryBySource(sourceUserId, sourceTraceId) {
            db.prepare(`DELETE FROM hub_shared_memories
         WHERE source_user_id=@source_user_id AND source_trace_id=@source_trace_id`).run({ source_user_id: sourceUserId, source_trace_id: sourceTraceId });
        },
        listSharedMemories(limit = 100) {
            const rows = db.prepare(`SELECT * FROM hub_shared_memories
         WHERE visible=1
         ORDER BY updated_at DESC LIMIT @limit`).all({ limit: clampLimit(limit) });
            return rows.map(rowToSharedMemory);
        },
        searchSharedMemories(query, limit = 10) {
            const cap = Math.max(50, Math.min(500, clampLimit(limit) * 40));
            const memories = db.prepare(`SELECT * FROM hub_shared_memories
         WHERE visible=1
         ORDER BY updated_at DESC LIMIT @limit`).all({ limit: cap }).map(rowToSharedMemory);
            const byId = new Map();
            for (const scored of scoreSharedMemoriesByText(query, memories)) {
                upsertSearchHit(byId, scored.memory, scored.score);
            }
            return [...byId.values()]
                .filter((hit) => hit.score > 0)
                .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
                .slice(0, clampLimit(limit));
        },
        deleteSharedMemoriesByUser(sourceUserId) {
            db.prepare(`DELETE FROM hub_shared_memories WHERE source_user_id=@source_user_id`).run({ source_user_id: sourceUserId });
        },
        purgeExpiredSharedMemories(before = Date.now() - HUB_SHARED_MEMORY_TOMBSTONE_TTL_MS) {
            const result = db.prepare(`DELETE FROM hub_shared_memories
         WHERE visible=0 AND deleted_at IS NOT NULL AND deleted_at <= @before`).run({ before });
            return Number(result.changes ?? 0);
        },
        upsertSharedSkill(skill) {
            db.prepare(`INSERT INTO hub_shared_skills (
           id, source_skill_id, source_user_id, name, invocation_guide,
           version, quality_score, bundle_json, created_at, updated_at
         ) VALUES (
           @id, @source_skill_id, @source_user_id, @name, @invocation_guide,
           @version, @quality_score, @bundle_json, @created_at, @updated_at
         )
         ON CONFLICT(source_user_id, source_skill_id) DO UPDATE SET
           name=excluded.name,
           invocation_guide=excluded.invocation_guide,
           version=excluded.version,
           quality_score=excluded.quality_score,
           bundle_json=excluded.bundle_json,
           updated_at=excluded.updated_at`).run({
                id: skill.id,
                source_skill_id: skill.sourceSkillId,
                source_user_id: skill.sourceUserId,
                name: skill.name,
                invocation_guide: skill.invocationGuide,
                version: skill.version,
                quality_score: skill.qualityScore,
                bundle_json: JSON.stringify(skill.bundle ?? {}),
                created_at: skill.createdAt,
                updated_at: skill.updatedAt,
            });
        },
        getSharedSkillBySource(sourceUserId, sourceSkillId) {
            const row = db.prepare(`SELECT * FROM hub_shared_skills
         WHERE source_user_id=@source_user_id AND source_skill_id=@source_skill_id`).get({ source_user_id: sourceUserId, source_skill_id: sourceSkillId });
            return row ? rowToSharedSkill(row) : null;
        },
        deleteSharedSkillBySource(sourceUserId, sourceSkillId) {
            db.prepare(`DELETE FROM hub_shared_skills
         WHERE source_user_id=@source_user_id AND source_skill_id=@source_skill_id`).run({ source_user_id: sourceUserId, source_skill_id: sourceSkillId });
        },
        listSharedSkills(limit = 100) {
            const rows = db.prepare(`SELECT * FROM hub_shared_skills ORDER BY updated_at DESC LIMIT @limit`).all({ limit: clampLimit(limit) });
            return rows.map(rowToSharedSkill);
        },
        deleteSharedSkillsByUser(sourceUserId) {
            db.prepare(`DELETE FROM hub_shared_skills WHERE source_user_id=@source_user_id`).run({ source_user_id: sourceUserId });
        },
        contributionsByUser() {
            const out = {};
            const memRows = db.prepare(`SELECT source_user_id, COUNT(*) AS n
         FROM hub_shared_memories
         WHERE visible=1
         GROUP BY source_user_id`).all();
            for (const row of memRows) {
                out[row.source_user_id] = out[row.source_user_id] ?? { memoryCount: 0, skillCount: 0 };
                out[row.source_user_id].memoryCount = row.n;
            }
            const skillRows = db.prepare(`SELECT source_user_id, COUNT(*) AS n FROM hub_shared_skills GROUP BY source_user_id`).all();
            for (const row of skillRows) {
                out[row.source_user_id] = out[row.source_user_id] ?? { memoryCount: 0, skillCount: 0 };
                out[row.source_user_id].skillCount = row.n;
            }
            return out;
        },
    };
}
function userToParams(user) {
    return {
        id: user.id,
        username: user.username,
        device_name: user.deviceName,
        role: user.role,
        status: user.status,
        token_hash: user.tokenHash,
        identity_key: user.identityKey,
        created_at: user.createdAt,
        approved_at: user.approvedAt,
        rejected_at: user.rejectedAt,
        left_at: user.leftAt,
        removed_at: user.removedAt,
        last_ip: user.lastIp,
        last_active_at: user.lastActiveAt,
        rejoin_requested_at: user.rejoinRequestedAt,
    };
}
function rowToUser(row) {
    return {
        id: row.id,
        username: row.username,
        deviceName: row.device_name,
        role: row.role,
        status: row.status,
        tokenHash: row.token_hash,
        identityKey: row.identity_key,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
        rejectedAt: row.rejected_at,
        leftAt: row.left_at,
        removedAt: row.removed_at,
        lastIp: row.last_ip,
        lastActiveAt: row.last_active_at,
        rejoinRequestedAt: row.rejoin_requested_at,
    };
}
function rowToClientConnection(row) {
    return {
        hubUrl: row.hub_url,
        userId: row.user_id,
        username: row.username,
        userToken: row.user_token,
        role: row.role,
        connectedAt: row.connected_at,
        identityKey: row.identity_key,
        lastKnownStatus: row.last_known_status,
        hubInstanceId: row.hub_instance_id,
    };
}
function rowToSharedMemory(row) {
    return {
        id: row.id,
        sourceTraceId: row.source_trace_id,
        sourceUserId: row.source_user_id,
        sourceAgent: row.source_agent,
        kind: row.kind,
        summary: row.summary,
        content: row.content,
        embedding: decodeVector(row.embedding),
        embeddingNorm2: row.embedding_norm2,
        visible: row.visible === 1,
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function rowToSharedSkill(row) {
    let bundle = {};
    try {
        const parsed = JSON.parse(row.bundle_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            bundle = parsed;
        }
    }
    catch {
        bundle = {};
    }
    return {
        id: row.id,
        sourceSkillId: row.source_skill_id,
        sourceUserId: row.source_user_id,
        name: row.name,
        invocationGuide: row.invocation_guide,
        version: row.version,
        qualityScore: row.quality_score,
        bundle,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function scoreSharedMemoriesByText(query, memories) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery)
        return [];
    const terms = searchTerms(normalizedQuery);
    return memories
        .map((memory) => {
        const haystack = normalizeSearchText(`${memory.summary}\n${memory.content}`);
        let score = 0;
        if (haystack.includes(normalizedQuery))
            score += 3;
        for (const term of terms) {
            if (haystack.includes(term))
                score += term.length >= 3 ? 1.5 : 1;
        }
        return { memory, score };
    })
        .filter((hit) => hit.score > 0);
}
function upsertSearchHit(into, memory, score) {
    const existing = into.get(memory.id);
    if (existing) {
        existing.score += score;
        return;
    }
    into.set(memory.id, { ...memory, score });
}
function normalizeSearchText(text) {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
}
function searchTerms(text) {
    const terms = new Set();
    const cjk = text.match(/[\p{Script=Han}]+/gu) ?? [];
    for (const segment of cjk) {
        for (let i = 0; i < segment.length - 1; i++) {
            terms.add(segment.slice(i, i + 2));
        }
        for (let i = 0; i < segment.length - 2; i++) {
            terms.add(segment.slice(i, i + 3));
        }
    }
    for (const term of text.match(/[a-z0-9_.$/-]{2,}/g) ?? []) {
        terms.add(term);
    }
    return [...terms].slice(0, 80);
}
function clampLimit(limit) {
    return Math.max(1, Math.min(500, Math.floor(limit || 100)));
}
//# sourceMappingURL=hub.js.map