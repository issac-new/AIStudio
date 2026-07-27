/**
 * Read-only eval injection scopes. `all` keeps the normal tool_driven tier
 * mix; other profiles override which tiers are retrieved before prompt.
 */
export type ReadOnlyInjectionProfile = "all" | "experience" | "skill" | "skill_experience";
export interface InjectionProfilePlan {
    scenarioId?: string;
    wantTier1?: boolean;
    wantTier2?: boolean;
    wantTier3?: boolean;
    experienceOnly?: boolean;
    limit?: number;
}
export declare function resolveInjectionProfilePlan(profile: ReadOnlyInjectionProfile | undefined): InjectionProfilePlan | undefined;
export declare function mergeRetrievePlanOverride(...layers: Array<InjectionProfilePlan | undefined>): InjectionProfilePlan | undefined;
//# sourceMappingURL=injection-profile.d.ts.map