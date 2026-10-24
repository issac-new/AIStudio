#!/usr/bin/env python3
"""规则有效性机械扫描器 v1.0
检查维度：
  D1 引用存在性：SOUL/rules 中引用的 _shared/*.md 和 skills 是否真实存在（悬空引用=无法落地）
  D2 工具存在性：规则中提到的 hermes 工具/skill 名是否在集群真实可用
  D3 模糊措辞检测：无法机械判定的规则关键词（'尽量'/'酌情'/'注意'/'视情况'等）
  D4 重复块检测：跨 profile 的大段重复（维护负担=改一处漏一处）
  D5 死链检测：markdown 链接目标是否存在
  D6 可复制命令抽验：命令手册中的 hermes 命令语法抽验
输出 JSON 到 stdout，人类摘要到 stderr
"""
import os, re, json, sys, subprocess
from pathlib import Path
from collections import defaultdict

HOME = Path.home()
PROFILES = HOME / ".hermes" / "profiles"
SHARED = PROFILES / "_shared"

def out(msg): print(msg, file=sys.stderr)

# ---------- 收集语料 ----------
corpus = {}  # path -> text
profile_dirs = sorted([d for d in PROFILES.iterdir() if d.is_dir() and d.name != "_shared"])
out(f"profile 数: {len(profile_dirs)}")

def collect(root: Path, pats):
    texts = {}
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in (".md", ".yaml", ".yml") and any(re.search(pt, str(p)) for pt in pats):
            try: texts[str(p)] = p.read_text(errors="replace")
            except Exception: pass
    return texts

# 主 SOUL + rules 文件（每个 profile 的核心规则载体）
soul_pat = re.compile(r"(SOUL\.md|rules\.md|orchestrator_rules\.md|email_kanban_rules\.md)$")
for pd in profile_dirs:
    for f in pd.glob("*.md"):
        if soul_pat.search(f.name):
            corpus[str(f)] = f.read_text(errors="replace")

# _shared 全部 md
shared_files = {}
for f in SHARED.rglob("*.md"):
    if ".git" in str(f): continue
    shared_files[str(f)] = f.read_text(errors="replace")
    corpus[str(f)] = shared_files[str(f)]

out(f"核心规则文件数: {len(corpus)}（含 _shared {len(shared_files)}）")

issues = defaultdict(list)

# ---------- D1 引用存在性 ----------
ref_pat = re.compile(r"(?:_shared/|~/.hermes/profiles/_shared/)([\w\-./]+?\.md)")
skill_ref_pat = re.compile(r"skill_view\(\s*['\"]([\w\-]+)['\"]\s*\)")
shared_names = {f.split("/")[-1] for f in shared_files}

all_skills = set()
import subprocess as sp
# 跟随 symlink 的全量收集（rglob 不穿透 symlink）
# 2026-08-27 修复：覆盖全部 profile 的本地 skills（此前只扫 ~/.hermes/skills + orchestrator，
# 导致 worker-coder 等的 profile 本地 skill（devops-rd/verify-requirement 等）被误报 D2）
for skills_root in [HOME/".hermes"/"skills"] + sorted(PROFILES.glob("*/skills")):
    if skills_root.exists():
        for d in skills_root.rglob("SKILL.md"):
            all_skills.add(d.parent.name)
        find_out = sp.run(["find", "-L", str(skills_root), "-name", "SKILL.md"], capture_output=True, text=True).stdout
        for line in find_out.splitlines():
            all_skills.add(Path(line).parent.name)

# 占位示例文件名（文档中用作示意，非真实引用）——不计悬空
PLACEHOLDER_REFS = {"foo.md", "bar.md", "baz.md", "example.md", "xxx.md"}

for path, text in corpus.items():
    for m in ref_pat.finditer(text):
        ref = m.group(1).split("/")[-1]
        if ref in PLACEHOLDER_REFS:
            continue
        if ref not in shared_names:
            issues["D1_悬空引用"].append({"file": path, "ref": m.group(0)[:80]})
    for m in skill_ref_pat.finditer(text):
        s = m.group(1)
        if s not in all_skills:
            issues["D2_不存在的skill"].append({"file": path, "skill": s})

