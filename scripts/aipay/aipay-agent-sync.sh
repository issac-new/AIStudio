#!/bin/bash
# aipay-agent-sync.sh — 把 overlay 的 hermes-agent 侧 patch 部署到**实际运行**的 agent 运行时
#
# 为什么需要：`npm run inject` 只把 patch 打进入仓构建用的
#   upstream/hermes-agent（workspace 树），而推演实例执行的是
#   HERMES_BIN=~/.hermes/hermes-agent/venv/bin/hermes（安装树）。
#   两棵树互不相干，故 agent 侧 patch 长期对推演无效（09-23 实锤：安装树
#   HERMES_CUSTOM 标记数为 0，372 的 tick socket 短路径回落从未生效）。
#
# 安全边界：安装树可能带着使用者在跑的本地改动。本脚本
#   - 只按 patch 自身涉及的文件路径作业，绝不整树 checkout / reset；
#   - 已应用（--reverse --check 通过）→ 幂等跳过；
#   - 不能干净应用 → 记为冲突、不强行 apply、不改任何文件，末尾非零退出交人裁决。
#
# 为什么不"全量同步所有 agent patch"：这些 patch 是照着旧上游写的，而安装树会随
#   `hermes update` 前进（现 v0.21.4）。上下文恰好还能对上的旧 patch 未必仍必要
#   （如 178 补的 kanban CLI 动词，现上游已自带），盲套可能重复注入或改坏语义。
#   故改为**显式点名**：默认只部署推演实需且已核过的一项，其余逐条评估后再加。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

AGENT_TREE="${HERMES_AGENT_TREE:-$HOME/.hermes/hermes-agent}"
PATCHDIR="$NCWK/overlay/patches"
# 与 inject.mjs 的路由规则保持一致（scripts/inject.mjs 的 targetRoot 判定）
AGENT_PREFIXES='^(hermes_cli/|plugins/|agent/|apps/|assets/|acp_|gateway/|tests/gateway/|tests/hermes_cli/)'

# 要部署的 patch：位置参数优先，否则用默认清单（空格分隔，可用 AIPAY_AGENT_PATCHES 覆盖）
DEFAULT_PATCHES="372-agent-tick-socket-fallback.patch 390-agent-kanban-home-default-board.patch 391-agent-kanban-board-team-fence.patch"
if (( $# > 0 )); then
  WANT=("$@")
else
  read -r -a WANT <<< "${AIPAY_AGENT_PATCHES:-$DEFAULT_PATCHES}"
fi

[[ -d "$AGENT_TREE/.git" ]] || { echo "✗ 不是 git 仓库：$AGENT_TREE" >&2; exit 2; }
cd "$AGENT_TREE" || exit 2

applied=0; skipped=0; conflicts=0; total=0
CONFLICT_LIST=()

for p in "${WANT[@]}"; do
  [[ -n "$p" ]] || continue
  [[ -f "$PATCHDIR/$p" ]] || { echo "  ! 缺 patch 文件: $p" >&2; conflicts=$((conflicts+1)); continue; }

  # 只看第一个目标路径，判定归属（与 inject.mjs 同规则）
  target=$(grep -m1 -E '^(---|\+\+\+) [ab]/' "$PATCHDIR/$p" | sed -E 's/^(---|\+\+\+) [ab]\///; s/[[:space:]].*$//')
  if ! printf '%s' "$target" | grep -qE "$AGENT_PREFIXES"; then
    continue                                   # 属 hermes-studio，由 npm run inject 负责
  fi
  total=$((total+1))

  if git apply --reverse --check "$PATCHDIR/$p" >/dev/null 2>&1; then
    skipped=$((skipped+1)); continue                       # 已在位，幂等
  fi
  if git apply --check "$PATCHDIR/$p" >/dev/null 2>&1; then
    if git apply --whitespace=nowarn "$PATCHDIR/$p" >/dev/null 2>&1; then
      applied=$((applied+1)); echo "  ✓ 已部署 $p"
    else
      conflicts=$((conflicts+1)); CONFLICT_LIST+=("$p (apply 失败)")
    fi
  else
    conflicts=$((conflicts+1)); CONFLICT_LIST+=("$p (与本地改动冲突)")
  fi
done

echo "────────────────────────────────────────────"
echo "agent 运行时 patch：候选 $total ｜ 新部署 $applied ｜ 已在位 $skipped ｜ 冲突 $conflicts"
if (( conflicts > 0 )); then
  for c in "${CONFLICT_LIST[@]}"; do echo "  ✗ $c"; done
  echo "未强行应用任何冲突 patch，安装树保持原样。请人工处置后重跑。"
  exit 1
fi
if (( applied > 0 )); then
  echo "提示：已改运行时代码，需重启各 profile gateway 才生效。"
fi
