export declare function normalizeSkillName(raw: string, fallback?: string): string;
export declare function buildStructuredName(input: {
    domain?: string;
    task?: string;
    action?: string;
    fallback?: string;
}): string;
export declare function deriveNameFromText(title: string, hint: string): string;
export declare function uniquifySkillName(base: string, existing: ReadonlySet<string>): string;
//# sourceMappingURL=name.d.ts.map