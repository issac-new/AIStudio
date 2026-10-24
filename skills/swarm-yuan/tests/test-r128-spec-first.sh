#!/usr/bin/env bash
# test-r128-spec-first.sh — R128 两项加固守门测试
# 任务1：spf_conf_val/spf_writable_dirs 引号感知注释剥离（cut -d'#' 腰斩修复）+
#        spf_strip_placeholder 占位符习语收敛（precheck/gates-warn 三处手写 → lib 单源）
# 任务2：spec-first-bridge 无 python3 降级链（jq→perl→awk；全缺披露放行）+ --self-test；
#        同步 fail-gate-hook _psr 功能探针（command -v 只证存在不证可用，exit 127 假壳实证）。
# 断言锚：findings 内容（deny reason/stderr 披露/解析值）而非只看退出码。
set -euo pipefail
cd "$(dirname "${0}")/.." || exit 1
LIB="assets/spec-first-lib.sh"
HOOK="assets/hooks/fail-gate-hook.sh"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
skip(){ echo "  ⊘ $1"; }
TMP="$(mktemp -d /tmp/r128.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck disable=SC1090
. "$LIB"

# ===== ① 引号感知注释剥离（spf_conf_val / spf_writable_dirs） =====
mkdir -p "$TMP/cfg"
cat > "$TMP/cfg/precheck.conf" <<'EOF'
BASE_BRANCH="release/#hotfix"
SPEC_REQUIRED=1  # 行尾真注释
SINGLE='re#leaf'
PLAIN=novalue
ESCAPED=re\#1
DOUBLED="a\"b"  # 注释里的引号不干扰
SPEC_GLOB="${SPEC_GLOB:-docs/**/*.md}"
WRITABLE_DIRS=("src" "a#b")  # TODO:model
EOF
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" BASE_BRANCH)" == 'release/#hotfix' ]] \
  && ok "1a 双引号内 # 不腰斩：BASE_BRANCH=release/#hotfix 完整读出" \
  || bad "1a 双引号内 # 被当注释腰斩"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SPEC_REQUIRED)" == "1" ]] \
  && ok "1b 行尾真注释仍被剥（SPEC_REQUIRED=1）" \
  || bad "1b 行尾注释未剥"
# R129：spf_conf_val 补单引号剥壳（与双引号对称）——1c 期望从「引号原样保留」改为裸值，# 仍不腰斩
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SINGLE)" == "re#leaf" ]] \
  && ok "1c 单引号内 # 不腰斩且引号剥壳（R129 对称化）" \
  || bad "1c 单引号值异常：$(spf_conf_val "$TMP/cfg/precheck.conf" SINGLE)"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" PLAIN)" == "novalue" ]] \
  && ok "1d 无注释行原样" || bad "1d 无注释行被改"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" ESCAPED)" == 're\#1' ]] \
  && ok "1e 转义 \# 不算注释（反斜杠原样保留）" || bad "1e \# 被当注释"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" DOUBLED)" == 'a\"b' ]] \
  && ok "1f 双引号内 \\\" 不闭合、注释含引号不干扰" || bad "1f 双引号转义/注释引号误判"
[[ "$(spf_writable_dirs "$TMP/cfg/precheck.conf")" == 'src a#b' ]] \
  && ok "1g WRITABLE_DIRS 含 # 目录不腰斩（src a#b）" || bad "1g WRITABLE_DIRS # 腰斩"
# 1h 既有回归：自引用默认与占位符不剥语义不变（R101 1a/1c 锚）
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SPEC_GLOB)" == 'docs/**/*.md' ]] \
  && ok "1h 自引用默认求值不变" || bad "1h 自引用默认回归"

# ===== ② spf_strip_placeholder 收敛（与旧三处习语逐字等价） =====
_old_idiom() { # $1=值 $2=KEY → 旧手写习语的输出（测试内参照实现：前缀命中即剥壳去尾}）
  local _v="$1" _k="$2"
  local _pre="\${${_k}:-"
  if [[ "${_v}" == "${_pre}"* ]]; then
    _v="${_v#"${_pre}"}"
    _v="${_v%\}}"
  fi
  printf '%s' "${_v}"
}
_all_match=1
for _pair in 'SPEC_GLOB:docs/specs/*.md' 'SPEC_REQUIRED:1' 'SPEC_GLOB:docs/**/*.md'; do
  _k="${_pair%%:*}"; _def="${_pair#*:}"
  _in="\${${_k}:-${_def}}"
  [[ "$(spf_strip_placeholder "${_in}")" == "$(_old_idiom "${_in}" "${_k}")" ]] || _all_match=0
