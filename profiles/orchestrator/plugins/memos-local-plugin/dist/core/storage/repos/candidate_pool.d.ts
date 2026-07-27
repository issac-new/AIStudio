import type { CandidatePoolRow, PolicyId } from "../../types.js";
import type { PageOptions, StorageDb } from "../types.js";
export declare function makeCandidatePoolRepo(db: StorageDb): {
    insert(row: CandidatePoolRow): void;
    upsert(row: CandidatePoolRow): void;
    getById(id: string): CandidatePoolRow | null;
    listBySignature(signature: string): CandidatePoolRow[];
    list(opts?: PageOptions): CandidatePoolRow[];
    prune(nowMs: number): number;
    delete(id: string): void;
    promote(id: string, policyId: PolicyId): void;
};
//# sourceMappingURL=candidate_pool.d.ts.map