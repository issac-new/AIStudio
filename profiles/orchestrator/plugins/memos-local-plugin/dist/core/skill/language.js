import { detectDominantLanguage } from "../llm/prompts/index.js";
export function resolveSkillOutputLanguage(policy, config) {
    const mode = config.outputLanguageMode ?? "follow_policy";
    if (mode === "zh" || mode === "en")
        return mode;
    const detected = detectDominantLanguage([
        policy.title,
        policy.trigger,
        policy.procedure,
        policy.boundary,
    ]);
    return detected === "zh" ? "zh" : "en";
}
//# sourceMappingURL=language.js.map