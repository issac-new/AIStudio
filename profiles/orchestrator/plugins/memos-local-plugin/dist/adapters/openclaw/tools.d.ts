import type { AgentKind } from "../../agent-contract/dto.js";
import type { MemoryCore } from "../../agent-contract/memory-core.js";
import type { HostLogger, OpenClawPluginApi } from "./openclaw-api.js";
export interface ToolsOptions {
    agent: AgentKind;
    core?: MemoryCore;
    getCore?: () => MemoryCore | null | Promise<MemoryCore | null>;
    log: HostLogger;
    /** Cap on how many characters we return per snippet. */
    maxBodyChars?: number;
}
export declare function registerOpenClawTools(api: OpenClawPluginApi, opts: ToolsOptions): void;
/** Exposed for tests + documentation. */
export declare const TOOL_SCHEMAS: {
    readonly memos_search: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TString;
        maxResults: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
        tier1topK: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
        tier2topK: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
        tier3topK: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
        sessionScope: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>;
    readonly memos_get: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
        kind: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"trace">, import("@sinclair/typebox").TLiteral<"policy">, import("@sinclair/typebox").TLiteral<"world_model">]>>;
    }>;
    readonly memos_timeline: import("@sinclair/typebox").TObject<{
        episodeId: import("@sinclair/typebox").TString;
        limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    }>;
    readonly memos_environment: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    }>;
    readonly memos_skill_list: import("@sinclair/typebox").TObject<{
        status: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"candidate">, import("@sinclair/typebox").TLiteral<"active">, import("@sinclair/typebox").TLiteral<"archived">]>>;
        limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    }>;
    readonly memos_skill_get: import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TString;
    }>;
};
//# sourceMappingURL=tools.d.ts.map