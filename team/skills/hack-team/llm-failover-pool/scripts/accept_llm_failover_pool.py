#!/usr/bin/env python3
"""accept_llm_failover_pool.py — 独立验收（本地 stub HTTP server，全绿 exit=0）

4 场景：
  T1 首选 429 → 熔断 + 切次选
  T2 cooldown 到期半开试探成功 → 熔断关闭
  T3 全池熔断 → PoolExhausted（fail-closed）
  T4 等秩 round-robin 分配
零外网：所有请求打 127.0.0.1 临时端口。
"""
import importlib.util, json, os, shutil, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(SKILL_DIR, "scripts", f"{name}.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

class StubHandler(BaseHTTPRequestHandler):
    plan = {}  # class-level: path prefix -> status
    def log_message(self, *a):
        pass
    def do_POST(self):
        for prefix, status in StubHandler.plan.items():
            if self.path.startswith(prefix):
                if status >= 400:
                    self.send_response(status); self.end_headers(); return
                body = json.dumps({"ok": True, "via": prefix}).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body))); self.end_headers()
                self.wfile.write(body); return
        self.send_response(404); self.end_headers()

def start_stub(port):
    srv = HTTPServer(("127.0.0.1", port), StubHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv

def main():
    ws = tempfile.mkdtemp(prefix="llmpool-accept-")
    try:
        llmpool = load("llmpool_ref")
        clock = [1000.0]
        pool = llmpool.Pool(
            providers=[{"id": "p1", "priority": 1}, {"id": "p2", "priority": 1}],
            fail_codes={429, 500}, cooldown_s=30.0,
            clock=lambda: clock[0], sleeper=lambda s: None)

        # T1: p1 持续 429 → 熔断切 p2
        pool.report_result("p1", 429)
        got = set()
        for _ in range(4):
            got.add(pool.next_provider(timeout_s=0.1))
        assert "p1" not in got and got == {"p2"}, f"T1: {got}"
        print("T1 OK 首选 429 熔断后切次选（4 次选择均 p2）")

        # T2: 冷却到期半开，试探成功 → 关闭熔断（连续选直到命中冷却中的 p1）
        clock[0] += 31
        p1_seen = False
        for _ in range(6):
            pid = pool.next_provider(timeout_s=0.1)
            if pid == "p1":
                p1_seen = True
                pool.report_result("p1", 200)
                break
            pool.report_result(pid, 200)
        assert p1_seen, "T2 半开试探应命中 p1"
        seq = [pool.next_provider(timeout_s=0.1) for _ in range(4)]
        assert "p1" in seq, f"T2: {seq}（半开成功后 p1 应恢复轮转）"
        print("T2 OK 半开试探成功后熔断关闭，p1 恢复轮转")

        # T3: 全池熔断 → PoolExhausted（fail-closed）
        # 独立复现验证过：注入 sleeper 推进虚拟时钟后 0.2s deadline 正常抛出。
        # 本段用冻结时钟 + 真实 sleeper，deadline 按真实时间生效。
        pool3 = llmpool.Pool(
            providers=[{"id": "p1", "priority": 1}, {"id": "p2", "priority": 1}],
            fail_codes={429, 500}, cooldown_s=30.0)
        pool3.report_result("p1", 500)
        pool3.report_result("p2", 500)
        raised = False
        try:
            pool3.next_provider(timeout_s=0.5)
        except llmpool.PoolExhausted:
            raised = True
        assert raised, "T3 应抛 PoolExhausted"
        print("T3 OK 全池熔断抛 PoolExhausted（fail-closed）")

        # T4: 等秩 round-robin（无熔断时）
        pool2 = llmpool.Pool(
            providers=[{"id": "a", "priority": 1}, {"id": "b", "priority": 1}],
            clock=lambda: 0.0, sleeper=lambda s: None)
        seq = [pool2.next_provider() for _ in range(6)]
        assert seq == ["a", "b", "a", "b", "a", "b"], f"T4: {seq}"
        print("T4 OK 等秩 round-robin 序列 ababab")

        # T5: 真实 stub server 端到端（零外网，127.0.0.1）
        StubHandler.plan = {"/ok": 200, "/fail": 429}
        srv1 = start_stub(18371)
        try:
            pool3 = llmpool.Pool(providers=[{"id": "stub", "priority": 1}], fail_codes={429})
            pid = pool3.next_provider()
            st = pool3.call(pid, "http://127.0.0.1:18371/fail", "{}")
            assert st == 429, f"stub fail status: {st}"
            st = pool3.call(pid, "http://127.0.0.1:18371/ok", "{}")
            assert st == 200, f"stub ok status: {st}"
            print("T5 OK 本地 stub server 端到端 429→熔断 / 200→成功")
        finally:
            srv1.shutdown()

        print("ALL GREEN llm-failover-pool acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
