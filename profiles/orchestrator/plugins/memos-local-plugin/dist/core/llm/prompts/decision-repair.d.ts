import type { PromptDef } from "./index.js";
/**
 * V7 §6.3 — Decision repair.
 *
 * When the same tool has failed N times in a row, we synthesize a PREFERENCE
 * (based on a similar past success) and an ANTI-PATTERN (based on the failing
 * pattern) to inject before the next LLM step.
 */
export declare const DECISION_REPAIR_PROMPT: PromptDef;
//# sourceMappingURL=decision-repair.d.ts.map