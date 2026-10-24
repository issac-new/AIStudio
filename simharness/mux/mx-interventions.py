#!/usr/bin/env python3
"""mx-interventions：推演 run 介入归因账本（2026-10-23，天猫吸收轮联动批）。

解析单 run 的 evidence/compensation-ledger.tsv + release-gate.jsonl +
uat-verdicts.jsonl，输出「人插手记录」读数：六类打标 + 排活/干活两层分账 +
风险信号 + 协作成熟度读数。口径与 overlay delivery 域同源（spec
2026-10-23-tmall-digital-worker-absorption.md D1-D3/D7/D17；simharness 不
import overlay，两侧对账以 spec 为准）。

用法：
  mx-interventions.py --run 20261021-v8-run22 [--json] [--root <SIM_ROOT>]
默认输出 markdown 表（G6 复盘贴档）；--json 输出机器读数。
"""
import argparse
import json
import os
import sys
from datetime import datetime

TYPES = ("raise", "context", "nudge", "unblock", "confirm", "rework")
TYPE_ZH = {
    "raise": "提出需求", "context": "补充上下文", "nudge": "催进度",
    "unblock": "解决卡点", "confirm": "拍板确认", "rework": "纠错返工",
}
LAYER_ZH = {"collab": "排活时插话", "delivery": "干活中插话"}


def _read(path):
    try:
        # errors=replace：run22 等历史台账实测含坏字节（0xe9…），容错读不炸复盘
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def parse_ledger(text):
    """TSV → 轻量行；detail 只取第 5 列止（D13 列吸坑：status/resolution 不进摘要）。"""
    rows = []
    for line in (text or "").splitlines():
        t = line.strip()
        if not t or t.startswith("id\t") or "\t" not in t:
            continue
        cols = t.split("\t")
        if len(cols) < 5:
            continue
        rows.append({"id": cols[0], "ts": cols[1], "type": cols[2],
                     "defect": cols[3], "detail": cols[4]})
    return rows


