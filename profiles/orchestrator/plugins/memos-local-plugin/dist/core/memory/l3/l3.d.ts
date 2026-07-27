/**
 * `runL3` — cross-task world-model abstraction.
 *
 * The orchestrator follows the V7 §2.4.1 recipe:
 *
 *   1. **Gather eligible L2 policies** (status = active, gain ≥ minGain,
 *      support ≥ minSupport) and split them into compatible clusters
 *      via `clusterPolicies` (domain key + centroid proximity).
 *   2. **Cooldown check**: skip clusters whose primary tag was abstracted
 *      recently — controlled by `algorithm.l3Abstraction.cooldownDays`.
 *   3. **Abstract** each surviving cluster with the `l3.abstraction`
 *      prompt (see `abstract.ts`).
 *   4. **Merge or create**: compare the draft against existing WMs that
 *      share a domain tag (see `merge.ts`). Above the similarity cutoff
 *      we update the existing row; otherwise we insert a new WM.
 *   5. **Persist evidence** — every WM row carries its source policies
 *      and source episodes so Tier-3 retrieval can trace WMs back to the
 *      L1/L2 rows that minted them.
 *
 * Pure pipeline: takes `deps` (repos, llm, log, bus) and returns a
 * `L3ProcessResult`. No globals.
 */
import type { Logger } from "../../logger/types.js";
import type { LlmClient } from "../../llm/index.js";
import type { Repos } from "../../storage/repos/index.js";
import type { WorldModelId } from "../../types.js";
import type { L3Config, L3EventBus, L3ProcessInput, L3ProcessResult } from "./types.js";
export interface RunL3Deps {
    repos: Pick<Repos, "embeddingRetryQueue" | "policies" | "traces" | "worldModel" | "kv">;
    llm: LlmClient | null;
    log: Logger;
    bus?: L3EventBus;
    config: L3Config;
}
export declare function runL3(input: L3ProcessInput, deps: RunL3Deps): Promise<L3ProcessResult>;
export declare function adjustConfidence(worldModelId: WorldModelId, polarity: "positive" | "negative", deps: Pick<RunL3Deps, "repos" | "config" | "log" | "bus">, now?: number): {
    previous: number;
    next: number;
} | null;
//# sourceMappingURL=l3.d.ts.map