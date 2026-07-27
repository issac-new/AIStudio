/**
 * Skill layer endpoints.
 *
 * Skills are the callable top of the memory stack (Phase 11). The
 * viewer uses these to render the skill library and to retire stale
 * skills when a user clicks "archive".
 */
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerSkillRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=skill.d.ts.map