/**
 * Retrieval query focus — strip host / eval prompt scaffolding so embed,
 * FTS, and llm_filter target the user's task, not repeated instruction templates.
 */
export type QueryFocusMethod = "passthrough" | "question_section" | "fallback";
export interface QueryFocusResult {
    text: string;
    method: QueryFocusMethod;
}
/**
 * Body after a markdown `## Question` (or `# Question`) heading.
 * Returns null when the heading is missing or the body is empty.
 */
export declare function extractQuestionSection(raw: string): string | null;
/** True when the prompt matches the EvoAgentBench IR eval template shape. */
export declare function isIrEvalPrompt(raw: string): boolean;
/**
 * When the prompt is an IR eval template, keep only the `## Question` body.
 * Otherwise return the raw text unchanged.
 */
export declare function focusIrRetrievalQuery(raw: string): QueryFocusResult;
//# sourceMappingURL=task-focus.d.ts.map