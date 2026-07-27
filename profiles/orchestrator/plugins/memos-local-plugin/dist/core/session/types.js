/**
 * Session & Episode contracts.
 *
 * Vocabulary (matches V7 §3.1):
 *
 *   - **Session** — a long-lived logical connection to an agent. Usually
 *     opened when the adapter starts and closed on process shutdown. All
 *     episodes that belong to the same "running agent" share one session.
 *
 *   - **Episode** — one user query (plus the agent's full response arc,
 *     including tool calls and nested sub-agents). ONE episode per turn.
 *     The episode transitions through: open → turns-added → finalized
 *     (or abandoned).
 *
 *   - **Turn** — an individual message inside the episode. The first turn
 *     is always the user's query; later turns can be assistant text,
 *     tool-call observations, or sub-agent hops.
 *
 * Intent classification runs AS THE EPISODE OPENS and governs which
 * retrieval tiers (Tier 1/2/3) the orchestrator will fire.
 */
export {};
//# sourceMappingURL=types.js.map