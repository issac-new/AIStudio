/**
 * LLM-assisted feedback refiner.
 *
 * Transforms raw user feedback into actionable guidance, following the same
 * structure as L2 induction (title, trigger, procedure, verification, caveats).
 *
 * This ensures consistency between feedback-derived experiences and L2-induced
 * policies, making them interchangeable in retrieval and injection.
 */
import type { LlmClient } from "../llm/index.js";
import type { TraceRow } from "../types.js";
export interface RefinedGuidance {
    /** Short, actionable title (e.g., "确认排序方向需求"). */
    title: string;
    /** When to apply this guidance (trigger condition). */
    trigger: string;
    /** What to do (actionable procedure). */
    procedure: string;
    /** What to avoid (anti-pattern). */
    caveats: string[];
    /** How to verify correctness. */
    verification: string;
    /** Confidence in this refinement (0-1). */
    confidence: number;
    /** Refinement method: "llm" or "rule". */
    method: "llm" | "rule";
    /** Why we fell back to rules (when method=rule). */
    fallbackReason?: "llm_disabled" | "llm_timeout" | "llm_malformed" | "llm_error";
}
export interface RefineInput {
    /** Raw user feedback text. */
    feedbackText: string;
    /** User's original request (last turn). */
    userRequest?: string;
    /** Agent's response that triggered the feedback (last turn). */
    agentResponse?: string;
    /** Full episode context (first turn + last 3 turns). */
    episodeContext?: string;
    /** Feedback polarity: positive, negative, neutral. */
    polarity: "positive" | "negative" | "neutral";
    /** Trace context (optional). */
    trace?: TraceRow | null;
}
export interface FeedbackRefinerOptions {
    llm?: LlmClient;
    timeoutMs?: number;
    disableLlm?: boolean;
}
export interface FeedbackRefiner {
    refine(input: RefineInput): Promise<RefinedGuidance>;
}
export declare function createFeedbackRefiner(opts?: FeedbackRefinerOptions): FeedbackRefiner;
export declare const FEEDBACK_REFINEMENT_SYSTEM = "You extract actionable guidance from user feedback.\n\nGiven a user's feedback on an agent's response, produce a **procedural policy**\nthat helps the agent avoid the same mistake (or replicate the same success) in\nfuture similar tasks.\n\nCRITICAL REQUIREMENTS:\n\n1. **TRIGGER must be SPECIFIC and CONCRETE**:\n   - \u274C BAD: \"\u5F53\u9047\u5230\u7C7B\u4F3C\u4EFB\u52A1\u65F6\" (too vague, no information)\n   - \u274C BAD: \"When a similar task appears\" (what is \"similar\"?)\n   - \u2705 GOOD: \"\u5F53\u7528\u6237\u8981\u6C42\u5B9E\u73B0\u6392\u5E8F\u7B97\u6CD5\u65F6\" (specific task type)\n   - \u2705 GOOD: \"\u5F53\u7528\u6237\u8981\u6C42\u5B9E\u73B0\u5192\u6CE1\u6392\u5E8F\u65F6\" (even more specific)\n\n   Extract the CONCRETE TASK TYPE from the episode context:\n   - What is the user asking for? (e.g., \"\u5192\u6CE1\u6392\u5E8F\", \"\u6570\u636E\u7B5B\u9009\", \"API\u8C03\u7528\")\n   - What domain? (e.g., \"\u7B97\u6CD5\u5B9E\u73B0\", \"\u6570\u636E\u5904\u7406\", \"\u6587\u4EF6\u64CD\u4F5C\")\n   - What specific feature? (e.g., \"\u6392\u5E8F\u65B9\u5411\", \"\u7B5B\u9009\u6761\u4EF6\", \"\u9519\u8BEF\u5904\u7406\")\n\n2. **PROCEDURE must be ACTIONABLE and CONCISE**:\n   - \u274C BAD: \"\u6839\u636E\u53CD\u9988\u8C03\u6574\" (no specific action)\n   - \u274C BAD: \"\u91C7\u7528\u66FF\u4EE3\u65B9\u6848\" (what alternative?)\n   - \u2705 GOOD: \"\u5B9E\u73B0\u4ECE\u5927\u5230\u5C0F\u7684\u6392\u5E8F\"\n   - \u2705 GOOD: \"\u660E\u786E\u8BE2\u95EE\u7528\u6237\u6392\u5E8F\u65B9\u5411\uFF08\u5347\u5E8F/\u964D\u5E8F\uFF09\"\n\n   Specify CONCRETE STEPS the agent should take. Keep it concise.\n\n3. **CAVEATS must provide SPECIFIC ANTI-PATTERNS** (optional):\n   - \u274C BAD: \"\u907F\u514D\u91CD\u590D\u5F53\u524D\u7684\u9519\u8BEF\" (no information gain)\n   - \u274C BAD: \"\u907F\u514D\u5F53\u524D\u7684\u505A\u6CD5\" (what approach?)\n   - \u2705 GOOD: \"\u4E0D\u8981\u5047\u8BBE\u9ED8\u8BA4\u6392\u5E8F\u65B9\u5411\u4E3A\u5347\u5E8F\"\n   - \u2705 GOOD: \"\u4E0D\u8981\u5728\u672A\u786E\u8BA4\u9700\u6C42\u65F6\u4F7F\u7528 AND \u903B\u8F91\"\n   - \u2705 EMPTY: [] (if no specific anti-pattern can be extracted)\n\n   Extract the SPECIFIC MISTAKE from the feedback. If none, leave empty.\n\n4. **VERIFICATION is OPTIONAL**:\n   - \u274C BAD: \"\u68C0\u67E5\u662F\u5426\u89E3\u51B3\u4E86\u7528\u6237\u6307\u51FA\u7684\u95EE\u9898\" (circular, no information)\n   - \u2705 GOOD: \"\u68C0\u67E5\u751F\u6210\u7684\u4EE3\u7801\u4E2D\u6BD4\u8F83\u8FD0\u7B97\u7B26\u65B9\u5411\uFF08< vs >\uFF09\"\n   - \u2705 EMPTY: \"\" (if no specific verification method exists)\n\n   Only provide verification if there's a CONCRETE, CHECKABLE method.\n   If you can't think of a specific verification step, leave it EMPTY.\n\n5. **SOURCE-SPECIFIC ENTITIES are NOT reusable by default**:\n   - Treat names, locations, product names, file names, one-off requested targets,\n     and single-task acceptance details as source-specific entities.\n   - Abstract them into a reusable category or variable for title, trigger,\n     procedure, caveats, and verification.\n   - Preserve an entity only when the input explicitly marks it as a structured\n     stable fact, such as a user profile fact, workspace/project fact,\n     long-term preference memory, or stable-fact annotation.\n   - Current episode text, tool output, verifier feedback, or one-time task\n     requirements are not enough evidence to call an entity long-term.\n\nIMPORTANT: Focus on TRIGGER + PROCEDURE. These are the core fields.\nCaveats and verification are optional - only fill them if you have specific content.\n\nReturn JSON:\n{\n  \"title\": \"short imperative title\",\n  \"trigger\": \"SPECIFIC task type/domain/feature (NOT '\u7C7B\u4F3C\u4EFB\u52A1')\",\n  \"procedure\": \"CONCRETE actionable steps (NOT '\u6839\u636E\u53CD\u9988\u8C03\u6574')\",\n  \"caveats\": [\"SPECIFIC anti-patterns\"] or [],\n  \"verification\": \"CHECKABLE verification method\" or \"\",\n  \"confidence\": number in [0, 1]\n}";
//# sourceMappingURL=feedback-refiner.d.ts.map