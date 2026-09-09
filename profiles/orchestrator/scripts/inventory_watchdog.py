#!/usr/bin/env python3
"""Skill-board drift watchdog. Silent when healthy; prints report only on drift.
Baseline: devops/skill-board-scoping (2026-08-05).
Exit 0 always when healthy so cron stays quiet; non-zero on drift so the
scheduler surfaces an alert."""
import os, sys
from pathlib import Path

HERMES = Path.home() / ".hermes"
SHARED = HERMES / "skills"
PROFILES = HERMES / "profiles"

# 2026-08-18: EXPECTED 改为从 shared/profiles.yaml 动态推导(单一事实源)。
# 旧硬编码基线(orchestrator=385 等)本身固化了技能膨胀; 现在期望值 = board
# (skills_enabled ∪ skills_pinned) 在共享层下的实际 SKILL.md 数, fence 执行后
# 应恰好命中。
import re as _re

def _load_boards():
    # 2026-09-04: parse with yaml.safe_load instead of the hand-rolled line
    # scanner. profiles.yaml is machine-rewritten by PyYAML (skill-board
    # tooling), which emits anchors/aliases ("skills_enabled: *id006") that
    # carry NO list items on the alias line — the line scanner silently
    # collected empty sets for every aliased profile (data-flink,
    # [已移除], ...) and flagged them UNSCOPED/DRIFT. safe_load resolves
    # anchors/aliases to the real lists.
    boards = {}
    try:
        import yaml
        with open(HERMES / "shared" / "profiles.yaml", encoding="utf-8") as f:
            doc = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return boards
    except Exception:
        return boards
    if not isinstance(doc, dict):
        return boards
    doc = doc.get("profiles", doc)  # 2026-09-04: file nests profiles under top-level "profiles:"
    for prof, spec in doc.items():
        if not isinstance(spec, dict) or prof.startswith("shared_config"):
            continue
        items = set()
        for k in ("skills_enabled", "skills_pinned"):
            v = spec.get(k)
            if isinstance(v, list):
                items.update(str(x) for x in v)
        if items:
            boards[prof] = items
    return boards

def _expected_count(board):
    n = 0
    for cat in board:
        d = SHARED / cat
        if not d.is_dir():
            continue
        if (d / "SKILL.md").exists():   # 顶层单例技能
            n += 1
            continue
        n += sum(1 for sub in d.iterdir() if sub.is_dir() and (sub / "SKILL.md").exists())
    return n

EXPECTED = {p: _expected_count(b) for p, b in _load_boards().items() if _expected_count(b) > 0}
TOLERANCE = 0.25          # ±25% drift allowed before flagging
HARD_MIN, HARD_MAX = 20, 600   # absolute sanity rails (全家桶 regression => ~1000)

def count_skills(skills_dir: Path) -> int:
    n = 0
    for root, _dirs, files in os.walk(skills_dir, followlinks=True):
        # maxdepth 3 equivalent
        depth = len(Path(root).relative_to(skills_dir).parts)
        if depth >= 3:
            _dirs[:] = []
            continue
        n += files.count("SKILL.md")
    return n

def count_real_dir_categories(skills_dir: Path) -> int:
    """Count top-level categories that are REAL directories (not symlinks).

    Update's bundled-skill seeding copytree materialises shared categories as
    real dirs inside profiles; symlinked categories are the canonical shape.
    A healthy profile should have ~0 real-dir copies of shared categories.
    """
    if not skills_dir.exists():
        return 0
    return sum(
        1
        for entry in skills_dir.iterdir()
        if entry.is_dir() and not entry.is_symlink() and not entry.name.startswith(".")
    )

def broken_links() -> list:
    bad = []
    bases = [SHARED] + [p / "skills" for p in PROFILES.iterdir()
                        if p.is_dir() and not p.name.startswith(("_", "."))
                        and (p / "skills").exists()]
    for base in bases:
        for entry in base.iterdir():
            if entry.is_symlink() and not entry.exists():
                bad.append(str(entry))
    return bad

problems = []

# 1. per-profile drift
for prof, expected in EXPECTED.items():
    if not (PROFILES / prof).exists():
        continue  # 已声明但尚未创建的 profile(architect/hack-c2 等)不算漂移
    sd = PROFILES / prof / "skills"
    if not sd.exists():
        problems.append(f"MISSING skills dir: {prof}")
        continue
    actual = count_skills(sd)
    lo, hi = max(HARD_MIN, int(expected * (1 - TOLERANCE))), min(HARD_MAX, int(expected * (1 + TOLERANCE)))
    if not (lo <= actual <= hi):
        problems.append(f"DRIFT {prof}: indexed={actual} expected~{expected} (allowed {lo}-{hi})")
    # Shape check: real-dir copies of shared categories should be ~0.
    # >0 means update's bundled seeding (sync_skills copytree) materialised
    # shared skills as real dirs instead of symlinks — the 2026-08-06 bug.
    # orchestrator is exempt: it owns the custom real-dir skills (hub/curator).
    # Only flag real dirs whose category ALSO exists in the shared layer —
    # custom-only real dirs (e.g. [已移除]) are legitimate.
    if prof == "orchestrator":
        continue
    real_dir_copies = [
        e.name
        for e in sd.iterdir()
        if e.is_dir() and not e.is_symlink()
        and not e.name.startswith(".") and (SHARED / e.name).is_dir()
    ]
    if real_dir_copies:
        problems.append(
            f"DIRCOPIES {prof}: {len(real_dir_copies)} real-dir shared-category copies "
            f"({', '.join(real_dir_copies)}) "
            f"(should be symlinks; run post-merge apply_board demote)"
        )

