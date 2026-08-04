---
name: personal-life-workbench
description: >-
  Build a personal AI life workbench on Hermes: activity tracking with
  auto-tagging, game discovery by tag, and knowledge fragmentation to
  systematic output. Covers the SQLite schema (4 tables), keyword-based
  auto-tagging, three cron jobs (daily stats with dual-source fusion,
  weekly game discovery, weekly knowledge consolidation), the cron script
  path pitfall, the test-data contamination pitfall, and the dual-source
  stats design (Hermes sessions + personal records). Use when building a
  personal productivity/life-tracking system on Hermes with cron plus
  Weixin delivery.
version: 1.2.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [personal, productivity, life-tracking, cron, sqlite, weixin]
    related_skills: [hermes-agent, xlsx, cognition-self-check]
---

# Personal Life Workbench

A three-module personal AI system built on Hermes: **activity tracking**,
**game discovery**, and **knowledge consolidation**. Records go into a
local SQLite DB; cron jobs generate reports and push them to Weixin.

## When to Use

- User wants to track daily activities with automatic categorization
- User wants game recommendations based on activity tags
- User has scattered knowledge notes needing systematic organization
- User wants daily/weekly reports delivered to their messaging channel
- Building any personal AI assistant pattern on Hermes (cron + DB + Weixin)
- User wants stats based on Hermes agent sessions + personal records

## Architecture

```
User (Weixin message) -> Hermes -> SQLite DB (life.db)
                                ^
                Cron jobs (3) read DB + generate reports -> deliver to Weixin
                    ^
                    |-- daily_stats.py now fuses TWO data sources:
                    |   1. Hermes sessions (hermes sessions list)
                    |   2. life.db activities (manual records)
```

Three modules share one SQLite database with four tables.

## Module 1: Activity Tracking + Auto-Tagging

### Schema (activities table)

```sql
CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    tags TEXT DEFAULT '',
    duration_min INTEGER DEFAULT 0,
    source TEXT DEFAULT 'manual',
    meta TEXT DEFAULT '{}'
);
```

### Auto-tagging mechanism

A `tag_taxonomy` table holds tag→keyword mappings. When recording an
activity, the script matches the activity text against all keywords
(case-insensitive substring) and assigns matching tags automatically.

```python
def auto_tag(activity_text, tag_map):
    text_lower = activity_text.lower()
    matched = set()
    for keyword, tag in tag_map.items():
        if keyword in text_lower:
            matched.add(tag)
    return ",".join(sorted(matched)) if matched else ""
```

### Tag hierarchy (17 preset tags, 7 categories)

```
运动(生活) -> 健身, 户外
学习(成长) -> 阅读, 编程, 技术
娱乐(休闲) -> 游戏, 影视, 音乐
社交(人际)
工作(产出)
生活(日常) -> 饮食, 睡眠
其他
```

### CLI interface

```bash
python3 scripts/life.py activity "下午跑步5公里" --duration 45
python3 scripts/life.py activity "玩了塞尔达" --duration 120 --tags 游戏
python3 scripts/life.py stats --days 7
python3 scripts/life.py list --date 2026-07-25 --tag 运动
```

## Module 2: Game Discovery

### Cron job: weekly game discovery

- Schedule: `0 20 * * 1` (Monday 20:00)
- Flow: read weekly activity stats, find top 2-3 entertainment tags,
  web_search for similar games, pick 3-5, save to DB, deliver to Weixin
- Feedback loop: user rates suggestions (rate id up|down)

## Module 3: Knowledge Consolidation

### Cron job: weekly knowledge consolidation

- Schedule: `0 21 * * 0` (Sunday 21:00)
- Toolsets: terminal, file, session_search
- Flow: query unstored fragments, hindsight_retain each, mark as stored,
  generate weekly summary with tag grouping

## Cron Job: Daily Stats (Dual-Source, v1.2)

- Schedule: `0 22 * * *` (daily 22:00)
- Script: `daily_stats.py` (via wrapper in `~/.hermes/profiles/orchestrator/scripts/`)
- Deliver: Weixin
- **Two data sources fused:**

### Source 1: Hermes Agent Sessions (automatic)

```python
def get_hermes_sessions(date_str=None):
    result = subprocess.run(
        ["hermes", "sessions", "list", "--limit", "200"],
        capture_output=True, text=True, timeout=15
    )
    # Session IDs start with YYYYMMDD — filter by date prefix
    # Exclude cron sessions (IDs containing "cron_")
    # Exclude 生活工作台 sessions
```

Session categorization (keyword-based, maps titles to work categories):

