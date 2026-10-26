#!/usr/bin/env bash
# test-runner-contract.sh — 统一 runner 契约（WP9）
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

out="$(SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --list 2>/dev/null)"
n="$(printf '%s\n' "$out" | awk 'NF{n++} END{print n+0}')"
[[ "$n" -ge 90 ]] && ok "run.sh --list ${n} 条" || bad "run.sh --list 仅 ${n} 条"

tap="$(SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --level 1 --jobs 1 --format tap --filter test-doc-numbers 2>/dev/null)"
printf '%s\n' "$tap" | grep -q '^1\.\.1$' && ok "TAP 计划 1..1" || bad "TAP 计划缺失"
printf '%s\n' "$tap" | grep -q '^ok 1 - test-doc-numbers\.sh$' && ok "TAP ok 1" || bad "TAP ok 1 缺失"

# 元数据闭环：每个 test-*.sh 必须在 index.tsv 登记（未登记会静默落到 level=2 / 可并行默认）
missing=""
for f in "$BASE"/tests/test-*.sh "$BASE"/tests/scripts/test-*.sh; do
  [[ -f "$f" ]] || continue
  b="$(basename "$f")"
  grep -q "^${b}	" "$BASE/tests/index.tsv" || missing="$missing $b"
done
if [[ -z "$missing" ]]; then
  ok "全部 test-*.sh 已登记 index.tsv"
else
  bad "index.tsv 未登记:${missing}"
fi

# 行为域元数据闭环：每个测试恰有一个域；域行不指向缺失测试；域筛选与零命中语义可用。
DOM="$BASE/tests/domains.tsv"
if [[ -f "$DOM" ]]; then
  dom_missing=""; dom_orphan=""
  for f in "$BASE"/tests/test-*.sh "$BASE"/tests/scripts/test-*.sh; do
    [[ -f "$f" ]] || continue
    b="$(basename "$f")"
    awk -F '\t' -v n="$b" '!/^#/ && $1==n {found=1} END{exit !found}' "$DOM" || dom_missing="$dom_missing $b"
  done
  while IFS=$'\t' read -r dt dd; do
    [[ -z "$dt" || "$dt" == \#* ]] && continue
    [[ -f "$BASE/tests/$dt" || -f "$BASE/tests/scripts/$dt" ]] || dom_orphan="$dom_orphan $dt"
  done < "$DOM"
  dup_dom="$(awk -F '\t' '!/^#/ && NF {print $1}' "$DOM" | sort | uniq -d | tr '\n' ' ')"
  [[ -z "$dom_missing" ]] && ok "全部 test-*.sh 已登记行为域" || bad "domains.tsv 未登记:${dom_missing}"
  [[ -z "$dom_orphan" ]] && ok "行为域行无孤儿（全部指向实存测试）" || bad "domains.tsv 孤儿行:${dom_orphan}"
  [[ -z "$dup_dom" ]] && ok "行为域登记无重复测试" || bad "domains.tsv 重复登记:${dup_dom}"
  dom_n="$(SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --list-domains 2>/dev/null | wc -l | tr -d ' ')"
  [[ "$dom_n" -ge 8 ]] && ok "run.sh --list-domains 输出 ${dom_n} 个域" || bad "run.sh --list-domains 仅 ${dom_n} 个域"
  dom_one="$(SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --domain gates --filter test-gate-rules --list 2>/dev/null | awk 'NF{n++} END{print n+0}')"
  [[ "$dom_one" -eq 1 ]] && ok "--domain gates 精确命中 1 个测试" || bad "--domain gates 命中 ${dom_one} 个测试"
  if SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --domain __no_such_domain__ --filter test-gate-rules >/dev/null 2>&1; then
    bad "未知域未 fail-closed"
  else
    ok "未知域 fail-closed"
  fi
else
  bad "缺 tests/domains.tsv（行为域元数据不可读）"
fi

# 零命中必须拒绝假绿
if SWARM_RUN_NO_LOCK=1 bash "$BASE/tests/run.sh" --filter __no_such_test__ >/dev/null 2>&1; then
  bad "零命中未 fail-closed"
else
  ok "零命中 fail-closed"
fi

# parallel_safe=no 的测试不得与任何测试并跑；parallel_safe=yes 的测试在 --jobs>1 时须真并行。
# 沙箱 6 个假测试各自用运行标记侦测并发：不安全测试起跑时看到别人在跑、或安全测试起跑时
# 看到不安全测试在跑，都记一条 violation。
SB="$(mktemp -d "${TMPDIR:-/tmp}/swarm-runner-sb.XXXXXX")"
mkdir -p "$SB/tests" "$SB/assets/lib" "$SB/marks"
cp "$BASE/tests/run.sh" "$SB/tests/run.sh"
cp "$BASE/assets/lib/run.sh" "$SB/assets/lib/run.sh"
for spec in a-safe1:yes b-safe2:yes c-unsafe1:no d-safe3:yes e-unsafe2:no f-safe4:yes; do
  name="test-${spec%%:*}.sh"; safe="${spec##*:}"
  printf '%s\t2\t%s\tcontract\t-\n' "$name" "$safe" >> "$SB/tests/index.tsv"
  cat > "$SB/tests/$name" <<EOF
#!/usr/bin/env bash
M="$SB/marks"; me="\$(basename "\$0" .sh)"
: > "\$M/running.\$me"
sleep 0.2
others="\$(ls "\$M"/running.* 2>/dev/null | grep -v "running.\$me\$" || true)"
if [[ "$safe" == "no" && -n "\$others" ]]; then echo "\$me saw: \$others" >> "\$M/violations"; fi
if [[ "$safe" == "yes" ]] && printf '%s\n' "\$others" | grep -q 'unsafe'; then echo "\$me saw unsafe" >> "\$M/violations"; fi
if [[ "$safe" == "yes" ]] && printf '%s\n' "\$others" | grep -q 'safe'; then echo "\$me" >> "\$M/overlaps"; fi
sleep 0.5; rm -f "\$M/running.\$me"
exit 0
EOF
done
if SWARM_RUN_NO_LOCK=1 bash "$SB/tests/run.sh" --level all --jobs 3 >/dev/null 2>&1; then
  ok "沙箱 6 测试 --jobs 3 全部通过"
else
  bad "沙箱 6 测试 --jobs 3 有失败"
fi
if [[ -s "$SB/marks/violations" ]]; then
  bad "parallel_safe=no 测试与他人并跑: $(tr '\n' ';' < "$SB/marks/violations")"
else
  ok "parallel_safe=no 测试全程独占（无并跑）"
fi
if [[ -s "$SB/marks/overlaps" ]]; then
  ok "parallel_safe=yes 测试在 --jobs 3 下真并行（$(wc -l < "$SB/marks/overlaps" | tr -d ' ') 次重叠）"
else
  bad "parallel_safe=yes 测试未并行（--jobs 3 退化为串行）"
fi
rm -rf "$SB"

echo "PASS test-runner-contract ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
