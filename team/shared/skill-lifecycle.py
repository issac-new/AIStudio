#!/usr/bin/env python3
"""
skill-lifecycle.py — 技能筛选/淘汰/召回 (2026-08-18)
======================================================
解决"高频复用要有自己的筛选和淘汰、召回机制":
  - 长期零使用的技能 → 归档出共享层(所有 profile 的索引立即瘦身)
  - 归档内容登记 MANIFEST.md(含描述), 可一键 restore 召回
  - 默认 dry-run, apply 才执行; 保护名单(全局 pin / skill-recall / hermes-agent)永不归档

使用判定(v1):
  1) 技能名在所有 profile 的 agent.log(含轮转)中出现 → 有使用记录(取最近时间戳)
  2) 技能名在 ~/.hermes/state.db 或 profiles/*/state.db 的文本中出现 → 视为有使用
  3) 无任何记录 且 目录 mtime 老于 --min-age-days(默认14) → 归档候选
  4) 有记录但最近使用早于 --unused-days(默认30) → 归档候选
日志中 skill_view 不含技能名, 故以"名字全文出现"为代理指标 —— 宁可漏杀, 不可误杀。

用法(hermes venv python):
  .../skill-lifecycle.py scan                      # 预览归档候选
  .../skill-lifecycle.py scan --unused-days 45     # 调整阈值
  .../skill-lifecycle.py apply                     # 执行归档(写 MANIFEST)
  .../skill-lifecycle.py restore <skill-name>      # 召回
  归档后: ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/generate-configs.py
         + skill-fence.py apply  (刷新 disabled 名单)
"""
import argparse
import datetime
import re
import shutil
import sqlite3
import sys
import time
from pathlib import Path

import yaml

HERMES = Path.home() / ".hermes"
SHARED_LAYER = HERMES / "skills"
ARCHIVE = HERMES / "skills-archive"
SHARED_YAML = HERMES / "shared" / "profiles.yaml"

# 永不归档
ALWAYS_PROTECT = {"skill-recall", "hermes-agent"}

TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")


def protected_names():
    names = set(ALWAYS_PROTECT)
    try:
        data = yaml.safe_load(SHARED_YAML.read_text()) or {}
        for cfg in (data.get("profiles", {}) or {}).values():
            for s in (cfg or {}).get("skills_pinned", []) or []:
                names.add(str(s))
    except Exception:
        pass
    return names


def iter_enabled_categories():
    """共享层中被任何 profile board 引用的类目 = 治理范围."""
    cats = set()
    try:
        data = yaml.safe_load(SHARED_YAML.read_text()) or {}
        for cfg in (data.get("profiles", {}) or {}).values():
            cfg = cfg or {}
            cats.update(c for c in cfg.get("skills_enabled", []) if isinstance(c, str))
    except Exception:
        pass
    return cats


def iter_skills(categories):
    """yield (category, skill_dir) — 类目下每个含 SKILL.md 的子目录."""
    for cat in sorted(categories):
        cat_dir = SHARED_LAYER / cat
        if not cat_dir.is_dir():
            continue
        if (cat_dir / "SKILL.md").exists():
            yield cat, cat_dir
            continue
        for sub in sorted(cat_dir.iterdir()):
            if sub.is_dir() and (sub / "SKILL.md").exists():
                yield cat, sub


