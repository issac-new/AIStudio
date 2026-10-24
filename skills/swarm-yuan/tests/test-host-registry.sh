#!/usr/bin/env bash
# test-host-registry.sh — hosts.tsv 驱动检测（WP2）
# 断言：8 宿主 home 判定与 ta_tool_home 路径来自 hosts.tsv；缺 home/CLI 时不误判。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-hosts.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# 只保留系统工具，避免本机真实 CLI 干扰
run_detect() {  # $1=home $2=tool → rc
  HOME="$1" PATH="/usr/bin:/bin" bash -c '
    source "'"$BASE"'/assets/tool-adapters/common.sh"
    ta_host_installed "$1"
  ' _ "$2"
}

# 1. 8 宿主：hosts.tsv 的 install_path 建目录后应判定已安装
while IFS=$'\t' read -r id det home schema adapter support evidence claim notes; do
  [[ "$id" =~ ^# ]] && continue
  [[ -z "$id" ]] && continue
  h="$TMP/home-$id"
  mkdir -p "$h"
  # 把 ~ 展开到临时 HOME
  expanded="${home/#\~/$h}"
  mkdir -p "$expanded"
  if HOME="$h" PATH="/usr/bin:/bin" bash -c '
      source "'"$BASE"'/assets/tool-adapters/common.sh"
      ta_host_installed "$1"
    ' _ "$id"; then
    ok "$id home 判定"
  else
    bad "$id home 未判定"
  fi
  got="$(HOME="$h" PATH="/usr/bin:/bin" bash -c '
      source "'"$BASE"'/assets/tool-adapters/common.sh"
      ta_tool_home "$1"
    ' _ "$id")"
  # 期望探测目录：dir: 判据（第2列）优先，否则 install_path（第3列）——与 ta_tool_home 口径一致（R139：
  # hermes/dsh/ccswitch 第3列是 skills 安装子目录，作探测目录会在「宿主已装、未装过技能」时漏检）
  if [[ "$det" == dir:* ]]; then
    expected="${det#dir:}"; expected="${expected/#\~/$h}"
  else
    expected="$expanded"
  fi
  if [[ "$got" == "$expected" ]]; then
    ok "$id ta_tool_home 路径"
  else
    bad "$id ta_tool_home 路径 ($got ≠ $expected)"
  fi
done < "$BASE/assets/registry/hosts.tsv"

# 1b. R139：dir: 判据正例——宿主家目录在而 skills 子目录未建（未装过技能）也须检出
while IFS=$'\t' read -r id det home schema adapter support evidence claim notes; do
  [[ "$id" =~ ^# ]] && continue
  [[ -z "$id" ]] && continue
  [[ "$det" == dir:* ]] || continue
  h="$TMP/first-$id"
  dironly="${det#dir:}"; dironly="${dironly/#\~/$h}"
  mkdir -p "$h" "$dironly"
  if HOME="$h" PATH="/usr/bin:/bin" bash -c '
      source "'"$BASE"'/assets/tool-adapters/common.sh"
      ta_host_installed "$1"
    ' _ "$id"; then
    ok "$id 仅家目录（无 skills 子目录）判定已装（dir: 判据）"
  else
    bad "$id 首装形态漏检（家目录在而 skills 子目录无）"
  fi
done < "$BASE/assets/registry/hosts.tsv"

# 2. 空 HOME + 无宿主 CLI → 不得误判
EMPTY="$TMP/empty"; mkdir -p "$EMPTY"
for tool in claude codex cursor gemini windsurf opencode kimi zcode hermes dsh ccswitch; do
  if run_detect "$EMPTY" "$tool"; then
    bad "空 HOME 误判已安装: $tool"
  else
    ok "空 HOME 不误判: $tool"
  fi
done

# 3. adapters 齐全
for a in claude codex zcode cursor gemini windsurf opencode kimi; do
  if [[ -f "$BASE/assets/tool-adapters/$a.sh" ]]; then ok "adapter $a"; else bad "adapter 缺失: $a"; fi
done

echo "PASS test-host-registry ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
