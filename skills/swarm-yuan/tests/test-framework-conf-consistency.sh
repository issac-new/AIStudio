#!/usr/bin/env bash
# test-framework-conf-consistency.sh — R48 框架配置一致性回归锁
# 三组断言（把 R47/R48 审计从一次性人肉扫描固化为 CI 机械执法）：
#   ① 全量声明：FACT_FRAMEWORKS 个（读 facts.conf）assets/framework-gates/*.sh 片段逐个声明 requires_conf（权威变量命名源，
#      generate-skill --upgrade/conf 清理与 mark-active 执法都消费它——缺声明=执法失锚）
#   ② 可活性：每个规则集 id，requires_conf 的 glob 族变量 ∪ id 前缀可匹配的 arch.conf 变量 非空
#      （否则该框架检出的项目无论怎么填 conf 都过不了 mark-active——R47-D3 jest-vitest 卡死形态）
#   ③ D3 变异锁（R44 负向断言先例）：--check-framework-globs 子命令
#      正向=只填 requires_conf 声明的 VITEST_TEST_GLOBS → 放行
#      负向=只填 id 前缀伪造的 JESTVITEST_SRC_GLOBS → 必须拦截（防前缀推导回潮吞掉 requires_conf 语义）
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

GATES="$BASE/assets/framework-gates"
ARCH="$BASE/assets/precheck.arch.conf"
SUFFIX_RE='(SRC_GLOBS|MAPPER_DIRS|CONFIG_FILES|SQL_GLOBS|SCHEMA_GLOBS|JOB_DIRS|KEY_COLUMNS|SHARD_KEY|GLOBS)'

# R62 机制修（子代理审计发现#1）：期望值改读 assets/facts.conf 单一事实源——
# 原先把期望值写死成常量，每新增规则集须手改本测试否则 CI 红（手抄数字三坑同族）。
# R70：路径挂 $BASE 自锚（原相对路径依赖 CWD=swarm-yuan，CI working-directory 掩盖，
# 从仓库根或统一 sweep 入口跑即炸——与 GATES/ARCH 的 $BASE 惯形对齐）。
_fw_expected=$(sed -n 's/^FACT_FRAMEWORKS=\([0-9][0-9]*\).*/\1/p' "$BASE/assets/facts.conf")
[[ -n "$_fw_expected" ]] || { echo "无法从 $BASE/assets/facts.conf 读 FACT_FRAMEWORKS"; exit 1; }
echo "=== ① ${_fw_expected} 片段 requires_conf 全量声明 ==="
_total=0; _missing=""
for f in "$GATES"/*.sh; do
  rid="$(basename "$f" .sh)"
  _total=$((_total+1))
  grep -q "^# ruleset: ${rid}  *requires_conf:" "$f" 2>/dev/null || _missing="$_missing $rid"
done
[[ "$_total" -eq "$_fw_expected" ]] && ok "片段总数 $_total=FACT_FRAMEWORKS $_fw_expected" || bad "片段总数 $_total≠${_fw_expected}（framework-gates/ 与 facts.conf 漂移）"
if [[ -z "$_missing" ]]; then
  ok "${_fw_expected}/${_fw_expected} 片段全部声明 requires_conf"
else
  bad "缺 requires_conf 声明:$_missing"
fi

echo "=== ② 每规则集 mark-active 可活性（至少一个可填可匹配变量）==="
_dead=""
for f in "$GATES"/*.sh; do
  rid="$(basename "$f" .sh)"
  prefix="$(printf '%s' "$rid" | tr -d '-' | tr '[:lower:]' '[:upper:]')"
  req_glob=$(grep -m1 "^# ruleset: ${rid}  *requires_conf:" "$f" 2>/dev/null | sed 's/.*requires_conf: *//' \
    | tr ' ' '\n' | grep -E "$SUFFIX_RE" | head -1 || true)
  pref_hit=$(grep -cE "^${prefix}[A-Z0-9_]*${SUFFIX_RE}=" "$ARCH" 2>/dev/null || true)
  if [[ -z "$req_glob" && "${pref_hit:-0}" -eq 0 ]]; then
    _dead="$_dead $rid"
  fi
done
if [[ -z "$_dead" ]]; then
  ok "全部规则集 mark-active 可活（requires_conf glob 变量或 arch.conf 前缀变量至少其一在）"
else
  bad "不可活规则集（检出即卡死形态）:$_dead"
fi

echo "=== ③ D3 变异锁（--check-framework-globs 正负双态）==="
_skill=$(mktemp -d /tmp/fwcc.XXXXXX)
mkdir -p "$_skill/scripts"
printf -- '---\nname: probe\nstatus: draft\n---\n# probe\n' > "$_skill/SKILL.md"
# requires_conf 注入区块形态（jest-vitest：conf 变量名与 id 前缀名实不符的实例）
cat > "$_skill/scripts/precheck.sh" <<'EOF'
# >>> swarm-yuan:framework-gates >>> （由 generate-skill.sh --inject-frameworks 维护，勿手改）
# ruleset: jest-vitest  requires_conf: VITEST_CONFIG_GLOBS VITEST_TEST_GLOBS VITEST_CONFIG_FILE VITEST_FORBIDDEN_UPSTREAM_TEST
# <<< swarm-yuan:framework-gates <<<
EOF
printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\n' > "$_skill/scripts/precheck.conf"

# 正向：只填 requires_conf 声明的 VITEST_TEST_GLOBS → 放行
printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\nVITEST_TEST_GLOBS=("src/**/*.spec.ts")\n' > "$_skill/scripts/precheck.conf"
if bash "$BASE/scripts/generate-skill.sh" --check-framework-globs "$_skill" >/dev/null 2>&1; then
  ok "正向：填 VITEST_TEST_GLOBS（requires_conf 声明名）放行"
else
  bad "正向失败：requires_conf 变量名不被认（R47-D3 修复回潮）"
fi

# 负向：只填 id 前缀伪造的 JESTVITEST_SRC_GLOBS → 必须拦截（前缀推导是补充不是替代）
printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\nJESTVITEST_SRC_GLOBS=("src/**")\n' > "$_skill/scripts/precheck.conf"
if bash "$BASE/scripts/generate-skill.sh" --check-framework-globs "$_skill" >/dev/null 2>&1; then
  bad "负向失败：伪造前缀变量被放行——执法退化回前缀推导（D3 半修形态）"
else
  ok "负向：伪造 JESTVITEST_* 前缀变量被拦截（requires_conf 语义未丢）"
fi

# 空态：什么都不填 → 拦截（R33-F1 空转防线本体）
printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\n' > "$_skill/scripts/precheck.conf"
if bash "$BASE/scripts/generate-skill.sh" --check-framework-globs "$_skill" >/dev/null 2>&1; then
  bad "空态失败：全空 conf 被放行（R33-F1 空转防线失效）"
else
  ok "空态：全空 conf 拦截（框架门禁空转防线在）"
fi
rm -rf "$_skill"

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "PASS test-framework-conf-consistency（$PASS 项断言全过）"
  exit 0
else
  echo "FAIL test-framework-conf-consistency（$FAIL 项失败 / $PASS 过）"
  exit 1
fi
