#!/usr/bin/env python3
"""accept_asset_topology_graph.py — 独立验收脚本（mktemp 干净环境实跑，全绿 exit=0）

含 2 次预期真实拦截：
  T1 重复资产变体（大小写/尾点/前导零 IP）被唯一索引+归一化合并
  T2 状态机拦截终态复活（dead_end -> supported 必须 exit=1）
"""
import json, os, shutil, sqlite3, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="kb-accept-")
    try:
        for f in ("kb_bootstrap.py", "kb_ingest.py", "kb_export.py"):
            shutil.copy(os.path.join(SKILL_DIR, "scripts", f), ws)
        db = os.path.join(ws, "kb.sqlite")

        def run(*args):
            return subprocess.run([sys.executable] + [os.path.join(ws, a) if a.endswith(".py") else a for a in args],
                                  capture_output=True, text=True)

        # 1) bootstrap
        r = run("kb_bootstrap.py", "--engagement", "demo", "--db", db)
        assert r.returncode == 0, f"bootstrap failed: {r.stderr}"
        print("T0 OK bootstrap exit=0")

        # 2) T1 重复资产拦截（真实拦截 #1）
        f1 = os.path.join(ws, "f1.json")
        json.dump({"engagement": "demo", "assets": [
            {"asset_type": "domain", "value": "API.Example.COM."},
            {"asset_type": "domain", "value": "api.example.com"},
            {"asset_type": "host", "value": "010.0.0.07"},
            {"asset_type": "host", "value": "10.0.0.7"},
        ]}, open(f1, "w"))
        r = run("kb_ingest.py", "--db", db, "--card", "t_demo1", "--findings", f1)
        assert r.returncode == 0, f"ingest failed: {r.stderr}"
        c = sqlite3.connect(db)
        assert c.execute("SELECT COUNT(*) FROM asset_topology WHERE asset_type='domain'").fetchone()[0] == 1, "T1 domain dedup FAILED"
        assert c.execute("SELECT COUNT(*) FROM asset_topology WHERE asset_type='host'").fetchone()[0] == 1, "T1 host dedup FAILED"
        assert c.execute("SELECT value FROM asset_topology WHERE asset_type='host'").fetchone()[0] == "10.0.0.7", "T1 IP normalize FAILED"
        c.close()
        print("T1 OK 重复资产变体被唯一索引归并（真实拦截 #1）")

        # 3) T2 状态机拦截终态复活（真实拦截 #2）
        f2 = os.path.join(ws, "f2.json")
        json.dump({"engagement": "demo", "nodes": [{"claim": "endpoint exists", "status": "open"}]}, open(f2, "w"))
        r = run("kb_ingest.py", "--db", db, "--card", "t_demo2", "--findings", f2)
        assert r.returncode == 0, f"node ingest failed: {r.stderr}"
        c = sqlite3.connect(db)
        rid = c.execute("SELECT id FROM reasoning_lineage LIMIT 1").fetchone()[0]
        st = c.execute("SELECT status FROM reasoning_lineage WHERE id=?", (rid,)).fetchone()[0]
        assert st == "open", f"node should be open, got {st}"
        c.close()
        r = run("kb_ingest.py", "--db", db, "--card", "t_demo2", "--transition", f"{rid}:dead_end")
        assert r.returncode == 0, f"open->dead_end should be legal: {r.stderr}"
        r = run("kb_ingest.py", "--db", db, "--card", "t_demo2", "--transition", f"{rid}:supported")
        assert r.returncode == 1 and "BLOCKED" in (r.stderr + r.stdout), "T2 terminal-revive NOT blocked"
        print("T2 OK dead_end 终态复活被状态机拒绝 exit=1（真实拦截 #2）")

        # 4) export
        r = run("kb_export.py", "--db", db, "--engagement", "demo", "--format", "md")
        assert r.returncode == 0 and "资产拓扑" in r.stdout, f"export failed: {r.stderr}"
        print("T3 OK 导出摘要可读")
        print("ALL GREEN asset-topology-graph acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
