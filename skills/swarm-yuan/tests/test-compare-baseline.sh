#!/usr/bin/env bash
# test-compare-baseline.sh — compare-baseline.sh 对比报告测试（WP-P6/M6）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/compare-baseline.sh"
TMP="$(mktemp -d /tmp/cbtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 构造 pre/post 基线
mkdir -p "$TMP/pre" "$TMP/post"
printf '25585\t164\tSKILL.md\n101086\t1334\treferences/exploration-guide.md\n66555\t646\treferences/template-spec.md\n193226\t2144\tTOTAL\n' > "$TMP/pre/context-surface-gen.tsv"
printf '25585\t164\tSKILL.md\n70000\t1037\treferences/exploration-guide.md\n66555\t646\treferences/template-spec.md\n162140\t1847\tTOTAL\n' > "$TMP/post/context-surface-gen.tsv"
printf '# timings\ndetect-frameworks.sh fixture=gin 2s\n' > "$TMP/pre/script-timings.txt"
printf '# timings\ndetect-frameworks.sh fixture=gin 1s\n' > "$TMP/post/script-timings.txt"
printf '100\t5000\tassets/precheck.sh\n' > "$TMP/pre/gate-loc.txt"
printf '105\t5200\tassets/precheck.sh\n' > "$TMP/post/gate-loc.txt"

# 态 1：报告含 before/after TOTAL + 降幅% + exploration-guide 归因
out="$(bash "$SH" "$TMP/pre" "$TMP/post" --stdout 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "报告 exit 0" || bad "exit=$rc"
echo "$out" | grep -qE '193226.*162140' && ok "TOTAL before→after" || bad "TOTAL 缺失: $out"
echo "$out" | grep -qE 'exploration-guide' && ok "guide 明细" || bad "guide 明细缺失"
echo "$out" | grep -qE '16\.[0-9]+%|降幅' && ok "降幅百分比" || bad "降幅缺失: $out"

# 态 2：fail-open（post 缺 context-surface-gen.tsv → 提示 + exit 0）
rm "$TMP/post/context-surface-gen.tsv"
out="$(bash "$SH" "$TMP/pre" "$TMP/post" --stdout 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF 'context-surface-gen.tsv' && ok "缺文件 fail-open" || bad "态2 异常 rc=$rc: $out"

# 态 3：确定性（同输入连跑两次一致）
cp "$TMP/pre/context-surface-gen.tsv" "$TMP/post/context-surface-gen.tsv" 2>/dev/null
printf '25585\t164\tSKILL.md\n101086\t1334\treferences/exploration-guide.md\n66555\t646\treferences/template-spec.md\n193226\t2144\tTOTAL\n' > "$TMP/pre/context-surface-gen.tsv"
o1="$(bash "$SH" "$TMP/pre" "$TMP/post" --stdout 2>/dev/null)"
o2="$(bash "$SH" "$TMP/pre" "$TMP/post" --stdout 2>/dev/null)"
[[ "$o1" == "$o2" ]] && ok "确定性 byte-identical" || bad "两次不一致"

[[ $FAIL -eq 0 ]] && { echo "PASS test-compare-baseline"; exit 0; } || { echo "FAIL test-compare-baseline" >&2; exit 1; }
