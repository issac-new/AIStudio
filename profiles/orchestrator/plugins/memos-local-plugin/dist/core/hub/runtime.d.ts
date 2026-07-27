import type { PolicyDTO, SkillDTO, TraceDTO, WorldModelDTO } from "../../agent-contract/dto.js";
import type { ResolvedConfig } from "../config/index.js";
import type { Logger } from "../logger/types.js";
import type { HubSharedMemorySearchHit } from "../storage/repos/hub.js";
import type { Repos } from "../storage/repos/index.js";
import type { EmbeddingVector } from "../types.js";
export interface HubAdminPayload {
    enabled: boolean;
    role?: "hub" | "client";
    status?: "disabled" | "starting" | "running" | "pending" | "connected" | "error";
    error?: string;
    url?: string;
    pending?: Array<{
        id: string;
        name: string;
        requestedAt: number;
        groupName?: string;
    }>;
    users?: Array<{
        id: string;
        name: string;
        groupName?: string;
        connected: boolean;
        role?: string;
        status?: string;
        memoryCount?: number;
        skillCount?: number;
    }>;
    groups?: Array<{
        id: string;
        name: string;
        memberCount: number;
    }>;
}
export interface HubRuntime {
    start(): Promise<void>;
    stop(): Promise<void>;
    adminSnapshot(): Promise<HubAdminPayload>;
    approveUser(userId: string): Promise<{
        ok: boolean;
        token?: string;
    }>;
    rejectUser(userId: string): Promise<{
        ok: boolean;
    }>;
    removeUser(userId: string): Promise<{
        ok: boolean;
    }>;
    publishTrace(trace: TraceDTO, embedding?: EmbeddingVector | null): Promise<string | null>;
    unpublishTrace(traceId: string): Promise<void>;
    publishPolicy(policy: PolicyDTO): Promise<string | null>;
    unpublishPolicy(policyId: string): Promise<void>;
    publishWorldModel(world: WorldModelDTO): Promise<string | null>;
    unpublishWorldModel(worldModelId: string): Promise<void>;
    publishSkill(skill: SkillDTO): Promise<string | null>;
    unpublishSkill(skillId: string): Promise<void>;
    searchMemories(query: string, limit?: number): Promise<HubMemorySearchHit[]>;
}
export type HubMemorySearchHit = HubSharedMemorySearchHit;
export declare function createHubRuntime(deps: {
    repos: Repos;
    config: ResolvedConfig;
    log: Logger;
    agent: string;
    version: string;
}): HubRuntime;
//# sourceMappingURL=runtime.d.ts.map