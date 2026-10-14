#!/usr/bin/env python3
"""ev_snapshot.py — 证据快照入库（SHA-256 内容寻址 + index 绑定）"""
import argparse, hashlib, json, os, shutil, sys, time

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence-root", required=True)
    ap.add_argument("--finding", required=True)
    ap.add_argument("--kind", required=True, choices=["request", "response", "screenshot", "tool-output"])
    ap.add_argument("--file", required=True, help="已采集的证据文件（scope 内）")
    ap.add_argument("--replay", default="", help="复放描述（授权范围内的命令模板/步骤）")
    ap.add_argument("--card", default="")
    a = ap.parse_args()
    if not os.path.isfile(a.file):
        print(f"BLOCKED: evidence file not found: {a.file}", file=sys.stderr)
        return 1
    blob_dir = os.path.join(a.evidence_root, "blobs")
    os.makedirs(blob_dir, exist_ok=True)
    sha = hashlib.sha256(open(a.file, "rb").read()).hexdigest()
    dst = os.path.join(blob_dir, sha)
    if not os.path.exists(dst):
        shutil.copy(a.file, dst)
    entry = {
        "finding_id": a.finding, "blob_sha256": sha, "kind": a.kind,
        "replay": a.replay, "captured_at": int(time.time()), "card_id": a.card,
    }
    with open(os.path.join(a.evidence_root, "index.jsonl"), "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"OK {a.finding} <- blob {sha[:12]}… ({a.kind})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