# ---------- D3 模糊措辞 ----------
vague_words = ["尽量", "酌情", "视情况", "适时", "灵活处理", "如有可能", "最好能", "考虑适当", "原则上"]
for path, text in corpus.items():
    lines = text.splitlines()
    for i, ln in enumerate(lines, 1):
        # 只统计规则性上下文（行首有 - 或数字. 或加粗标题）中的模糊词
        if re.match(r"^\s*(?:[-*]|\d+\.)\s", ln) and any(w in ln for w in vague_words):
            issues["D3_模糊措辞"].append({"file": path, "line": i, "text": ln.strip()[:100]})

# ---------- D5 死链 ----------
link_pat = re.compile(r"\[([^\]]{1,60})\]\(([^)\s]+\.md)\)")
for path, text in corpus.items():
    for m in link_pat.finditer(text):
        target = m.group(2)
        if target.startswith("http"): continue
        # 解析 ~/ 和相对路径
        tp = Path(target.replace("~", str(HOME))) if target.startswith("~") else (Path(path).parent / target)
        if not tp.exists():
            issues["D5_死链"].append({"file": path, "link": target[:100]})

# ---------- D4 重复块（跨 profile SOUL 的 5 行指纹）----------
block_map = defaultdict(list)
for pd in profile_dirs:
    soul = pd / "SOUL.md"
    if not soul.exists(): continue
    lines = soul.read_text(errors="replace").splitlines()
    for i in range(len(lines) - 5):
        chunk = tuple(l.strip() for l in lines[i:i+5] if l.strip())
        if len(chunk) == 5 and all(len(c) > 20 for c in chunk):
            block_map["\n".join(chunk)].append(f"{pd.name}:{i+1}")

dup_blocks = {k: v for k, v in block_map.items() if len({x.split(':')[0] for x in v}) >= 3}
out(f"跨 ≥3 profile 重复的 5 行块: {len(dup_blocks)}")

# ---------- D6 命令抽验：hermes 子命令语法 ----------
hermes_subcmds = subprocess.run(["hermes", "--help"], capture_output=True, text=True).stdout if subprocess.run(["which", "hermes"], capture_output=True).returncode == 0 else ""
valid_subcmds = set(re.findall(r"^\s+(\w[\w-]*)", hermes_subcmds, re.M))
cmd_pat = re.compile(r"^\s*hermes ([a-z][\w-]*)")
for path, text in corpus.items():
    for i, ln in enumerate(text.splitlines(), 1):
        m = cmd_pat.match(ln)
        if m and valid_subcmds and m.group(1) not in valid_subcmds:
            issues["D6_可疑命令"].append({"file": path, "line": i, "cmd": ln.strip()[:90]})

# ---------- 汇总 ----------
summary = {k: len(v) for k, v in issues.items()}
out("\n===== 扫描摘要 =====")
for k, c in summary.items():
    out(f"{k}: {c}")
out(f"D4 重复块组数: {len(dup_blocks)}")

# D7: SOUL/rules 引用但被 profile config disabled 的 skill（引用-禁用矛盾）
import re as _re2, yaml as _yaml
for prof in sorted(PROFILES.glob("*/config.yaml")):
    if prof.parent.name == "_shared": continue
    try:
        c = _yaml.safe_load(prof.read_text()) or {}
        disabled = set(c.get("skills", {}).get("disabled", []) or [])
        if not disabled: continue
        t_all = ""
        for f in [prof.parent/"SOUL.md"] + list(prof.parent.glob("*rules*.md")):
            if f.exists(): t_all += f.read_text(errors="replace")
        refs = set(_re2.findall(r"skill_view\(['\"]([\w-]+)['\"]\)", t_all))
        for bad in sorted(refs & disabled):
            issues["D7_引用被禁用"].append({"profile": prof.parent.name, "skill": bad})
    except Exception: pass

# watchdog 形态：D1/D2/D5/D6/D7 任一命中即漂移报警（D3/D4 属信息项不报警）
DRIFT_KEYS = ["D1_悬空引用", "D2_不存在的skill", "D5_死链", "D6_可疑命令", "D7_引用被禁用"]
drift = {k: v for k, v in issues.items() if k in DRIFT_KEYS and v}
if not drift:
    print(f"rules-audit OK: {len(corpus)} files clean (D1/D2/D5/D6/D7 all zero)")
    sys.exit(0)
print("RULES DRIFT DETECTED:")
print(json.dumps({k: v for k, v in drift.items()}, ensure_ascii=False, indent=1))
sys.exit(2)