done
[[ "${_all_match}" -eq 1 ]] && ok '2a 占位符剥离与旧实现逐字一致（${VAR:-def} 形态）' || bad "2a 与旧实现偏离"
[[ "$(spf_strip_placeholder 'plain')" == "plain" && "$(spf_strip_placeholder '<占位符>')" == "<占位符>" ]] \
  && ok "2b 非占位形态透传（plain / <占位符>）" || bad "2b 非占位形态被误剥"
[[ "$(spf_strip_placeholder '${X:-}')" == "" ]] && ok "2c 空默认剥为空" || bad "2c 空默认异常"
# 2d 收敛面机器断言：三处旧习语消灭、改为 lib 调用
if ! grep -q "in '\${" assets/precheck.sh assets/gates-warn.sh; then
  ok "2d precheck/gates-warn 旧 case 习语已消灭"
else
  bad "2d 旧 case 习语残留（precheck/gates-warn）"
fi
_g1=$(grep -c 'spf_strip_placeholder' assets/precheck.sh || true)
_g2=$(grep -c 'spf_strip_placeholder' assets/gates-warn.sh || true)
[[ "${_g1}" -ge 2 && "${_g2}" -ge 3 ]] \
  && ok "2e 调用点落位（precheck=${_g1} 行 gates-warn=${_g2} 行，含注释）" \
  || bad "2e 调用点缺失（precheck=${_g1} gates-warn=${_g2}）"

# ===== ③ bridge 降级链（stub 假壳 exit 127 前置 PATH；fixture 同 test-r103 形态） =====
SK="$TMP/skill"; PJ="$TMP/proj"
mkdir -p "$SK/scripts" "$SK/rules.d" "$PJ/src" "$TMP/bin"
cp assets/hooks/spec-first-bridge.sh assets/hooks/fail-gate-hook.sh \
   assets/spec-first-lib.sh scripts/gate-rules.sh "$SK/scripts/"
