#!/usr/bin/env bash
# test-cross-stack-monorepo.sh — R48 跨栈同仓回归锁（前后端应用项目 × 子目录工程根形态）
# 锚定三类同仓缺陷（换栈演练不再靠碰运气，CI 机械执法）：
#   ① 解析基准类：Go go.mod 子目录（R48-G2）/ Rust crate 根（R48-G3）/ Java 源根（R47-D2）
#      ——relations-extract 对每栈的工程内边集非零（fixture: monorepo-cross-stack/）
#   ② 探测类：element-ui 包名（R47-D1）——javaweb fixture 检出 element
#   ③ 命令合成类：conf-render poly 复合命令（R48-G4）——TEST_CMD 含 ≥2 段 (cd <dir> && ...)
# 负向锚（R44 变异锁先例）：根级单栈项目渲染命令不得漂移（防 poly 误伤单栈路径）。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
FX="$BASE/tests/cross-stack-fixtures/monorepo"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

extract_kind() { # $1=fixture $2=kind 输出计数（stdout）
  local d="/tmp/mcs-$1-$$"
  rm -rf "$d" && mkdir -p "$d/references"
  bash "$BASE/scripts/relations-extract.sh" "$FX/$1" --skill-dir "$d" >/dev/null 2>&1
  grep -c "\"kind\":\"$2\"" "$d/references/relations.jsonl" 2>/dev/null || true
  rm -rf "$d"
}
extract_total() { # $1=fixture 输出总边数（stdout）
  local d="/tmp/mcs-t-$1-$$"
  rm -rf "$d" && mkdir -p "$d/references"
  bash "$BASE/scripts/relations-extract.sh" "$FX/$1" --skill-dir "$d" >/dev/null 2>&1
  wc -l < "$d/references/relations.jsonl" 2>/dev/null | tr -d ' ' || true
  rm -rf "$d"
}

echo "=== ① 同仓五栈 relations-extract 边集（解析基准缺陷锁）==="

_g=$(extract_total goweb);   [[ "${_g:-0}" -ge 2 ]] && ok "goweb 总边 $_g ≥2（Go+前端）" || bad "goweb 总边 ${_g:-0} <2——Go 同仓漏（G2 回归）"
_rs=$(extract_total rsfull); [[ "${_rs:-0}" -ge 3 ]] && ok "rsfull 总边 $_rs ≥3（Rust crate/self+前端）" || bad "rsfull 总边 ${_rs:-0} <3（G3 回归）"
_py=$(extract_total pyfull); [[ "${_py:-0}" -ge 2 ]] && ok "pyfull 总边 $_py ≥2（相对导入同仓兼容锁）" || bad "pyfull 总边 ${_py:-0} <2"
_nd=$(extract_total nodeweb); [[ "${_nd:-0}" -ge 2 ]] && ok "nodeweb 总边 $_nd ≥2（require 相对解析锁）" || bad "nodeweb 总边 ${_nd:-0} <2"
_jv=$(extract_total javaweb); [[ "${_jv:-0}" -ge 5 ]] && ok "javaweb 总边 $_jv ≥5" || bad "javaweb 总边 ${_jv:-0} <5"
_jvmb=$(extract_kind javaweb mapper-binding); [[ "${_jvmb:-0}" -ge 1 ]] && ok "javaweb mapper-binding ≥1（Java 源根发现，R47-D2 锁）" || bad "javaweb mapper-binding=0（R47-D2 回归）"
_jvfm=$(extract_kind javaweb field-mapping); [[ "${_jvfm:-0}" -ge 1 ]] && ok "javaweb field-mapping ≥1（列↔属性耦合入边集）" || bad "javaweb field-mapping=0"

# Go 工程内边逐字锚（module 前缀剥离 + go.mod 基准目录）
_d=/tmp/mcs-gofix-$$; rm -rf "$_d" && mkdir -p "$_d/references"
bash "$BASE/scripts/relations-extract.sh" "$FX/goweb" --skill-dir "$_d" >/dev/null 2>&1
if grep -q '"from":"server/internal/user/handler.go","to":"server/internal/repo"' "$_d/references/relations.jsonl" 2>/dev/null; then
  ok "goweb Go 工程内 import 边精确形态（G2）"
else
  bad "goweb Go 工程内边缺失/形态漂移（G2）"
fi
rm -rf "$_d"
# Rust crate 根逐字锚
_d=/tmp/mcs-rsfix-$$; rm -rf "$_d" && mkdir -p "$_d/references"
bash "$BASE/scripts/relations-extract.sh" "$FX/rsfull" --skill-dir "$_d" >/dev/null 2>&1
if grep -q '"from":"backend/src/main.rs","to":"backend/src/models/mod.rs"' "$_d/references/relations.jsonl" 2>/dev/null; then
  ok "rsfull crate:: 以文件 src/ 为 crate 根（G3）"
else
  bad "rsfull crate 根解析回归（G3）"
fi
rm -rf "$_d"

echo "=== ② 同仓探测（element-ui 包名，R47-D1 锁）==="
_af=$(bash "$BASE/scripts/detect-frameworks.sh" "$FX/javaweb" 2>/dev/null | grep '^ACTIVE_FRAMEWORKS=')
case "$_af" in
  *element*) ok "javaweb 检出 element（element-ui pkgjson 信号）" ;;
  *)         bad "javaweb 未检出 element（R47-D1 回归）: $_af" ;;
esac
case "$_af" in
  *mybatis*) ok "javaweb 检出 mybatis" ;;
  *)         bad "javaweb 未检出 mybatis: $_af" ;;
esac

echo "=== ③ conf-render poly 复合命令（R48-G4 锁）==="
rm -rf /tmp/mcs-conf-$$ && bash "$BASE/scripts/conf-render.sh" "$FX/javaweb" --out /tmp/mcs-conf-$$ >/dev/null 2>&1
_tc=$(grep -m1 '^TEST_CMD=' /tmp/mcs-conf-$$/precheck.conf 2>/dev/null || true)
case "$_tc" in
  *'(cd backend'*) if [[ "$_tc" == *'(cd frontend'* ]]; then ok "TEST_CMD 双段复合: $_tc"; else bad "TEST_CMD 缺 frontend 段: $_tc"; fi ;;
  *) bad "TEST_CMD 未合成复合命令: $_tc" ;;
esac
rm -rf /tmp/mcs-conf-$$

echo "=== ④ 根级单栈不漂移（poly 误伤负向锚）==="
_mono=$(mktemp -d /tmp/mcs-mono.XXXXXX)
printf '{ "name": "solo", "scripts": { "build": "vite build", "test": "vitest run" }, "dependencies": { "vue": "3.4.0" } }\n' > "$_mono/package.json"
rm -rf /tmp/mcs-conf2-$$ && bash "$BASE/scripts/conf-render.sh" "$_mono" --out /tmp/mcs-conf2-$$ >/dev/null 2>&1
_tc2=$(grep -m1 '^TEST_CMD=' /tmp/mcs-conf2-$$/precheck.conf 2>/dev/null || true)
if [[ "$_tc2" == "TEST_CMD='npm test'"* ]]; then
  ok "根级单栈维持 npm test（无 cd 复合）"
else
  bad "根级单栈命令漂移: $_tc2"
fi
rm -rf "$_mono" /tmp/mcs-conf2-$$

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "PASS test-cross-stack-monorepo（$PASS 项断言全过）"
  exit 0
else
  echo "FAIL test-cross-stack-monorepo（$FAIL 项失败 / $PASS 过）"
  exit 1
fi