| Keywords | Category |
|----------|----------|
| [已移除], fdtd, fem, 喻文健, 崔晓亮, icdia | [已移除]研发 |
| hack, 渗透, 安全, sqlmap, nmap, exploit, 取证 | 安全研究 |
| profile, soul, gateway, yaml, token, config, docker | 系统运维 |
| 调研, 研究, research, palantir | 技术调研 |
| 编码, 代码, code, 开发, scaffold | 编码开发 |
| [已移除], 教育, 教案, 特殊教育 | 教育研究 |
| 行芯, phlexing, osint, 情报 | 竞争情报 |
| 修复, fix, debug, 401, error | 问题修复 |
| 优化, optimize, 精简, token | 系统优化 |
| 发布, github, push, 分发 | 发布部署 |

Also queries 5 kanban board DBs for tasks created that day.

### Source 2: Personal Manual Records (from life.db)

```python
def get_personal_activities(date_str=None):
    """Query life.db activities table for user-recorded activities."""
    return list_activities(date=date_str, limit=100)
```

### Output format

```
## 🤖 Hermes Agent 工作产出
- 会话数: N 个 (~Nh 预估)
### 按类别分布 (table)
### 会话明细 (grouped by category)

## 👤 个人活动记录
- 记录数: N 次, M 分钟

## 📈 汇总
- Hermes 会话 + 个人记录 → 预估总产出小时数
```

### Key design decisions

1. **Session date filtering via ID prefix** — `hermes sessions list` has
   no date filter; session IDs start with `YYYYMMDD`, so prefix matching works
2. **Cron sessions excluded** — automated jobs aren't user work
3. **Fallback to yesterday** if today has 0 sessions
4. **Work-hours estimation is rough** (~1h per session heuristic)

## Pitfalls

### Cron script path must be relative to ~/.hermes/scripts/

When creating a cron job with script parameter, the path is resolved
relative to `~/.hermes/scripts/` NOT the workdir. An absolute path or
home-relative path is rejected. Fix: create a wrapper script:

```bash
# ~/.hermes/profiles/orchestrator/scripts/daily_life_stats_wrapper.py
import subprocess, sys, os
TARGET = "$HOME/hermes-docker-sandbox/workspace/life-workbench/scripts/daily_stats.py"
subprocess.run([sys.executable, TARGET], cwd=os.path.dirname(TARGET))
```

Then pass `script="daily_life_stats_wrapper.py"` to cronjob.

### daily_stats.py must reference today not yesterday

A daily 22:00 stats cron should report on today's activities. Initially
the script used `timedelta(-1)` for yesterday which showed zero results
at 22:00 the same day. Fix: use `datetime.now()` for today.

### Hindsight toolset needed for knowledge cron

The weekly knowledge consolidation cron job needs session_search in its
enabled_toolsets to access hindsight_retain.

### Auto-tagging is keyword substring matching not NLP

Simple case-insensitive substring matching. Will miss synonyms not in
the keyword list and false-positive on substrings. For better accuracy,
expand the keyword list or add an LLM-based tagging pass.

### Never insert test data into the user's real database

When building the workbench, the agent inserted 5 fabricated activities
to verify the pipeline, then showed the user a stats report including
those test records as if they were real. The user caught this:
"7.25 life.db里的数据都是假的 帮我删掉"

**Fix**: After pipeline verification, ALWAYS delete test data before
showing stats. Or better: use a separate test database during development.

This is a specific instance of cognition-self-check #1 (facts vs
fabrication) and report-data-verification (every number must come from
a real tool call).

### Single-source stats miss real work (v1.1 → v1.2 fix)

The original daily_stats.py only queried life.db. When the user didn't
log activities manually, the report showed "0 activities" even though
they'd been working with Hermes all day. Fix: add Hermes sessions as
a second automatic source. See `references/dual-source-stats-design.md`
for the complete implementation.

## File Layout

```
~/hermes-docker-sandbox/workspace/life-workbench/
├── data/life.db
├── scripts/
│   ├── init_db.py
│   ├── life.py          # CLI: activity/knowledge/stats/list/games/rate
│   └── daily_stats.py   # Cron: dual-source daily report
├── reports/
├── logs/
└── README.md
```

## Weixin Integration

Users record activities and knowledge by sending Weixin messages:
- "记录活动：跑步5公里 45分钟" → life.py activity
- "记个知识点：SQLite WAL" → life.py knowledge
- "看看本周统计" → life.py stats
- "游戏列表" → life.py games

## Related Skills

- **hermes-agent** — CLI reference, cron job creation, config
- **gateway-smart-routing** — routing rules for Weixin messages
- **cognition-self-check** — prevents fabricated data errors
- **report-data-verification** — verifies numbers in stats reports
- **xlsx** — alternative storage backend
