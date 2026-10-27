#!/usr/bin/env bash
# test-r128-function-size.sh — R128 函数尺寸机器锁（防 generate-skill.sh 函数再长肥）
# 背景：R128 前五大函数 150-588 行（verify_completeness/inject_frameworks/
# check_framework_globs/copy_universal_templates/create 流 emit 段），行为保持式拆分后
# 收敛为「编排器 ≤64 行 + 子函数 ≤120 行」。本测试静态锁住上限，超限即 fail——
# 要加超限内容须显式改本文件上限并给出理由注释（审阅时可见，不静默长肥）。
# 边界算法（与 R128 拆分时人工测量同口径）：
#   函数起点 = `^[a-z_][a-z0-9_]*\(\) *\{`（单行定义计 1 行）；
#   函数终点 = 其后首个列 0 孤立 `}` ——heredoc 行计入尺寸且不误判边界（hooks.json 等
#   JSON heredoc 内含列 0 `}`，扫描器带 heredoc 态跳过内容直到终止符行）；
#   函数与函数之间的顶级子命令拦截块（--mark-active/--refresh 等中段 exit 布局）
#   不属于任何函数，不计入。
# 上限：默认 150 行。唯一豁免 _fg_emit_workflow=214——其 heredoc 本体 210 行（design-sync 轮 +3；
#   2026-10-27 四阶段轮 +2：总览四阶段声明 + 节点⑧准入行）（workflow.md 九节点骨架，内容逐字节
#   锁定不可拆），函数壳 4 行；该豁免条目同时被反向断言（函数不存在时 fail），防止豁免名单变死条目。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

GEN=scripts/generate-skill.sh
# 挂账清偿批：子命令拦截块外置为 scripts/generator/subcommands.sh 后，
# 扫描面扩到全部生成器模块（函数与顶层块都不再有盲区）。
GEN_MODULES=(scripts/generate-skill.sh scripts/generator/*.sh)
CAP_DEFAULT=150
# 豁免表（格式 name:cap，空格分隔；每条须带存在性反向断言）
CAP_EXCEPTIONS="_fg_emit_workflow:214"

# ---- ① 尺寸扫描（单 awk，heredoc 感知）----
SCAN="$(mktemp /tmp/r128-size.XXXXXX)"
trap 'rm -f "$SCAN"' EXIT
# 注：awk 程序内不出现字面单引号（shell 引号冲突）——可选引号用 sprintf("%c",39) 动态构造；
# 本仓 `<<` 全部为 heredoc 起始（`<<<` herestring/标记串 `< <(` 进程替换均不匹配该正则，已核对）。
awk '
  BEGIN { q = sprintf("%c", 39); infn = ""; hd = "" }
  function herestart(line,  rx, tag) {
    rx = "<<-?[" q "\"]?[A-Za-z_][A-Za-z0-9_]*"
    if (match(line, rx)) {
      tag = substr(line, RSTART, RLENGTH)
      sub(/^<<-?/, "", tag)
      if (substr(tag, 1, 1) == q || substr(tag, 1, 1) == "\"") tag = substr(tag, 2)
      return tag
    }
    return ""
  }
  !/^[[:space:]]*#/ && infn == "" && hd == "" && $0 ~ /^[a-z_][a-z0-9_]*\(\) *\{/ {
    name = $0; sub(/\(\).*$/, "", name)
    if ($0 ~ /\{.*\}/) { printf "%s %d %d\n", name, NR, 1; next }
    infn = name; start = NR; hd = ""
    t = herestart($0); if (t != "") hd = t
    next
  }
  infn != "" {
    if (hd != "") { if ($0 == hd) hd = ""; next }
    t = herestart($0); if (t != "") { hd = t; next }
    if ($0 == "}") { printf "%s %d %d\n", infn, start, NR - start + 1; infn = "" }
  }
' "${GEN_MODULES[@]}" > "$SCAN"

# ---- ② vacuous-pass 守卫：扫描器必须找到足量函数（否则边界算法失明，全绿是假的）----
N_FUNCS=$(wc -l < "$SCAN" | tr -d ' ')
if [[ "$N_FUNCS" -lt 20 ]]; then
  bad "尺寸扫描只找到 ${N_FUNCS} 个函数（<20）——边界算法失明，测试自身失效"
  exit 1
fi
ok "尺寸扫描找到 ${N_FUNCS} 个函数（边界算法工作正常）"

# ---- ③ R128 五编排器在位断言（防整体删除后测试仍绿）----
for must_fn in verify_completeness inject_frameworks check_framework_globs copy_universal_templates _fg_emit_guides; do
  if awk -v f="$must_fn" '$1 == f { found = 1 } END { exit !found }' "$SCAN"; then
    ok "编排器在位: ${must_fn}"
  else
    bad "编排器缺失: ${must_fn}（R128 拆分结构被破坏）"
  fi
done

# ---- ④ 上限执法：默认 150；豁免表内按条目上限，豁免条目须实际存在 ----
VIOL=0
while read -r fname _start size; do
  [[ -n "${fname:-}" ]] || continue
  cap="$CAP_DEFAULT"
  for exc in $CAP_EXCEPTIONS; do
    if [[ "$exc" == "${fname}:"* ]]; then cap="${exc##*:}"; fi
  done
  if [[ "$size" -gt "$cap" ]]; then
    bad "${fname} ${size} 行 > 上限 ${cap}（默认 ${CAP_DEFAULT}；豁免见文件头注）——须拆分或显式改本测试上限"
    VIOL=$((VIOL + 1))
  fi
done < "$SCAN"
if [[ "$VIOL" -eq 0 ]]; then
  ok "全部函数 ≤ 上限（默认 ${CAP_DEFAULT}；豁免: ${CAP_EXCEPTIONS}）"
fi

for exc in $CAP_EXCEPTIONS; do
  ename="${exc%%:*}"
  if awk -v f="$ename" '$1 == f { found = 1 } END { exit !found }' "$SCAN"; then
    esize=$(awk -v f="$ename" '$1 == f { print $3 }' "$SCAN")
    ecap="${exc##*:}"
    ok "豁免条目活体在位: ${ename}=${esize}/${ecap}"
  else
    bad "豁免条目 ${ename} 已不存在——上限表漂移，须从 ${CAP_EXCEPTIONS} 移除该条"
  fi
done

if [[ "$FAIL" -eq 0 ]]; then
  echo "PASS test-r128-function-size（${N_FUNCS} 函数全在上限内）"
else
  echo "FAIL test-r128-function-size" >&2
  exit 1
fi
