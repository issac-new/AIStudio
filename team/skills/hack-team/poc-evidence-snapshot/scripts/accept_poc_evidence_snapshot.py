#!/usr/bin/env python3
"""accept_poc_evidence_snapshot.py — 独立验收（mktemp 干净环境，全绿 exit=0）

含 2 次预期真实拦截：
  T1 篡改 blob 后 --all 校验抓出 sha 漂移
  T2 悬空绑定（index 引用不存在 blob）被抓出
零攻击内容：全部 fixture 为本地合成文本。
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ws = tempfile.mkdtemp(prefix="ev-accept-")
    try:
        for f in ("ev_snapshot.py", "ev_verify.py"):
            shutil.copy(os.path.join(SKILL_DIR, "scripts", f), ws)
        root = os.path.join(ws, "evidence")
        os.makedirs(root)

        def run(prog, *args):
            return subprocess.run([sys.executable, os.path.join(ws, prog), *args],
                                  capture_output=True, text=True)

        # fixture 证据（合成文本，无真实目标内容）
        f1 = os.path.join(ws, "req.txt");  open(f1, "w").write("GET /api/v1/item/1 HTTP/1.1\nHost: scope-target.example\n")
        f2 = os.path.join(ws, "resp.txt"); open(f2, "w").write("HTTP/1.1 200 OK\n\n{\"id\":1}")

        r = run("ev_snapshot.py", "--evidence-root", root, "--finding", "f-001", "--kind", "request",
                "--file", f1, "--replay", "curl 模板（授权 scope 内）", "--card", "t_x")
        assert r.returncode == 0, f"snap1 failed: {r.stderr}"
        r = run("ev_snapshot.py", "--evidence-root", root, "--finding", "f-001", "--kind", "response",
                "--file", f2, "--card", "t_x")
        assert r.returncode == 0, f"snap2 failed: {r.stderr}"
        r = run("ev_verify.py", "--evidence-root", root, "--all")
        assert r.returncode == 0 and "verified" in r.stdout, f"green verify failed: {r.stderr}"
        print("T0 OK 双证据快照 + 全量校验通过")

        # finding 清单
        r = run("ev_verify.py", "--evidence-root", root, "--finding", "f-001")
        assert r.returncode == 0 and r.stdout.count("blob") == 2
        print("T0 OK finding 清单 2 条")

        # T1 篡改 blob 抓漂移（真实拦截 #1）
        blob_dir = os.path.join(root, "blobs")
        sha1 = [e["blob_sha256"] for e in [json.loads(l) for l in open(os.path.join(root, "index.jsonl"))] if e["kind"] == "request"][0]
        p = os.path.join(blob_dir, sha1)
        orig = open(p).read()
        open(p, "w").write(orig.replace("GET", "GETX"))  # 篡改 1 字节
        r = run("ev_verify.py", "--evidence-root", root, "--all")
        assert r.returncode == 1 and "TAMPER/DRIFT" in r.stdout, "T1 tamper NOT caught"
        print("T1 OK 篡改 blob 后 sha256 漂移被抓 exit=1（真实拦截 #1）")
        open(p, "w").write(orig)  # 还原

        # T2 悬空绑定被抓（真实拦截 #2）
        with open(os.path.join(root, "index.jsonl"), "a") as f:
            f.write(json.dumps({"finding_id": "f-ghost", "blob_sha256": "0" * 64, "kind": "tool-output",
                                "replay": "", "captured_at": 0, "card_id": ""}) + "\n")
        r = run("ev_verify.py", "--evidence-root", root, "--all")
        assert r.returncode == 1 and "MISSING" in r.stdout, "T2 dangling NOT caught"
        print("T2 OK 悬空绑定（不存在 blob）被抓 exit=1（真实拦截 #2）")

        # 还原后再验全绿
        entries = [l for l in open(os.path.join(root, "index.jsonl")) if '"f-ghost"' not in l]
        open(os.path.join(root, "index.jsonl"), "w").writelines(entries)
        r = run("ev_verify.py", "--evidence-root", root, "--all")
        assert r.returncode == 0, "restore-verify failed"
        print("ALL GREEN poc-evidence-snapshot acceptance exit=0")
        return 0
    finally:
        shutil.rmtree(ws, ignore_errors=True)

if __name__ == "__main__":
    raise SystemExit(main())
