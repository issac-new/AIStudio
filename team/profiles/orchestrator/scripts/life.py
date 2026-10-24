#!/usr/bin/env python3
"""活动记录 + 自动打 tag"""

import sqlite3
import os
import re
import json
from datetime import datetime

DB_PATH = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench/data/life.db")


def load_tag_keywords():
    """从 tag_taxonomy 表加载 tag → keywords 映射"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT tag, keywords FROM tag_taxonomy WHERE keywords != ''")
    mapping = {}
    for tag, keywords in c.fetchall():
        for kw in keywords.split(","):
            kw = kw.strip().lower()
            if kw:
                mapping.setdefault(kw, tag)
    conn.close()
    return mapping


def auto_tag(activity_text, tag_map):
    """根据关键词自动匹配 tag"""
    text_lower = activity_text.lower()
    matched = set()
    for keyword, tag in tag_map.items():
        if keyword in text_lower:
            matched.add(tag)
    return ",".join(sorted(matched)) if matched else ""


def record_activity(activity, tags="", duration_min=0, source="manual", meta=None):
    """记录一条活动

    Args:
        activity: 活动描述文本
        tags: 手动指定的 tag（逗号分隔），若为空则自动打 tag
        duration_min: 持续时间(分钟)
        source: 来源 (manual/weixin/cron)
        meta: 附加元数据 dict
    Returns:
        (id, final_tags)
    """
    now = datetime.now()
    tag_map = load_tag_keywords()

    # 自动打 tag
    if not tags:
        tags = auto_tag(activity, tag_map)

    # 如果手动指定了 tags，也补充自动 tag
    else:
        auto = auto_tag(activity, tag_map)
        if auto:
            all_tags = set(tags.split(",")) | set(auto.split(","))
            tags = ",".join(sorted(all_tags))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """INSERT INTO activities (timestamp, date, activity, tags, duration_min, source, meta)
           VALUES (?,?,?,?,?,?,?)""",
        (
            now.isoformat(),
            now.strftime("%Y-%m-%d"),
            activity,
            tags,
            duration_min,
            source,
            json.dumps(meta or {}, ensure_ascii=False),
        ),
    )
    row_id = c.lastrowid
    conn.commit()
    conn.close()
    return row_id, tags


def record_knowledge(content, tags="", source="manual", meta=None):
    """记录一条知识碎片

    Args:
        content: 知识内容文本
        tags: 手动指定 tag
        source: 来源
        meta: 附加元数据
    Returns:
        (id, tags)
    """
    now = datetime.now()
    tag_map = load_tag_keywords()

    if not tags:
        tags = auto_tag(content, tag_map)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """INSERT INTO knowledge (timestamp, date, content, tags, source, hindsight_stored, meta)
           VALUES (?,?,?,?,?,?,?)""",
        (
            now.isoformat(),
            now.strftime("%Y-%m-%d"),
            content,
            tags,
            source,
            0,
            json.dumps(meta or {}, ensure_ascii=False),
        ),
    )
    row_id = c.lastrowid
    conn.commit()
    conn.close()
    return row_id, tags


def rate_game(game_id, rating):
    """给游戏推荐评分 (up/down)"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "UPDATE game_suggestions SET rating=?, rating_timestamp=? WHERE id=?",
        (rating, datetime.now().isoformat(), game_id),
    )
    conn.commit()
    conn.close()


def add_game_suggestion(name, desc="", tags="", url="", source_query=""):
    """添加一条游戏推荐"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """INSERT INTO game_suggestions (timestamp, game_name, description, tags, url, source_query)
           VALUES (?,?,?,?,?,?)""",
        (datetime.now().isoformat(), name, desc, tags, url, source_query),
    )
    row_id = c.lastrowid
    conn.commit()
    conn.close()
    return row_id


def list_activities(date=None, tag=None, limit=50):
    """查询活动列表"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    query = "SELECT id, timestamp, date, activity, tags, duration_min, source FROM activities"
    clauses = []
    params = []
    if date:
        clauses.append("date = ?")
        params.append(date)
    if tag:
        clauses.append("tags LIKE ?")
        params.append(f"%{tag}%")
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return rows


def list_knowledge(tag=None, limit=50):
    """查询知识碎片列表"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    query = "SELECT id, timestamp, date, content, tags, hindsight_stored FROM knowledge"
    clauses = []
    params = []
    if tag:
        clauses.append("tags LIKE ?")
        params.append(f"%{tag}%")
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return rows


def list_unrated_games(limit=20):
    """获取未评分的游戏推荐"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT id, game_name, description, tags, url, source_query FROM game_suggestions WHERE rating IS NULL OR rating = '' ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    )
    rows = c.fetchall()
    conn.close()
    return rows


