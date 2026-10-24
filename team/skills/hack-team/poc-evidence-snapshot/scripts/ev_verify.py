#!/usr/bin/env python3
"""ev_verify.py — 防篡改校验 + finding 证据清单"""
import argparse, hashlib, json, os, sys

def load_index(root):
    path = os.path.join(root, "index.jsonl")
    if not os.path.exists(path):
        return []
    return [json.loads(l) for l in open(path) if l.strip()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence-root", required=True)
    ap.add_argument("--finding")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    entries = load_index(a.evidence_root)
    if a.finding:
        hits = [e for e in entries if e["finding_id"] == a.finding]
        for e in hits:
            print(f"{e['kind']}: blob {e['blob_sha256'][:12]}… replay={e['replay'] or '-'}")
        print(f"-- {len(hits)} entr(y/ies) for {a.finding}")
        return 0
    if a.all:
        bad = 0
        blob_dir = os.path.join(a.evidence_root, "blobs")
        for e in entries:
            p = os.path.join(blob_dir, e["blob_sha256"])
            if not os.path.exists(p):
                print(f"TAMPER/MISSING: index 引用的 blob 不存在: {e['blob_sha256'][:12]}… (finding={e['finding_id']})")
                bad += 1
                continue
            actual = hashlib.sha256(open(p, "rb").read()).hexdigest()
            if actual != e["blob_sha256"]:
                print(f"TAMPER/DRIFT: sha 漂移 finding={e['finding_id']} expected={e['blob_sha256'][:12]}… actual={actual[:12]}…")
                bad += 1
        # 反向：blobs 目录里有但 index 没引用的孤儿（提示，不算错）
        if bad:
            print(f"FAIL: {bad} 处漂移/缺失", file=sys.stderr)
            return 1
        print(f"OK all {len(entries)} bindings verified, sha256 一致")
        return 0
    print("BLOCKED: 需要 --finding 或 --all", file=sys.stderr)
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
