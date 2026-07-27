/**
 * Helpers for LLM-derived display text.
 *
 * Raw turns stay intact for audit/replay. These helpers are for structured
 * memory artifacts that the LLM synthesizes and that we later display or
 * inject back into model context.
 */
export declare function sanitizeDerivedText(value: unknown): string;
export declare function sanitizeDerivedMarkdown(value: unknown): string;
export declare function sanitizeDerivedList(values: readonly unknown[]): string[];
export declare function sanitizeDerivedMarkdownList(values: readonly unknown[]): string[];
export declare function stripDangerousMarkdownLinks(text: string): string;
export declare function isSafeLinkTarget(raw: string): boolean;
//# sourceMappingURL=content.d.ts.map