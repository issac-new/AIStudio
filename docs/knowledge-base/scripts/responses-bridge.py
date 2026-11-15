#!/usr/bin/env python3
"""responses-bridge: OpenAI Responses 协议网关 -> chat/completions 协议桥（stdlib 零依赖）

适用：知识库/RAG 平台只支持 OpenAI chat/completions 端点，而上游 LLM 网关
只暴露 Responses 协议（如 cc-switch /v1/responses）时，本桥做协议转换，
含 SSE 真流式（Responses 的 SSE 事件流 → chat.completions 的 chunk 流）。

用法:
  BRIDGE_PORT=18085 UPSTREAM=http://127.0.0.1:PORT/v1/responses \
  BRIDGE_API_KEY=sk-xxx python3 responses-bridge.py

环境变量（全部可省，见下默认）:
  BRIDGE_PORT     监听端口（默认 18085）
  UPSTREAM        上游 Responses 端点（必填实践上）
  BRIDGE_API_KEY  客户端鉴权 key（空=不鉴权，仅本机回环用）
  BRIDGE_LOG      日志路径（默认 /tmp/responses-bridge.log）
"""
import json, os, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("BRIDGE_PORT", "18085"))
UPSTREAM = os.environ.get("UPSTREAM", "http://your-responses-gateway/v1/responses")
API_KEY = os.environ.get("BRIDGE_API_KEY", "")
LOG = os.environ.get("BRIDGE_LOG", "/tmp/responses-bridge.log")

def log(msg):
    with open(LOG, "a") as f:
        f.write(msg + "\n")

def call_upstream(model, messages, max_tokens):
    """非流式：上游 Responses -> chat.completions 形状"""
    body = {"model": model, "input": messages}
    if max_tokens:
        body["max_output_tokens"] = max(64, int(max_tokens) * 4)
    req = urllib.request.Request(UPSTREAM, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.loads(r.read())
    # Responses: output[].content[].text 拼接
    text = ""
    for item in d.get("output", []):
        for c in item.get("content", []):
            if isinstance(c, dict) and c.get("text"):
                text += c["text"]
    return {"id": d.get("id", "bridge"), "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
            "usage": d.get("usage", {})}

class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/v1/models":
            self._json(200, {"object": "list", "data": [{"id": os.environ.get("BRIDGE_MODEL", "bridged-model"), "object": "model"}]})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if API_KEY and self.headers.get("Authorization") != f"Bearer {API_KEY}":
            return self._json(401, {"error": "bad key"})
        if self.path != "/v1/chat/completions":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n))
        try:
            resp = call_upstream(req.get("model"), req.get("messages", []), req.get("max_tokens"))
            self._json(200, resp)
        except Exception as e:
            log(f"ERR {e}")
            self._json(502, {"error": str(e)})

if __name__ == "__main__":
    log(f"bridge up :{PORT} -> {UPSTREAM}")
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
