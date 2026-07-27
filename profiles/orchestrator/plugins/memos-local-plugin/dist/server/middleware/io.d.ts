/**
 * Request-body and response-writing helpers.
 *
 * Keep these minimal — we don't want to accidentally re-implement a
 * web framework. Handlers return plain objects; `writeJson` takes care
 * of stringification + content-type + status.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
export declare function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer>;
export declare function parseJsonBody<T = unknown>(body: Buffer): T;
export declare function writeJson(res: ServerResponse, status: number, payload: unknown): void;
export declare function writeText(res: ServerResponse, status: number, text: string, contentType?: string): void;
export declare function writeNotFound(res: ServerResponse): void;
export declare function writeMethodNotAllowed(res: ServerResponse, method: string): void;
//# sourceMappingURL=io.d.ts.map