import type { LlmClient } from "../llm/index.js";
import type { Logger } from "../logger/types.js";
import type { EpisodeId } from "../types.js";
import type { RetrievalQueryExtract } from "./query-builder.js";
export interface RetrievalQueryExtractDeps {
    llm: LlmClient | null;
    log: Logger;
    episodeId?: EpisodeId;
    timeoutMs?: number;
}
export declare function extractRetrievalQueryWithLlm(rawQuery: string, deps: RetrievalQueryExtractDeps): Promise<RetrievalQueryExtract | null>;
//# sourceMappingURL=query-extract.d.ts.map