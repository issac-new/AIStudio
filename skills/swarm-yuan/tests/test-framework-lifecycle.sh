#!/usr/bin/env bash
# test-framework-lifecycle.sh — 框架注入/移除/回滚事务契约（Task 6 / A07）
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$BASE/tests/e2e/java-demo"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }
SB="$(mktemp -d "${TMPDIR:-/tmp}/fw-lifecycle.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile standard fw "$DEMO" "$SB" >/dev/null 2>&1
S="$SB/fw"
[[ -f "$S/scripts/precheck.sh" ]] || { echo "create 失败"; exit 1; }

# 填充 springboot 变量并注入一个框架
printf 'SPRINGBOOT_SRC_GLOBS=("src/main/java/**/*.java")\n' >> "$S/scripts/precheck.arch.conf"
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" >/dev/null 2>&1
grep -q 'ruleset: spring-boot' "$S/scripts/precheck.sh" && ok '注入在位' || bad '注入缺失'

# ① 移除最后一个框架 → 空标记区块 + ledger 同步 + sha 记账
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" --remove spring-boot >/dev/null 2>&1
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" --remove sharding >/dev/null 2>&1
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" --remove lombok >/dev/null 2>&1
if grep -q '^# >>> swarm-yuan:framework-gates >>>' "$S/scripts/precheck.sh" \
   && ! grep -q 'ruleset: spring-boot' "$S/scripts/precheck.sh"; then
  ok '移除后区块为空标记'
else
  bad '移除后区块异常'
fi
grep -q '^framework_gates_sha=' "$S/.swarm-yuan-version" && ok '空集合 sha 已记账' || bad 'sha 缺失'

# ② 回滚（快照深度 1）：净技能上注入 → remove spring-boot → 回滚，
#    应恢复 remove 前状态（三框架清单 + 区块含 spring-boot ruleset）。
S2="$SB/fw2"; mkdir -p "$S2"
SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile standard fw2 "$DEMO" "$SB" >/dev/null 2>&1
S="$S2"
printf 'SPRINGBOOT_SRC_GLOBS=("src/main/java/**/*.java")\n' >> "$S/scripts/precheck.arch.conf"
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" >/dev/null 2>&1
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" --remove spring-boot >/dev/null 2>&1
bash "$BASE/scripts/generate-skill.sh" --rollback-frameworks "$S" >/dev/null 2>&1
if grep -q 'ruleset: spring-boot' "$S/scripts/precheck.sh" && grep -q 'spring-boot' "$S/scripts/precheck.arch.conf"; then
  ok '回滚恢复注入与清单'
else
  bad "回滚不完整（ruleset=$(grep -c 'ruleset: spring-boot' "$S/scripts/precheck.sh" 2>/dev/null) conf=$(grep -c 'spring-boot' "$S/scripts/precheck.arch.conf" 2>/dev/null)）"
fi

# ③ 手改区块后 upgrade 必须拒绝（sha 保留链）
bash "$BASE/scripts/generate-skill.sh" --inject-frameworks "$S" >/dev/null 2>&1
grep -q '^framework_gates_sha=' "$S/.swarm-yuan-version" || { echo "前置失败：注入未记账"; exit 1; }
printf '# 手改注入区\n' >> "$S/scripts/precheck.sh"
# 把手改行放进标记区块内，制造 sha 失配
python3 - "$S/scripts/precheck.sh" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('# <<< swarm-yuan:framework-gates <<<', '# 手改痕迹\n# <<< swarm-yuan:framework-gates <<<')
open(p,'w').write(s)
PY
out="$(bash "$BASE/scripts/generate-skill.sh" --upgrade --profile standard fw2 "$DEMO" "$SB" 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '手改'; then
  ok '手改区块后 upgrade 拒绝'
else
  bad "upgrade 未拒绝手改（rc=${rc}；out 尾：$(printf '%s' "$out" | tail -3 | tr '\n' ' ')）"
fi

printf 'test-framework-lifecycle: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
