/**
 * Extract the set of tool / command names actually invoked in a batch of
 * traces, using the structured `ToolCallDTO` data rather than regex
 * heuristics on natural-language text.
 *
 * Two levels of extraction:
 *   1. `tc.name` — the tool-level identifier (e.g. "shell", "pip.install").
 *   2. First token of `tc.input` when input is a string — the command-level
 *      identifier for shell-like tools (e.g. "apk" from "apk add openssl-dev").
 */
import type { TraceRow } from "../types.js";
export declare function extractToolNames(traces: readonly TraceRow[]): Set<string>;
//# sourceMappingURL=tool-names.d.ts.map