#!/usr/bin/env bash
# test-ontology-verify.sh — ontology-verify.sh 六锚行为级回归（R130 覆盖补齐）
# 契约：<PROJECT_DIR> [--skill-dir <dir>] 一站式体检六锚，advisory 性质——锚失配只 ⚠ 不阻断
#（exit 0），仅 arg 错误 exit 1。全部断言输出内容而非只看 rc；六锚逐态覆盖。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/ontology-verify.sh"
# 注意：沙盒前缀不得含 "test" 字样——inventory-verify 的同名测试探测用 -ipath '*test*'
# 匹配全路径，沙盒路径含 test 会把项目内所有文件误判为测试文件（实测踩中）。
TMP="$(mktemp -d /tmp/ovprobe.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 用法/arg 错误（唯一非零退出面）---
out="$(bash "$SH" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && ok "无参 rc=1" || bad "无参 rc=${rc}"
printf '%s\n' "$out" | grep -q "PROJECT_DIR 缺失或不存在" && ok "无参报缺失提示" || bad "无参提示异常: ${out}"
out="$(bash "$SH" "$TMP/no-such-dir" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && ok "不存在目录 rc=1" || bad "坏目录 rc=${rc}"
out="$(bash "$SH" "$TMP" --bogus 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "未知参数" && ok "未知参数 rc=1+提示" || bad "未知参数 rc=${rc}"
out="$(bash "$SH" "$TMP" "$TMP" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && ok "双位置参数 rc=1" || bad "双位置参数 rc=${rc}"
out="$(bash "$SH" "$TMP" --skill-dir 2>&1)"; rc=$?
[[ $rc -ne 0 ]] && ok "--skill-dir 缺值 rc!=0" || bad "--skill-dir 缺值 rc=${rc}"
out="$(bash "$SH" -h 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "用法" && printf '%s\n' "$out" | grep -q "退出码" \
  && ok "-h 打印用法与退出码语义" || bad "-h 输出异常: ${out}"

# --- 态 1：空项目全缺省（无 .swarm-yuan、无 skill-dir）→ 六锚休眠态各就各位 + exit 0 ---
mkdir -p "$TMP/p0"
out="$(bash "$SH" "$TMP/p0" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "空项目 exit 0（advisory 不阻断）" || bad "空项目 rc=${rc}"
printf '%s\n' "$out" | grep -q "⚠ Fingerprint 快照不存在" && ok "锚1 无快照 → ⚠" || bad "锚1 态异常: ${out}"
printf '%s\n' "$out" | grep -q "⚠ stability-audit 跳过" && ok "锚2 无 skill-dir → ⚠ 跳过" || bad "锚2 态异常"
printf '%s\n' "$out" | grep -q "⚠ 版本戳缺失" && ok "锚3 无版本戳 → ⚠" || bad "锚3 态异常"
printf '%s\n' "$out" | grep -q "⚠ digest 链跳过" && ok "锚4 无 decisions/trace → ⚠ 跳过" || bad "锚4 态异常"
printf '%s\n' "$out" | grep -q "✓ 账本↔过程（gate-audit）：无审计文件（hooks 未启用拦截=休眠态，正常）" \
  && ok "锚5 无审计文件 → ✓ 休眠态" || bad "锚5 态异常"
printf '%s\n' "$out" | grep -q "→ 六锚语义详见" && ok "尾行指向 README 3.8" || bad "尾行缺失"

# --- 态 2：锚1 指纹三态（无/一致/变化）+ 锚6 last-good 只在有快照时报 ---
mkdir -p "$TMP/p1/src"
printf 'const q = 1\n' > "$TMP/p1/src/zz.ts"
bash scripts/project-fingerprint.sh "$TMP/p1" --write >/dev/null 2>&1
out="$(bash "$SH" "$TMP/p1" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ 地图↔仓库（Fingerprint）：快照与当前仓库一致（表征时效锚定）" \
  && ok "锚1 快照一致 → ✓" || bad "锚1 一致态异常: ${out}"
printf '%s\n' "$out" | grep -q "✓ last-good 红线：当前基线 total=1" && ok "锚6 报基线 total" || bad "锚6 态异常: ${out}"
mkdir -p "$TMP/p1/newdir" && printf 'x\n' > "$TMP/p1/newdir/extra.txt"
out="$(bash "$SH" "$TMP/p1" 2>&1)"
printf '%s\n' "$out" | grep -qE "仓库已变化（[1-9][0-9]* 个 scope 变更）" \
  && ok "锚1 仓库变化 → ✓ 报 scope 变更数" || bad "锚1 变化态异常: ${out}"

# --- 态 3：锚2 stability-audit 三态（warn/无冲突/跳过）---
mkdir -p "$TMP/p3/src" "$TMP/skill/references"
printf 'const q = 1\n' > "$TMP/p3/src/zz.ts"
# stable 标注 + fan-in=0 + 无同名测试 → 两处机械信号矛盾（tmp 非 git 仓 churn 为 -）
cat > "$TMP/skill/references/reference-manual.md" <<'EOF'
# rm
## §6 全量接口端点表
| 端点 | 方法 | 说明 |
|------|------|------|
| `src/zz.ts` | GET | 稳定 |
EOF
out="$(bash "$SH" "$TMP/p3" --skill-dir "$TMP/skill" 2>&1)"
printf '%s\n' "$out" | grep -q "⚠ 标注↔组件倾向：2 处 STABILITY_WARN" \
  && ok "锚2 stable 无引用无测试 → 2 处 WARN" || bad "锚2 warn 态异常: ${out}"
