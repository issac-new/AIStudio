export function resolveInjectionProfilePlan(profile) {
    switch (profile) {
        case "experience":
            return {
                wantTier1: false,
                wantTier2: true,
                wantTier3: false,
                experienceOnly: true,
            };
        case "skill":
            return {
                wantTier1: true,
                wantTier2: false,
                wantTier3: false,
            };
        case "skill_experience":
            return {
                wantTier1: true,
                wantTier2: true,
                wantTier3: false,
                experienceOnly: true,
            };
        case "all":
        default:
            return undefined;
    }
}
export function mergeRetrievePlanOverride(...layers) {
    const merged = {};
    for (const layer of layers) {
        if (!layer)
            continue;
        Object.assign(merged, layer);
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
}
//# sourceMappingURL=injection-profile.js.map