/**
 * `createCaptureEventBus` — mirror of `core/session/events.ts` for the
 * capture pipeline. One bus per `CaptureRunner`; consumers subscribe and
 * get a typed delivery with per-kind and wildcard channels.
 */
import type { CaptureEventBus } from "./types.js";
export declare function createCaptureEventBus(): CaptureEventBus;
//# sourceMappingURL=events.d.ts.map