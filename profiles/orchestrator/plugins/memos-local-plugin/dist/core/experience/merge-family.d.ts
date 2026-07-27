import type { PolicyRow } from "../types.js";
export type MergeFamily = NonNullable<PolicyRow["mergeFamily"]>;
export declare function deriveMergeFamily(input: Pick<PolicyRow, "experienceType" | "evidencePolarity" | "inducedBy">): MergeFamily;
//# sourceMappingURL=merge-family.d.ts.map