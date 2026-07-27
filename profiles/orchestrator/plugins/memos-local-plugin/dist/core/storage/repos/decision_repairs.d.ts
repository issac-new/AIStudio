import type { DecisionRepairRow } from "../../types.js";
import type { PageOptions, StorageDb } from "../types.js";
export declare function makeDecisionRepairsRepo(db: StorageDb): {
    insert(row: DecisionRepairRow): void;
    getById(id: string): DecisionRepairRow | null;
    recentForContext(contextHash: string): DecisionRepairRow[];
    markValidated(id: string): void;
    list(opts?: PageOptions): DecisionRepairRow[];
};
//# sourceMappingURL=decision_repairs.d.ts.map