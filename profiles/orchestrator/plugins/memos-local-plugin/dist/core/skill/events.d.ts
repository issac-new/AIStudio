/**
 * Skill event bus — tiny targeted-vs-wildcard listener dispatcher.
 *
 * Mirrors `core/memory/l2/events.ts` + `core/memory/l3/events.ts` so every
 * business module has the same ergonomics. All errors thrown by listeners
 * are caught and logged on the dedicated channel; no listener can crash
 * the orchestrator.
 */
import type { SkillEventBus } from "./types.js";
export declare function createSkillEventBus(): SkillEventBus;
//# sourceMappingURL=events.d.ts.map