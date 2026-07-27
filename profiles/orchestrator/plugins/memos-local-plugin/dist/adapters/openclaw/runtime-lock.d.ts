import type { ResolvedHome } from "../../core/config/index.js";
export interface OpenClawRuntimeLockOwner {
    pluginId: string;
    version: string;
    pid: number;
    token: string;
    startedAt: number;
    dbFile: string;
    viewerPort: number;
}
export interface OpenClawRuntimeLockHandle {
    lockDir: string;
    owner: OpenClawRuntimeLockOwner;
    release(): void;
}
export interface AcquireOpenClawRuntimeLockOptions {
    home: ResolvedHome;
    pluginId: string;
    version: string;
    viewerPort: number;
    pid?: number;
    now?: () => number;
    unwrittenOwnerStaleMs?: number;
}
export declare class DuplicateOpenClawRuntimeError extends Error {
    readonly code = "duplicate_instance";
    readonly lockDir: string;
    readonly owner: OpenClawRuntimeLockOwner | null;
    constructor(lockDir: string, owner: OpenClawRuntimeLockOwner | null);
}
export declare function openClawRuntimeLockDir(home: ResolvedHome): string;
export declare function acquireOpenClawRuntimeLock(options: AcquireOpenClawRuntimeLockOptions): OpenClawRuntimeLockHandle;
//# sourceMappingURL=runtime-lock.d.ts.map