#!/bin/bash
# skills-count-guard.sh — SKILL.md 计数对账 + 空壳检测自检 (2026-09-08)
# swarm:skills-guard-v2
#
# 事故背景: 2026-09-08 09:47 update autostash(--keep-stash) 扫走 repo 树 untracked
# skills，共享层符号链接透传导致主库 43 个 skill 目录空壳。本脚本是 update/
# post-merge 流水线的计数对账守卫：前快照 → 操作 → 后快照 → 对账，后<前即告警
# 并输出损失清单；空壳目录（目录存在但无 SKILL.md）视为损伤。
#
# 用法:
#   skills-count-guard.sh snapshot        # 打印当前计数（供 hook 前后快照）
#   skills-count-guard.sh check <before> <after>
#       # 对账: after<before → exit 2 + 损失清单; 空壳 → exit 3 + 空壳清单
#   skills-count-guard.sh full            # 单次完整体检（计数合理性+空壳扫描）
#
# 退出码: 0 健康 / 2 计数下降 / 3 空壳检测 / 4 参数错误
# 默认静默（healthy → 无输出）；--verbose 显示 ✓

SHARED="$HOME/.hermes/skills"
VERBOSE="${SKILLS_GUARD_VERBOSE:-0}"
[ "${1:-}" = "--verbose" ] && { VERBOSE=1; shift; }

count_skill_mds() {
  # -L 跟随符号链接（共享层 category 是指向 repo 树的链接），排除 archive
  find -L "$SHARED" -name SKILL.md 2>/dev/null | grep -v '/archive/' | wc -l | tr -d ' '
}

find_empty_shells() {
  # 共享层直接子目录（含 symlink 透传后的 category）下：目录存在但无 SKILL.md
  # 只扫两层（category/name），跳过 dot 目录、archive、.hub 等
  # 修正：category 目录若有子 skill（含 SKILL.md）不视为空壳；只有叶子目录无
  # SKILL.md 才报警。纯描述性 category（无子目录）也跳过——它们不是 skill 容器。
  # 关键：只检查指向 repo 树的 symlink category（事故场景的攻击面）；real-dir
  # category（如 cybersecurity 等）不在自动同步范围，不视为空壳风险。
  python3 - "$SHARED" <<'PYEOF'
import os, sys
base = sys.argv[1]
shells = []
if not os.path.isdir(base):
    print(":root-missing")
    sys.exit(0)
for cat in sorted(os.listdir(base)):
    if cat.startswith('.') or cat == 'archive':
        continue
    catp = os.path.join(base, cat)
    if not os.path.isdir(catp):
        continue
    # 顶层单例 skill（category 目录本身就是 skill，有 SKILL.md）
    if os.path.exists(os.path.join(catp, 'SKILL.md')):
        continue
    # 只检查 symlink 类别（指向 repo 树的）——这些是事故时会被抽空的攻击面
    if not os.path.islink(catp):
        # real-dir category（非 repo 同步来源）——合法，非空壳风险
        continue
    # symlink category: 目标目录存在但可能被抽空
    try:
        children = os.listdir(catp)
    except OSError:
        shells.append(f"{cat} (link target unreadable)")
        continue
    if not children:
        shells.append(f"{cat} (symlink to empty target)")
        continue
    # 统计该 category 下有多少个拥有 SKILL.md 的子目录
    skilled = 0
    for name in sorted(os.listdir(catp)):
        if name.startswith('.') or name in ('archive', 'knowledge-base', 'references'):
            continue
        sub = os.path.join(catp, name)
        if os.path.isdir(sub) and os.path.exists(os.path.join(sub, 'SKILL.md')):
            skilled += 1
    if skilled == 0:
        # category 里没有任何带 SKILL.md 的子目录 → 整个 category 疑似空壳
        shells.append(f"{cat} (all {len(children)} child dirs lack SKILL.md)")
    else:
        # 有子 skill，但可能还有空壳子目录（被抽空的）
        for name in sorted(os.listdir(catp)):
            if name.startswith('.') or name in ('archive', 'knowledge-base', 'references'):
                continue
            sub = os.path.join(catp, name)
            if os.path.isdir(sub) and not os.path.exists(os.path.join(sub, 'SKILL.md')):
                shells.append(f"{cat}/{name}")
if shells:
    print('\n'.join(shells))
PYEOF
}

case "${1:-}" in
  snapshot)
    count_skill_mds
    ;;
  check)
    [ -z "${2:-}" ] || [ -z "${3:-}" ] && { echo "usage: $0 check <before> <after>" >&2; exit 4; }
    before=$2; after=$3; rc=0
    if [ "$after" -lt "$before" ]; then
      echo "⚠ SKILLS-COUNT DROPPED: before=$before after=$after (lost $((before-after)))"
      echo "  empty-shell / damage list:"
      find_empty_shells | sed 's/^/    /'
      rc=2
    else
      shells=$(find_empty_shells)
      if [ -n "$shells" ]; then
        echo "⚠ EMPTY SHELL DETECTED (count ok $before→$after but shells exist):"
        echo "$shells" | sed 's/^/    /'
        rc=3
      elif [ "$VERBOSE" = 1 ]; then
        echo "✓ skills count stable: $before → $after, no empty shells"
      fi
    fi
    exit $rc
    ;;
  full)
    n=$(count_skill_mds)
    shells=$(find_empty_shells)
    if [ -n "$shells" ]; then
      echo "⚠ skills guard: count=$n, empty shells:"
      echo "$shells" | sed 's/^/    /'
      exit 3
    fi
    [ "$VERBOSE" = 1 ] && echo "✓ skills guard healthy: count=$n"
    exit 0
    ;;
  *)
    echo "usage: $0 [--verbose] {snapshot|check <before> <after>|full}" >&2
    exit 4
    ;;
esac
