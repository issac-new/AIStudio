/**
 * HTTP server entry point.
 *
 * Built on the Node standard library's `http` module — no framework. We
 * pay the small cost of writing a router by hand to keep the surface
 * area tiny, which in turn lets us guarantee the security properties
 * spelled out in `ALGORITHMS.md` (loopback default, API-key gating,
 * static-root escape prevention, etc.).
 *
 * ## Single-agent URL layout
 *
 * Each agent runs its own viewer on its own port:
 *
 *   - openclaw → :18799
 *   - hermes   → :18800
 *
 * The server hosts the SPA at `/`, the JSON REST API at `/api/v1/*`,
 * and the static viewer assets. There are no `/openclaw/*` /
 * `/hermes/*` URL prefixes — clients always talk to the agent's own
 * port. If both agents are installed, the root path renders a small
 * picker page that links to the *other* agent's URL (external link,
 * no reverse proxy, no peer cores).
 */
import type { ServerDeps, ServerHandle, ServerOptions } from "./types.js";
export declare function startHttpServer(deps: ServerDeps, options?: ServerOptions): Promise<ServerHandle>;
//# sourceMappingURL=http.d.ts.map