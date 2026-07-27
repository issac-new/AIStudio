import type { PolicyRow } from "../types.js";
import type { SkillConfig } from "./types.js";
export type SkillOutputLanguage = "zh" | "en";
export declare function resolveSkillOutputLanguage(policy: Pick<PolicyRow, "title" | "trigger" | "procedure" | "boundary">, config: Pick<SkillConfig, "outputLanguageMode">): SkillOutputLanguage;
//# sourceMappingURL=language.d.ts.map