def ts_ms(ts):
    try:
        return int(datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M:%S").timestamp() * 1000)
    except (ValueError, AttributeError):
        return 0


def interventions(run_dir):
    entries, auto_approve, sources = [], 0, []
    ledger = _read(os.path.join(run_dir, "evidence", "compensation-ledger.tsv"))
    if ledger is not None:
        sources.append("compensation-ledger.tsv")
        seen = set()
        for r in parse_ledger(ledger):
            base = {"ts": ts_ms(r["ts"]), "anchor": r["id"], "source": "ledger"}
            if r["type"] == "dispatch-preset":
                frm = r["detail"][5:].split(" ", 1)[0] if r["detail"].startswith("from=") else None
                key = f"{r['defect']}#{frm or 'system'}"
                first = key not in seen
                seen.add(key)
                text = r["detail"].split(" text=", 1)[-1] if " text=" in r["detail"] else r["detail"]
                entries.append({**base, "actor": frm or "system", "layer": "collab",
                                "type": "raise" if (frm and first) else "context",
                                "snippet": text[:120]})
            elif r["type"] == "nudge":
                desc = r["detail"].split(" desc=", 1)[-1] if " desc=" in r["detail"] else r["detail"]
                entries.append({**base, "actor": "director", "layer": "delivery",
                                "type": "nudge", "snippet": desc[:120]})
            elif r["type"] in ("card-backfill", "card-walk-done"):
                entries.append({**base, "actor": "system", "layer": "delivery",
                                "type": "unblock", "snippet": r["detail"][:120]})
            elif r["type"] == "auto-approve":
                auto_approve += 1
    gate = _read(os.path.join(run_dir, "evidence", "release-gate.jsonl"))
    if gate is not None:
        sources.append("release-gate.jsonl")
        for line in gate.splitlines():
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            d = str(o.get("action") or o.get("decision") or "")
            ts = int(datetime.fromisoformat(str(o.get("ts", "")).replace("Z", "+00:00")).timestamp() * 1000) \
                if o.get("ts") else 0
            if d in ("approve", "release"):
                entries.append({"ts": ts, "actor": str(o.get("actor", "?")), "layer": "delivery",
                                "type": "confirm", "source": "gate", "anchor": f"gate@{ts}",
                                "snippet": "G5 发布门通过"})
            elif d == "reject":
                entries.append({"ts": ts, "actor": str(o.get("actor", "?")), "layer": "delivery",
                                "type": "rework", "source": "gate", "anchor": f"gate@{ts}",
                                "snippet": "G5 发布门打回"})
    uat = _read(os.path.join(run_dir, "evidence", "uat-verdicts.jsonl"))
    if uat is not None:
        sources.append("uat-verdicts.jsonl")
        for line in uat.splitlines():
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            v = str(o.get("verdict", ""))
            ts = int(datetime.fromisoformat(str(o.get("ts", "")).replace("Z", "+00:00")).timestamp() * 1000) \
                if o.get("ts") else 0
            if v in ("pass", "conditional", "reject"):
                entries.append({"ts": ts, "actor": str(o.get("actor", "?")), "layer": "delivery",
                                "type": "confirm" if v != "reject" else "rework",
                                "source": "uat", "anchor": f"uat@{o.get('ac', '?')}@{ts}",
                                "snippet": f"UAT {o.get('ac', '?')} {'通过' if v == 'pass' else '有条件' if v == 'conditional' else '打回'}"})
    entries.sort(key=lambda e: -e["ts"])
    return entries, auto_approve, sources


def summarize(entries, auto_approve):
    by_type = {t: 0 for t in TYPES}
    by_layer = {"collab": 0, "delivery": 0}
    actors = {}
    for e in entries:
        by_type[e["type"]] += 1
        by_layer[e["layer"]] += 1
        actors[e["actor"]] = actors.get(e["actor"], 0) + 1
    total = len(entries)
    ctx_ratio = (by_type["context"] / total) if total else 0.0
    confirms = by_type["confirm"]
    return {
        "total": total, "byType": by_type, "byLayer": by_layer, "autoApprove": auto_approve,
        "topActors": sorted(actors.items(), key=lambda kv: (-kv[1], kv[0]))[:5],
        "riskSignals": [
            {"id": "context-gap", "label": "上下文缺失",
             "hit": total >= 5 and ctx_ratio >= 0.4,
             "note": f"补充上下文 {by_type['context']}/{total}（{round(ctx_ratio * 100)}%）"},
            {"id": "misunderstanding", "label": "理解偏差",
             "hit": by_type["rework"] >= 3, "note": f"纠错返工 {by_type['rework']} 次"},
        ],
        "collabSharePct": round(by_layer["collab"] / total * 100, 1) if total else 0.0,
        "autoApproveSharePct": round(auto_approve / (auto_approve + confirms) * 100, 1)
        if (auto_approve + confirms) else None,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", required=True, help="run id（SIM_ROOT/runs/<id>）")
    ap.add_argument("--root", default=os.environ.get("SIM_ROOT", os.path.expanduser("~/ncwk-sim-mux")))
    ap.add_argument("--json", action="store_true", help="机器读数输出")
    a = ap.parse_args()
    run_dir = os.path.join(a.root, "runs", a.run)
    if not os.path.isdir(run_dir):
        print(f"run 目录缺席：{run_dir}", file=sys.stderr)
        return 2
    entries, auto_approve, sources = interventions(run_dir)
    stats = summarize(entries, auto_approve)
    if a.json:
        print(json.dumps({"run": a.run, "sources": sources, "stats": stats,
                          "entries": entries[:500]}, ensure_ascii=False, indent=1))
        return 0
    print(f"# 介入归因账本 · {a.run}")
    print(f"\n来源：{'、'.join(sources) or '（无台账）'}\n")
    print(f"- 插手共 **{stats['total']}** 次（{LAYER_ZH['collab']} {stats['byLayer']['collab']} / "
          f"{LAYER_ZH['delivery']} {stats['byLayer']['delivery']}）；机器自动过审 {auto_approve}（不计）")
    for t in TYPES:
        print(f"- {TYPE_ZH[t]}：{stats['byType'][t]}")
    top = "、".join(f"{k} {v}" for k, v in stats["topActors"])
    print(f"\n插手最多：{top or '—'}\n")
    for r in stats["riskSignals"]:
        mark = "⚠ 该注意" if r["hit"] else "正常"
        print(f"- 风险 {r['label']}：{mark}（{r['note']}）")
    print(f"\n协作读数：排活沟通占 {stats['collabSharePct']}%；该人拍板的节点 "
          f"{stats['autoApproveSharePct'] if stats['autoApproveSharePct'] is not None else '—'}% 机器自动过")
    print("\n（口径 spec D1-D3/D7；与 8647 /api/hermes/delivery/interventions 同源对账）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
