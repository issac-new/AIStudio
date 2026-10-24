#!/usr/bin/env python3
"""mx-mixed-motive.py — 混合动机场景（资源竞标市场）指标器与结算器（2026-10-24 清账批）。

源文口径（银翼AI评测室《多 Agent 群体协作的评测基准设计方法》维度二）：
  群体社会福利总量 W=ΣUᵢ ｜ 基尼系数（效用公平性）｜ 纳什均衡偏离度
  ｜ 成交分布与预算利用。诚实降档（D12）：纳什偏离用相对离差代理（无博弈论
  求解器，等分份额为基准）；全部纯函数、可回放。

子命令：
  settle --bids <bids.jsonl> --out <ledger.jsonl>   竞标→契约结算（最高价者得、
      按份额分配额度；utility=份额×单位价值−出价成本）
  metrics --ledger <ledger.jsonl> --out <report.json>   指标报告
bids.jsonl 每行：{"round":1,"bidder":"unit_a","bid":12,"quota":30}
"""
import argparse
import json
import sys
from collections import defaultdict


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def settle(bids, total_quota, unit_value=2.0):
    """结算：每轮独立——出价高者得（同价先到）；utility=所得份额×单位价值−出价。

    返回 ledger 行（含 won/allocated/utility），纯函数可回放。
    """
    ledger = []
    by_round = defaultdict(list)
    for b in bids:
        by_round[int(b.get("round") or 0)].append(b)
    for rnd in sorted(by_round):
        rows = sorted(by_round[rnd], key=lambda r: (-(float(r.get("bid") or 0)), str(r.get("bidder"))))
        remaining = float(total_quota)
        for r in rows:
            want = float(r.get("quota") or 0)
            got = max(0.0, min(want, remaining))
            pay = float(r.get("bid") or 0) if got > 0 else 0.0
            remaining -= got
            ledger.append({
                "round": rnd,
                "bidder": str(r.get("bidder") or "?"),
                "bid": float(r.get("bid") or 0),
                "quotaAsked": want,
                "allocated": got,
                "won": got > 0,
                "utility": round(got * float(unit_value) - pay, 4),
            })
    return ledger


def gini_of(values):
    """基尼系数（0=绝对公平，1=绝对集中）；空/全零=None。"""
    xs = sorted(float(v) for v in values if float(v) >= 0)
    n = len(xs)
    if n == 0 or sum(xs) <= 0:
        return None
    cum = 0.0
    for i, x in enumerate(xs, 1):
        cum += i * x
    return round((2 * cum) / (n * sum(xs)) - (n + 1) / n, 4)


def metrics_of(ledger):
    """指标报告：welfare/gini/nashDeviation(相对离差代理)/成交与预算面。"""
    utils = defaultdict(float)
    won = defaultdict(int)
    asked = defaultdict(float)
    allocated_total = 0.0
    for row in ledger:
        utils[row["bidder"]] += float(row.get("utility") or 0)
        if row.get("won"):
            won[row["bidder"]] += 1
        asked[row["bidder"]] += float(row.get("quotaAsked") or 0)
        allocated_total += float(row.get("allocated") or 0)
    values = list(utils.values())
    total = sum(values)
    n = len(values)
    mean = total / n if n else 0.0
    rel_dispersion = (sum(abs(v - mean) for v in values) / n / mean) if mean > 0 else None
    rounds = sorted({int(r.get("round") or 0) for r in ledger})
    return {
        "welfare": round(total, 4),
        "gini": gini_of(values),
        "nashDeviation": round(rel_dispersion, 4) if rel_dispersion is not None else None,
        "nashBasis": "relative-dispersion-proxy（等分份额基准；无博弈求解器，D12 诚实降档）",
        "bidders": n,
        "rounds": len(rounds),
        "utilityByBidder": {k: round(v, 4) for k, v in sorted(utils.items())},
        "winsByBidder": dict(sorted(won.items())),
        "allocatedTotal": round(allocated_total, 4),
        "askedTotal": round(sum(asked.values()), 4),
        "budgetUtilization": round(allocated_total / sum(asked.values()), 4) if sum(asked.values()) > 0 else None,
    }


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("settle")
    sp.add_argument("--bids", required=True)
    sp.add_argument("--out", required=True)
    sp.add_argument("--quota", type=float, default=100.0)
    sp.add_argument("--unit-value", type=float, default=2.0)
    mp = sub.add_parser("metrics")
    mp.add_argument("--ledger", required=True)
    mp.add_argument("--out", required=True)
    a = ap.parse_args()

    if a.cmd == "settle":
        bids = load_jsonl(a.bids)
        ledger = settle(bids, a.quota, a.unit_value)
        with open(a.out, "w", encoding="utf-8") as f:
            for row in ledger:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"settle: {len(ledger)} 条契约行 → {a.out}")
        return 0
    ledger = load_jsonl(a.ledger)
    report = metrics_of(ledger)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"metrics: welfare={report['welfare']} gini={report['gini']} "
          f"nashDev={report['nashDeviation']} bidders={report['bidders']} → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
