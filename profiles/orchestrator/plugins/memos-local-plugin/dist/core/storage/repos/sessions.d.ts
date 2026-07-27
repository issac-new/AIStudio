/**
 * Session rows are lightweight: we only track birth/last-seen + a JSON meta
 * bag for whatever adapters want to stash (e.g. OpenClaw's `hostPid`).
 */
import type { AgentKind, SessionId } from "../../types.js";
import type { StorageDb } from "../types.js";
export interface SessionRow {
    id: SessionId;
    agent: AgentKind;
    ownerAgentKind?: AgentKind;
    ownerProfileId?: string;
    ownerWorkspaceId?: string | null;
    startedAt: number;
    lastSeenAt: number;
    meta: Record<string, unknown>;
}
export declare function makeSessionsRepo(db: StorageDb): {
    upsert(row: SessionRow): void;
    touch(id: SessionId, lastSeenAt: number, meta?: Record<string, unknown>): void;
    getById(id: SessionId): SessionRow | null;
    listRecent(limit?: number): SessionRow[];
    deleteOlderThan(cutoffMs: number): number;
};
//# sourceMappingURL=sessions.d.ts.map