#!/usr/bin/env bash
# test-signal-index.sh — gen-framework-index.sh 双产物 + 幂等测试（WP-P1）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/gen-framework-index.sh"
SIG="assets/framework-signals.md"
GUIDE="references/exploration-guide.md"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

bash "$SH" >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 ]] && ok "gen-framework-index exit 0" || { bad "exit=$rc"; echo "FAIL test-signal-index" >&2; exit 1; }

# 态 1：signals 覆盖全部框架（不含 _template.md；表头 1 行 '^| ' 须减）
# 注：每框架 §1 可有多行信号（完整信号表外迁），故断言 数据行 ≥ 框架数 且逐框架 rid 出现
fwn=0; for _f in references/frameworks/*.md; do [[ -f "$_f" ]] || continue; [[ "$(basename "$_f")" == _template.md ]] && continue; fwn=$((fwn+1)); done
rows=$(grep -c '^| ' "$SIG")
[[ $((rows - 1)) -ge $fwn ]] && ok "signals 数据行 $((rows-1)) ≥ 框架数 $fwn" || bad "signals 行数 $((rows-1)) < $fwn"
miss=0
for f in references/frameworks/*.md; do
  b=$(basename "$f" .md)
  [[ "$b" == "_template" ]] && continue
  grep -qF "| ${b} |" "$SIG" || { bad "signals 缺框架行: $b"; miss=1; }
done
[[ $miss -eq 0 ]] && ok "signals 覆盖全部 $fwn 个框架"
grep -q '由 scripts/gen-framework-index.sh 生成' "$SIG" && ok "生成声明头" || bad "缺生成声明头"

# 态 2：guide 区块指针化（标记间 ≤5 行且含指针）+ 标记保留
blk=$(awk '/^# >>> framework-signal-index >>>/{f=1;next}/^# <<< framework-signal-index <<</{f=0}f' "$GUIDE")
n=$(printf '%s\n' "$blk" | grep -c .)
[[ $n -le 5 ]] && ok "guide 区块 ≤5 行（实际 ${n}）" || bad "guide 区块 $n 行未指针化"
printf '%s\n' "$blk" | grep -qF "assets/framework-signals.md" && ok "指针含 signals 路径" || bad "缺指针"
grep -qF '# >>> framework-signal-index >>>' "$GUIDE" && grep -qF '# <<< framework-signal-index <<<' "$GUIDE" \
  && ok "标记保留" || bad "标记丢失"

# 态 3：幂等（再跑一次，双产物 byte-identical）
sig_b="$(mktemp /tmp/sigb.XXXXXX)"; gui_b="$(mktemp /tmp/guib.XXXXXX)"
cp "$SIG" "$sig_b"; cp "$GUIDE" "$gui_b"
bash "$SH" >/dev/null 2>&1
diff -q "$sig_b" "$SIG" >/dev/null && diff -q "$gui_b" "$GUIDE" >/dev/null \
  && ok "幂等 byte-identical" || bad "二次运行产物漂移"
rm -f "$sig_b" "$gui_b"

[[ $FAIL -eq 0 ]] && { echo "PASS test-signal-index"; exit 0; } || { echo "FAIL test-signal-index" >&2; exit 1; }
