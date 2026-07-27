import type { ResolvedConfig } from "../config/index.js";
import type { Logger } from "../logger/types.js";
import type { HubRole, HubSharedMemoryRecord, HubSharedMemorySearchHit, HubSharedSkillRecord, HubUserRecord } from "../storage/repos/hub.js";
type HubRepo = import("../storage/repos/index.js").Repos["hub"];
type HubSharedMemoryInput = Omit<HubSharedMemoryRecord, "id" | "sourceUserId" | "visible" | "deletedAt" | "createdAt" | "updatedAt">;
export interface HubServerSnapshot {
    url: string;
    port: number;
    hubInstanceId: string;
    ownerUserId: string;
    ownerToken: string;
}
export interface AuthenticatedHubUser {
    userId: string;
    username: string;
    role: HubRole;
}
export declare class HubServerRuntime {
    private readonly deps;
    private server;
    private actualPort;
    private authState;
    private owner;
    constructor(deps: {
        repo: HubRepo;
        config: ResolvedConfig;
        log: Logger;
        version: string;
    });
    start(): Promise<HubServerSnapshot>;
    stop(): Promise<void>;
    snapshot(): HubServerSnapshot;
    get hubInstanceId(): string;
    get ownerUserId(): string;
    get ownerToken(): string;
    approveUser(userId: string): {
        token: string;
        user: HubUserRecord;
    } | null;
    rejectUser(userId: string): HubUserRecord | null;
    removeUser(userId: string): HubUserRecord | null;
    publishMemoryAsOwner(input: HubSharedMemoryInput): HubSharedMemoryRecord;
    searchMemories(query: string, limit?: number): HubSharedMemorySearchHit[];
    unpublishMemoryAsOwner(sourceTraceId: string): void;
    publishSkillAsOwner(input: Omit<HubSharedSkillRecord, "id" | "sourceUserId" | "createdAt" | "updatedAt">): HubSharedSkillRecord;
    unpublishSkillAsOwner(sourceSkillId: string): void;
    private handle;
    private handleJoin;
    private respondExistingJoin;
    private findUserByUsername;
    private authenticate;
    private publishMemoryForUser;
    private pruneExpiredSharedMemories;
    private publishSkillForUser;
    private ensureBootstrapAdmin;
    private issueToken;
    private loadAuthState;
    private saveAuthState;
    private get configuredPort();
    private get teamName();
    private get teamToken();
    private readJson;
    private json;
}
export {};
//# sourceMappingURL=server.d.ts.map