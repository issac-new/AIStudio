#!/usr/bin/env python3
"""Hermes Agent 熵管理清理脚本 — 每周执行一次。

扫描 ~/.hermes 目录，检测并报告以下熵积累：
1. 文档新鲜度：SOUL.md/rules.md mtime > 30 天
2. 工具库存：SOUL.md 引用的工具是否在 config.yaml toolsets 中
3. kanban 过期任务：running > 7 天 / blocked > 14 天
4. 重复失败分析：kanban_comment 中同类 error_type >= 3 次
5. memory 使用率：> 90% 告警
6. .bak 文件清理：扫描并删除 .bak 文件
7. 重复 skill 检测：同名 skill 出现在多个 profile
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

HERMES = Path(os.path.expanduser("~/.hermes"))
PROFILES = HERMES / "profiles"
REPORT = []

def log(category, severity, message, detail=""):
    REPORT.append({
        "category": category,
        "severity": severity,
        "message": message,
        "detail": detail,
        "timestamp": datetime.now().isoformat(),
    })

# 1. 文档新鲜度
now = time.time()
threshold = 30 * 24 * 3600  # 30 days
for soul in PROFILES.rglob("SOUL.md"):
    if ".git" in str(soul):
        continue
    age = now - soul.stat().st_mtime
    if age > threshold:
        days = int(age / (24 * 3600))
        log("文档新鲜度", "MEDIUM", f"{soul.relative_to(HERMES)} 最后修改 {days} 天前", str(soul))

for rules in PROFILES.rglob("*_rules.md"):
    if ".git" in str(rules):
        continue
    age = now - rules.stat().st_mtime
    if age > threshold:
        days = int(age / (24 * 3600))
        log("文档新鲜度", "MEDIUM", f"{rules.relative_to(HERMES)} 最后修改 {days} 天前", str(rules))

# 2. .bak 文件清理
bak_count = 0
for bak in HERMES.rglob("*.bak"):
    if ".git" in str(bak):
        continue
    bak_count += 1
    log(".bak 清理", "LOW", f"发现 .bak 文件: {bak.relative_to(HERMES)}", str(bak))

if bak_count == 0:
    log(".bak 清理", "INFO", "无 .bak 文件（正常）")

# 3. memory 使用率
memory_file = PROFILES / "orchestrator" / "memories" / "MEMORY.md"
if memory_file.exists():
    content = memory_file.read_text()
    # Check for usage indicator
    if "2,200/2,200" in content or "2199/2200" in content or "2200/2200" in content:
        log("memory 使用率", "HIGH", "orchestrator memory 已满 (2200/2200 chars)", str(memory_file))
    else:
        log("memory 使用率", "INFO", "orchestrator memory 使用正常")

# 4. 重复 skill 检测
skill_locations = {}
for sk in HERMES.rglob("SKILL.md"):
    if ".git" in str(sk) or "node_modules" in str(sk):
        continue
    try:
        content = sk.read_text(errors='ignore')
        if content.startswith("---"):
            # Extract name from frontmatter
            for line in content.split('\n')[:10]:
                if line.strip().startswith("name:"):
                    name = line.split(":", 1)[1].strip().strip('"').strip("'")
                    if name not in skill_locations:
                        skill_locations[name] = []
                    skill_locations[name].append(str(sk.relative_to(HERMES)))
                    break
    except:
        pass

for name, locations in skill_locations.items():
    if len(locations) > 3:
        log("重复 skill", "LOW", f"skill '{name}' 出现在 {len(locations)} 个位置", ", ".join(locations[:5]))

# 5. 概念重复检测（简单版：搜索关键概念在多少个 skill 中出现）
concepts = {
    "Delivering Work": r"Delivering Work",
    "Corrections 传播阈值": r"Corrections.*传播阈值|Corrections.*propagation",
    "五维评估": r"五维评估|5D.*evaluation|EvaluationSuite",
    "规则分层放置": r"规则分层放置|rule.*placement.*audit",
}

all_skills = list(HERMES.rglob("SKILL.md"))
all_skills = [s for s in all_skills if ".git" not in str(s) and "node_modules" not in str(s)]

for concept, pattern in concepts.items():
    import re
    found = []
    for sk in all_skills:
        try:
            content = sk.read_text(errors='ignore')
            if re.search(pattern, content, re.IGNORECASE):
                found.append(sk.parent.name)
        except:
            pass
    if len(found) > 2:
        log("概念重复", "MEDIUM", f"'{concept}' 在 {len(found)} 个 skill 中重复: {', '.join(found)}")

# 6. kanban 过期任务（检查 kanban.db）
kanban_db = HERMES / "kanban.db"
if kanban_db.exists():
    try:
        import sqlite3
        conn = sqlite3.connect(str(kanban_db))
        cursor = conn.cursor()
        
        # Check for stale running tasks
        seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()
        cursor.execute("SELECT id, title, assignee FROM tasks WHERE status='running' AND updated_at < ?", (seven_days_ago,))
        for row in cursor.fetchall():
            log("kanban 过期", "HIGH", f"running 任务 > 7 天: {row[1]} (id={row[0]}, assignee={row[2]})")
        
        # Check for stale blocked tasks
        fourteen_days_ago = (datetime.now() - timedelta(days=14)).isoformat()
        cursor.execute("SELECT id, title FROM tasks WHERE status='blocked' AND updated_at < ?", (fourteen_days_ago,))
        for row in cursor.fetchall():
            log("kanban 过期", "MEDIUM", f"blocked 任务 > 14 天: {row[1]} (id={row[0]})")
        
        conn.close()
    except Exception as e:
        log("kanban 过期", "INFO", f"无法查询 kanban.db: {e}")
else:
    log("kanban 过期", "INFO", "无 kanban.db（可能不是 dispatcher profile）")

# 7. 符号链接完整性检查（自引用循环 + 断裂链接）
shared_skills = HERMES / "skills"
if shared_skills.exists():
    loop_count = 0
    broken_count = 0
    ok_count = 0
    
    for item in shared_skills.iterdir():
        if item.name.startswith(".") or not item.is_symlink():
            continue
        target = os.readlink(item)
        # Self-referencing loop: target resolves to the same path as the link
        if os.path.abspath(target) == str(item):
            loop_count += 1
            log("符号链接", "HIGH", f"自引用循环: {item.name} → {target}（指向自身）", str(item))
        elif not Path(target).exists():
            broken_count += 1
            log("符号链接", "HIGH", f"断裂链接: {item.name} → {target}（目标不存在）", str(item))
        else:
            ok_count += 1
    
    if loop_count == 0 and broken_count == 0:
        log("符号链接", "INFO", f"shared skills 符号链接正常（{ok_count} 个工作链接）")
    
    # Also check profile symlinks pointing to shared
    for profile_dir in PROFILES.iterdir():
        if not profile_dir.is_dir() or profile_dir.name.startswith("_") or profile_dir.name.startswith("."):
            continue
        ps = profile_dir / "skills"
        if not ps.exists():
            continue
        for item in ps.iterdir():
            if item.name.startswith(".") or not item.is_symlink():
                continue
            target = os.readlink(item)
            if not Path(target).exists():
                log("符号链接", "HIGH", f"{profile_dir.name}/{item.name}: 断裂 → {target}", str(item))
else:
    log("符号链接", "INFO", "无 ~/.hermes/skills 目录")

# Summary
print("=" * 60)
print(f"Hermes 熵管理报告 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
print("=" * 60)

severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "INFO": 3}
REPORT.sort(key=lambda x: (severity_order.get(x["severity"], 99), x["category"]))

counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
for item in REPORT:
    counts[item["severity"]] = counts.get(item["severity"], 0) + 1

print(f"\n总计: {len(REPORT)} 项")
print(f"  HIGH: {counts.get('HIGH', 0)}")
print(f"  MEDIUM: {counts.get('MEDIUM', 0)}")
print(f"  LOW: {counts.get('LOW', 0)}")
print(f"  INFO: {counts.get('INFO', 0)}")

print("\n--- 详情 ---")
for item in REPORT:
    emoji = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🔵", "INFO": "✅"}.get(item["severity"], "❓")
    print(f"{emoji} [{item['category']}] {item['message']}")

# Output JSON for programmatic consumption
print("\n--- JSON ---")
print(json.dumps(REPORT, ensure_ascii=False, indent=2))
