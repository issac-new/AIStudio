#!/usr/bin/env python3
"""accept_agentic_tool_fingerprint.py — 独立验收（mktemp 干净环境，全绿 exit=0）

3 次预期判定（fixture 全合成，无真实目标）：
  T1 强指纹（自更新 UA）单事件 match-strong
  T2 双弱指纹交叉 match-cross
  T3 单弱指纹 below-threshold（不告警）
"""
import json, os, shutil, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="fp-accept-")
    try:
        shutil.copy(os.path.join(SKILL_DIR, "scripts", "fp_match.py"), ws)
        ev = os.path.join(ws, "events.jsonl")
        with open(ev, "w") as f:
            f.write(json.dumps({"event_id": "e1", "ua": "artex-selfupdate/1.0", "port": 443}) + "\n")
            f.write(json.dumps({"event_id": "e2", "ua": "curl/8.4", "port": 8787,
                                "header_names": ["x-session-key", "accept"]}) + "\n")
            f.write(json.dumps({"event_id": "e3", "ua": "curl/8.4", "port": 8787}) + "\n")
            f.write(json.dumps({"event_id": "e4", "ua": "Mozilla/5.0", "port": 443, "title": "Home"}) + "\n")

        p = subprocess.run([sys.executable, os.path.join(ws, "fp_match.py"), "--events", ev],
                           capture_output=True, text=True)
        assert p.returncode == 0, f"match failed: {p.stderr}"
        results = {}
        for line in p.stdout.splitlines():
            r = json.loads(line)
            results[r["event"]] = r

        assert results["e1"]["verdict"] == "match-strong" and "selfupdate_ua" in results["e1"]["hits"], f"T1: {results['e1']}"
        print("T1 OK 强指纹自更新 UA 单命中 match-strong")

        assert results["e2"]["verdict"] == "match-cross" and set(results["e2"]["hits"]) == {"default_ports", "custom_session_header"}, f"T2: {results['e2']}"
        print("T2 OK 双弱指纹（端口对+自定义会话头）交叉 match-cross")

        assert results["e3"]["verdict"] == "below-threshold", f"T3: {results['e3']}"
        print("T3 OK 单弱指纹仅端口 below-threshold 不放行（真实拦截=交叉门生效）")

        assert results["e4"]["verdict"] == "clean", f"T4: {results['e4']}"
        print("T4 OK 无关事件 clean")
        print("ALL GREEN agentic-tool-fingerprint acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
