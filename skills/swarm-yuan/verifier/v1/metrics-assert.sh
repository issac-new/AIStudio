#!/usr/bin/env bash
# metrics-assert.sh — C6 可维护性阈值断言（验收标准 v1 C6）
#
# 三项断言（阈值真值：v1/metrics-baseline.txt；文件缺失=未配置→整体静默跳过 RC=0，
# 单项键缺失=该项跳过；启用后 fail-closed）：
#   ① LOC 增长：precheck.sh 行数较基线增长 <40%（整数判定 5*loc < 7*baseline）
#   ② 重复度：framework-gates 注入双副本 diff 行数 <30
#      口径：临时 skill 骨架 ACTIVE_FRAMEWORKS=79 全量，generate-skill.sh
#      --inject-frameworks 产物的标记块（不含标记行）与 assets/framework-gates/*.sh
#      同序串联逐行 diff，计 '^[<>]' 行数（正常应为 0，阈值容忍标记/空行级漂移）
#   ③ 文档一致性：self-check.sh 输出「▶ 文档一致性检查」段（至下一「▶ 」段前）
#      无 ✗/FAIL 行；段缺失视为 FAIL（fail-closed）。
#      self-check 整体 RC 受环境缺工具影响（如 superpowers 未装），不作断言对象。
#
# 用法: bash verifier/v1/metrics-assert.sh [repo_root]
# 输出: METRIC_* 机器可读行；退出码 0=全过/未配置跳过，1=阈值违例
set -u
V1="$(cd "$(dirname "$0")" && pwd)"
SWARM_YUAN_HOME="${SWARM_YUAN_HOME:-$(cd "$V1/../.." && pwd)}"
SWARM_YUAN_SOURCE_ROOT="${SWARM_YUAN_SOURCE_ROOT:-$(cd "$SWARM_YUAN_HOME/../.." && pwd)}"
if [ $# -ge 1 ]; then
  SWARM_YUAN_SOURCE_ROOT="$(cd "$1" && pwd)"
  SWARM_YUAN_HOME="$SWARM_YUAN_SOURCE_ROOT/skills/swarm-yuan"
fi
ROOT="$SWARM_YUAN_SOURCE_ROOT"
SY="$SWARM_YUAN_HOME"
BASE="$V1/metrics-baseline.txt"

if [ ! -f "$BASE" ]; then
  echo "METRICS_ASSERT_SKIP（$BASE 缺失，未配置静默跳过）"
  exit 0
fi

get_kv() { # $1=键名；输出值（缺失=空）
  sed -n "s/^$1=\\(.*\\)$/\\1/p" "$BASE" | head -1
}

FAILS=0
WORK="$(mktemp -d /tmp/metrics-assert.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# ① LOC 增长阈值
BL_LOC=$(get_kv BASELINE_LOC_PRECHECK)
if [ -n "$BL_LOC" ]; then
  LOC=$(wc -l < "$SY/assets/precheck.sh" | tr -d ' ')
  # 增长 <40% ⇔ 5*loc < 7*baseline
  if [ $((LOC*5)) -lt $((BL_LOC*7)) ]; then
    echo "METRIC_LOC_PRECHECK $LOC BASELINE $BL_LOC GROWTH_LIMIT_PCT 40 OK"
  else
    echo "METRIC_LOC_PRECHECK $LOC BASELINE $BL_LOC GROWTH_LIMIT_PCT 40 FAIL（增长越限）"
    FAILS=$((FAILS+1))
  fi
else
  echo "METRIC_LOC_PRECHECK SKIP（BASELINE_LOC_PRECHECK 未配置）"
fi

# ② 注入双副本 diff 阈值
DUP_MAX=$(get_kv DUP_GATES_DIFF_MAX)
if [ -n "$DUP_MAX" ]; then
  INJ="$WORK/skill"
  mkdir -p "$INJ/scripts"
  cp "$SY/assets/precheck.sh" "$INJ/scripts/precheck.sh"
  IDS=$(ls "$SY/assets/framework-gates" 2>/dev/null | sed -n 's/^\(.*\)\.sh$/\1/p')
  {
    printf 'PROJECT_DIR="%s"\n' "$INJ"
    printf 'ACTIVE_FRAMEWORKS=('
    for id in $IDS; do printf '"%s" ' "$id"; done
    printf ')\n'
  } > "$INJ/scripts/precheck.conf"
  if [ -z "$IDS" ] || ! bash "$SY/scripts/generate-skill.sh" --inject-frameworks "$INJ" > "$WORK/inject.log" 2>&1; then
    echo "METRIC_DUP_GATES_DIFF FAIL（注入工具失败或片段清单为空，fail-closed；日志 $WORK/inject.log）"
    FAILS=$((FAILS+1))
  else
    # 产物标记块（不含标记行）vs 源文件同序串联
    awk '/^# >>> swarm-yuan:framework-gates >>>/{f=1;next} /^# <<< swarm-yuan:framework-gates <<</{f=0} f' \
      "$INJ/scripts/precheck.sh" > "$WORK/actual.txt"
    : > "$WORK/expected.txt"
    for id in $IDS; do cat "$SY/assets/framework-gates/$id.sh" >> "$WORK/expected.txt"; done
    D=$(diff "$WORK/expected.txt" "$WORK/actual.txt" | grep -c '^[<>]')
    if [ "$D" -le "$DUP_MAX" ]; then
      echo "METRIC_DUP_GATES_DIFF $D LIMIT_LT_30 OK（注入双副本一致）"
    else
      echo "METRIC_DUP_GATES_DIFF $D LIMIT_LT_30 FAIL（双副本漂移越限）"
      FAILS=$((FAILS+1))
    fi
  fi
else
  echo "METRIC_DUP_GATES_DIFF SKIP（DUP_GATES_DIFF_MAX 未配置）"
fi

# ③ 文档一致性段无 FAIL（self-check 全量实跑，仅取段内容判定，忽略整体 RC）
if [ ! -f "$SY/scripts/self-check.sh" ]; then
  echo "METRIC_DOC_CONSISTENCY FAIL（self-check.sh 缺失，fail-closed）"
  FAILS=$((FAILS+1))
else
  # 2026-07-22 WP-S1 收口：改 --check-only。裸跑默认 FORCE_LATEST=1——全部已装也联网
  # 升级（npm i -g / npx / 源码包重装 / gstack setup 拉 playwright chromium ~160MB），
  # 断言目标（文档一致性段）与升级无关，却使 verifier 非密封且篡改用户全局环境；
  # 慢网络下升级段可挂 1h+。--check-only（FORCE_LATEST=0）跳过升级段，
  # 文档一致性段照常执行（2026-07-22 self-check 修复后运行时齐全也会走到该段）。
  bash "$SY/scripts/self-check.sh" --check-only > "$WORK/selfcheck.out" 2>&1
  awk '/^▶ 文档一致性检查/{f=1;next} /^▶ /{if(f)exit} f' "$WORK/selfcheck.out" > "$WORK/docsec.out"
  if [ ! -s "$WORK/docsec.out" ]; then
    echo "METRIC_DOC_CONSISTENCY FAIL（「▶ 文档一致性检查」段缺失或为空，fail-closed）"
    FAILS=$((FAILS+1))
  else
    BX=$(grep -c '✗' "$WORK/docsec.out")
    BF=$(grep -c 'FAIL' "$WORK/docsec.out")
    V=$((BX+BF))
    if [ "$V" -eq 0 ]; then
      echo "METRIC_DOC_CONSISTENCY 0_VIOLATIONS OK"
    else
      echo "METRIC_DOC_CONSISTENCY $V VIOLATIONS FAIL"
      grep '✗\|FAIL' "$WORK/docsec.out" | head -10
      FAILS=$((FAILS+1))
    fi
  fi
fi

echo "METRICS_ASSERT_FAILS $FAILS"
[ "$FAILS" -eq 0 ]
