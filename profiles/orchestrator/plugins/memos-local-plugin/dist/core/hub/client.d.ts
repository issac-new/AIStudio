import type { ResolvedConfig } from "../config/index.js";
import type { Logger } from "../logger/types.js";
import type { ClientHubConnection } from "../storage/repos/hub.js";
type HubRepo = import("../storage/repos/index.js").Repos["hub"];
export interface HubClientStatus {
    connected: boolean;
    hubUrl?: string;
    user: null | Record<string, unknown>;
    error?: string;
}
export declare class PendingApprovalError extends Error {
    readonly userId: string;
    constructor(userId: string);
}
export declare class HubClientRuntime {
    private readonly deps;
    private heartbeatTimer;
    private pendingPollTimer;
    constructor(deps: {
        repo: HubRepo;
        config: ResolvedConfig;
        log: Logger;
    });
    start(): Promise<ClientHubConnection | null>;
    stop(): Promise<void>;
    status(): HubClientStatus;
    refreshStatus(): Promise<HubClientStatus>;
    requestJson<T>(route: string, init?: RequestInit): Promise<T>;
    private connect;
    private refreshActiveUser;
    private checkRegistrationStatus;
    private autoJoin;
    private startHeartbeat;
    private startPendingPoll;
    private stopPendingPoll;
    private markConnectionStatus;
    private rememberJoinConfig;
    private currentUsername;
}
export declare function hubRequestJson<T>(hubUrl: string, userToken: string, route: string, init?: RequestInit): Promise<T>;
export declare function normalizeHubUrl(hubAddress: string): string;
export {};
//# sourceMappingURL=client.d.ts.map