printf '# rm\n## §6 全量接口端点表\n| 端点 | 方法 |\n|---|---|\n' > "$TMP/skill/references/reference-manual.md"
out="$(bash "$SH" "$TMP/p3" --skill-dir "$TMP/skill" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ 标注↔组件倾向（stability-audit）：稳定性标注与 churn/fan-in/测试三信号无冲突" \
  && ok "锚2 无标注行 → 无冲突" || bad "锚2 干净态异常: ${out}"
rm "$TMP/skill/references/reference-manual.md"
out="$(bash "$SH" "$TMP/p3" --skill-dir "$TMP/skill" 2>&1)"
printf '%s\n' "$out" | grep -q "⚠ stability-audit 跳过（skill-dir 或 reference-manual.md 缺失）" \
  && ok "锚2 manual 缺失 → ⚠ 跳过" || bad "锚2 缺 manual 态异常: ${out}"

# --- 态 4：锚3 版本戳 + SKILL_DIR 自动推断（$PROJ/../SKILL.md）---
printf 'v9.9.9\n2026-01-01\n' > "$TMP/skill/.swarm-yuan-version"
out="$(bash "$SH" "$TMP/p3" --skill-dir "$TMP/skill" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ 生成物↔生成器（版本戳）：v9.9.9" && ok "锚3 版本戳取头两行" || bad "锚3 态异常: ${out}"
mkdir -p "$TMP/sk2/proj" "$TMP/sk2/references"
touch "$TMP/sk2/SKILL.md"
printf '# rm\n' > "$TMP/sk2/references/reference-manual.md"
printf 'v1.0.0\n' > "$TMP/sk2/.swarm-yuan-version"
out="$(bash "$SH" "$TMP/sk2/proj" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ 生成物↔生成器（版本戳）：v1.0.0" \
  && ok "SKILL_DIR 由 ../SKILL.md 自动推断" || bad "自动推断失效: ${out}"

# --- 态 5：锚4 digest 链四态（顺序一致/乱序失配/无解失配/纯旧行+混合）---
P2="$TMP/p2"; mkdir -p "$P2/.swarm-yuan"
L1='{"ts":"2026-01-01T00:00:00Z","ev":"gen"}'
L2='{"ts":"2026-01-01T00:00:01Z","ev":"decision"}'
L3='{"ts":"2026-01-01T00:00:02Z","ev":"trace"}'
printf '%s\n%s\n%s\n' "$L1" "$L2" "$L3" > "$P2/.swarm-yuan/trace.jsonl"
c1="$(printf '%s' "$L1" | cksum | awk '{print $1}')"
c2="$(printf '%s' "$L2" | cksum | awk '{print $1}')"
c9="$(printf '%s' '{"ev":"tampered"}' | cksum | awk '{print $1}')"
D="$P2/.swarm-yuan/decisions.jsonl"
printf '{"id":1,"ref_trace_hash":"%s"}\n{"id":2,"ref_trace_hash":"%s"}\n' "$c1" "$c2" > "$D"
out="$(bash "$SH" "$P2" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ decisions↔trace（digest 链）：2/2 锚定行解析且顺序一致（另 0 行旧式无锚）" \
  && ok "锚4 顺序锚定 → 2/2 解析" || bad "锚4 一致态异常: ${out}"
printf '{"id":1,"ref_trace_hash":"%s"}\n{"id":2,"ref_trace_hash":"%s"}\n' "$c2" "$c1" > "$D"   # 乱序：c1 在 c2 之后无解
out="$(bash "$SH" "$P2" 2>&1)"
printf '%s\n' "$out" | grep -q "失配——decisions 第 2 行" \
  && ok "锚4 乱序 → 第 2 行起 stale" || bad "锚4 乱序态异常: ${out}"
printf '{"id":1,"ref_trace_hash":"%s"}\n' "$c9" > "$D"   # 锚在 trace 中无解（被篡改/丢失）
out="$(bash "$SH" "$P2" 2>&1)"
printf '%s\n' "$out" | grep -q "锚.*在 trace 中无解" \
  && ok "锚4 无解锚 → 失配+无解提示" || bad "锚4 无解态异常: ${out}"
printf '{"id":1,"note":"legacy-no-anchor"}\n' > "$D"
out="$(bash "$SH" "$P2" 2>&1)"
printf '%s\n' "$out" | grep -q "✓ decisions↔trace（digest 链）：无锚定行（1 行均为锚定引入前旧行" \
  && ok "锚4 纯旧行 → 非失配" || bad "锚4 纯旧行态异常: ${out}"
printf '{"id":1,"ref_trace_hash":"%s"}\n{"id":2,"note":"legacy"}\n' "$c2" > "$D"
out="$(bash "$SH" "$P2" 2>&1)"
printf '%s\n' "$out" | grep -q "1/1 锚定行解析且顺序一致（另 1 行旧式无锚）" \
  && ok "锚4 混合 → 1/1 解析+1 旧行" || bad "锚4 混合态异常: ${out}"
printf '{"invoked":"g1","result":"fail"}\n{"invoked":"g2","result":"pass"}\n{"invoked":"g3","result":"pass"}\n' \
  > "$P2/.swarm-yuan/gate-audit.jsonl"
out="$(bash "$SH" "$P2" 2>&1)"; rc=$?
printf '%s\n' "$out" | grep -q "✓ 账本↔过程（gate-audit）：3 行决策审计" \
  && ok "锚5 审计 3 行计数" || bad "锚5 计数态异常: ${out}"
[[ $rc -eq 0 ]] && ok "含失配/警告态仍 exit 0（体检非门禁）" || bad "advisory 态 rc=${rc}"

[[ $FAIL -eq 0 ]] && { echo "PASS test-ontology-verify"; exit 0; } || { echo "FAIL test-ontology-verify" >&2; exit 1; }
