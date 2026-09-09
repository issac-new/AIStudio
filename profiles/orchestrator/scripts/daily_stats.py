#!/usr/bin/env python3
"""每日活动统计报表 — 供 cron job 调用

数据来源（双源汇总）：
1. Hermes Agent 会话 + 看板任务（自动采集，反映工作产出）
2. life.db 中的手动记录（用户通过微信/CLI 录入的个人活动）

输出到 stdout，cron 会将其注入 agent prompt。
"""

import sys
import os
import subprocess
import sqlite3
import json
from datetime import datetime, timedelta

# ─── 路径配置 ───
LIFE_DB = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench/data/life.db")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from life import get_stats, list_activities, load_tag_keywords, auto_tag

today = datetime.now().strftime("%Y-%m-%d")
yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def get_hermes_sessions(date_str=None):
    """从 hermes CLI 获取会话列表，按日期过滤。

    Returns:
        list of (session_id, title, source, model, time_info)
    """
    try:
        result = subprocess.run(
            ["hermes", "sessions", "list", "--limit", "200"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return []

        sessions = []
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("Title") or line.startswith("─"):
                continue

            # Skip cron jobs
            if "cron_" in line:
                continue
            if "生活工作台" in line:
                continue

            # Parse: Title  Workspace  TimeAgo  SessionID
            parts = line.split()
            if len(parts) < 4:
                continue
            session_id = parts[-1]
            time_info = parts[-3] + " " + parts[-2]
            title = " ".join(parts[:-3])

            # Date filtering: check session_id prefix for date
            # Session IDs start with YYYYMMDD_HHMMSS
            if date_str:
                date_compact = date_str.replace("-", "")
                if not session_id.startswith(date_compact):
                    continue

            sessions.append({
                "id": session_id,
                "title": title,
                "time": time_info,
            })

        return sessions
    except Exception:
        return []


def get_kanban_tasks(date_str=None):
    """获取看板任务（从全局 kanban.db）。

    Returns:
        list of (task_id, title, status, assignee, board)
    """
    kanban_db = os.path.expanduser("~/.hermes/kanban.db")
    if not os.path.exists(kanban_db):
        return []

    try:
        conn = sqlite3.connect(kanban_db)
        c = conn.cursor()

        if date_str:
            # Convert date to unix timestamp range
            start_ts = int(datetime.strptime(date_str, "%Y-%m-%d").timestamp())
            end_ts = start_ts + 86400
            c.execute(
                """SELECT id, title, status, assignee, created_at
                   FROM tasks WHERE created_at >= ? AND created_at < ?
                   ORDER BY created_at DESC""",
                (start_ts, end_ts)
            )
        else:
            # Last 7 days
            cutoff = int((datetime.now() - timedelta(days=7)).timestamp())
            c.execute(
                "SELECT id, title, status, assignee, created_at FROM tasks WHERE created_at >= ? ORDER BY created_at DESC",
                (cutoff,)
            )

        rows = c.fetchall()
        conn.close()
        return [
            {"id": r[0], "title": r[1], "status": r[2], "assignee": r[3]}
            for r in rows
        ]
    except Exception:
        return []


def get_board_tasks(date_str=None):
    """获取各看板（swarm/hack/product/ops/[已移除]）的任务。"""
    tasks = []
    for board in ["swarm", "hack", "product", "ops", "[已移除]"]:
        board_db = os.path.expanduser(f"~/.hermes/kanban/boards/{board}/kanban.db")
        if not os.path.exists(board_db):
            continue
        try:
            conn = sqlite3.connect(board_db)
            c = conn.cursor()
            if date_str:
                start_ts = int(datetime.strptime(date_str, "%Y-%m-%d").timestamp())
                end_ts = start_ts + 86400
                c.execute(
                    "SELECT id, title, status, assignee FROM tasks WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC",
                    (start_ts, end_ts)
                )
            else:
                cutoff = int((datetime.now() - timedelta(days=7)).timestamp())
                c.execute(
                    "SELECT id, title, status, assignee FROM tasks WHERE created_at >= ? ORDER BY created_at DESC",
                    (cutoff,)
                )
            for r in c.fetchall():
                tasks.append({"id": r[0], "title": r[1], "status": r[2], "assignee": r[3], "board": board})
            conn.close()
        except Exception:
            continue
    return tasks


def categorize_session(title):
    """根据会话标题自动分类。

    Returns:
        (category, is_productive)
    """
    title_lower = title.lower()

    categories = [
        # (keywords, category, is_productive)
        (["[已移除]", "fdtd", "fem", "信号完整性", "寄生参数", "喻文健", "崔晓亮", "icdia"],
         "[已移除]研发", True),
        (["hack", "渗透", "安全", "sqlmap", "nmap", "exploit", "forensic", "取证", "靶场"],
         "安全研究", True),
        (["profile", "soul", "配置", "gateway", "fallback", "yaml", "token", "config",
          "docker", "matrix", "weixin", "email", "kanban", "dispatch", "cron", "npm"],
         "系统运维", True),
        (["调研", "研究", "research", "palantir", "pua", "architect", "github"],
         "技术调研", True),
        (["编码", "代码", "code", "开发", "develop", "scaffold", "package", "publish"],
         "编码开发", True),
        (["[已移除]", "教育", "教案", "教材", "特殊教育", "教师"],
         "教育研究", True),
        (["行芯", "phlexing", "osint", "情报", "资产测绘"],
         "竞争情报", True),
        (["修复", "fix", "debug", "排查", "401", "error", "crash"],
         "问题修复", True),
        (["优化", "optimize", "精简", "瘦身", "token", "成本"],
         "系统优化", True),
        (["发布", "github", "push", "分发", "sync"],
         "发布部署", True),
    ]

    for keywords, category, is_productive in categories:
        for kw in keywords:
            if kw in title_lower:
                return category, is_productive

    return "其他", True


def get_personal_activities(date_str=None):
    """从 life.db 获取手动录入的个人活动。"""
    return list_activities(date=date_str, limit=100)


def get_personal_stats(date_str=None):
    """从 life.db 获取手动记录的统计。"""
    return get_stats(date=date_str)


# ─── 主逻辑 ───

print(f"# 📊 每日活动统计 — {today}")
print()

# ─── 数据源 1: Hermes Agent 会话 ───
sessions_today = get_hermes_sessions(today)
sessions_yesterday = get_hermes_sessions(yesterday)

# 也获取最近的会话（hermes sessions list 不支持精确日期过滤，用 ID 前缀过滤）
all_recent = get_hermes_sessions()
today_sessions = []
for s in all_recent:
    date_compact = today.replace("-", "")
    if s["id"].startswith(date_compact):
        today_sessions.append(s)

# 如果今天没有，用昨天的
if not today_sessions:
    for s in all_recent:
        date_compact = yesterday.replace("-", "")
        if s["id"].startswith(date_compact):
            today_sessions.append(s)
    if today_sessions:
        print(f"（注：今日无会话，显示昨日 {yesterday} 数据）")
        print()

# 分类会话
categorized = {}
for s in today_sessions:
    cat, productive = categorize_session(s["title"])
    categorized.setdefault(cat, []).append(s)

print(f"## 🤖 Hermes Agent 工作产出")
print()
print(f"- 会话数: {len(today_sessions)} 个")

# 计算产出时间（粗估：每个会话约 30-120 分钟，取平均 60 分钟）
estimated_hours = len(today_sessions) * 1.0  # 粗估每个会话 1 小时
print(f"- 预估工作时长: ~{estimated_hours:.1f} 小时")
print()

if categorized:
    print("### 按类别分布")
    print()
    print("| 类别 | 会话数 |")
    print("|------|--------|")
    for cat in sorted(categorized.keys(), key=lambda k: -len(categorized[k])):
        print(f"| {cat} | {len(categorized[cat])} |")

    print()
    print("### 会话明细")
    print()
    for cat in sorted(categorized.keys(), key=lambda k: -len(categorized[k])):
        print(f"**{cat}** ({len(categorized[cat])} 个)")
        for s in categorized[cat]:
            print(f"  - {s['title'][:60]} | {s['time']}")
        print()

# ─── 数据源 1b: 看板任务 ───
board_tasks = get_board_tasks(today)
kanban_tasks = get_kanban_tasks(today)
all_tasks = board_tasks + kanban_tasks

if all_tasks:
    print(f"### 📋 看板任务 ({len(all_tasks)} 个)")
    print()
    for t in all_tasks[:10]:
        board_info = f"[{t.get('board', 'global')}] " if 'board' in t else ""
        print(f"  - {board_info}{t['title'][:50]} | {t['status']}")
    print()

# ─── 数据源 2: 个人手动记录 ───
personal = get_personal_activities(today)
personal_stats = get_personal_stats(today)

print(f"## 👤 个人活动记录")
print()
print(f"- 记录数: {personal_stats['total_activities']} 次")
print(f"- 总时长: {personal_stats['total_duration_min']} 分钟 ({personal_stats['total_duration_min'] / 60:.1f} 小时)")

if personal:
    print()
    print("### 活动明细")
    print()
    for r in personal:
        print(f"  - {r[3][:50]} | tags={r[4]} | {r[5]}min | {r[6]}")

# ─── 汇总 ───
total_sessions = len(today_sessions)
total_personal = personal_stats['total_activities']
total_estimated_hours = estimated_hours + personal_stats['total_duration_min'] / 60

print()
print(f"## 📈 汇总")
print()
print(f"- Hermes 会话: {total_sessions} 个 (~{estimated_hours:.1f}h)")
print(f"- 个人记录: {total_personal} 条 ({personal_stats['total_duration_min'] / 60:.1f}h)")
print(f"- 预估总产出: ~{total_estimated_hours:.1f} 小时")
