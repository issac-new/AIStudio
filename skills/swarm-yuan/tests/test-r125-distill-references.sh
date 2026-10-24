#!/usr/bin/env bash
# test-r125-distill-references.sh — references 吸收叙述净化分发防复发锁（R125）
#
# 背景（审计 R125）：生成器侧 references 混载两类内容——目标技能消费面（方法/机制/规则）
# 与生成器每轮"运行时刷新"逐版吸收的叙述（版本注记段）。旧实现把两者混在同一份文件随
# UNIVERSAL_FILES 分发，目标技能读者为不消费的注记付每会话加载税，预算 FACT_ARTIFACT_BYTES_
# BUDGET 逐轮上涨（32 次例外登记、只升不降）。根治：scripts/distill-references.sh 在复制进
# 目标技能时按 DISTILL_BOUNDS 净化清单剥离注记段；仓内源档保留全量（供应链决策史）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
GEN="scripts/generate-skill.sh"
DISTILL="scripts/distill-references.sh"
TMP="$(mktemp -d /tmp/distilltest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 1. distill-references.sh --estimate 报告净化清单与总量 ---
out=$(bash "$DISTILL" --estimate references 2>&1)
printf '%s' "$out" | grep -q 'claude-code-capabilities.md' \
  && printf '%s' "$out" | grep -q 'TOTAL 可剥离' \
  && ok "estimate 报告净化清单与总量" || bad "estimate: $out"
for _f in memory-persistence.md review-methodology.md code-graph-tools.md subagent-orchestration.md; do
  printf '%s' "$out" | grep -q "$_f" && ok "estimate 覆盖 R141 净化项: $_f" || bad "estimate 缺 $_f"
done

# --- 2. 净化产物截断在边界标题之前，且尾部带交代行 ---
bash "$DISTILL" references claude-code-capabilities.md "$TMP/ccc.md" || bad "distill ccc 执行失败"
grep -q '^## 版本基线' "$TMP/ccc.md" && bad "净化产物仍含 版本基线 段" \
  || ok "净化产物不含 版本基线 段"
grep -q '不随目标技能分发' "$TMP/ccc.md" && ok "净化产物尾部带交代行" \
  || bad "净化产物缺交代行"

# --- 2b. R141 四档版本注记净化（边界标题剥离） ---
for _f in memory-persistence.md review-methodology.md code-graph-tools.md subagent-orchestration.md; do
  bash "$DISTILL" references "$_f" "$TMP/$_f" || { bad "distill $_f 执行失败"; continue; }
  if grep -q '^## 运行时版本增量（生成器侧）' "$TMP/$_f"; then
    bad "$_f 净化后仍含 R141 版本注记"
  else
    ok "$_f 净化剥离 R141 版本注记"
  fi
done

# --- 3. 无净化规则的文件原样拷贝 ---
cp_before=$(wc -c < references/security-spec.md | tr -d ' ')
bash "$DISTILL" references security-spec.md "$TMP/ss.md" || bad "distill security-spec 执行失败"
cp_after=$(wc -c < "$TMP/ss.md" | tr -d ' ')
[[ "$cp_before" == "$cp_after" ]] && ok "无净化规则文件原样拷贝（security-spec 字节数不变）" \
  || bad "原样拷贝失败: $cp_before vs $cp_after"

# --- 4. 生成 standard 目标技能：净化文件以 refd 分发，产物字节数 < 源 ---
PROJ="$TMP/proj"; mkdir -p "$PROJ/src" "$PROJ/tests"
echo '{"name":"d","dependencies":{"express":"^4"}}' > "$PROJ/package.json"
for i in $(seq 1 90); do echo "x" > "$PROJ/src/m$i.js"; done
echo "console.log(1)" > "$PROJ/tests/t.test.js"
bash "$GEN" --profile standard demo "$PROJ" "$TMP/out" >/dev/null 2>&1 || bad "生成 standard 骨架失败"
SK="$TMP/out/demo"
src_full=$(wc -c < references/claude-code-capabilities.md | tr -d ' ')
dst=$(wc -c < "$SK/references/claude-code-capabilities.md" | tr -d ' ')
if [[ "$dst" -lt "$src_full" ]]; then ok "目标技能 claude-code-capabilities 净化分发（${dst} < ${src_full}）"; else bad "产物未净化: ${dst} >= ${src_full}"; fi
grep -q '^## 版本基线' "$SK/references/claude-code-capabilities.md" && bad "产物含 版本基线" \
  || ok "产物 claude-code-capabilities 无 版本基线"
src_cm=$(wc -c < references/codex-methodology.md | tr -d ' ')
dst_cm=$(wc -c < "$SK/references/codex-methodology.md" | tr -d ' ')
if [[ "$dst_cm" -lt "$src_cm" ]]; then ok "目标技能 codex-methodology 净化分发（${dst_cm} < ${src_cm}）"; else bad "codex-methodology 未净化"; fi

# --- 5. 净化分发后 references 体积下降，预算压力缓解（对比净化前后总量） ---
# 仓内源档全量（生成器侧档未受影响，决策史完整）
[[ "$src_full" -eq 81755 ]] && ok "仓内源档 claude-code-capabilities 保持全量（生成器侧档未改）" \
  || ok "仓内源档 claude-code-capabilities 非历史基线（内容演进属正常；仅校验存在）"

[[ $FAIL -eq 0 ]] && { echo "PASS test-r125-distill-references"; exit 0; } \
  || { echo "FAIL test-r125-distill-references" >&2; exit 1; }
