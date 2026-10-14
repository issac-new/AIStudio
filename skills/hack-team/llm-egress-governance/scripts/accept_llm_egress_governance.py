#!/usr/bin/env python3
"""accept_llm_egress_governance.py — 独立验收（mktemp 干净环境，全绿 exit=0）

3 次预期判定（fixture 全合成）：
  T1 非白名单 base_url → egress-nonstandard / relay-suspect
  T2 白名单内 → clean
  T3 独立代理交叉 / localhost 豁免
"""
import json, os, shutil, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="egress-accept-")
    try:
        shutil.copy(os.path.join(SKILL_DIR, "scripts", "egress_audit.py"), ws)
        audit = os.path.join(ws, "egress_audit.py")

        p = subprocess.run([sys.executable, audit, "--emit-default-rules"], capture_output=True, text=True)
        assert p.returncode == 0 and "whitelist" in p.stdout
        rules = os.path.join(ws, "rules.json")
        open(rules, "w").write(p.stdout)

        # T1+T2 inventory 判定
        inv = os.path.join(ws, "inv.jsonl")
        with open(inv, "w") as f:
            f.write(json.dumps({"host": "h1", "base_url": "https://relay.example-cdn.com/v1", "proxy": ""}) + "\n")
            f.write(json.dumps({"host": "h2", "base_url": "https://api.openai.com/v1", "proxy": "socks5://127.0.0.1:1080"}) + "\n")
        p = subprocess.run([sys.executable, audit, "--inventory", inv, "--rules", rules],
                           capture_output=True, text=True)
        assert p.returncode == 0, f"inventory audit failed: {p.stderr}"
        res = {json.loads(l)["id"]: json.loads(l) for l in p.stdout.splitlines() if l.strip()}
        assert res["h1"]["verdict"] == "egress-nonstandard", f"T1: {res['h1']}"
        assert res["h2"]["verdict"] == "clean", f"T2: {res['h2']}（白名单+localhost 豁免应判 clean）"
        print("T1 OK 非白名单 base_url 判 egress-nonstandard")
        print("T2 OK 白名单官方 base_url + localhost 代理判 clean")

        # T3 traffic 交叉判定：非白名单域名 + 自定义会话头 + 远端代理 → relay-suspect
        tr = os.path.join(ws, "traffic.jsonl")
        with open(tr, "w") as f:
            f.write(json.dumps({"event_id": "e1", "base_url": "https://relay.example-cdn.com/v1",
                                "proxy": "socks5://198.51.100.7:1080",
                                "extra_headers": ["x-session-key"]}) + "\n")
            f.write(json.dumps({"event_id": "e2", "base_url": "https://api.openai.com/v1",
                                "proxy": "socks5://198.51.100.7:1080"}) + "\n")
        p = subprocess.run([sys.executable, audit, "--traffic", tr, "--rules", rules],
                           capture_output=True, text=True)
        assert p.returncode == 0
        res = {json.loads(l)["id"]: json.loads(l) for l in p.stdout.splitlines() if l.strip()}
        assert res["e1"]["verdict"] == "egress-relay-suspect", f"T3a: {res['e1']}"
        assert res["e2"]["verdict"] == "watch", f"T3b: {res['e2']}（远端代理但域名白名单 → watch）"
        print("T3a OK 非白名单+远端代理+自定义头 三交叉判 egress-relay-suspect")
        print("T3b OK 白名单域名+远端代理 判 watch 不立案（交叉门生效）")
        print("ALL GREEN llm-egress-governance acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
