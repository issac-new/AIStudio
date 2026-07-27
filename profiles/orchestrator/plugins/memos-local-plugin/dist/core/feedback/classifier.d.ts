/**
 * V7 §2.4.3 + §2.4.6 — classify a raw user feedback string into one of
 * eight shapes. The output drives whether the repair orchestrator needs
 * to run and what fields it can extract.
 *
 * We keep this deterministic + rule-based first. The feedback pipeline
 * must run in degraded mode (no LLM, no network) and tests must stay
 * trivially stable.
 *
 * Priority order (first hit wins):
 *
 *   1. `preference`  — explicit "use X instead of Y" / 用 X 代替 Y / ...
 *   2. `correction`  — "it should be X, not Y" / "应该是 X 不是 Y"
 *   3. `constraint`  — "also make sure N" / "还要 …" / "must keep …"
 *   4. `negative`    — blanket rejection ("wrong", "不对", "no")
 *   5. `positive`    — clear approval
 *   6. `confusion`   — user didn't understand ("what do you mean?" / "???")
 *   7. `instruction` — imperative next step
 *   8. `unknown`     — no signal
 */
import type { ClassifiedFeedback, UserFeedbackShape } from "./types.js";
export interface ClassifierOptions {
    /** Language hints are advisory; the classifier handles mixed text. */
    locales?: readonly ("en" | "zh")[];
}
export declare function classifyFeedback(raw: string, opts?: ClassifierOptions): ClassifiedFeedback;
export type { UserFeedbackShape };
//# sourceMappingURL=classifier.d.ts.map