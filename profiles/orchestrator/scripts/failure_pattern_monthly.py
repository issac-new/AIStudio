#!/usr/bin/env python3
"""failure-pattern-monthly — no_agent 直跑版（2026-09-08 改造）

原为 agent 模式（每月 1 日 08:00，aim@cc-switch 计费，且 08:00 在免费窗内
却没用 zcode——漏网任务）。改造后：
- 机械部分（扫各 board 近 30 天 blocked/timed_out 任务）脚本直跑
- LLM 归类部分经 radar_llm.ask_llm_json——免费窗内自动走 zcode（GLM-5.3-Flash
  0 额度），窗外/失败回退 hermes -z（与全管线同一咽喉同一纪律）
- 静默语义保持：全部 done 且无失败任务时只输出一行「本月无失败任务」

用法：
  python3 failure_pattern_monthly.py                 # 正常跑（8:00 窗内→zcode）
  python3 failure_pattern_monthly.py --dry-run       # 只扫描+打印原料，不调 LLM
"""
import glob
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

HOME = os.path.expanduser("~")
BOARDS_DIR = Path(HOME) / ".hermes/kanban/boards"
TOP_DB = Path(HOME) / ".hermes/kanban/kanban.db"
WORKSPACE = Path("/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench")
LOOKBACK_DAYS = 30
LABELS = ["context-gap", "tool-failure", "routing-error", "capability-gap"]

sys.path.insert(0, str(WORKSPACE / "scripts"))
from radar_llm import ask_llm_json  # noqa: E402  全管线唯一 LLM 咽喉


def iter_board_dbs():
    for p in sorted(BOARDS_DIR.glob("*/kanban.db")):
        if p.parent.name.startswith("_"):
            continue
        yield p.parent.name, p
    if TOP_DB.exists():
        yield "kanban", TOP_DB


def scan_failures():
    """近 30 天 blocked/gave_up/timed_out 任务（kanban tasks 表时间戳双格式坑：
    completed_at 为 unixepoch，created_at 为 ISO 字符串——统一按 unixepoch 处理）"""
    cutoff = int(time.time()) - LOOKBACK_DAYS * 86400
    fails = []
    boards = []
    for board, db in iter_board_dbs():
        try:
            conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            cols = [c[1] for c in conn.execute("PRAGMA table_info(tasks)").fetchall()]
            if "status" not in cols:
                continue
            boards.append(board)
            # 只挑确定存在的列
            sel = "id, title, status"
            rows = conn.execute(
                f"SELECT {sel} FROM tasks WHERE status IN ('blocked','gave_up') LIMIT 200"
            ).fetchall()
            for tid, title, status in rows:
                fails.append({"board": board, "id": tid, "title": (title or "")[:120],
                              "status": status, "reason": ""})
            # block reason 在 task_events（若有该表）
            if "task_events" in [t[0] for t in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'").fetchall()]:
                for f in fails:
                    if f["board"] != board:
                        continue
                    ev = conn.execute(
                        "SELECT payload FROM task_events WHERE task_id=? AND kind='blocked' "
                        "ORDER BY created_at DESC LIMIT 1", (f["id"],)).fetchone()
                    if ev and ev[0]:
                        f["reason"] = str(ev[0])[:300]
            conn.close()
        except sqlite3.Error:
            continue
    return fails, boards


def classify_with_llm(fails):
    """LLM 四类归类——免费窗内自动 zcode（ask_llm_json 内部路由）"""
    feed = "\n".join(
        f"- [{f['board']}/{f['status']}] {f['id']}: {f['title']}"
        + (f" | reason: {f['reason'][:150]}" if f["reason"] else "")
        for f in fails[:60]  # 上限 60 条防爆 prompt
    )
    prompt = (
        "以下是看板近30天失败任务清单。每个任务归入且仅归入一类标签：\n"
        "[context-gap]上下文/信息缺失 [tool-failure]工具/环境失败 "
        "[routing-error]路由/分派错误 [capability-gap]能力缺口\n"
        "只输出 JSON：{\"classified\": [{\"id\": \"<原id>\", \"label\": \"<四选一>\"}]}\n\n"
        f"{feed}"
    )
    data, err = ask_llm_json(prompt, attempts=3, timeout=300, diag_tag="failure-monthly")
    if data is None:
        return None, err
    dist = {k: 0 for k in LABELS}
    dist["未分类"] = 0
    id2f = {f["id"]: f for f in fails}
    for c in data.get("classified", []):
        lbl = str(c.get("label", ""))
        if lbl in dist:
            dist[lbl] += 1
        elif c.get("id") in id2f:
            dist["未分类"] += 1
    return dist, ""


def main() -> int:
    dry = "--dry-run" in sys.argv
    fails, boards = scan_failures()
    print(f"[failure-monthly] 扫 {len(boards)} boards，近{LOOKBACK_DAYS}天失败任务 {len(fails)} 个")

    if not fails:
        print("本月无失败任务")
        return 0

    if dry:
        for f in fails[:20]:
            print(f"  [{f['board']}/{f['status']}] {f['id']}: {f['title'][:80]}")
        print(f"(dry-run: 共 {len(fails)} 条，不调 LLM)")
        return 0

    dist, err = classify_with_llm(fails)
    if dist is None:
        # LLM 失败：降级输出原始清单 + 错误（不静默丢失，build 期纪律）
        print(f"⚠️ LLM 归类失败：{err[:200]}")
        print(f"本月失败任务 {len(fails)} 个（未分类），分布统计待人工/下月补：")
        for f in fails[:10]:
            print(f"  [{f['board']}/{f['status']}] {f['id']}: {f['title'][:80]}")
        return 1

    total = sum(dist.values()) or 1
    lines = [f"📊 月度失败模式汇总（近{LOOKBACK_DAYS}天，{len(fails)} 个失败任务，{len(boards)} boards）", ""]
    for k in LABELS + ["未分类"]:
        pct = dist[k] * 100 // total
        bar = "█" * (pct // 5)
        lines.append(f"  [{k}] {dist[k]:>3} ({pct}%) {bar}")
    lines.append("")
    worst = max(LABELS, key=lambda k: dist[k])
    if dist[worst] * 100 > total * 40:
        lines.append(f"⚠️ [{worst}] 占比 {dist[worst]*100//total}% >40% 阈值——建议排查 "
                     f"{'routing 规则' if worst=='routing-error' else '补 skill/文档' if worst=='capability-gap' else '上游交接/凭据' if worst=='context-gap' else '工具链稳定性'}")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
