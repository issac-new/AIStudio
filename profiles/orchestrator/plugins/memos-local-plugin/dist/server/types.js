/**
 * HTTP server types — public surface.
 *
 * The server wraps a `MemoryCore` and serves:
 *
 *   1. a JSON REST API under /api/v1,
 *   2. a live event stream at /api/v1/events (SSE),
 *   3. a live log stream at /api/v1/logs (SSE),
 *   4. static assets for the viewer.
 *
 * The server is purely a façade — it never talks to the database or
 * any other subsystem directly. All business logic lives in the core;
 * this layer only handles URL routing, serialisation, and transport.
 */
export {};
//# sourceMappingURL=types.js.map