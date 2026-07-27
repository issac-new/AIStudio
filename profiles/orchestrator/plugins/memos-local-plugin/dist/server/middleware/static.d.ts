/**
 * Static-asset middleware.
 *
 * Serves the built viewer bundle from a configured directory.
 * Directory traversal is blocked by resolving every request path
 * against the root and verifying containment.
 *
 * Content-Type is derived from the file extension — we keep a small
 * hard-coded MIME map instead of shelling out to `mime-types`.
 */
import type { ServerResponse } from "node:http";
import type { ServerOptions } from "../types.js";
export declare function serveStatic(res: ServerResponse, pathname: string, opts: ServerOptions): Promise<boolean>;
//# sourceMappingURL=static.d.ts.map