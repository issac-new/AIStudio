#!/usr/bin/env python3
"""kb_ingest.py — 资产去重入库 + 推理节点状态机（唯一写入口）"""
import argparse, json, sqlite3, sys, hashlib, ipaddress

VALID_TRANSITIONS = {
    "open": {"supported", "refuted", "dead_end"},  # open 可直接判死（recon 常见：一验即不通）
    "supported": {"dead_end"},
    "refuted": {"dead_end"},
    "dead_end": set(),  # 终态：不可复活
}

def norm_domain(v):
    return v.strip().lower().rstrip(".")

def norm_value(asset_type, v):
    if asset_type == "domain":
        return norm_domain(v)
    if asset_type == "host":
        s = v.strip()
        parts = s.split(".")
        # dotted quad：手工去前导零（ipaddress 拒收前导零，需先归一）
        if len(parts) == 4 and all(p.isdigit() for p in parts):
            try:
                return str(ipaddress.ip_address(".".join(str(int(p)) for p in parts)))
            except ValueError:
                return s
        try:
            return str(ipaddress.ip_address(s))
        except ValueError:
            return s
    return v.strip()

def ingest_assets(c, eng, card, assets):
    ins = 0
    for a in assets:
        at, v = a["asset_type"], norm_value(a["asset_type"], a["value"])
        aid = "ast-" + hashlib.sha1(f"{eng}:{at}:{v}".encode()).hexdigest()[:8]
        cur = c.execute(
            "INSERT OR IGNORE INTO asset_topology(id,engagement_id,asset_type,value,attrs,first_seen_card,confidence) VALUES(?,?,?,?,?,?,?)",
            (aid, eng, at, v, json.dumps(a.get("attrs", {})), card, a.get("confidence", "lead")),
        )
        ins += cur.rowcount
    return ins

def ingest_nodes(c, eng, card, nodes):
    ids = []
    for n in nodes:
        rid = "rnode-" + hashlib.sha1(f"{eng}:{card}:{n['claim']}".encode()).hexdigest()[:8]
        c.execute(
            "INSERT OR REPLACE INTO reasoning_lineage(id,parent_id,engagement_id,card_id,claim,status,evidence_ref) VALUES(?,?,?,?,?,?,?)",
            (rid, n.get("parent_id"), eng, card, n["claim"], n.get("status", "open"), n.get("evidence_ref")),
        )
        ids.append(rid)
    return ids

def transition(c, rid, new_status):
    row = c.execute("SELECT status FROM reasoning_lineage WHERE id=?", (rid,)).fetchone()
    if not row:
        print(f"BLOCKED: node {rid} not found", file=sys.stderr); return 1
    old = row[0]
    if new_status not in VALID_TRANSITIONS.get(old, set()):
        print(f"BLOCKED: illegal transition {old} -> {new_status}", file=sys.stderr); return 1
    c.execute("UPDATE reasoning_lineage SET status=? WHERE id=?", (new_status, rid))
    print(f"OK {rid}: {old} -> {new_status}")
    return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="kb.sqlite")
    ap.add_argument("--engagement", default=None)
    ap.add_argument("--card", default=None)
    ap.add_argument("--findings", type=argparse.FileType("r"))
    ap.add_argument("--transition", help="<rnode-id>:<new_status>")
    a = ap.parse_args()
    c = sqlite3.connect(a.db)
    c.commit()  # 确保 autocommit 模式读到的状态与磁盘一致
    if a.transition:
        rid, st = a.transition.split(":", 1)
        rc = transition(c, rid, st)
        c.commit()
        return rc
    if not a.findings:
        print("BLOCKED: need --findings or --transition", file=sys.stderr); return 1
    data = json.load(a.findings)
    eng = a.engagement or data.get("engagement") or "default"
    n1 = ingest_assets(c, eng, a.card, data.get("assets", []))
    ids = ingest_nodes(c, eng, a.card, data.get("nodes", []))
    c.commit()
    print(f"OK ingest card={a.card} new_assets={n1} nodes={len(ids)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
