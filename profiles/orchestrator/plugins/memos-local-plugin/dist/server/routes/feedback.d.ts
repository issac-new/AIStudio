/**
 * Feedback endpoint.
 *
 * Explicit user feedback (thumbs up/down, corrections) from the
 * viewer. Accepts a partial `FeedbackDTO`; the core assigns `id` +
 * `ts` on write.
 */
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerFeedbackRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=feedback.d.ts.map