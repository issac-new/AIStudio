#!/bin/bash
# mx-pin-review-object.sh — 评审对象钉锚（2026-11-05 run27 G2 两连熔断根治件）
#
# 根因：修订推仓后秒级派复评，评审回合读本地未 fetch 的旧稿——判词锚在旧版，
# 旧版没修缺项→合理 FAIL→复审窗口翻负→熔断（run27 实锤：派单锚 ce4f09c、
# 卡面判词却评审 v1.1@72de4e9 旧稿）。钉锚＝派发前把评审对象文件以锚内容
# 覆写进评审人工作区，评审人读到的就是派单锚版本，不依赖 agent 自觉 fetch。
#
# 用法: mx-pin-review-object.sh <workspace_repo> <anchor_sha> <repo_path>
#   workspace_repo 评审人工作区 git 仓（workspaces/<agent>/aipaydev）
#   anchor_sha     派单锚（origin/main 上该文件最新提交）
#   repo_path      评审对象仓内路径
# 退出码：0=钉成或幂等放行（锚空/非 git 仓）；1=锚:路径不存在（记障不阻断调用方）
set -uo pipefail
WS="${1:-}"
ANCHOR="${2:-}"
PATH_IN="${3:-}"
if [ -z "$ANCHOR" ]; then
  echo "[钉锚 SKIP] 锚空（上游未取到，放行交由判词锚守卫兜底）"
  exit 0
fi
if [ ! -d "$WS/.git" ]; then
  echo "[钉锚 SKIP] 非 git 仓形态（评审人无独立仓，放行）"
  exit 0
fi
git -C "$WS" fetch -q origin 2>/dev/null || true
SPEC="${ANCHOR}:${PATH_IN}"
if ! git -C "$WS" cat-file -e "$SPEC" 2>/dev/null; then
  echo "[钉锚 FAIL] ${SPEC} 不在对象库（fetch 后仍缺席）"
  exit 1
fi
mkdir -p "$WS/$(dirname "$PATH_IN")"
if git -C "$WS" show "$SPEC" > "$WS/$PATH_IN"; then
  echo "[钉锚] ${PATH_IN} 已钉为锚 ${ANCHOR} 版"
  exit 0
fi
echo "[钉锚 FAIL] 覆写失败（权限/路径）"
exit 1
