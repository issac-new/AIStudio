#!/usr/bin/env python3
"""ft_add.py — 失败尝试入库（强制「因为<根因>」子句）"""
import argparse, hashlib, json, os, re, sys, time

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", required=True)
    ap.add_argument("--card", required=True)
    ap.add_argument("--engagement", required=True)
    ap.add_argument("--category", required=True,
                    choices=["dead-end", "blocked", "timeout", "invalid-assumption", "tool-failure"])
    ap.add_argument("--claim", required=True)
    ap.add_argument("--context", default="")
    ap.add_argument("--evidence-ref", default="")
    a = ap.parse_args()
    # 机械门：claim 必须含「因为」或 "because" 根因子句
    if not re.search(r"因为|because", a.claim, re.IGNORECASE):
        print("BLOCKED: claim 必须含根因子句（'因为 ...' / 'because ...'）——无根因的死路条目禁止入库", file=sys.stderr)
        return 1
    fid = "fail-" + hashlib.sha1(f"{a.card}:{a.claim}".encode()).hexdigest()[:8]
    entry = {
        "id": fid, "card_id": a.card, "engagement": a.engagement,
        "category": a.category, "claim": a.claim, "context": a.context,
        "evidence_ref": a.evidence_ref, "created_at": int(time.time()),
    }
    with open(a.ledger, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"OK {fid} -> {a.ledger}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