cp assets/rules.d/*.rules "$SK/rules.d/" 2>/dev/null || true
printf -- '---\nname: demo-skill\ndescription: 测试技能\nstatus: active\n---\n' > "$SK/SKILL.md"
cat > "$SK/scripts/precheck.conf" <<EOF
PROJECT_DIR="$PJ"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
GATE_ENFORCE_DENY=""
EOF
for _m in python3 jq perl awk; do
  printf '#!/bin/sh\nexit 127\n' > "$TMP/bin/${_m}"; chmod +x "$TMP/bin/${_m}"
done
P3="/usr/bin:/bin:/usr/sbin:/sbin"
BRC="$SK/scripts/spec-first-bridge.sh"
run_br() { # $1=PATH $2=payload → rc 全局 BRRC、stderr 全局 BRERR
  BRRC=0
  printf '%s' "$2" | PATH="$1" bash "$BRC" --host cursor >"$TMP/br_out" 2>"$TMP/br_err" || BRRC=$?
  BRERR="$(cat "$TMP/br_err" 2>/dev/null || true)"
}
# 3a 正常环境 deny
run_br "$P3" "{\"tool_name\":\"Write\",\"toolInput\":{\"file_path\":\"$PJ/src/a.py\"}}"
[[ "$BRRC" -eq 2 ]] && printf '%s' "$BRERR" | grep -q "写源码区" \
  && ok "3a 正常环境 Write 无 spec → exit 2（deny reason 含写源码区）" \
  || bad "3a 正常环境未拦（rc=${BRRC}）"
# 3b-3d 逐级屏蔽：python3 → jq 级；python3+jq → perl 级；python3+jq+perl → awk 级
mkdir -p "$TMP/b1" "$TMP/b2" "$TMP/b3" "$TMP/b4"
cp "$TMP/bin/python3" "$TMP/b1/"
cp "$TMP/bin/python3" "$TMP/bin/jq" "$TMP/b2/"
cp "$TMP/bin/python3" "$TMP/bin/jq" "$TMP/bin/perl" "$TMP/b3/"
cp "$TMP/bin/python3" "$TMP/bin/jq" "$TMP/bin/perl" "$TMP/bin/awk" "$TMP/b4/"
_lvl=1
for _paths in "$TMP/b1:$P3" "$TMP/b2:$P3" "$TMP/b3:$P3"; do
  _labels="3b 3c 3d"
  _names="python3 python3+jq python3+jq+perl"
  _label=$(printf '%s' "${_labels}" | cut -d' ' -f"${_lvl}")
  _mask=$(printf '%s' "${_names}" | cut -d' ' -f"${_lvl}")
  # 本级依赖的真实解析器必须在基础 PATH 可达，否则该级断言无从生效（披露式跳过）
  case "${_lvl}" in
    1) _need="jq" ;; 2) _need="perl" ;; 3) _need="awk" ;;
  esac
  if PATH="$P3" command -v "${_need}" >/dev/null 2>&1; then
    run_br "${_paths}" "{\"tool_name\":\"Write\",\"toolInput\":{\"file_path\":\"$PJ/src/a.py\"}}"
    [[ "$BRRC" -eq 2 ]] && printf '%s' "$BRERR" | grep -q "写源码区" \
      && ok "${_label} 屏蔽 ${_mask}（${_need} 级）→ deny exit 2" \
      || bad "${_label} 屏蔽 ${_mask} 后 deny 失效（rc=${BRRC}）"
  else
    skip "${_label} ${_need} 不在基础 PATH，本级演练跳过"
  fi
  _lvl=$((_lvl+1))
done
# 3e 全缺：放行 + stderr 披露一行
run_br "$TMP/b4:$P3" "{\"tool_name\":\"Write\",\"toolInput\":{\"file_path\":\"$PJ/src/a.py\"}}"
[[ "$BRRC" -eq 0 ]] && printf '%s' "$BRERR" | grep -q "解析链全缺" \
  && ok "3e 解析链全缺 → 放行且 stderr 披露「解析链全缺」" \
  || bad "3e 全缺行为异常（rc=${BRRC}，err=${BRERR}）"
# 3f --self-test：正常 rc=0；全缺 rc=1（L1 面失效须可发现）
PATH="$P3" bash "$BRC" --self-test >/dev/null 2>&1 && ok "3f --self-test 正常环境 rc=0" || bad "3f --self-test 正常环境失败"
_rc=0; PATH="$TMP/b4:$P3" bash "$BRC" --self-test >/dev/null 2>&1 || _rc=$?
[[ "${_rc}" -eq 1 ]] && ok "3g 全缺环境 --self-test rc=1（失效可发现）" || bad "3g 全缺 self-test rc=${_rc}（应 1）"
# 3h 多行命令（rules.d forbid npm publish）在 jq 级与 awk 级不截断
_ML='{"toolName":"Shell","toolInput":{"command":"git status\nnpm publish"}}'
for _pair2 in "jq:$TMP/b1" "awk:$TMP/b3"; do
  _n="${_pair2%%:*}"; _p="${_pair2#*:}"
  if PATH="$P3" command -v "${_n}" >/dev/null 2>&1; then
    _rc=0; printf '%s' "$_ML" | PATH="${_p}:$P3" bash "$BRC" --host cursor >/dev/null 2>&1 || _rc=$?
    [[ "${_rc}" -eq 2 ]] && ok "3h ${_n} 级多行命令 forbid → exit 2（换行不截断）" \
      || bad "3h ${_n} 级多行命令 deny 失效（rc=${_rc}）"
  else
    skip "3h ${_n} 不在基础 PATH，跳过"
  fi
done
# 3i 放行回归（jq 级）：非源码区 / 非 JSON payload
_rc=0; printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"/tmp/README.md"}}' | PATH="$TMP/b1:$P3" bash "$BRC" --host cursor >/dev/null 2>&1 || _rc=$?
[[ "${_rc}" -eq 0 ]] && ok "3i 非源码区放行（jq 级）" || bad "3i 非源码区误拦"
_rc=0; printf 'not-json' | PATH="$TMP/b1:$P3" bash "$BRC" --host gemini >/dev/null 2>&1 || _rc=$?
[[ "${_rc}" -eq 0 ]] && ok "3j 非 JSON payload fail-open 放行（jq 级）" || bad "3j 非 JSON 误拦"

# ===== ④ fail-gate-hook _psr 功能探针同步（stub 下不再盲化） =====
PATH="$P3" bash "$HOOK" --self-test >/dev/null 2>&1 \
  && ok "4a fail-gate --self-test 正常环境健康" || bad "4a fail-gate self-test 失败"
_rc=0; PATH="$TMP/b1:$P3" bash "$HOOK" --self-test >/dev/null 2>&1 || _rc=$?
[[ "${_rc}" -eq 0 ]] && ok "4b 屏蔽 python3（stub）后 self-test 仍健康（jq 级解析可达）" \
  || bad "4b stub python3 下 fail-gate 盲化（rc=${_rc}）"
_st_out="$(printf '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"%s/src/a.py"},"cwd":"%s"}' "$PJ" "$PJ" \
  | PATH="$TMP/b1:$P3" CLAUDE_PLUGIN_ROOT="$SK" bash "$HOOK" 2>/dev/null || true)"
printf '%s' "$_st_out" | grep -q '"permissionDecision":"deny"' \
  && ok "4c stub python3 下 hook 仍输出 spec deny JSON" || bad "4c stub python3 下 hook 无 deny"
_rc=0; PATH="$P3" bash "$BRC" --host opencode --tool bash --cmd "git status
npm publish" --cwd "$PJ" >/dev/null 2>&1 || _rc=$?
[[ "${_rc}" -eq 2 ]] && ok "4d 显式参数模式多行命令 forbid → exit 2（回归）" || bad "4d 显式参数回归失败"

# ===== ⑤ 门禁面回归：L3 check_spec_first 用新剥离链仍三态 =====
S="$TMP/skillcopy"; mkdir -p "$S"
cp assets/precheck.sh assets/gates-warn.sh assets/gates-strict.sh assets/gates-advisory.sh \
   assets/gate-enforce-level.conf assets/spec-first-lib.sh "$S/" 2>/dev/null
GP="$TMP/gitproj"; mkdir -p "$GP"
(
  cd "$GP" || exit 1
  git init -q . && git config user.email t@t && git config user.name t
  mkdir -p docs src && echo base > docs/base.md && echo x > src/a.py && git add -A && git commit -qm base
  echo change > src/a.py && git add src/a.py
) >/dev/null 2>&1
cat > "$S/precheck.conf" <<EOF
PROJECT_DIR="$GP"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
GATE_ENFORCE_DENY=""
EOF
_out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1) && _orc=0 || _orc=1
if [[ "${_orc}" -eq 1 && "$(printf '%s' "$_out" | grep -c gate_spec_first_missing)" -ge 1 ]]; then
  ok "5a L3 无 spec + src 变更 FAIL（gate_spec_first_missing）"
else
  bad "5a L3 门禁未 FAIL: rc=${_orc}"
fi
mkdir -p "$GP/docs/specs" && printf '# X\n## 决策记录\n- A\n' > "$GP/docs/specs/001.md"
_out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1) || true
printf '%s' "$_out" | grep -q "已批准 spec" && ok "5b L3 有 spec PASS" || bad "5b L3 有 spec 未 PASS: ${_out}"
sed -i.bak 's|SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"|SPEC_REQUIRED="0"|' "$S/precheck.conf" && rm -f "$S/precheck.conf.bak"
_out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1) || true
printf '%s' "$_out" | grep -q "SKIPPED" && ok "5c L3 开关关 ⊘ SKIPPED 披露" || bad "5c L3 未披露跳过"

if [[ "$FAIL" -eq 0 ]]; then echo "test-r128-spec-first: PASS"; else echo "test-r128-spec-first: FAIL" >&2; fi
exit "$FAIL"
