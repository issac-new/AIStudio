#!/usr/bin/env python3
"""Canary MCP upstream for CVE-2026-59822 reproduction (framework ENV step).

Minimal Streamable-HTTP MCP server, ONE canary tool, logs every HTTP request
(proxy->upstream) into REQUEST_LOG.json so the data flow is provable at the
wire level. Port 9999/mcp.
"""
import json, os, threading, time
from mcp.server.fastmcp import FastMCP

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "REQUEST_LOG.json")
_lock = threading.Lock()

def _record(entry):
    with _lock:
        rows = []
        if os.path.exists(LOG_PATH):
            try: rows = json.load(open(LOG_PATH))
            except Exception: rows = []
        rows.append(entry)
        json.dump(rows, open(LOG_PATH, "w"), indent=2)

mcp = FastMCP("canary-mcp", host="127.0.0.1", port=9999)

@mcp.tool()
def canary_read_secret() -> str:
    """Canary: proves MCP tool execution reachable."""
    return "CANARY_TOOL_EXECUTED uid=canary"

@mcp.tool()
def ping() -> str:
    return "pong"

if __name__ == "__main__":
    app = mcp.streamable_http_app()
    async def logging_app(scope, receive, send):
        if scope["type"] == "http":
            body = b""
            while True:
                msg = await receive(); body += msg.get("body", b"")
                if not msg.get("more_body"): break
            _record({"ts": time.time(), "path": scope.get("path"),
                     "method": scope.get("method"),
                     "headers": {k.decode(): v.decode() for k, v in scope.get("headers", [])},
                     "body": body.decode("utf-8", "replace")[:4000]})
        await app(scope, receive, send)
    import uvicorn
    uvicorn.run(logging_app, host="127.0.0.1", port=9999, log_level="warning")
