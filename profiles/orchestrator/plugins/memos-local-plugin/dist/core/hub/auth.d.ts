import type { HubRole, HubUserStatus } from "../storage/repos/hub.js";
export interface UserTokenPayload {
    userId: string;
    username: string;
    role: HubRole;
    status: HubUserStatus;
}
export declare function makeSharedToken(): string;
export declare function issueUserToken(payload: UserTokenPayload, secret: string, ttlMs?: number): string;
export declare function verifyUserToken(token: string, secret: string): UserTokenPayload | null;
//# sourceMappingURL=auth.d.ts.map