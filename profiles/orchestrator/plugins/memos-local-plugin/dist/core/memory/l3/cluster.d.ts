/**
 * Step 1 of the L3 pipeline — **cluster compatible L2 policies**.
 *
 * V7 §2.4.1 says L3 is induced when "multiple policies behind the scenes
 * share the same organising principle". We don't have labels for that
 * principle; we approximate it with two cheap signals:
 *
 *   1. **Domain key**. A stable short string built from the policy's
 *      primary tag (from `policy.trigger` / `procedure`) plus a
 *      normalised tool family. Example: `"docker|pip"`, `"node|npm"`.
 *      Policies that share the same key go into the same bucket.
 *   2. **Vector proximity**. Within a bucket, we compute pairwise
 *      cosine and only keep policies within `clusterMinSimilarity`
 *      of the bucket centroid. Stragglers become their own buckets
 *      (they'll wait for more evidence).
 *
 * No LLM call happens here — this is pure extraction + math.
 */
import type { PolicyRow } from "../../types.js";
import type { L3Config, PolicyCluster, PolicyClusterKey } from "./types.js";
export interface ClusterInput {
    policies: readonly PolicyRow[];
}
export interface ClusterDeps {
    config: Pick<L3Config, "clusterMinSimilarity" | "minPolicies">;
}
export declare function domainKeyOf(policy: PolicyRow): {
    key: PolicyClusterKey;
    tags: string[];
};
/**
 * Split a set of eligible L2 policies into compatible clusters ready for
 * abstraction. Caller is expected to have already filtered by `gain`,
 * `support`, and `status === 'active'` — cluster-time logic doesn't
 * second-guess eligibility.
 */
export declare function clusterPolicies(input: ClusterInput, deps: ClusterDeps): PolicyCluster[];
//# sourceMappingURL=cluster.d.ts.map