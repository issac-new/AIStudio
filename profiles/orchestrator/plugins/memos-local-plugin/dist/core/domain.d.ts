/**
 * Task-domain presets. IR-only retrieval/render behaviors are gated on
 * `domain === "ir"` so normal agent sessions stay on the default path.
 */
export type MemosDomain = "" | "ir";
export declare function isIrDomain(domain: string | undefined | null): domain is "ir";
export declare function effectiveSkillInjectionMode(config: {
    domain?: string;
    skillInjectionMode?: "summary" | "full";
}): "summary" | "full";
export declare function effectiveReadOnlyInjectionProfile(config: {
    domain?: string;
    readOnlyInjectionProfile?: "all" | "experience" | "skill" | "skill_experience";
}): "all" | "experience" | "skill" | "skill_experience";
//# sourceMappingURL=domain.d.ts.map