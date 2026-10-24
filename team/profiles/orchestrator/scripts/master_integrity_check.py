#!/usr/bin/env python3
"""master-skill-integrity-check — master 技能库完整性对账（2026-08-27 二轮体检新增）
背景：worldmonitor-intel master 曾在会话中无声消失（无 fs 审计可归因）。本脚本固化对账机制：
  1. 对每个 profile 的 skills/<cat>/ symlink，检查 master 目标是否存在（断链报警）
  2. 对 _trash 归档外的"影子删除"：与上次快照对比，master 分类内 SKILL.md 数量骤降 >20% 报警
  3. SOUL 引用的 skill 在 master 侧实体存在性
静默 = 健康（exit 0）；报警 = exit 1（cron surface）。
快照存 ~/.hermes/profiles/orchator/scripts/.master-integrity-snapshot.json —— 修正：orchestrator
"""
import os, sys, json, re, glob
from pathlib import Path

HOME = Path.home()
PROFILES = HOME / ".hermes" / "profiles"
MASTER = HOME / ".hermes" / "skills"
SNAP = PROFILES / "orchestrator" / "scripts" / ".master-integrity-snapshot.json"

problems = []

# ---- 1. profile 侧断链 ----
for link in glob.glob(str(PROFILES / "*" / "skills" / "*")):
    p = Path(link)
    if p.is_symlink() and not p.exists():
        problems.append(f"BROKEN-LINK {link} -> {os.readlink(link)}")

# ---- 2. master 分类数量 vs 快照 ----
def count_master():
    d = {}
    if not MASTER.is_dir():
        return d
    for cat in MASTER.iterdir():
        if not cat.is_dir():
            continue
        if (cat / "SKILL.md").is_file():
            d[cat.name] = 1  # 顶层单例
            continue
        n = sum(1 for sub in cat.iterdir() if sub.is_dir() and (sub / "SKILL.md").is_file())
        if n:
            d[cat.name] = n
    return d

cur = count_master()
if SNAP.exists():
    try:
        prev = json.loads(SNAP.read_text())
        for cat, n in prev.items():
            if cat in cur and cur[cat] < n * 0.8 and n >= 5:
                problems.append(f"MASTER-SHRINK {cat}: {n} -> {cur[cat]} (-{100-cur[cat]*100//n}%)")
            elif cat not in cur and n >= 5:
                problems.append(f"MASTER-GONE {cat}: 快照{n}个, 现不存在")
    except Exception as e:
        problems.append(f"SNAPSHOT-ERR {e}")
# 2026-08-27 蓝军复核 F-C 修复：只在健康时更新快照。
# 原缺陷：problems 非空也写快照 → 报警基线被污染（下次对比以"已缩水"状态为新常态，骤降检测失效）。
if not problems:
    SNAP.write_text(json.dumps(cur, ensure_ascii=False, indent=1))

# ---- 3. SOUL 引用 master 实体存在 ----
for soul in PROFILES.glob("*/SOUL.md"):
    prof = soul.parent.name
    if prof == "_shared":
        continue
    _t = soul.read_text(errors="replace")
    refs = set(re.findall(r"skill_view\(\s*['\"]([\w-]+)['\"]\s*\)", _t)) | set(re.findall(r"skill_view ([\w-]+)", _t))
    for r in refs:
        hit = False
        for cat_dir in (MASTER).iterdir():
            if (cat_dir / r / "SKILL.md").is_file() or (cat_dir / "SKILL.md").is_file() and cat_dir.name == r:
                hit = True
                break
        if not hit:
            problems.append(f"SOUL-REF-NO-MASTER {prof} -> {r}")

if problems:
    print(f"master integrity drift ({len(problems)}):")
    for p_ in problems:
        print("  -", p_)
    sys.exit(1)
print("master-integrity OK")
