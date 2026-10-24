#!/usr/bin/env bash
# test-sync-vendor-knowledge.sh — sync-vendor-knowledge.sh 行为级回归锁（R130 覆盖补齐）
# 契约：把 $SRC（缺省 ~/.hermes）下 pay-orchestrator/references 与 _shared 三件镜像到 <脚本上级>/vendor-knowledge/；
#   --check 只校验六件关键文件存在；主源缺失致命 rc=1，_shared 缺失容忍；嵌套 .git/.DS_Store 不入镜像。
# 沙箱：脚本拷到 $TMP/sy/scripts/ 使 VK 落 $TMP/sy/vendor-knowledge，SRC 指向自造假源——绝不碰真仓与 ~/.hermes。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/svk.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0; ok() { echo "  ✓ $1"; }; bad() { echo "  ✗ $1" >&2; FAIL=1; }

mkdir -p "$TMP/sy/scripts" && cp "$BASE/scripts/sync-vendor-knowledge.sh" "$TMP/sy/scripts/"
SH="$TMP/sy/scripts/sync-vendor-knowledge.sh"; VK="$TMP/sy/vendor-knowledge"
mk_src() {  # $1=根；完整假源（含应被排除的 .git/.DS_Store）
  local r="$1/profiles"
  mkdir -p "$r/pay-orchestrator/references/standards" "$r/pay-orchestrator/references/.git" \
           "$r/_shared/02-org-orchestration" "$r/_shared/03-evolution-memory"
  printf '# idx\n' > "$r/pay-orchestrator/references/pay-knowledge-index.md"
  printf '# kc\n' > "$r/pay-orchestrator/references/standards/known-conflicts.md"
  printf '# ck\n' > "$r/pay-orchestrator/references/chentianyu-kernel-frameworks.md"
  printf 'junk\n' > "$r/pay-orchestrator/references/.git/HEAD"
  printf 'junk\n' > "$r/pay-orchestrator/references/.DS_Store"
  printf '# fl\n' > "$r/_shared/02-org-orchestration/four-lenses-charter.md"
  printf '# ls\n' > "$r/_shared/02-org-orchestration/language-standard.md"
  printf '# oc\n' > "$r/_shared/03-evolution-memory/output-contract.md"
}

# 态1 源根不存在 → 致命 rc=1
out="$(SRC="$TMP/nowhere" bash "$SH" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '运行时根不存在' && ok "态1 源根不存在 rc=1 明示" || bad "态1 rc=${rc}: $out"

# 态2 源根在、主源 pay-orchestrator/references 缺 → 致命且报主源缺失（T2 修复：此前在 copy_tree 内 exit，_shared 的 || true 接不住）
mkdir -p "$TMP/src2/profiles/_shared"
out="$(SRC="$TMP/src2" bash "$SH" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q 'pay 知识库源缺失' && ok "态2 主源缺失 rc=1 且报「pay 知识库源缺失」" || bad "态2 rc=${rc}: $(printf '%s' "$out" | tail -2)"
[[ ! -d "$VK/pay-team" ]] && ok "态2 失败路径零镜像写入" || bad "态2 失败仍写了 pay-team"

# 态3 完整源同步 → rc=0，六件在位，.git/.DS_Store 不入镜像
mk_src "$TMP/src3"
out="$(SRC="$TMP/src3" bash "$SH" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s' "$out" | grep -q '同步完成' && ok "态3 完整源同步 rc=0" || bad "态3 rc=${rc}: $(printf '%s' "$out" | tail -2)"
_miss=""; for f in pay-team/references/pay-knowledge-index.md pay-team/references/standards/known-conflicts.md pay-team/references/chentianyu-kernel-frameworks.md _shared/02-org-orchestration/four-lenses-charter.md _shared/02-org-orchestration/language-standard.md _shared/03-evolution-memory/output-contract.md; do [[ -f "$VK/$f" ]] || _miss="${_miss} $f"; done
[[ -z "$_miss" ]] && ok "态3 六件关键文件全部在位" || bad "态3 缺: ${_miss}"
[[ ! -e "$VK/pay-team/references/.git" && ! -e "$VK/pay-team/references/.DS_Store" ]] && ok "态3 嵌套 .git/.DS_Store 未入镜像" || bad "态3 杂物入镜像"
n1=$(find "$VK" -type f | wc -l | tr -d ' ')
printf '%s' "$out" | grep -q "共 ${n1} 文件" && ok "态3 汇总文件数=${n1} 与实际一致" || bad "态3 汇总计数不符（实际 ${n1}）: $(printf '%s' "$out" | grep '同步完成')"

# 态4 --check 同步后 → rc=0 镜像完整
out="$(bash "$SH" --check 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s' "$out" | grep -q '✓ 镜像完整' && [[ $(printf '%s' "$out" | grep -c '  ✓ ') -eq 6 ]] && ok "态4 --check 六件 ✓ 且 rc=0" || bad "态4 rc=${rc}: $(printf '%s' "$out" | tail -2)"

# 态5 幂等：再同步 rc=0 文件数不变
out="$(SRC="$TMP/src3" bash "$SH" 2>&1)"; rc=$?
n2=$(find "$VK" -type f | wc -l | tr -d ' ')
[[ $rc -eq 0 && "$n1" == "$n2" ]] && ok "态5 重复同步幂等（${n1}=${n2}）" || bad "态5 rc=${rc} n1=${n1} n2=${n2}"

# 态6 --check 缺件 → rc=1 列出 ✗ 缺失
rm -f "$VK/_shared/03-evolution-memory/output-contract.md"
out="$(bash "$SH" --check 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '✗ 缺失 _shared/03-evolution-memory/output-contract.md' && printf '%s' "$out" | grep -q '镜像不完整' \
  && ok "态6 --check 缺件 rc=1 并点名缺失文件" || bad "态6 rc=${rc}: $(printf '%s' "$out" | tail -2)"

# 态7 _shared 缺失容忍：主源在、_shared 全缺 → rc=0，空目录就位（后续 --check 自然报缺）
rm -rf "$VK"; mkdir -p "$TMP/src7/profiles/pay-orchestrator/references"; printf '# i\n' > "$TMP/src7/profiles/pay-orchestrator/references/pay-knowledge-index.md"
out="$(SRC="$TMP/src7" bash "$SH" 2>&1)"; rc=$?
[[ $rc -eq 0 && -d "$VK/_shared/02-org-orchestration" && -d "$VK/_shared/03-evolution-memory" ]] && ok "态7 _shared 缺失容忍 rc=0（目录就位）" || bad "态7 rc=${rc}: $(printf '%s' "$out" | tail -2)"

# 态8 用法面：--check 对不存在的 VK 不崩（find 2>/dev/null），rc=1
rm -rf "$VK"; out="$(bash "$SH" --check 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '镜像文件总数：0' && ok "态8 VK 不存在 --check rc=1 总数 0 不崩" || bad "态8 rc=${rc}: $(printf '%s' "$out" | tail -3)"

echo ""
[[ $FAIL -eq 0 ]] && echo "PASS test-sync-vendor-knowledge" || { echo "FAIL test-sync-vendor-knowledge" >&2; }
exit $FAIL