def get_stats(date=None, days=7):
    """获取统计: tag 分布、总时长、活动数"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if date:
        c.execute(
            "SELECT tags, duration_min, COUNT(*) FROM activities WHERE date = ? GROUP BY tags",
            (date,),
        )
    else:
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        c.execute(
            "SELECT tags, duration_min, COUNT(*) FROM activities WHERE date >= ? GROUP BY tags",
            (cutoff,),
        )

    rows = c.fetchall()
    conn.close()

    # 聚合 tag 统计
    tag_stats = {}
    total_activities = 0
    total_duration = 0
    for tags_str, dur, cnt in rows:
        total_activities += cnt
        total_duration += dur or 0
        if not tags_str:
            tag = "未分类"
        else:
            # 取第一个 tag 为主 tag
            tag = tags_str.split(",")[0]
        if tag not in tag_stats:
            tag_stats[tag] = {"count": 0, "duration_min": 0}
        tag_stats[tag]["count"] += cnt
        tag_stats[tag]["duration_min"] += dur or 0

    return {
        "tag_stats": tag_stats,
        "total_activities": total_activities,
        "total_duration_min": total_duration,
        "period": f"最近{days}天" if not date else date,
    }


# CLI 入口 — 便于 cron job 和终端调用
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法:")
        print("  python life.py activity '描述' [--tags a,b] [--duration 30] [--source weixin]")
        print("  python life.py knowledge '知识内容' [--tags a,b]")
        print("  python life.py stats [--date 2026-07-25] [--days 7]")
        print("  python life.py list [--date 2026-07-25] [--tag 运动] [--limit 50]")
        print("  python life.py games [--unrated]")
        print("  python life.py rate <game_id> <up|down>")
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "activity":
        text = sys.argv[2]
        tags = ""
        duration = 0
        source = "manual"
        for i, arg in enumerate(sys.argv[3:], 3):
            if arg == "--tags" and i + 1 < len(sys.argv):
                tags = sys.argv[i + 1]
            elif arg == "--duration" and i + 1 < len(sys.argv):
                duration = int(sys.argv[i + 1])
            elif arg == "--source" and i + 1 < len(sys.argv):
                source = sys.argv[i + 1]
        rid, final_tags = record_activity(text, tags, duration, source)
        print(f"✅ 活动已记录 (id={rid})")
        print(f"   描述: {text}")
        print(f"   标签: {final_tags or '无'}")
        print(f"   时长: {duration}分钟")

    elif cmd == "knowledge":
        # Support: knowledge 'content text' [--tags a,b]
        #          knowledge --list [--tag X] [--limit 50]
        #          knowledge --list-all
        if len(sys.argv) > 2 and sys.argv[2].startswith("--"):
            sub = sys.argv[2]
            if sub in ("--list", "--list-all"):
                tag_filter = None
                limit = 50
                for i, arg in enumerate(sys.argv[3:], 3):
                    if arg == "--tag" and i + 1 < len(sys.argv):
                        tag_filter = sys.argv[i + 1]
                    elif arg == "--limit" and i + 1 < len(sys.argv):
                        limit = int(sys.argv[i + 1])
                rows = list_knowledge(tag_filter, limit)
                print(f"\n📚 知识碎片 ({len(rows)} 条):")
                for r in rows:
                    stored = "✅" if r[5] else "⬜"
                    print(f"  [{r[0]}] {r[1][:10]} | {r[3][:50]} | tags={r[4]} | {stored}")
            else:
                print(f"未知选项: {sub}")
                print("  knowledge '内容' [--tags a,b]")
                print("  knowledge --list [--tag X] [--limit N]")
                print("  knowledge --list-all")
            sys.exit(0)
        if len(sys.argv) < 3:
            print("用法: knowledge '内容' [--tags a,b] 或 knowledge --list")
            sys.exit(0)
        text = sys.argv[2]
        tags = ""
        for i, arg in enumerate(sys.argv[3:], 3):
            if arg == "--tags" and i + 1 < len(sys.argv):
                tags = sys.argv[i + 1]
        rid, final_tags = record_knowledge(text, tags)
        print(f"✅ 知识碎片已记录 (id={rid})")
        print(f"   标签: {final_tags or '无'}")

    elif cmd == "stats":
        date = None
        days = 7
        for i, arg in enumerate(sys.argv[2:], 2):
            if arg == "--date" and i + 1 < len(sys.argv):
                date = sys.argv[i + 1]
            elif arg == "--days" and i + 1 < len(sys.argv):
                days = int(sys.argv[i + 1])
        stats = get_stats(date, days)
        print(f"\n📊 统计 — {stats['period']}")
        print(f"   总活动: {stats['total_activities']} 次")
        print(f"   总时长: {stats['total_duration_min']} 分钟")
        print(f"\n   {'Tag':<10} {'次数':>6} {'时长(分)':>10}")
        print(f"   {'─'*30}")
        for tag, s in sorted(stats["tag_stats"].items(), key=lambda x: -x[1]["count"]):
            print(f"   {tag:<10} {s['count']:>6} {s['duration_min']:>10}")

    elif cmd == "list":
        date = None
        tag = None
        limit = 50
        for i, arg in enumerate(sys.argv[2:], 2):
            if arg == "--date" and i + 1 < len(sys.argv):
                date = sys.argv[i + 1]
            elif arg == "--tag" and i + 1 < len(sys.argv):
                tag = sys.argv[i + 1]
            elif arg == "--limit" and i + 1 < len(sys.argv):
                limit = int(sys.argv[i + 1])
        rows = list_activities(date, tag, limit)
        for r in rows:
            print(f"[{r[0]}] {r[2]} | {r[3][:40]} | tags={r[4]} | {r[5]}min | {r[6]}")

    elif cmd == "games":
        unrated = "--unrated" in sys.argv
        rows = list_unrated_games() if unrated else []
        if unrated:
            print(f"\n🎮 未评分的游戏推荐 ({len(rows)} 条):")
            for r in rows:
                print(f"  [{r[0]}] {r[1]} — {r[2][:50]}")
                if r[4]:
                    print(f"       URL: {r[4]}")
                if r[3]:
                    print(f"       Tags: {r[3]}")
        else:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT id, game_name, rating, source_query FROM game_suggestions ORDER BY timestamp DESC LIMIT 20")
            for r in c.fetchall():
                print(f"  [{r[0]}] {r[1]} | {r[2] or '未评'} | query={r[3]}")
            conn.close()

    elif cmd == "rate":
        game_id = int(sys.argv[2])
        rating = sys.argv[3]
        rate_game(game_id, rating)
        print(f"✅ 游戏 id={game_id} 评分: {rating}")

    else:
        print(f"未知命令: {cmd}")
