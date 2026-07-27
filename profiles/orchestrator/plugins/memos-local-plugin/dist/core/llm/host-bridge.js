/**
 * `HostLlmBridge` is the adapter-injected escape hatch for "use the host
 * agent's LLM." OpenClaw has one via its sharing API; Hermes typically does
 * not.
 *
 * The bridge is intentionally simple: one `complete(prompt, opts)` entry
 * point. Streaming is deliberately not supported — hosts usually don't
 * expose streaming over their sharing APIs, and our streaming call sites
 * only ever target the primary provider.
 */
// Module-scoped singleton: adapter registers once at startup, core reads it.
let currentBridge = null;
export function registerHostLlmBridge(bridge) {
    currentBridge = bridge;
}
export function getHostLlmBridge() {
    return currentBridge;
}
/** Clear on shutdown / test teardown. */
export function __resetHostLlmBridgeForTests() {
    currentBridge = null;
}
//# sourceMappingURL=host-bridge.js.map