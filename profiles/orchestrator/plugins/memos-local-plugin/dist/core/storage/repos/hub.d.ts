import type { StorageDb } from "../types.js";
import type { makeKvRepo } from "./kv.js";
import type { EmbeddingVector } from "../../types.js";
export type HubRole = "admin" | "member";
export type HubUserStatus = "pending" | "active" | "rejected" | "blocked" | "left" | "removed";
export interface HubAuthState {
    authSecret: string;
    bootstrapAdminUserId?: string;
    bootstrapAdminToken?: string;
    hubInstanceId?: string;
}
export interface HubUserRecord {
    id: string;
    username: string;
    deviceName: string;
    role: HubRole;
    status: HubUserStatus;
    tokenHash: string;
    identityKey: string;
    createdAt: number;
    approvedAt: number | null;
    rejectedAt: number | null;
    leftAt: number | null;
    removedAt: number | null;
    lastIp: string;
    lastActiveAt: number | null;
    rejoinRequestedAt: number | null;
}
export interface ClientHubConnection {
    hubUrl: string;
    userId: string;
    username: string;
    userToken: string;
    role: HubRole;
    connectedAt: number;
    identityKey: string;
    lastKnownStatus: string;
    hubInstanceId: string;
}
export interface HubSharedMemoryRecord {
    id: string;
    sourceTraceId: string;
    sourceUserId: string;
    sourceAgent: string;
    kind: string;
    summary: string;
    content: string;
    embedding?: EmbeddingVector | null;
    embeddingNorm2?: number | null;
    visible: boolean;
    deletedAt: number | null;
    createdAt: number;
    updatedAt: number;
}
export interface HubSharedMemorySearchHit extends HubSharedMemoryRecord {
    score: number;
}
export interface HubSharedSkillRecord {
    id: string;
    sourceSkillId: string;
    sourceUserId: string;
    name: string;
    invocationGuide: string;
    version: number;
    qualityScore: number | null;
    bundle: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}
type KvRepo = ReturnType<typeof makeKvRepo>;
export declare const HUB_SHARED_MEMORY_TOMBSTONE_TTL_MS: number;
export interface ClientHubJoinConfig {
    hubUrl: string;
    teamTokenHash: string;
}
export declare function makeHubRepo(db: StorageDb, kv: KvRepo): {
    getAuthState(): HubAuthState | null;
    setAuthState(state: HubAuthState): void;
    upsertUser(user: HubUserRecord): void;
    getUser(id: string): HubUserRecord | null;
    findUserByIdentityKey(identityKey: string): HubUserRecord | null;
    listUsers(status?: HubUserStatus): HubUserRecord[];
    updateUserActivity(userId: string, ip: string, at?: number): void;
    setClientConnection(conn: ClientHubConnection): void;
    getClientConnection(): ClientHubConnection | null;
    clearClientConnection(): void;
    getClientJoinConfig(): ClientHubJoinConfig | null;
    setClientJoinConfig(config: ClientHubJoinConfig): void;
    clearClientJoinConfig(): void;
    upsertSharedMemory(memory: HubSharedMemoryRecord): void;
    getSharedMemoryBySource(sourceUserId: string, sourceTraceId: string): HubSharedMemoryRecord | null;
    hideSharedMemoryBySource(sourceUserId: string, sourceTraceId: string, deletedAt?: number): void;
    deleteSharedMemoryBySource(sourceUserId: string, sourceTraceId: string): void;
    listSharedMemories(limit?: number): HubSharedMemoryRecord[];
    searchSharedMemories(query: string, limit?: number): HubSharedMemorySearchHit[];
    deleteSharedMemoriesByUser(sourceUserId: string): void;
    purgeExpiredSharedMemories(before?: number): number;
    upsertSharedSkill(skill: HubSharedSkillRecord): void;
    getSharedSkillBySource(sourceUserId: string, sourceSkillId: string): HubSharedSkillRecord | null;
    deleteSharedSkillBySource(sourceUserId: string, sourceSkillId: string): void;
    listSharedSkills(limit?: number): HubSharedSkillRecord[];
    deleteSharedSkillsByUser(sourceUserId: string): void;
    contributionsByUser(): Record<string, {
        memoryCount: number;
        skillCount: number;
    }>;
};
export {};
//# sourceMappingURL=hub.d.ts.map