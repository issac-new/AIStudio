export declare const STANDALONE_MATH_FINAL_ANSWER_TASK_KIND = "standalone_math_final_answer";
export declare const MATH_FINAL_ANSWER_PROTOCOL_TITLE = "## Standalone math task guardrails";
export declare function isStandaloneMathFinalAnswerTask(text: string | undefined): boolean;
export declare function renderMathFinalAnswerProtocol(text?: string): string;
export declare function mergeMathFinalAnswerProtocol(context: string, text?: string): string;
//# sourceMappingURL=math-task.d.ts.map