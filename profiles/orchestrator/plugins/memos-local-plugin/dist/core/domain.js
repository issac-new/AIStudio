/**
 * Task-domain presets. IR-only retrieval/render behaviors are gated on
 * `domain === "ir"` so normal agent sessions stay on the default path.
 */
export function isIrDomain(domain) {
    return domain === "ir";
}
export function effectiveSkillInjectionMode(config) {
    if (!isIrDomain(config.domain))
        return "summary";
    return config.skillInjectionMode ?? "summary";
}
export function effectiveReadOnlyInjectionProfile(config) {
    if (!isIrDomain(config.domain))
        return "all";
    return config.readOnlyInjectionProfile ?? "all";
}
//# sourceMappingURL=domain.js.map