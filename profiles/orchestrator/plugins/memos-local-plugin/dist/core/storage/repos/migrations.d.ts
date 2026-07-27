import type { StorageDb } from "../types.js";
export interface AppliedMigrationRow {
    version: number;
    name: string;
    appliedAt: number;
}
export declare function makeMigrationsRepo(db: StorageDb): {
    listApplied(): AppliedMigrationRow[];
    highestAppliedVersion(): number | null;
};
//# sourceMappingURL=migrations.d.ts.map