import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const LOCK_DIRNAME = "openclaw-runtime.lock";
const OWNER_FILENAME = "owner.json";
const UNWRITTEN_OWNER_STALE_MS = 30_000;
export class DuplicateOpenClawRuntimeError extends Error {
    code = "duplicate_instance";
    lockDir;
    owner;
    constructor(lockDir, owner) {
        const detail = owner
            ? `pid=${owner.pid} startedAt=${new Date(owner.startedAt).toISOString()}`
            : "owner=unknown";
        super(`memos-local OpenClaw runtime is already active (${detail})`);
        this.name = "DuplicateOpenClawRuntimeError";
        this.lockDir = lockDir;
        this.owner = owner;
    }
}
export function openClawRuntimeLockDir(home) {
    return path.join(home.daemonDir, LOCK_DIRNAME);
}
export function acquireOpenClawRuntimeLock(options) {
    const lockDir = openClawRuntimeLockDir(options.home);
    const ownerFile = path.join(lockDir, OWNER_FILENAME);
    const now = options.now ?? Date.now;
    const pid = options.pid ?? process.pid;
    const unwrittenOwnerStaleMs = options.unwrittenOwnerStaleMs ?? UNWRITTEN_OWNER_STALE_MS;
    fs.mkdirSync(options.home.daemonDir, { recursive: true });
    for (;;) {
        try {
            fs.mkdirSync(lockDir);
            break;
        }
        catch (err) {
            const e = err;
            if (e.code !== "EEXIST")
                throw err;
            const owner = readOwner(ownerFile);
            if (owner && pidIsAlive(owner.pid)) {
                throw new DuplicateOpenClawRuntimeError(lockDir, owner);
            }
            if (!owner && !lockLooksStale(lockDir, now(), unwrittenOwnerStaleMs)) {
                throw new DuplicateOpenClawRuntimeError(lockDir, null);
            }
            fs.rmSync(lockDir, { recursive: true, force: true });
        }
    }
    const owner = {
        pluginId: options.pluginId,
        version: options.version,
        pid,
        token: randomUUID(),
        startedAt: now(),
        dbFile: options.home.dbFile,
        viewerPort: options.viewerPort,
    };
    try {
        fs.writeFileSync(ownerFile, JSON.stringify(owner, null, 2), "utf8");
    }
    catch (err) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        throw err;
    }
    let released = false;
    const releaseSync = () => {
        if (released)
            return;
        released = true;
        const current = readOwner(ownerFile);
        if (current?.token !== owner.token)
            return;
        fs.rmSync(lockDir, { recursive: true, force: true });
    };
    const onExit = () => releaseSync();
    process.once("exit", onExit);
    return {
        lockDir,
        owner,
        release() {
            releaseSync();
            process.off("exit", onExit);
        },
    };
}
function readOwner(ownerFile) {
    try {
        const parsed = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
        if (typeof parsed.pluginId !== "string" ||
            typeof parsed.version !== "string" ||
            typeof parsed.pid !== "number" ||
            typeof parsed.token !== "string" ||
            typeof parsed.startedAt !== "number" ||
            typeof parsed.dbFile !== "string" ||
            typeof parsed.viewerPort !== "number") {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function pidIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        const code = err.code;
        return code === "EPERM";
    }
}
function lockLooksStale(lockDir, now, staleMs) {
    try {
        const stat = fs.statSync(lockDir);
        return now - stat.mtimeMs >= staleMs;
    }
    catch {
        return true;
    }
}
//# sourceMappingURL=runtime-lock.js.map