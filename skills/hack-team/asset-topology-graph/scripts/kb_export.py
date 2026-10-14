#!/usr/bin/env python3
"""kb_export.py — 导出资产清单 + 推理谱系摘要"""
import argparse, sqlite3

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="kb.sqlite")
    ap.add_argument("--engagement", required=True)
    ap.add_argument("--format", choices=["md", "json"], default="md")
    a = ap.parse_args()
    c = sqlite3.connect(a.db)
    assets = c.execute(
        "SELECT asset_type,value,confidence,first_seen_card FROM asset_topology WHERE engagement_id=? ORDER BY asset_type,value",
        (a.engagement,)).fetchall()
    nodes = c.execute(
        "SELECT id,parent_id,card_id,claim,status FROM reasoning_lineage WHERE engagement_id=? ORDER BY created_at",
        (a.engagement,)).fetchall()
    if a.format == "json":
        import json
        print(json.dumps({"assets": assets, "reasoning_nodes": nodes}, indent=2, ensure_ascii=False))
        return 0
    print(f"# Engagement {a.engagement} — 资产拓扑 ({len(assets)})")
    for at, v, conf, card in assets:
        print(f"- [{at}] {v} ({conf}, src={card})")
    print(f"\n# 推理谱系 ({len(nodes)})")
    for nid, pid, card, claim, st in nodes:
        print(f"- {nid} <- {pid or '-'} [{st}] {claim} (card={card})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
