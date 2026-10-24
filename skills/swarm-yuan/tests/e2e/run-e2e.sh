#!/usr/bin/env bash
# run-e2e.sh — P1 端到端验证：四框架注入 + 门禁 fail 全链路
# 用法: bash tests/e2e/run-e2e.sh
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="${BASE}/e2e/java-demo"
PARADIGM="$(cd "${BASE}/.." && pwd)"  # swarm-yuan 范式根（含 scripts/generate-skill.sh）
FIX_DIR="$(mktemp -d /tmp/fwe2e.XXXXXX)"
trap 'rm -rf "${FIX_DIR}"' EXIT

echo "▶ E2E: 四框架注入 + 门禁 fail 全链路验证"

# 1. 构造目标 skill 骨架（precheck.sh + conf）
mkdir -p "${FIX_DIR}/scripts"
cp "${PARADIGM}/assets/precheck.sh" "${FIX_DIR}/scripts/precheck.sh"
# WP-Q1.3：拆分后 precheck.sh 依赖 gates-strict/warn/advisory.sh 三文件（source 守卫，
# check_framework 等在 gates-warn.sh）——与 tests/run-gate-fixture.sh 同款拷贝
for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "${PARADIGM}/assets/$_gf" ]] && cp "${PARADIGM}/assets/$_gf" "${FIX_DIR}/scripts/$_gf"
done
cat > "${FIX_DIR}/scripts/precheck.conf" <<'EOF'
PROJECT_DIR="__DEMO__"
ACTIVE_FRAMEWORKS=("mybatis" "lombok" "spring-batch" "sharding")
MYBATIS_MAPPER_DIRS=("__DEMO__/src/main/resources/mapper")
MYBATIS_SRC_GLOBS=("__DEMO__/src/main/java/**/*.java")
SQL_INJECTION_WHITELIST=("ORDER BY ${orderBy}")
LOMBOK_SRC_GLOBS=("__DEMO__/src/main/java/**/*.java")
SPRING_BATCH_JOB_DIRS=("__DEMO__/src/main/java/**/*.java")
SHARDED_TABLES=("t_order")
SHARDING_KEY_COLUMNS=("t_order=user_id")
SHARDING_BROADCAST_TABLES=("t_dict")
EOF
# 替换 __DEMO__ 为实际路径（heredoc 用单引号防 ${} 展开）
sed -i.bak "s|__DEMO__|${DEMO}|g" "${FIX_DIR}/scripts/precheck.conf" && rm -f "${FIX_DIR}/scripts/precheck.conf.bak"

# 2. 注入门禁片段
echo "== Step 1: --inject-frameworks 注入四框架 =="
bash "${PARADIGM}/scripts/generate-skill.sh" --inject-frameworks "${FIX_DIR}" 2>&1 | tail -3

# 断言1: 4 个 _fw_*_check 已注入
for fn in _fw_mybatis_check _fw_lombok_check _fw_spring_batch_check _fw_sharding_check; do
  grep -q "^${fn}()" "${FIX_DIR}/scripts/precheck.sh" && echo "✓ ${fn} 已注入" || { echo "✗ ${fn} 未注入"; exit 1; }
done

# 3. 跑 --framework，断言检出四个 fail id（WP-Q2H-B 后 check_framework=advisory——违规不阻断
#    退出码是设计语义，断言 = 检测命中：advisory/fail 行含植入的四个违规 id）
echo "== Step 2: --framework 实跑，断言四个 fail id =="
out="$(cd "${DEMO}" && bash "${FIX_DIR}/scripts/precheck.sh" --framework 2>&1 || true)"
printf '%s\n' "$out" | grep -qE '⚠ advisory: fw_|✗ fw_' \
  && echo "✓ --framework 检出违规（advisory 语义，不断行退出码）" \
  || { echo "✗ --framework 未检出任何违规（无 advisory/fail 行）"; echo "$out" | tail -20; exit 1; }

for gid in fw_mybatis_dollar fw_lombok_data_jpa fw_batch_step_scope fw_sharding_key_in_dml; do
  echo "$out" | grep -q "$gid" && echo "✓ 输出含 fail id: $gid" || { echo "✗ 输出缺 fail id: $gid"; echo "$out" | grep -E '✗|✓' | head -15; exit 1; }
done

# 3.1 数据映射防线 e2e（漏改字段防线三件套：声明式边 + 任务维度 + 字段同步门禁）
#   relations-extract 出 mapper-binding/data-mapping 边（改实体字段的影响面反查依据）；
#   DIM_SCHEDULE_JOB 枚举 job 入口（ReportJob/BatchJobConfig）；field_sync 对同步 resultMap pass。
echo "== Step 2.1: 数据映射防线（mapper-binding/data-mapping 边 + 调度任务维度 + field_sync）=="
REL_OUT="$(mktemp /tmp/rel.e2e.XXXXXX)"
bash "${PARADIGM}/scripts/relations-extract.sh" "${DEMO}" --out "${REL_OUT}" >/dev/null 2>&1
grep -qF '"from":"src/main/resources/mapper/UserMapper.xml","to":"src/main/java/com/demo/UserMapper.java","kind":"mapper-binding"' "${REL_OUT}" \
  && echo "✓ mapper-binding 边（XML namespace → Mapper 接口）" \
  || { echo "✗ mapper-binding 边缺失"; cat "${REL_OUT}"; exit 1; }
grep -qF '"from":"src/main/resources/mapper/UserMapper.xml","to":"src/main/java/com/demo/User.java","kind":"data-mapping"' "${REL_OUT}" \
  && echo "✓ data-mapping 边（resultMap type → 实体，改 User 字段反查 XML 的依据）" \
  || { echo "✗ data-mapping 边缺失"; cat "${REL_OUT}"; exit 1; }
