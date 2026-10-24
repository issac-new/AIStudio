#!/usr/bin/env bash
# test-registry —— 事实注册表对账（WP1）
# 覆盖：--check 通过态 / 变异必红（防 vacuous pass）/ --counts 关键计数。
set -uo pipefail
PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
NAME=test-registry
OK=0; FAIL=0
ok()  { OK=$((OK+1));  echo "  ok $*"; }
bad() { FAIL=$((FAIL+1)); echo "  fail $*"; }

# 1) 对账通过态
if bash "$ROOT/scripts/registry-render.sh" --check >/tmp/test-registry.log 2>&1; then
  ok "--check 通过"
else
  bad "--check 未通过（详见 /tmp/test-registry.log）"
  sed -n '1,20p' /tmp/test-registry.log
fi

# 2) 变异必红：fixture 列改指向不存在目录 -> check 必须 exit 1（vacuous pass 防线）
TMP=$(mktemp -d "${TMPDIR:-/tmp}/reg-mut.XXXXXX"); trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT/assets/registry" "$TMP/registry"
sed '3s#tests/gate-fixtures/branch#__mutated_missing__#' "$TMP/registry/gates.tsv" > "$TMP/g" && mv "$TMP/g" "$TMP/registry/gates.tsv"
if grep -q '__mutated_missing__' "$TMP/registry/gates.tsv"; then ok "变异已写入（行3 fixture=不存在路径）"; else bad "变异未写入（测试自身 sed 失效）"; fi
if SWARM_REGISTRY_DIR="$TMP/registry" bash "$ROOT/scripts/registry-render.sh" --check >/dev/null 2>&1; then
  bad "变异未被发现（fixture 列篡改后仍通过 = vacuous pass）"
else
  ok "变异必红（gates.fixture 列篡改被检出）"
fi

# 3) 变异必红：enforce 声明与 gate-enforce-level.conf 有效分层分叉
cp -R "$ROOT/assets/registry" "$TMP/registry2"
sed '3s/\tstrict\t/\tadvisory\t/' "$TMP/registry2/gates.tsv" > "$TMP/g2" && mv "$TMP/g2" "$TMP/registry2/gates.tsv"
if grep -q $'\tadvisory\t' "$TMP/registry2/gates.tsv"; then ok "变异已写入（行3 enforce=advisory）"; else bad "变异未写入（测试自身 sed 失效）"; fi
if SWARM_REGISTRY_DIR="$TMP/registry2" bash "$ROOT/scripts/registry-render.sh" --check >/dev/null 2>&1; then
  bad "enforce 声明分叉未被发现"
else
  ok "enforce 声明≠有效分层被检出"
fi

# 3b) 变异必红：runtimes.tsv 基线改动后，upstream-baseline 状态表必须失配
cp -R "$ROOT/assets/registry" "$TMP/registry3"
awk 'BEGIN{FS=OFS="\t"} $1=="openspec"{$7="v0.0.0-mutated"} {print}' \
  "$TMP/registry3/runtimes.tsv" > "$TMP/r3" && mv "$TMP/r3" "$TMP/registry3/runtimes.tsv"
if grep -q 'v0.0.0-mutated' "$TMP/registry3/runtimes.tsv"; then
  ok "变异已写入（openspec 基线篡改）"
else
  bad "变异未写入（测试自身 awk 失效）"
fi
if SWARM_REGISTRY_DIR="$TMP/registry3" bash "$ROOT/scripts/registry-render.sh" --check >/dev/null 2>&1; then
  bad "runtimes.tsv 基线改动未反映到 upstream-baseline（双源漂移未被检出）"
else
  ok "双源漂移必红（状态表 ≠ runtimes.tsv）"
fi

# 3c) 生命周期报告可用（只读，不因观察项而失败）
if bash "$ROOT/scripts/registry-render.sh" --lifecycle >/tmp/test-registry-lifecycle.log 2>&1 \
   && grep -q '生命周期候选' /tmp/test-registry-lifecycle.log; then
  ok "--lifecycle 输出候选清单"
else
  bad "--lifecycle 未输出候选清单"
fi

# 4) counts 关键计数（与 facts 闭合一的再断言）
C=$(bash "$ROOT/scripts/registry-render.sh" --counts)
for kv in REG_GATES_TOTAL=56 REG_REFERENCES=57 REG_UNIVERSAL_FILES=103 REG_UNIVERSAL_FILES_CORE=47 REG_RUNTIMES_WIRED=15; do
  if printf '%s\n' "$C" | grep -qx "$kv"; then ok "$kv"; else bad "缺 $kv"; fi
done

echo "$NAME: $OK ok / $FAIL fail"
[ "$FAIL" = 0 ]