# 2. unknown active profiles not in baseline (new profile created without board scoping)
for p in PROFILES.iterdir():
    if not p.is_dir() or p.name.startswith(("_", ".")) or p.name.endswith(".archived"):
        continue
    if (p / "skills").exists() and p.name not in EXPECTED:
        problems.append(f"UNSCOPED profile (not in baseline mapping): {p.name} -> apply skill-board-scoping")

# 3. broken symlinks
for b in broken_links():
    problems.append(f"BROKEN link: {b}")

# 4. zero-skill stub categories in shared (skip dot-dirs like .curator_backups/.hub)
for cat in SHARED.iterdir():
    if cat.name.startswith("."):
        continue
    if cat.is_dir() and not any(cat.rglob("SKILL.md")):
        problems.append(f"EMPTY stub category in shared: {cat.name}")

if problems:
    print(f"skill-board drift detected ({len(problems)} issues):")
    for p in problems:
        print(f"  - {p}")
    print("Fix: ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/skill-fence.py apply --with-configs")
    sys.exit(1)
# healthy: stay silent


# ---------------------------------------------------------------------------
# Tool inventory drift (merged 2026-08-05; baseline: devops/tool-inventory-baseline)
# ---------------------------------------------------------------------------
import subprocess

def _count(cmd, skip=0):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
        lines = [l for l in out.splitlines() if l.strip()]
        return max(0, len(lines) - skip)
    except Exception:
        return -1   # tool missing entirely -> flag

def _conda_envs():
    try:
        out = subprocess.run(["conda", "env", "list"], capture_output=True, text=True, timeout=60).stdout
        return len([l for l in out.splitlines()
                    if l.strip() and not l.startswith("#") and "/envs/" in l])
    except Exception:
        return -1

tool_problems = []

brew_leaves = _count(["brew", "leaves"])
npm_global  = _count(["npm", "ls", "-g", "--depth=0"], skip=1)
pipx_n      = _count(["pipx", "list", "--short"])
uv_n        = len([l for l in subprocess.run(["uv", "tool", "list"],
                   capture_output=True, text=True, timeout=60).stdout.splitlines()
                   if l and l[0].islower() and " " not in l.strip().split(" ")[0].strip("-")])
conda_n     = _conda_envs()

TOOL_EXPECTED = {
    "brew leaves (~101)": (brew_leaves, 101, 0.20),  # rebaselined 2026-08-11 (was 73; +28 = hack team security tools)
    "npm global (~25)":  (npm_global, 25, 0.35),  # rebaselined 2026-09-02 (was 16; +9 agent-workflow CLIs: dsh/dsh-tui/openspec/codex-security/claude-code/open-code-review/gitlab-ci-local/corepack + claude-mem(Claude Code plugin, usage 2263) + cnpm(user 08-28 npmmirror))
    "pipx (10)":         (pipx_n, 10, 0.30),
    "uv tools (3)":      (uv_n, 3, 0.50),
    "conda envs (3)":    (conda_n, 3, 0.50),
}
for name, (actual, expected, tol) in TOOL_EXPECTED.items():
    if actual < 0:
        tool_problems.append(f"TOOL-CHECK-FAIL {name}: command missing")
        continue
    lo, hi = int(expected * (1 - tol)), int(expected * (1 + tol)) + 1
    if not (lo <= actual <= hi):
        tool_problems.append(f"TOOL-DRIFT {name}: actual={actual} expected~{expected}")

# banned re-installs (competing agent CLIs / credential risk surface)
BANNED = ["gemini-cli", "ironclaw", "zeroclaw", "flowise", "n8n", "nanobot"]
leaves_out = subprocess.run(["brew", "leaves"], capture_output=True, text=True, timeout=60).stdout
npm_out = subprocess.run(["npm", "ls", "-g", "--depth=0"], capture_output=True, text=True, timeout=60).stdout
for b in BANNED:
    if b in leaves_out or b in npm_out:
        tool_problems.append(f"BANNED-REINSTALL: {b} (see tool-inventory-baseline pruned list)")

if tool_problems:
    print(f"tool-inventory drift detected ({len(tool_problems)} issues):")
    for p in tool_problems:
        print(f"  - {p}")
    print("Fix: skill_view('devops:tool-inventory-baseline').")
    sys.exit(1)

