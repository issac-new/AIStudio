/**
 * Small shared utilities for repositories. Each repo should be a dumb mapper
 * between `XxxRow` (see `core/types.ts`) and a SQLite row — any algorithm
 * logic belongs outside of storage.
 */
import type { EmbeddingVector } from "../../types.js";
import type { RuntimeNamespace, ShareScope } from "../../../agent-contract/dto.js";
import type { PageOptions, RawRow, TimeRange } from "../types.js";
export declare const repoLog: import("../../index.js").Logger;
export declare function toJsonText(v: unknown): string;
export declare function fromJsonText<T>(raw: unknown, fallback: T): T;
export declare function toBlob(v: EmbeddingVector | null | undefined): Buffer | null;
export declare function fromBlob(v: unknown): EmbeddingVector | null;
export declare function nullable<T>(v: T | undefined): T | null;
export declare function buildPageClauses(opts: PageOptions | undefined, tsColumn: string): string;
export declare function clampLimit(n: number): number;
export declare function timeRangeWhere(range: TimeRange | undefined, column: string): {
    sql: string;
    params: Record<string, number>;
};
/** Merge several fragment clauses into one `WHERE ...` string (or empty). */
export declare function joinWhere(fragments: Array<string | undefined>): string;
export declare function ownerColumns(): string[];
export declare function ownerParamsFromRow(row: {
    ownerAgentKind?: string;
    ownerProfileId?: string;
    ownerWorkspaceId?: string | null;
}): Record<string, unknown>;
export declare function ownerFieldsFromRaw(r: {
    owner_agent_kind?: string | null;
    owner_profile_id?: string | null;
    owner_workspace_id?: string | null;
}): {
    ownerAgentKind: string;
    ownerProfileId: string;
    ownerWorkspaceId: string | null;
};
export declare function defaultOwnerFields(ns?: RuntimeNamespace | null): {
    ownerAgentKind: string;
    ownerProfileId: string;
    ownerWorkspaceId: string | null;
};
export declare function visibilityWhere(ns: RuntimeNamespace, alias?: string): {
    sql: string;
    params: Record<string, unknown>;
};
export declare function normalizeShareForStorage(scope: unknown): ShareScope;
export declare function rowOr<T>(row: RawRow | undefined, map: (r: RawRow) => T): T | null;
//# sourceMappingURL=_helpers.d.ts.map