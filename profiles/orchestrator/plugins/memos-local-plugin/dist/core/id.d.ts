/**
 * Tiny id helpers used throughout the core.
 *
 * We use uuid v7 (time-ordered) for anything that benefits from index locality
 * (traces, episodes, events, logs). For human-readable short ids (skill names,
 * span ids, correlation ids) we use a base32-Crockford 12-char shortid.
 */
export declare function newUuid(): string;
/**
 * Generate a Crockford base32 short id (default 12 chars ≈ 60 bits of entropy).
 * Time-prefixing not applied here — caller decides.
 */
export declare function shortId(len?: number): string;
/** Convenience wrappers so call sites read like prose. */
export declare const ids: {
    readonly trace: () => string;
    readonly episode: () => string;
    readonly session: () => string;
    readonly policy: () => string;
    readonly world: () => string;
    readonly skill: () => string;
    readonly feedback: () => string;
    readonly decisionRepair: () => string;
    readonly span: () => string;
    readonly trace_corr: () => string;
    readonly uuid: typeof newUuid;
};
//# sourceMappingURL=id.d.ts.map