/**
 * API-key gate.
 *
 * The server listens on loopback by default, so anyone on the local
 * machine can hit it regardless. In cross-machine / multi-user
 * scenarios the host sets `apiKey` — which this middleware enforces
 * on every `/api/*` request.
 *
 * Clients can supply the key via either `Authorization: Bearer …` or
 * `x-api-key` header. 401 is returned for missing/wrong keys; we do
 * NOT 403 because that would leak whether the resource exists.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
export declare function enforceApiKey(req: IncomingMessage, res: ServerResponse, apiKey: string): boolean;
//# sourceMappingURL=auth.d.ts.map