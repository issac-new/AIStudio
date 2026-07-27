/**
 * Live event stream (SSE).
 *
 * `GET /api/v1/events` returns a `text/event-stream` connection that
 * emits every `CoreEvent` the algorithm core produces. Each message
 * is a single `data:` line containing the JSON-serialised event.
 *
 * Clients reconnect with `Last-Event-ID`; the event type and id map
 * to the `CoreEvent.kind` + `CoreEvent.id` fields, letting a simple
 * JavaScript `EventSource` fan events out to typed listeners.
 */
import type { ServerDeps } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerEventsRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=events.d.ts.map