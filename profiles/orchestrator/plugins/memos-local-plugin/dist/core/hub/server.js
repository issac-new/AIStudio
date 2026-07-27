import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import { HUB_SHARED_MEMORY_TOMBSTONE_TTL_MS } from "../storage/repos/hub.js";
import { issueUserToken, verifyUserToken } from "./auth.js";
export class HubServerRuntime {
    deps;
    server = null;
    actualPort = 0;
    authState;
    owner = null;
    constructor(deps) {
        this.deps = deps;
        this.authState = this.loadAuthState();
    }
    async start() {
        if (this.server?.listening && this.owner) {
            return this.snapshot();
        }
        const token = this.teamToken;
        if (!token) {
            throw new Error("hub.teamToken is required when hub.role=hub");
        }
        this.server = createServer((req, res) => {
            void this.handle(req, res).catch((err) => {
                this.deps.log.warn("hub.request.failed", {
                    err: err instanceof Error ? err.message : String(err),
                });
                this.json(res, 500, { error: "internal_error" });
            });
        });
        let listenPort = this.configuredPort;
        await new Promise((resolve, reject) => {
            let retries = 0;
            const onError = (err) => {
                if (err.code === "EADDRINUSE" && retries < 3) {
                    retries++;
                    listenPort = this.configuredPort + retries;
                    this.deps.log.warn("hub.port.busy_retry", { port: listenPort - 1, nextPort: listenPort });
                    this.server.listen(listenPort, "0.0.0.0");
                    return;
                }
                this.server?.off("listening", onListening);
                reject(err);
            };
            const onListening = () => {
                this.server?.off("error", onError);
                resolve();
            };
            this.server.on("error", onError);
            this.server.once("listening", onListening);
            this.server.listen(listenPort, "0.0.0.0");
        });
        this.actualPort = listenPort;
        this.owner = this.ensureBootstrapAdmin();
        this.pruneExpiredSharedMemories();
        this.deps.log.info("hub.started", {
            url: `http://127.0.0.1:${this.actualPort}`,
            bindHost: "0.0.0.0",
            teamName: this.teamName,
        });
        return this.snapshot();
    }
    async stop() {
        const server = this.server;
        this.server = null;
        this.owner = null;
        if (!server)
            return;
        await new Promise((resolve) => server.close(() => resolve()));
        this.deps.log.info("hub.stopped", {});
    }
    snapshot() {
        if (!this.owner) {
            throw new Error("hub server has not started");
        }
        return {
            url: `http://127.0.0.1:${this.actualPort || this.configuredPort}`,
            port: this.actualPort || this.configuredPort,
            hubInstanceId: this.hubInstanceId,
            ownerUserId: this.owner.userId,
            ownerToken: this.owner.token,
        };
    }
    get hubInstanceId() {
        return this.authState.hubInstanceId;
    }
    get ownerUserId() {
        return this.owner?.userId ?? this.authState.bootstrapAdminUserId ?? "";
    }
    get ownerToken() {
        return this.owner?.token ?? this.authState.bootstrapAdminToken ?? "";
    }
    approveUser(userId) {
        const user = this.deps.repo.getUser(userId);
        if (!user)
            return null;
        const token = this.issueToken(user, "member");
        const updated = {
            ...user,
            role: "member",
            status: "active",
            tokenHash: hashToken(token),
            approvedAt: Date.now(),
        };
        this.deps.repo.upsertUser(updated);
        return { token, user: updated };
    }
    rejectUser(userId) {
        const user = this.deps.repo.getUser(userId);
        if (!user)
            return null;
        const updated = {
            ...user,
            status: "rejected",
            rejectedAt: Date.now(),
            tokenHash: "",
        };
        this.deps.repo.upsertUser(updated);
        return updated;
    }
    removeUser(userId) {
        const user = this.deps.repo.getUser(userId);
        if (!user || user.role === "admin")
            return null;
        const updated = {
            ...user,
            status: "removed",
            tokenHash: "",
            removedAt: Date.now(),
        };
        this.deps.repo.upsertUser(updated);
        this.deps.repo.deleteSharedMemoriesByUser(user.id);
        this.deps.repo.deleteSharedSkillsByUser(user.id);
        return updated;
    }
    publishMemoryAsOwner(input) {
        return this.publishMemoryForUser(this.ownerUserId, input);
    }
    searchMemories(query, limit = 10) {
        this.pruneExpiredSharedMemories();
        return this.deps.repo.searchSharedMemories(query, limit);
    }
    unpublishMemoryAsOwner(sourceTraceId) {
        this.deps.repo.hideSharedMemoryBySource(this.ownerUserId, sourceTraceId);
    }
    publishSkillAsOwner(input) {
        return this.publishSkillForUser(this.ownerUserId, input);
    }
    unpublishSkillAsOwner(sourceSkillId) {
        this.deps.repo.deleteSharedSkillBySource(this.ownerUserId, sourceSkillId);
    }
    async handle(req, res) {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.actualPort || this.configuredPort}`);
        const path = url.pathname;
        const method = (req.method ?? "GET").toUpperCase();
        if (method === "GET" && path === "/api/v1/hub/info") {
            return this.json(res, 200, {
                teamName: this.teamName,
                version: this.deps.version,
                apiVersion: "v1",
                hubInstanceId: this.hubInstanceId,
            });
        }
        if (method === "POST" && path === "/api/v1/hub/join") {
            const body = await this.readJson(req);
            if (!body || body.teamToken !== this.teamToken) {
                return this.json(res, 403, { error: "invalid_team_token" });
            }
            return this.handleJoin(req, res, body);
        }
        if (method === "POST" && path === "/api/v1/hub/registration-status") {
            const body = await this.readJson(req);
            if (!body || body.teamToken !== this.teamToken) {
                return this.json(res, 403, { error: "invalid_team_token" });
            }
            const userId = String(body.userId || "");
            const requestedUsername = optionalSafeUsername(body.username);
            let user = userId ? this.deps.repo.getUser(userId) : null;
            if (user && requestedUsername && user.username !== requestedUsername) {
                const conflict = this.findUserByUsername(requestedUsername);
                if (conflict && conflict.id !== user.id) {
                    return this.json(res, 409, {
                        error: "username_taken",
                        message: `Username "${requestedUsername}" is already in use.`,
                    });
                }
                user = { ...user, username: requestedUsername };
                this.deps.repo.upsertUser(user);
            }
            if (!user && requestedUsername) {
                user = this.findUserByUsername(requestedUsername);
            }
            if (!user)
                return this.json(res, 404, { error: "not_found" });
            if (user.status === "active") {
                const token = this.issueToken(user, user.role);
                this.deps.repo.upsertUser({ ...user, tokenHash: hashToken(token) });
                return this.json(res, 200, {
                    status: "active",
                    userId: user.id,
                    username: user.username,
                    identityKey: user.identityKey,
                    userToken: token,
                });
            }
            return this.json(res, 200, {
                status: user.status,
                userId: user.id,
                username: user.username,
                identityKey: user.identityKey,
            });
        }
        const auth = this.authenticate(req);
        if (!auth)
            return this.json(res, 401, { error: "unauthorized" });
        if (method === "POST" && path === "/api/v1/hub/heartbeat") {
            return this.json(res, 200, { ok: true });
        }
        if (method === "GET" && path === "/api/v1/hub/me") {
            const user = this.deps.repo.getUser(auth.userId);
            if (!user)
                return this.json(res, 401, { error: "unauthorized" });
            return this.json(res, 200, publicUser(user));
        }
        if (method === "GET" && path === "/api/v1/hub/admin/pending-users") {
            if (auth.role !== "admin")
                return this.json(res, 403, { error: "forbidden" });
            return this.json(res, 200, { users: this.deps.repo.listUsers("pending").map(publicUser) });
        }
        if (method === "GET" && path === "/api/v1/hub/admin/users") {
            if (auth.role !== "admin")
                return this.json(res, 403, { error: "forbidden" });
            const contrib = this.deps.repo.contributionsByUser();
            const now = Date.now();
            const users = this.deps.repo.listUsers()
                .filter((u) => u.status === "active")
                .map((u) => ({
                ...publicUser(u),
                isOwner: u.id === this.ownerUserId,
                isOnline: u.id === this.ownerUserId || (!!u.lastActiveAt && now - u.lastActiveAt < 2 * 60_000),
                memoryCount: contrib[u.id]?.memoryCount ?? 0,
                skillCount: contrib[u.id]?.skillCount ?? 0,
            }));
            return this.json(res, 200, { users });
        }
        if (method === "POST" && path === "/api/v1/hub/admin/approve-user") {
            if (auth.role !== "admin")
                return this.json(res, 403, { error: "forbidden" });
            const body = await this.readJson(req);
            const approved = this.approveUser(String(body?.userId ?? ""));
            if (!approved)
                return this.json(res, 404, { error: "not_found" });
            return this.json(res, 200, { status: "active", token: approved.token });
        }
        if (method === "POST" && path === "/api/v1/hub/admin/reject-user") {
            if (auth.role !== "admin")
                return this.json(res, 403, { error: "forbidden" });
            const body = await this.readJson(req);
            const rejected = this.rejectUser(String(body?.userId ?? ""));
            if (!rejected)
                return this.json(res, 404, { error: "not_found" });
            return this.json(res, 200, { status: "rejected" });
        }
        if (method === "POST" && path === "/api/v1/hub/admin/remove-user") {
            if (auth.role !== "admin")
                return this.json(res, 403, { error: "forbidden" });
            const body = await this.readJson(req);
            const removed = this.removeUser(String(body?.userId ?? ""));
            if (!removed)
                return this.json(res, 404, { error: "not_found" });
            return this.json(res, 200, { status: "removed" });
        }
        if (method === "POST" && path === "/api/v1/hub/memories/share") {
            const body = await this.readJson(req);
            if (!body?.memory)
                return this.json(res, 400, { error: "invalid_payload" });
            const memory = this.publishMemoryForUser(auth.userId, normalizeMemoryPayload(body.memory));
            return this.json(res, 200, { ok: true, memoryId: memory.id, visibility: "public" });
        }
        if (method === "POST" && path === "/api/v1/hub/memories/unshare") {
            const body = await this.readJson(req);
            const sourceTraceId = String(body?.sourceTraceId ?? body?.sourceChunkId ?? "");
            if (!sourceTraceId)
                return this.json(res, 400, { error: "missing_source_trace_id" });
            this.deps.repo.hideSharedMemoryBySource(auth.userId, sourceTraceId);
            return this.json(res, 200, { ok: true });
        }
        if (method === "GET" && path === "/api/v1/hub/memories") {
            this.pruneExpiredSharedMemories();
            return this.json(res, 200, {
                memories: this.deps.repo
                    .listSharedMemories(Number(url.searchParams.get("limit") || 100))
                    .map(publicMemory),
            });
        }
        if (method === "POST" && path === "/api/v1/hub/memories/search") {
            const body = await this.readJson(req);
            const query = String(body.query ?? "");
            const limit = Number(body.limit ?? body.maxResults ?? 10);
            return this.json(res, 200, {
                memories: this.searchMemories(query, limit).map(publicMemory),
            });
        }
        if (method === "POST" && path === "/api/v1/hub/skills/publish") {
            const body = await this.readJson(req);
            const metadata = asRecord(body?.metadata);
            const bundle = asRecord(body?.bundle);
            const sourceSkillId = String(metadata.id || "");
            if (!sourceSkillId)
                return this.json(res, 400, { error: "missing_skill_id" });
            const skill = this.publishSkillForUser(auth.userId, {
                sourceSkillId,
                name: String(metadata.name || sourceSkillId),
                invocationGuide: String(metadata.invocationGuide || bundle.invocationGuide || ""),
                version: Number(metadata.version || 1),
                qualityScore: metadata.qualityScore == null ? null : Number(metadata.qualityScore),
                bundle,
            });
            return this.json(res, 200, { ok: true, skillId: skill.id, visibility: "public" });
        }
        if (method === "POST" && path === "/api/v1/hub/skills/unpublish") {
            const body = await this.readJson(req);
            const sourceSkillId = String(body?.sourceSkillId || "");
            if (!sourceSkillId)
                return this.json(res, 400, { error: "missing_skill_id" });
            this.deps.repo.deleteSharedSkillBySource(auth.userId, sourceSkillId);
            return this.json(res, 200, { ok: true });
        }
        if (method === "GET" && path === "/api/v1/hub/skills/list") {
            return this.json(res, 200, {
                skills: this.deps.repo.listSharedSkills(Number(url.searchParams.get("limit") || 100)),
            });
        }
        return this.json(res, 404, { error: "not_found" });
    }
    handleJoin(req, res, body) {
        const identityKey = typeof body.identityKey === "string" ? body.identityKey.trim() : "";
        const username = safeUsername(String(body.username || os.userInfo().username || "member"));
        const joinIp = (typeof body.clientIp === "string" && body.clientIp.trim()) ||
            req.headers["x-client-ip"]?.trim() ||
            req.socket.remoteAddress ||
            "";
        const nameMatch = this.findUserByUsername(username);
        if (nameMatch) {
            this.respondExistingJoin(res, nameMatch, identityKey, joinIp);
            return;
        }
        const identityMatch = identityKey ? this.deps.repo.findUserByIdentityKey(identityKey) : null;
        if (identityMatch) {
            const conflict = this.findUserByUsername(username);
            if (conflict && conflict.id !== identityMatch.id) {
                return this.json(res, 409, { error: "username_taken", message: `Username "${username}" is already in use.` });
            }
            const renamed = identityMatch.username === username
                ? identityMatch
                : { ...identityMatch, username };
            if (renamed !== identityMatch)
                this.deps.repo.upsertUser(renamed);
            this.respondExistingJoin(res, renamed, identityKey, joinIp);
            return;
        }
        const now = Date.now();
        const generatedIdentityKey = identityKey || randomUUID();
        const user = {
            id: randomUUID(),
            username,
            deviceName: String(body.deviceName || ""),
            role: "member",
            status: "pending",
            tokenHash: "",
            identityKey: generatedIdentityKey,
            createdAt: now,
            approvedAt: null,
            rejectedAt: null,
            leftAt: null,
            removedAt: null,
            lastIp: joinIp,
            lastActiveAt: now,
            rejoinRequestedAt: null,
        };
        this.deps.repo.upsertUser(user);
        this.deps.log.info("hub.join.pending", { userId: user.id, username: user.username });
        return this.json(res, 200, { status: "pending", userId: user.id, identityKey: generatedIdentityKey });
    }
    respondExistingJoin(res, matched, identityKey, joinIp) {
        this.deps.repo.updateUserActivity(matched.id, joinIp);
        if (matched.status === "active") {
            const token = this.issueToken(matched, matched.role);
            const updated = {
                ...matched,
                identityKey: matched.identityKey || identityKey,
                tokenHash: hashToken(token),
            };
            this.deps.repo.upsertUser(updated);
            return this.json(res, 200, {
                status: "active",
                userId: matched.id,
                username: matched.username,
                userToken: token,
                identityKey: updated.identityKey,
            });
        }
        if (matched.status === "pending") {
            return this.json(res, 200, {
                status: "pending",
                userId: matched.id,
                username: matched.username,
                identityKey: matched.identityKey || identityKey,
            });
        }
        if (matched.status === "rejected" || matched.status === "left" || matched.status === "removed") {
            const pending = {
                ...matched,
                status: "pending",
                tokenHash: "",
                identityKey: matched.identityKey || identityKey,
                rejoinRequestedAt: Date.now(),
            };
            this.deps.repo.upsertUser(pending);
            return this.json(res, 200, {
                status: "pending",
                userId: pending.id,
                username: pending.username,
                identityKey: pending.identityKey,
            });
        }
        return this.json(res, 200, { status: matched.status, userId: matched.id, username: matched.username });
    }
    findUserByUsername(username) {
        return this.deps.repo
            .listUsers()
            .find((u) => u.username === username && u.status !== "left" && u.status !== "removed") ?? null;
    }
    authenticate(req) {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer "))
            return null;
        const token = header.slice("Bearer ".length);
        const payload = verifyUserToken(token, this.authState.authSecret);
        if (!payload)
            return null;
        const user = this.deps.repo.getUser(payload.userId);
        if (!user || user.status !== "active" || user.tokenHash !== hashToken(token))
            return null;
        const ip = req.headers["x-client-ip"]?.trim() ||
            req.socket.remoteAddress ||
            "";
        this.deps.repo.updateUserActivity(user.id, ip);
        return { userId: user.id, username: user.username, role: user.role };
    }
    publishMemoryForUser(sourceUserId, input) {
        this.pruneExpiredSharedMemories();
        const existing = this.deps.repo.getSharedMemoryBySource(sourceUserId, input.sourceTraceId);
        const now = Date.now();
        const memory = {
            ...input,
            id: existing?.id ?? randomUUID(),
            sourceUserId,
            visible: true,
            deletedAt: null,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.deps.repo.upsertSharedMemory(memory);
        return memory;
    }
    pruneExpiredSharedMemories(now = Date.now()) {
        const purged = this.deps.repo.purgeExpiredSharedMemories(now - HUB_SHARED_MEMORY_TOMBSTONE_TTL_MS);
        if (purged > 0) {
            this.deps.log.info("hub.shared_memories.purged", { count: purged });
        }
    }
    publishSkillForUser(sourceUserId, input) {
        const existing = this.deps.repo.getSharedSkillBySource(sourceUserId, input.sourceSkillId);
        const now = Date.now();
        const skill = {
            ...input,
            id: existing?.id ?? randomUUID(),
            sourceUserId,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.deps.repo.upsertSharedSkill(skill);
        return skill;
    }
    ensureBootstrapAdmin() {
        const now = Date.now();
        const existingByState = this.authState.bootstrapAdminUserId
            ? this.deps.repo.getUser(this.authState.bootstrapAdminUserId)
            : null;
        const existing = existingByState ??
            this.deps.repo.listUsers().find((u) => u.role === "admin" && u.status === "active") ??
            null;
        const base = existing ?? {
            id: randomUUID(),
            username: "admin",
            deviceName: os.hostname() || "hub",
            role: "admin",
            status: "active",
            tokenHash: "",
            identityKey: "",
            createdAt: now,
            approvedAt: now,
            rejectedAt: null,
            leftAt: null,
            removedAt: null,
            lastIp: "",
            lastActiveAt: now,
            rejoinRequestedAt: null,
        };
        const activeAdmin = {
            ...base,
            role: "admin",
            status: "active",
            approvedAt: base.approvedAt ?? now,
        };
        const token = this.issueToken(activeAdmin, "admin", 3650 * 24 * 60 * 60 * 1000);
        this.deps.repo.upsertUser({ ...activeAdmin, tokenHash: hashToken(token) });
        this.authState.bootstrapAdminUserId = activeAdmin.id;
        this.authState.bootstrapAdminToken = token;
        this.saveAuthState();
        return { userId: activeAdmin.id, token };
    }
    issueToken(user, role = user.role, ttlMs) {
        return issueUserToken({ userId: user.id, username: user.username, role, status: "active" }, this.authState.authSecret, ttlMs);
    }
    loadAuthState() {
        const existing = this.deps.repo.getAuthState();
        if (existing?.authSecret) {
            const state = {
                ...existing,
                hubInstanceId: existing.hubInstanceId || randomUUID(),
            };
            this.deps.repo.setAuthState(state);
            return state;
        }
        const state = {
            authSecret: randomBytes(32).toString("hex"),
            hubInstanceId: randomUUID(),
        };
        this.deps.repo.setAuthState(state);
        return state;
    }
    saveAuthState() {
        this.deps.repo.setAuthState(this.authState);
    }
    get configuredPort() {
        return this.deps.config.hub.port || 18912;
    }
    get teamName() {
        return this.deps.config.hub.teamName || os.hostname() || "MemOS Hub";
    }
    get teamToken() {
        return this.deps.config.hub.teamToken || "";
    }
    async readJson(req) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buf.length;
            if (size > 2 * 1024 * 1024) {
                throw Object.assign(new Error("request body too large"), { statusCode: 413 });
            }
            chunks.push(buf);
        }
        if (chunks.length === 0)
            return {};
        const text = Buffer.concat(chunks).toString("utf8");
        return text ? asRecord(JSON.parse(text)) : {};
    }
    json(res, status, body) {
        if (res.headersSent)
            return;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    }
}
function normalizeMemoryPayload(raw) {
    const body = asRecord(raw);
    const sourceTraceId = String(body.sourceTraceId || body.sourceChunkId || "");
    return {
        sourceTraceId,
        sourceAgent: String(body.sourceAgent || ""),
        kind: String(body.kind || "trace"),
        summary: String(body.summary || ""),
        content: String(body.content || ""),
        embedding: parseEmbeddingVector(body.embedding),
    };
}
function parseEmbeddingVector(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const out = new Float32Array(value.length);
    for (let i = 0; i < value.length; i++) {
        const n = Number(value[i]);
        if (!Number.isFinite(n))
            return null;
        out[i] = n;
    }
    return out;
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        name: user.username,
        deviceName: user.deviceName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        approvedAt: user.approvedAt,
        lastIp: user.lastIp,
        lastActiveAt: user.lastActiveAt,
    };
}
function publicMemory(memory) {
    return {
        id: memory.id,
        sourceTraceId: memory.sourceTraceId,
        sourceUserId: memory.sourceUserId,
        sourceAgent: memory.sourceAgent,
        kind: memory.kind,
        summary: memory.summary,
        content: memory.content,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        ...(memory.score == null ? {} : { score: memory.score }),
    };
}
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
function safeUsername(raw) {
    const trimmed = raw.trim().replace(/\s+/g, "-").slice(0, 32);
    return trimmed.length >= 2 ? trimmed : `user-${randomUUID().slice(0, 8)}`;
}
function optionalSafeUsername(raw) {
    if (typeof raw !== "string" || !raw.trim())
        return "";
    return safeUsername(raw);
}
//# sourceMappingURL=server.js.map