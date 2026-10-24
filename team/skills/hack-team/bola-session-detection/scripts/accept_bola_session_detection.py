#!/usr/bin/env python3
"""accept_bola_session_detection.py — 独立验收（mktemp 干净环境，全绿 exit=0）

含 2 次预期 fixture 命中：
  T1 顺序枚举会话被判 bola-suspect/confirmed
  T2 正常翻页会话（raw 超阈值但去重后不足）不误判
全部 fixture 为本地合成 JSONL，零真实目标。
"""
import json, os, shutil, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="bola-accept-")
    try:
        shutil.copy(os.path.join(SKILL_DIR, "scripts", "bola_analyze.py"), ws)

        def run(*args):
            return subprocess.run([sys.executable, os.path.join(ws, "bola_analyze.py")] + list(args),
                                  capture_output=True, text=True)

        # fixture：攻击会话 A（顺序枚举 1..40 + step=2 段），正常用户 B（翻页同 5 对象 60 次）
        rows = []
        for oid in list(range(1, 31)) + list(range(100, 130, 2)) + list(range(200, 231, 5)):  # 3 条独立顺序段
            rows.append({"session": "s-att", "ua": "tool/1.0", "ip": "10.0.0.1",
                         "path": f"/api/item/{oid}", "obj_id": oid, "user_id": "u-att", "ts": 1000 + oid})
        for uid in ("u1", "u2", "u3"):  # 多身份访问同对象 → cross 特征
            rows.append({"session": f"s-{uid}", "ua": "browser", "ip": "10.0.0.2",
                         "path": "/api/item/7", "obj_id": 7, "user_id": uid, "ts": 2000})
        for i in range(60):  # 正常翻页：raw 60 但仅 5 去重对象
            rows.append({"session": "s-norm", "ua": "browser", "ip": "10.0.0.9",
                         "path": f"/api/page/{i % 5}", "obj_id": i % 5, "user_id": "u-norm", "ts": 3000 + i})
        tf = os.path.join(ws, "traffic.jsonl")
        with open(tf, "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")

        p = run("--traffic", tf, "--min-objects", "30", "--min-sequential", "3")
        assert p.returncode == 0, f"analyze failed: {p.stderr}"
        results = [json.loads(l) for l in p.stdout.splitlines() if l.strip()]
        by_sid = {r["session"]: r for r in results}

        # T1 攻击会话判 suspect 或 confirmed
        a = by_sid.get("s-att")
        assert a and a["verdict"] in ("bola-suspect", "bola-confirmed"), f"T1 attack session verdict: {a}"
        assert a["dedup_obj_count"] >= 30 and a["sequential_runs"] >= 1, f"T1 features: {a}"
        print(f"T1 OK 顺序枚举会话判 {a['verdict']}（dedup={a['dedup_obj_count']}, seq_runs={a['sequential_runs']}, cross={a['cross_user_objects']}）")

        # T2 正常翻页会话不误判（raw=60 超阈值，但 dedup=5）
        b = by_sid.get("s-norm")
        assert b and b["verdict"] == "clean", f"T2 normal session must be clean, got: {b}"
        print(f"T2 OK 正常翻页会话 raw=60 但 dedup={b['dedup_obj_count']} < 30，不误判（真实拦截=dudup 防线生效）")

        # SIEM 伪查询可生成
        p = run("--emit-siem", "--min-objects", "30", "--min-sequential", "3")
        assert p.returncode == 0 and "dedup_obj >= 30" in p.stdout
        print("T3 OK SIEM 伪查询基线可生成")
        print("ALL GREEN bola-session-detection acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
