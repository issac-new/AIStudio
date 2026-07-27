/**
 * `createRewardEventBus` — mirror of `core/session/events.ts` for the
 * reward pipeline. One bus per reward orchestrator; subscribers get a
 * typed delivery with per-kind and wildcard channels.
 */
import type { RewardEventBus } from "./types.js";
export declare function createRewardEventBus(): RewardEventBus;
//# sourceMappingURL=events.d.ts.map