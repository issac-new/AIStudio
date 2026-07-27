import type { AgentKind, RuntimeNamespace, ShareScope } from "../../agent-contract/dto.js";
export declare const DEFAULT_PROFILE_ID = "default";
export interface OwnerFields {
    ownerAgentKind: AgentKind;
    ownerProfileId: string;
    ownerWorkspaceId: string | null;
}
export interface VisibilityWhere {
    sql: string;
    params: Record<string, unknown>;
}
export declare function normalizeNamespace(input: Partial<RuntimeNamespace> | null | undefined, fallbackAgent?: AgentKind): RuntimeNamespace;
export declare function namespaceFromHints(agent: AgentKind, hints?: Record<string, unknown> | null, fallback?: RuntimeNamespace): RuntimeNamespace;
export declare function ownerFromNamespace(ns: RuntimeNamespace): OwnerFields;
export declare function ownerParams(ns: RuntimeNamespace, prefix?: string): Record<string, unknown>;
export declare function normalizeShareScope(scope: unknown): ShareScope;
export declare function visibilityWhere(ns: RuntimeNamespace | null | undefined, alias?: string): VisibilityWhere;
export declare function ownerWhere(ns: RuntimeNamespace | null | undefined, alias?: string): VisibilityWhere;
export declare function isVisibleTo(row: {
    ownerAgentKind?: AgentKind;
    ownerProfileId?: string;
    share?: {
        scope?: ShareScope | string | null;
    } | null;
}, ns: RuntimeNamespace): boolean;
export declare function namespaceMeta(ns: RuntimeNamespace): Record<string, unknown>;
//# sourceMappingURL=namespace.d.ts.map