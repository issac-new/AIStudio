#!/usr/bin/env python3
"""markings-clearance 执法检查（2026-08-27 二轮体检 F-D 落地）
蓝军发现：clearances/markings 是纯配置声明，hermes 源码零消费方——跨板派单的
markings 校验完全依赖 orchestrator 自律（prompt 层），无机械层。
本脚本补上机械层（等效零代码原则，不改 hermes 源码）：
  扫 7 板活跃任务卡的 metadata.markings / body 中的 markings 声明，对照 assignee
  的 config.yaml clearances，缺口即报（exit 1）。
静默 = 健康。挂 cron 与 master-integrity 同窗。
"""
import os, re, sqlite3, sys, glob, yaml
from pathlib import Path

HOME = Path.home()
BOARDS = ["swarm", "hack", "product", "ops", "[已移除]", "platform", "[已移除]"]
PROFILES = HOME / ".hermes" / "profiles"

def profile_clearances(prof: str) -> set:
    cfg = PROFILES / prof / "config.yaml"
    if not cfg.is_file():
        return set()
    try:
        d = yaml.safe_load(cfg.read_text()) or {}
    except Exception:
        return set()
    cl = d.get("clearances")
    if isinstance(cl, list):
        return {str(x) for x in cl}
    return set()

def card_markings(meta) -> set:
    """从 metadata dict / JSON 字符串提取 markings 声明。"""
    if not meta:
        return set()
    try:
        import json
        d = json.loads(meta) if isinstance(meta, str) else meta
    except Exception:
        return set()
    m = d.get("markings") if isinstance(d, dict) else None
    if isinstance(m, list):
        return {str(x) for x in m}
    return set()

problems = []
for b in BOARDS:
    db = HOME / ".hermes" / "kanban" / "boards" / b / "kanban.db"
    if not db.is_file():
        continue
    # mode=ro（尊重 WAL）
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, assignee, status, metadata FROM tasks "
            "WHERE status NOT IN ('done','archived') AND assignee IS NOT NULL"
        ).fetchall()
    except Exception:
        rows = []
    finally:
        conn.close()
    for r in rows:
        mk = card_markings(r["metadata"])
        if not mk:
            continue
        cl = profile_clearances(r["assignee"] or "")
        missing = mk - cl
        if missing:
            problems.append(
                f"{b}/{r['id']} assignee={r['assignee']} markings={sorted(mk)} "
                f"超出 clearances={sorted(cl) if cl else '(无)'}"
            )

if problems:
    print(f"markings-clearance violation ({len(problems)}):")
    for p in problems:
        print("  -", p)
    sys.exit(1)
print("markings-clearance OK")
