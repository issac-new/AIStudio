/**
 * Route registry — all REST endpoints + SSE streams.
 *
 * Keep this file flat and auditable. Every route is spelled out as
 * `"METHOD /path"`. Handler signatures are:
 *
 *     (ctx) => unknown | Promise<unknown>
 *
 * Returning `undefined` means the handler already wrote the response
 * (e.g. SSE streams). Returning any other value means "serialise as
 * JSON 200".
 *
 * ## Pattern routes
 *
 * Flat `METHOD /path` keys are the default. When a path needs a
 * parameter (e.g. `/api/v1/traces/:id`), register it via
 * `routes.setPattern("METHOD /path/:foo", handler)`. The dispatcher
 * tries exact routes first, then scans patterns in registration
 * order; params land on `ctx.params`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerDeps, ServerOptions } from "../types.js";
export interface RouteContext {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    body: Buffer;
    deps: ServerDeps;
    /** Parsed path params (populated by pattern routes only). */
    params: Record<string, string>;
}
export type RouteHandler = (ctx: RouteContext) => unknown | Promise<unknown>;
/**
 * Dual-storage route map. `setPattern` registers a URL template with
 * `:param` placeholders (matched exact-segment, no regex escaping
 * needed). `set` remains the flat happy path.
 */
export declare class Routes {
    private exact;
    private patterns;
    set(key: string, handler: RouteHandler): void;
    has(key: string): boolean;
    getExact(key: string): RouteHandler | undefined;
    exactKeys(): IterableIterator<string>;
    /**
     * Register a pattern route. `key` looks like
     * `"GET /api/v1/traces/:id"`. The matcher splits on `/`, escapes
     * literal segments, and captures `:name` segments as named params.
     */
    setPattern(key: string, handler: RouteHandler): void;
    matchPattern(method: string, pathname: string): {
        handler: RouteHandler;
        params: Record<string, string>;
    } | null;
    /** All known pathnames (exact + patterns) — used for 405 detection. */
    allPaths(): string[];
    /** Patterns that match a pathname regardless of method (for 405). */
    pathMatches(pathname: string): boolean;
}
export declare function buildRoutes(deps: ServerDeps, options: ServerOptions): Routes;
export declare function parseJson<T = unknown>(ctx: RouteContext): T;
export declare function parseQuery<T = Record<string, string>>(ctx: RouteContext): T;
export declare function writeError(ctx: RouteContext, status: number, code: string, message: string): void;
//# sourceMappingURL=registry.d.ts.map