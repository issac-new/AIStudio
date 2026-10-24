#!/usr/bin/env bash
# test-task-scale.sh — task-scale.sh 行为级回归测试（从 git diff 判任务规模：simple|standard|full）
# 契约：
#   判定规则（决策 18）：敏感目录触碰 → full；跨多服务（services/* 或 apps/* ≥2 子目录）→ full；
#     文件数 >10 → full；≤5 且不敏感 → simple；6-10 → standard
#   非 git 项目 / 无变更 → 降级 standard（质量优先偏置）；目录不存在 → exit 1
#   stdout 恰为规模词一行，判定依据走 stderr
# 沙箱说明：git 夹具一律在 mktemp 目录新建一次性仓库（基线 commit + 变更 commit，
#   HEAD~1...HEAD 即变更集），不触碰本仓 git 状态。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/task-scale.sh"
TMP=$(mktemp -d /tmp/tst.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 造夹具仓库：$1=仓库目录，stdin=变更文件清单（每行一个相对路径；空清单=仅基线 commit）
new_repo() {
  local d="$1" f _n=0
  git init -q "$d"
  git -C "$d" config user.email t@t.local
  git -C "$d" config user.name t
  echo base > "$d/README.md"
  git -C "$d" add -A && git -C "$d" commit -qm base
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    mkdir -p "$d/$(dirname "$f")"
    echo x > "$d/$f"
    _n=$((_n+1))
  done
  [[ "${_n}" -gt 0 ]] && git -C "$d" add -A && git -C "$d" commit -qm change
  return 0
}

run_scale() { # $1=仓库目录 → stdout=规模词，stderr 依据
  bash "$SH" "$1" 2>"$TMP/err"
}

# --- 态 1：目录不存在 → exit 1 ---
out=$(bash "$SH" "$TMP/no-such-dir" 2>"$TMP/err"); rc=$?
[[ $rc -eq 1 ]] && grep -qF '项目目录不存在' "$TMP/err" && ok "态1 目录不存在 exit 1" || bad "态1 rc=${rc}: ${out}"

# --- 态 2：非 git 项目 → 降级 standard ---
mkdir -p "$TMP/plain"
out=$(run_scale "$TMP/plain"); rc=$?
[[ $rc -eq 0 && "$out" == "standard" ]] && grep -qF '降级 standard' "$TMP/err" \
  && ok "态2 非 git 降级 standard" || bad "态2 out=${out}"

# --- 态 3：git 仓库仅基线 commit（无变更集）→ standard ---
new_repo "$TMP/r_base" </dev/null
out=$(run_scale "$TMP/r_base"); rc=$?
[[ $rc -eq 0 && "$out" == "standard" ]] && grep -qF '无变更文件' "$TMP/err" \
  && ok "态3 无变更降级 standard" || bad "态3 out=${out}: $(cat "$TMP/err")"

# --- 态 4-7：文件数分档（3→simple / 5→simple 边界 / 6→standard / 10→standard 边界）---
printf 'src/a.ts\nsrc/b.ts\nsrc/c.ts\n' | new_repo "$TMP/r3"
out=$(run_scale "$TMP/r3")
[[ "$out" == "simple" ]] && grep -qF '→ simple' "$TMP/err" && ok "态4 3 文件 simple" || bad "态4 out=${out}"
printf 'f1\nf2\nf3\nf4\nf5\n' | new_repo "$TMP/r5"
out=$(run_scale "$TMP/r5")
[[ "$out" == "simple" ]] && ok "态5 5 文件 simple（边界含）" || bad "态5 out=${out}"
printf 'f1\nf2\nf3\nf4\nf5\nf6\n' | new_repo "$TMP/r6"
out=$(run_scale "$TMP/r6")
[[ "$out" == "standard" ]] && ok "态6 6 文件 standard" || bad "态6 out=${out}"
seq 1 10 | sed 's/^/f/' | new_repo "$TMP/r10"
out=$(run_scale "$TMP/r10")
[[ "$out" == "standard" ]] && grep -qF '6-10' "$TMP/err" && ok "态7 10 文件 standard（边界含）" || bad "态7 out=${out}"

# --- 态 8：11 文件 → full（>10）---
seq 1 11 | sed 's/^/f/' | new_repo "$TMP/r11"
out=$(run_scale "$TMP/r11")
[[ "$out" == "full" ]] && grep -qF '>10 → full' "$TMP/err" && ok "态8 11 文件 full" || bad "态8 out=${out}"

# --- 态 9-10：敏感目录触碰 → full（嵌套路径 / 顶层目录；优先于文件数档）---
printf 'src/api/user.ts\nsrc/util.ts\n' | new_repo "$TMP/rs1"
out=$(run_scale "$TMP/rs1")
[[ "$out" == "full" ]] && grep -qF '触碰敏感目录' "$TMP/err" && ok "态9 嵌套 api/ 触敏 full" || bad "态9 out=${out}: $(cat "$TMP/err")"
printf 'api/openapi.yaml\n' | new_repo "$TMP/rs2"
out=$(run_scale "$TMP/rs2")
[[ "$out" == "full" ]] && ok "态10 顶层 api/ 触敏 full" || bad "态10 out=${out}"

# --- 态 11：同服务多文件折叠为一个服务目录 → 不升 full（sed 服务目录提取回归锁）---
printf 'services/user/a.ts\nservices/user/b.ts\nservices/user/c.ts\n' | new_repo "$TMP/rsvc1"
out=$(run_scale "$TMP/rsvc1")
[[ "$out" == "simple" ]] && grep -qF '≤5 且未触碰敏感目录' "$TMP/err" \
  && ok "态11 同服务 3 文件折叠不升档" || bad "态11 out=${out}: $(cat "$TMP/err")"

# --- 态 12-13：跨多服务 → full（services/ 与 apps/ 两族）---
printf 'services/user/a.ts\nservices/order/b.ts\n' | new_repo "$TMP/rsvc2"
out=$(run_scale "$TMP/rsvc2")
[[ "$out" == "full" ]] && grep -qF '跨多服务' "$TMP/err" && ok "态12 services 跨 2 服务 full" || bad "态12 out=${out}: $(cat "$TMP/err")"
printf 'apps/web/a.ts\napps/admin/b.ts\n' | new_repo "$TMP/rapp"
out=$(run_scale "$TMP/rapp")
[[ "$out" == "full" ]] && grep -qF '跨多服务' "$TMP/err" && ok "态13 apps 跨 2 服务 full" || bad "态13 out=${out}: $(cat "$TMP/err")"

# --- 态 14：stdout 恰为一行规模词，依据走 stderr ---
_lines=$(run_scale "$TMP/r11" | grep -c .)
[[ "${_lines}" -eq 1 ]] && grep -qF 'task-scale 判定:' "$TMP/err" \
  && ok "态14 stdout 单行、依据在 stderr" || bad "态14 stdout ${_lines} 行"

[[ $FAIL -eq 0 ]] && { echo "PASS test-task-scale"; exit 0; } || { echo "FAIL test-task-scale" >&2; exit 1; }
