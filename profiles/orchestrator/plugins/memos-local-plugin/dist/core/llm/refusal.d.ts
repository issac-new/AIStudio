/**
 * Lightweight refusal detector for model outputs that should never be
 * persisted as learned memory. Providers may expose structured refusal
 * signals, but our JSON facade only sees text at many call sites.
 */
export interface ModelRefusalMatch {
    matchedPrefix: string;
    content: string;
}
export declare function detectModelRefusal(value: unknown): ModelRefusalMatch | null;
export declare function detectModelRefusalText(text: string): ModelRefusalMatch | null;
//# sourceMappingURL=refusal.d.ts.map