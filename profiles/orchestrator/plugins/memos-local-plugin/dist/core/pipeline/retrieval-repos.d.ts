/**
 * Adapter between the concrete storage `Repos` and the narrow
 * `RetrievalRepos` surface the retrieval pipeline consumes.
 *
 * Keeping this translation in `core/pipeline/` means the retrieval module
 * stays decoupled from the storage schema — and the pipeline stays the
 * one place where we remember which repo serves which tier.
 */
import type { RetrievalRepos } from "../retrieval/types.js";
import type { Repos } from "../storage/repos/index.js";
import type { RuntimeNamespace } from "../../agent-contract/dto.js";
export declare function wrapRetrievalRepos(repos: Repos, namespace: RuntimeNamespace): RetrievalRepos;
//# sourceMappingURL=retrieval-repos.d.ts.map