def usage_records(name):
    """返回 (last_used_iso or None, evidence)"""
    last = None
    evid = []
    # 1) 日志
    for logf in HERMES.glob("profiles/*/logs/agent.log*"):
        try:
            with open(logf, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if name in line:
                        evid.append(logf.name)
                        m = TS_RE.match(line)
                        if m:
                            ts = m.group(1)
                            if last is None or ts > last:
                                last = ts
        except Exception:
            pass
    # 2) sqlite(state.db 文本列全文 LIKE — 慢但周频任务可接受)
    if not evid:
        for db in [HERMES / "state.db"] + list(HERMES.glob("profiles/*/state.db")):
            if not db.exists():
                continue
            try:
                con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
                tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
                hit = False
                for t in tables:
                    try:
                        cols = [r[1] for r in con.execute(f"PRAGMA table_info('{t}')")]
                        for c in cols:
                            n = con.execute(
                                f"SELECT COUNT(*) FROM '{t}' WHERE \"{c}\" LIKE ? LIMIT 1", (f"%{name}%",)
                            ).fetchone()[0]
                            if n:
                                hit = True
                                break
                    except Exception:
                        continue
                    if hit:
                        break
                con.close()
                if hit:
                    evid.append(db.name)
            except Exception:
                pass
    return last, evid


def desc_of(skill_dir):
    try:
        text = (skill_dir / "SKILL.md").read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"^description:\s*(.+)$", text, re.M)
        return (m.group(1).strip().strip("'\"")[:80]) if m else ""
    except Exception:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", choices=["scan", "apply", "restore"], default="scan")
    ap.add_argument("name", nargs="?", help="restore 模式: 技能名")
    ap.add_argument("--min-age-days", type=int, default=14)
    ap.add_argument("--unused-days", type=int, default=30)
    args = ap.parse_args()
    today = datetime.date.today()

    if args.mode == "restore":
        if not args.name:
            print("用法: skill-lifecycle.py restore <skill-name>"); sys.exit(2)
        hits = [p for p in ARCHIVE.rglob(args.name) if p.is_dir()]
        if not hits:
            print(f"归档中未找到 {args.name}"); sys.exit(1)
        src = hits[0]
        rel = src.relative_to(ARCHIVE)
        # 归档路径 .../<profile>/<name> 或 global/<category>/<name>
        parts = list(rel.parts)
        if parts[0] == "global" and len(parts) >= 3:
            dest = SHARED_LAYER / parts[1] / parts[2]
        elif parts[0] == "global" and len(parts) == 2:
            dest = SHARED_LAYER / parts[1]          # 单例技能
        else:
            dest = HERMES / "profiles" / parts[0] / "skills" / parts[-1]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            print(f"目标已存在: {dest}"); sys.exit(1)
        shutil.move(str(src), str(dest))
        print(f"✅ 已召回: {src} -> {dest}")
        print("后续: 若为顶层单例需加入 profiles.yaml skills_pinned; 然后重跑 generate-configs.py + skill-fence.py apply")
        return

    protect = protected_names()
    cats = iter_enabled_categories()
    now = time.time()
    candidates = []
    total = 0
    for cat, sd in iter_skills(cats):
        total += 1
        name = sd.name
        if name in protect:
            continue
        age_days = (now - sd.stat().st_mtime) / 86400
        if age_days < args.min_age_days:
            continue
        last, evid = usage_records(name)
        if evid and last is None:
            continue  # 有痕迹但无时间戳 → 保守跳过
        if last:
            d = datetime.date.fromisoformat(last[:10])
            if (today - d).days <= args.unused_days:
                continue
        candidates.append((cat, name, sd, last or "从未", desc_of(sd)))

    print(f"治理范围: {len(cats)} 类目 / {total} 技能; 归档候选 {len(candidates)} (min-age={args.min_age_days}d unused={args.unused_days}d)")
    for cat, name, sd, last, desc in candidates:
        print(f"  - {cat}/{name}  最近使用={last}  {desc}")
    if args.mode != "apply":
        print("(dry-run — apply 执行归档)")
        return
    stamp = datetime.datetime.now().strftime("%F %T")
    with open(ARCHIVE / "MANIFEST.md", "a", encoding="utf-8") as mf:
        for cat, name, sd, last, desc in candidates:
            rel = sd.relative_to(SHARED_LAYER)
            dest = ARCHIVE / "global" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(sd), str(dest))
            mf.write(f"- {name} | global/{rel} | {stamp} | 最近使用={last} | {desc} | 恢复: skill-lifecycle.py restore {name}\n")
            print(f"  archived: {rel}")
    print(f"✅ 归档 {len(candidates)} 个。后续: generate-configs.py + skill-fence.py apply 刷新各 profile 禁用名单。")


if __name__ == "__main__":
    main()
