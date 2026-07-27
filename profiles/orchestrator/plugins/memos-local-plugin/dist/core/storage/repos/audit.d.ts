/**
 * Database-side audit log. Every write here is also mirrored to the file-based
 * audit.log sink (`core/logger/sinks/audit-log.ts`). Both are kept forever.
 */
import type { PageOptions, StorageDb } from "../types.js";
export interface AuditEventRow {
    id?: number;
    ts: number;
    actor: string;
    kind: string;
    target?: string | null;
    detail?: Record<string, unknown>;
}
export declare function makeAuditRepo(db: StorageDb): {
    append(row: AuditEventRow): number;
    getById(id: number): AuditEventRow | null;
    listKind(kind: string, limit?: number): AuditEventRow[];
    list(opts?: PageOptions): AuditEventRow[];
};
//# sourceMappingURL=audit.d.ts.map