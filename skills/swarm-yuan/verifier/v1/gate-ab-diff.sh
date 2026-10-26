#!/usr/bin/env bash
# gate-ab-diff.sh <gate_id> — 框架门禁片段重构 A/B 字节级等价验证（黄金标准）
#
# 契约（批量改造必须遵守）：
#   1. 改造只允许：删嵌套注释剥离器 → 调 precheck.sh 公共库 _fw_strip_comments_*；
#      规范形报告尾 if/else/fi → _fw_report；其余（grep 模式/循环/阈值/守卫/消息文本）零改动。
#   2. 等价判定：HEAD 原版与工作区改版分别注入同一份工作区 precheck.sh，
#      在 fixture 的 violating + compliant 两目录各跑 --framework，
#      stdout 逐字节一致 且 退出码一致，才算等价。
#   3. 不能转换为 _fw_report 的情形（保持手写）：
#      - bad 文案插值多个变量（如 spring-boot fw_sboot_constructor_inject 的 ${fi_hits}\n${fi_hits2}）
#      - pass/fail 两端均含动态内容（如 vite fw_vite_alias_order 行号插值）
#      - 分支条件非 [[ -n "$x" ]]（如计数器 -eq/-ge、多条件 &&）
#      - warn/fail 无 else pass 分支、或 else 分支非 pass
#   4. 剥离器家族→库函数映射（57 片段实证聚类，函数体逐字节比对）：
#      C 系 14 份同体      → _fw_strip_comments_c
#        angular elasticjob kafka lombok(_fw_code_only) mapstruct netty quartz
#        rabbitmq react redis rocketmq spring-batch(_fw_code_only) spring-boot spring-cloud
#      C 系变体(多剥行内/**/) gin gorm → _fw_strip_comments_c_inline
#      Python 系 4 份       django fastapi flask sqlalchemy → _fw_strip_comments_hash
#      配置系 3 份          elasticjob quartz redis (*_cfg_only) → _fw_strip_comments_cfg
#      SQL 系 2 份          postgresql sqlserver → _fw_strip_comments_sql
#      MySQL 系 1 份        mysql(多剔 # 行) → _fw_strip_comments_mysql
#      JS 行首系 2 份       nextjs nuxt(仅行首//，保行内URL) → _fw_strip_comments_js_head
#      XML 系 1 份          mapstruct(awk 状态机) → _fw_strip_comments_xml
#      独有助手不外移：nextjs _fw_nextjs_is_client；mapstruct _fw_mapstruct_build_code_only
#      （后者为 pom→xml / 其他→c 分发器，改造时改写为调用两个库函数）
#   5. 空集守卫两种风格（早退 warn+return vs 每门禁 if/else）不统一，保持原样。
#   6. 文件头 3 行（ruleset/gates/harvested-from）保留。
#
# 用法: bash verifier/v1/gate-ab-diff.sh <gate_id>
# 退出码: 0=两模式均等价；1=差异或用法错误
set -u
V1="$(cd "$(dirname "$0")" && pwd)"
SWARM_YUAN_HOME="${SWARM_YUAN_HOME:-$(cd "$V1/../.." && pwd)}"
SWARM_YUAN_SOURCE_ROOT="${SWARM_YUAN_SOURCE_ROOT:-$(cd "$SWARM_YUAN_HOME/../.." && pwd)}"
ROOT="$SWARM_YUAN_SOURCE_ROOT"
SY="$SWARM_YUAN_HOME"
ID="${1:-}"
if [[ -z "$ID" || ! -f "$SY/assets/framework-gates/$ID.sh" ]]; then
  echo "用法: bash $0 <gate_id>（须存在 skills/swarm-yuan/assets/framework-gates/<id>.sh 与 tests/fixtures/<id>/）" >&2
  exit 1
fi
FX="$SY/tests/fixtures/$ID"
[[ -d "$FX/violating" && -d "$FX/compliant" ]] || { echo "AB $ID SKIP: fixture 缺失" >&2; exit 1; }

WORK="$(mktemp -d /tmp/gate-ab.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
FRAG_OLD="$WORK/old.sh"
git -C "$ROOT" show "HEAD:skills/swarm-yuan/assets/framework-gates/$ID.sh" > "$FRAG_OLD" \
  || { echo "AB $ID ERROR: git show HEAD 原版失败" >&2; exit 1; }
FRAG_NEW="$SY/assets/framework-gates/$ID.sh"

# 注入：与工作区 precheck.sh 的标记区块替换（与 generate-skill.sh --inject-frameworks 同 awk 逻辑）
inject() { # $1=frag $2=out
  awk -v frag="$1" '
    /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
    /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
    !skip { print }
  ' "$SY/assets/precheck.sh" > "$2"
}

run_case() { # $1=mode $2=frag $3=stdout_file ; echo rc
  local mode="$1" frag="$2" outf="$3" dir rc
  dir="$WORK/run-$mode-$(basename "$frag")"
  mkdir -p "$dir/scripts"
  sed "s|__REPO_ROOT__|$ROOT|g" "$FX/$mode/precheck.conf" > "$dir/scripts/precheck.conf"
  inject "$frag" "$dir/scripts/precheck.sh"
  ( cd "$FX/$mode" && bash "$dir/scripts/precheck.sh" --framework ) > "$outf" 2>"$outf.err"
  rc=$?
  echo "$rc"
}

fails=0
for mode in violating compliant; do
  rc_old="$(run_case "$mode" "$FRAG_OLD" "$WORK/$mode.old.out")"
  rc_new="$(run_case "$mode" "$FRAG_NEW" "$WORK/$mode.new.out")"
  if cmp -s "$WORK/$mode.old.out" "$WORK/$mode.new.out" && [[ "$rc_old" == "$rc_new" ]]; then
    echo "AB $ID $mode OK (rc=$rc_old, stdout $(wc -c < "$WORK/$mode.old.out")B 逐字节一致)"
  else
    echo "AB $ID $mode DIFF (rc_old=$rc_old rc_new=$rc_new)"
    diff "$WORK/$mode.old.out" "$WORK/$mode.new.out" | head -20
    fails=$((fails+1))
  fi
  if ! cmp -s "$WORK/$mode.old.out.err" "$WORK/$mode.new.out.err"; then
    echo "AB $ID $mode STDERR-DIFF（不判负，仅供参考）"
    diff "$WORK/$mode.old.out.err" "$WORK/$mode.new.out.err" | head -10
  fi
done
if [[ $fails -eq 0 ]]; then
  echo "AB $ID PASS"
else
  echo "AB $ID FAIL ($fails 模式不等价)"
  exit 1
fi