_e=$(grep -c . "${REL_OUT}"); [[ "$_e" -eq 4 ]] && echo "✓ 边总数=4（mapper-binding + data-mapping + field-mapping×2，target/ 构建产物不重复出边）" \
  || { echo "✗ 边总数=${_e}（期望 4）"; cat "${REL_OUT}"; exit 1; }
rm -f "${REL_OUT}"
source "${PARADIGM}/assets/inventory-dimensions.conf"
_jc=$(eval "${DIM_SCHEDULE_JOB_CMD//\$\{PROJECT_DIR\}/\"${DEMO}\"}" | grep -c .)
[[ "$_jc" -eq 2 ]] && echo "✓ DIM_SCHEDULE_JOB 枚举 2（@Scheduled ReportJob + ItemReader BatchJobConfig）" \
  || { echo "✗ 调度任务枚举=${_jc}（期望 2）"; exit 1; }
echo "$out" | grep -q 'fw_mybatis_field_sync.*均可' && echo "✓ field_sync 同步 resultMap pass" \
  || { echo "✗ field_sync 未报 pass（java-demo resultMap 应同步）"; echo "$out" | grep field_sync; exit 1; }

# 3.5 核心门禁回归（实战暴露的 P0/P1/P2 缺陷防退化）：
#   check_reuse 多文件 diff 不再 syntax error；_sec_scan 排除 dist/；SQL 注入 ERE 的
#   TS 安全形态豁免 + sanitize 降 warn + 真阳性仍 fail。
echo "== Step 2.5: 核心门禁回归（reuse/security）=="
REG_DIR="$(mktemp -d /tmp/fwreg.XXXXXX)"
trap 'rm -rf "${FIX_DIR}" "${REG_DIR}"' EXIT
mkdir -p "${REG_DIR}/scripts" "${REG_DIR}/src" "${REG_DIR}/dist"
cp "${PARADIGM}/assets/precheck.sh" "${REG_DIR}/scripts/precheck.sh"
# 同上：开发态需同目录 gates-*.sh（reuse/security 门禁函数在拆分文件中）
for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "${PARADIGM}/assets/$_gf" ]] && cp "${PARADIGM}/assets/$_gf" "${REG_DIR}/scripts/$_gf"
done
cat > "${REG_DIR}/scripts/precheck.conf" <<EOF
PROJECT_DIR="${REG_DIR}"
WRITABLE_DIRS=("src")
SCAN_DIRS=("src")
SECURITY_TOOL="builtin"
EOF
# 3.5a P0 回归：git 仓库内两个新增文件均有导出，--reuse 不得 syntax error
( cd "${REG_DIR}" && git init -q && git config user.email t@t && git config user.name t \
  && printf 'export const a = 1\n' > src/keep.ts && git add -A && git commit -qm init \
  && printf 'export function f1() {}\nexport const c1 = 1\n' > src/new1.ts \
  && printf 'export class C2 {}\nexport function f2() {}\n' > src/new2.ts )
reuse_out="$(cd "${REG_DIR}" && bash scripts/precheck.sh --reuse 2>&1 || true)"
echo "$reuse_out" | grep -q 'syntax error' && { echo "✗ --reuse 出现 syntax error（P0 退化）"; echo "$reuse_out" | tail -10; exit 1; }
echo "✓ --reuse 无 syntax error（P0 回归通过）"
# 3.5b P1 回归：dist/ 下的注入拼接不触发 fail
printf 'const q = "SELECT * FROM users WHERE id=" + uid;\n' > "${REG_DIR}/dist/bundle.js"
sec_out="$(cd "${REG_DIR}" && bash scripts/precheck.sh --security 2>&1 || true)"
echo "$sec_out" | grep -q 'bundle.js' && { echo "✗ --security 命中 dist/ 构建产物（P1 退化）"; echo "$sec_out" | grep 'bundle.js' | head -3; exit 1; }
echo "✓ --security 不扫 dist/（P1 回归通过）"
# 3.5c P2 回归：TS 安全形态豁免 / sanitize 降 warn / 真阳性仍 fail
cat > "${REG_DIR}/src/db.ts" <<'TS'
const COLS = "id,name";
const q1 = `SELECT ${COLS} FROM users WHERE id = ?`;
const q2 = `SELECT * FROM t WHERE id IN (${placeholders})`;
const url = `/api/x/${encodeURIComponent(id)}`;
const q3 = `SELECT * FROM users WHERE name='${userName}'`;
const safe = sanitize(raw);
const q4 = `SELECT * FROM users WHERE name='${safe}'`;
TS
sec_out="$(cd "${REG_DIR}" && bash scripts/precheck.sh --security 2>&1 || true)"
echo "$sec_out" | grep -q 'q1' && { echo "✗ 列名常量插值被误报（P2 退化）"; exit 1; }
echo "$sec_out" | grep -q 'q2' && { echo "✗ IN 占位符插值被误报（P2 退化）"; exit 1; }
echo "$sec_out" | grep -q 'encodeURIComponent' && { echo "✗ URL 模板被误报（P2 退化）"; exit 1; }
echo "✓ TS 安全形态豁免（P2 回归通过）"
echo "$sec_out" | grep -q '疑似 SQL 注入.*userName' || { echo "✗ 真阳性未 fail（P2 过度豁免）"; echo "$sec_out" | tail -10; exit 1; }
echo "✓ 真阳性仍 fail（P2 无过度豁免）"
echo "$sec_out" | grep -q '疑似已经 sanitize' || { echo "✗ sanitize 变量未降 warn（P2 退化）"; exit 1; }
echo "✓ sanitize 变量降 warn（P2 回归通过）"

echo "E2E OK：四框架注入与门禁 fail 全链路验证通过"
