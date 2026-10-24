#!/usr/bin/env python3
"""kb_bootstrap.py — asset-topology-graph 建库脚本（staged 提案配套）"""
import argparse, sqlite3

DDL = """
CREATE TABLE IF NOT EXISTS asset_topology (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('host','domain','endpoint','credential','service','file','persona')),
  value TEXT NOT NULL,
  attrs TEXT DEFAULT '{}',
  first_seen_card TEXT,
  confidence TEXT DEFAULT 'lead' CHECK(confidence IN ('confirmed','probable','lead')),
  created_at INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(engagement_id, asset_type, value)
);
CREATE TABLE IF NOT EXISTS reasoning_lineage (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  engagement_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  claim TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','supported','refuted','dead_end')),
  evidence_ref TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engagement", required=True)
    ap.add_argument("--db", default="kb.sqlite")
    a = ap.parse_args()
    c = sqlite3.connect(a.db)
    c.executescript(DDL)
    print(f"OK kb_bootstrap engagement={a.engagement} db={a.db}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
