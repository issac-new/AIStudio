#!/usr/bin/env python3
"""生活工作台 — 活动数据库初始化"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.expanduser("~/hermes-docker-sandbox/workspace/life-workbench/data/life.db")


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 活动表
    c.execute("""
    CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,           -- ISO8601 记录时间
        date TEXT NOT NULL,                -- YYYY-MM-DD 便于按日查询
        activity TEXT NOT NULL,            -- 活动描述
        tags TEXT DEFAULT '',              -- 逗号分隔的标签
        duration_min INTEGER DEFAULT 0,   -- 持续时间(分钟)
        source TEXT DEFAULT 'manual',     -- manual/weixin/cron
        meta TEXT DEFAULT '{}'             -- JSON 元数据
    )
    """)

    # 标签体系表
    c.execute("""
    CREATE TABLE IF NOT EXISTS tag_taxonomy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag TEXT UNIQUE NOT NULL,
        parent_tag TEXT DEFAULT '',        -- 父标签(多级)
        category TEXT DEFAULT '',          -- 一级分类
        description TEXT DEFAULT '',
        keywords TEXT DEFAULT ''           -- 关键词(逗号分隔，用于自动打tag)
    )
    """)

    # 知识碎片表
    c.execute("""
    CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        date TEXT NOT NULL,
        content TEXT NOT NULL,             -- 知识内容
        tags TEXT DEFAULT '',
        source TEXT DEFAULT 'manual',
        hindsight_stored INTEGER DEFAULT 0, -- 是否已存入 Hindsight
        meta TEXT DEFAULT '{}'
    )
    """)

    # 游戏推荐表
    c.execute("""
    CREATE TABLE IF NOT EXISTS game_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        game_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        url TEXT DEFAULT '',
        rating TEXT DEFAULT '',            -- up/down/null
        rating_timestamp TEXT DEFAULT '',
        source_query TEXT DEFAULT ''      -- 触发搜索的tag
    )
    """)

    # 初始化标签体系
    tags = [
        # 运动类
        ("运动", "", "生活", "体育锻炼、健身、户外运动", "运动,健身,跑步,游泳,球,瑜伽,徒步,骑行"),
        ("健身", "运动", "生活", "室内健身", "健身,力量,有氧,器械,哑铃,俯卧撑"),
        ("户外", "运动", "生活", "户外运动", "徒步,登山,骑行,跑步,散步,公园"),
        # 学习类
        ("学习", "", "成长", "学习新知识、技能", "学习,研究,读书,课程,教程,笔记"),
        ("阅读", "学习", "成长", "读书、文章", "读,书,阅读,文章,看书,翻书"),
        ("编程", "学习", "成长", "编程开发", "编程,代码,开发,python,js,debug,重构"),
        ("技术", "学习", "成长", "技术研究", "技术,架构,工具,框架,API"),
        # 娱乐类
        ("娱乐", "", "休闲", "娱乐活动", "游戏,电影,视频,音乐,综艺,动漫"),
        ("游戏", "娱乐", "休闲", "玩游戏", "游戏,玩,steam,switch,手游,ps5"),
        ("影视", "娱乐", "休闲", "看影视", "电影,电视剧,动漫,纪录片,看片"),
        ("音乐", "娱乐", "休闲", "听音乐、演奏", "音乐,听歌,歌曲,播放,专辑"),
        # 社交类
        ("社交", "", "人际", "社交活动", "聊天,聚会,吃饭,朋友,见面,微信聊"),
        # 工作类
        ("工作", "", "产出", "工作相关", "工作,办公,会议,项目,任务,deadline"),
        # 生活类
        ("生活", "", "日常", "日常生活", "做饭,家务,购物,理发,银行,办事"),
        ("饮食", "生活", "日常", "吃饭、烹饪", "吃,饭,做饭,烹饪,外卖,餐厅,美食"),
        ("睡眠", "生活", "日常", "睡觉、休息", "睡,午休,休息,小憩"),
        # 其他
        ("其他", "", "其他", "未分类", ""),
    ]

    for tag, parent, cat, desc, kw in tags:
        c.execute(
            "INSERT OR IGNORE INTO tag_taxonomy (tag, parent_tag, category, description, keywords) VALUES (?,?,?,?,?)",
            (tag, parent, cat, desc, kw),
        )

    conn.commit()
    conn.close()
    print(f"✅ 数据库初始化完成: {DB_PATH}")

    # 统计
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM tag_taxonomy")
    tag_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM activities")
    act_count = c.fetchone()[0]
    conn.close()
    print(f"   标签体系: {tag_count} 个标签")
    print(f"   活动记录: {act_count} 条")


if __name__ == "__main__":
    init_db()
