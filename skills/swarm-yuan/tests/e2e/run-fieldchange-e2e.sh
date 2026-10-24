#!/usr/bin/env bash
# run-fieldchange-e2e.sh — 漏改字段防线场景回归（数据映射三维度补核的端到端验证）
# 用法: bash tests/e2e/run-fieldchange-e2e.sh
#
# 剧本 = 研发反馈的真实事故链（改实体字段漏改 mapper XML / 丢批处理任务依赖分析）：
#   阶段A 生成：create 骨架 + relations-extract 边集 + 按 template-spec 新方法论填
#        reference-manual 数据映射三件套（§5 任务表/§9 模型映射表）+ 注入门禁 + inventory-verify
#   阶段B 研发工作1「改实体字段」：data-mapping 边反查召回 mapper XML → 漏改被
#        fw_mybatis_field_sync 拦截 → 同步修复 pass（漏改字段防线的完整闭环）
#   阶段C 研发工作2「新增定时任务」：DIM_SCHEDULE_JOB 枚举变化 → 清单失配 FAIL → 补行 PASS
# 断言全部锚定真实命令输出；任何一步失败即退出非零。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PARADIGM="$(cd "${BASE}/.." && pwd)"   # swarm-yuan 范式根（生成器侧）
DEMO_SRC="${PARADIGM}/tests/e2e/java-demo"
WORK="$(mktemp -d /tmp/fce2e.XXXXXX)"
trap 'rm -rf "${WORK}"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; exit 1; }

echo "▶ FIELDCHANGE-E2E: 漏改字段防线场景回归（生成 → 改字段 → 加任务）"

# ===== 阶段 A：生成目标技能（流A 模拟：骨架 → 边集 → 数据映射三件套 → 门禁 → 核验）=====
PROJ="${WORK}/proj"
SKILL="${WORK}/skill/.claude/skills/demo-java"
cp -R "${DEMO_SRC}" "${PROJ}"
rm -rf "${PROJ}/target"   # 构建产物不进分析面（真实仓库含 target，此处聚焦映射层）

bash "${PARADIGM}/scripts/generate-skill.sh" --profile standard demo-java "${PROJ}" "${WORK}/skill/.claude/skills" \
  >"${WORK}/create.log" 2>&1 \
  && ok "A1 create 骨架成功（profile=standard）" || { cat "${WORK}/create.log" >&2; bad "A1 create 失败"; }

bash "${PARADIGM}/scripts/relations-extract.sh" "${PROJ}" --skill-dir "${SKILL}" >/dev/null 2>&1
E="${SKILL}/references/relations.jsonl"
[[ -f "$E" ]] && ok "A2 relations.jsonl 边集落盘" || bad "A2 边集未生成"
_ec=$(grep -c . "$E"); [[ "$_ec" -eq 4 ]] \
  && ok "A2 边数=4（mapper-binding + data-mapping + field-mapping×2）" || bad "A2 边数=${_ec}（期望 4）: $(cat "$E")"

# AI 填充模拟：按 template-spec §5/§9 章节要求，用机械提取的真实数据写数据映射三件套。
# 先清 create 模板自带示例行（（P1 待补）标记；真实流A ④填充时 AI 替换、--verify-completeness 执法）
sed -i.bak '/（P1 待补）/d' "${SKILL}/references/reference-manual.md" && rm -f "${SKILL}/references/reference-manual.md.bak"
sed -i.bak '/（P1 待补）/d' "${SKILL}/references/recipes.md" && rm -f "${SKILL}/references/recipes.md.bak"
cat >> "${SKILL}/references/reference-manual.md" <<'EOF'

## §5 调用链路说明（数据映射补核）

### 调度/批处理任务表（§C+.2-J 产物；DIM_SCHEDULE_JOB 计数核验锚）

| 构件 | 入口 | 触发方式 | 读数据资产 | 写数据资产 | 说明 |
|------|------|---------|-----------|-----------|------|
| ReportJob | `src/main/java/com/demo/ReportJob.java` | @Scheduled cron 小时 | t_user | t_order | 报表 |
| BatchJobConfig | `src/main/java/com/demo/BatchJobConfig.java` | jobParameters | 输入文件 | — | 导入 |

## §9 模型与映射清单（数据映射补核）

| 构件 | 路径 | 说明 |
|------|------|------|
| User 实体 | `src/main/java/com/demo/User.java` | @Entity，t_user |
| UserMapper 接口 | `src/main/java/com/demo/UserMapper.java` | @Mapper |
| UserMapper SQL | `src/main/resources/mapper/UserMapper.xml` | namespace=com.demo.UserMapper；resultMap→User |
EOF
ok "A3 reference-manual 数据映射三件套填充（§5 任务表 + §9 模型映射表）"

# conf 框架面 + 门禁注入（create 骨架的 precheck.conf 是模板值，按探查结果实例化）
cat >> "${SKILL}/scripts/precheck.conf" <<EOF
ACTIVE_FRAMEWORKS=("mybatis" "lombok" "spring-batch" "sharding")
MYBATIS_MAPPER_DIRS=("${PROJ}/src/main/resources/mapper")
MYBATIS_SRC_GLOBS=("${PROJ}/src/main/java/**/*.java")
LOMBOK_SRC_GLOBS=("${PROJ}/src/main/java/**/*.java")
SPRING_BATCH_JOB_DIRS=("${PROJ}/src/main/java/**/*.java")
EOF
bash "${PARADIGM}/scripts/generate-skill.sh" --inject-frameworks "${SKILL}" >/dev/null 2>&1 \
  && ok "A4 框架门禁注入（mybatis 等 4 框架）" || bad "A4 注入失败"

out="$(cd "${PROJ}" && bash "${SKILL}/scripts/precheck.sh" --framework 2>&1 || true)"
echo "$out" | grep -q 'fw_mybatis_field_sync' \
  && ok "A5 field_sync 门禁执勤（生成态 resultMap 同步 → pass）" || bad "A5 field_sync 未运行: $(echo "$out" | grep field_sync)"
outv="$(bash "${PARADIGM}/scripts/inventory-verify.sh" "${PROJ}" --skill-dir "${SKILL}" --form backend --path-check --tsv 2>/dev/null || true)"
echo "$outv" | grep -F '定时 / 批处理任务' | grep -q 'PASS' \
  && ok "A6 DIM_SCHEDULE_JOB 清单核验 PASS（2/2）" || bad "A6 任务维度核验异常: $(echo "$outv" | grep 定时)"
echo "$outv" | grep -qF 'HALLUCINATION' && bad "A6 path-check 幻觉路径: $(echo "$outv" | grep HALLUCINATION)" || ok "A6 path-check 零幻觉"

# ===== 阶段 B：研发工作 1 —— 改实体字段（User.orders → userOrders）=====
# B1 前置查询（数据模型变更配方三查之一）：查 data-mapping 边反查"谁依赖 User"
_ds=$(grep -F '"to":"src/main/java/com/demo/User.java"' "$E" | sed -n 's/.*"from":"\([^"]*\)".*/\1/p')
printf '%s\n' "$_ds" | grep -qF 'src/main/resources/mapper/UserMapper.xml' \
  && ok "B1 影响面反查：data-mapping 边召回 UserMapper.xml（import 边查不到的字符串耦合点）" \
  || bad "B1 反查未召回 XML（got: ${_ds:-空}）——漏改防线失效"

# B2 模拟漏改：实体重命名 orders→userOrders，XML resultMap property 不动
sed -i.bak 's/private List<Order> orders;/private List<Order> userOrders;/' "${PROJ}/src/main/java/com/demo/User.java" && rm -f "${PROJ}/src/main/java/com/demo/User.java.bak"
out="$(cd "${PROJ}" && bash "${SKILL}/scripts/precheck.sh" --framework 2>&1 || true)"
echo "$out" | grep 'fw_mybatis_field_sync' | grep -qE '失同步|orders' \
  && ok "B2 漏改被 fw_mybatis_field_sync 拦截（property=orders 失同步）" \
  || bad "B2 漏改未拦截（field_sync 应 fail）: $(echo "$out" | grep field_sync)"

# B3 修复：同步 resultMap property
sed -i.bak 's/property="orders"/property="userOrders"/' "${PROJ}/src/main/resources/mapper/UserMapper.xml" && rm -f "${PROJ}/src/main/resources/mapper/UserMapper.xml.bak"
out="$(cd "${PROJ}" && bash "${SKILL}/scripts/precheck.sh" --framework 2>&1 || true)"
echo "$out" | grep 'fw_mybatis_field_sync' | grep -q '均可' \
  && ok "B3 同步修复后 field_sync pass（闭环完成）" || bad "B3 修复后仍报: $(echo "$out" | grep field_sync)"

# B4 边集健康：--verify 无失锚（RELATION_MISS 为精确违例标记；成功行含"0 失锚"字样勿用宽 grep）
bash "${PARADIGM}/scripts/relations-extract.sh" "${PROJ}" --skill-dir "${SKILL}" --verify 2>&1 | grep -q 'RELATION_MISS' \
  && bad "B4 边集失锚" || ok "B4 边集抽样核验无失锚"

# ===== 阶段 C：研发工作 2 —— 新增定时任务（CleanJob）=====
cat > "${PROJ}/src/main/java/com/demo/CleanJob.java" <<'EOF'
package com.demo;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CleanJob {
    @Scheduled(cron = "0 30 * * * *")
    public void run() { /* 清理 */ }
}
EOF
outv="$(bash "${PARADIGM}/scripts/inventory-verify.sh" "${PROJ}" --skill-dir "${SKILL}" --form backend --tsv 2>/dev/null || true)"
echo "$outv" | grep -F '定时 / 批处理任务' | grep -q 'FAIL' \
  && ok "C1 新增 job 未登清单 → DIM_SCHEDULE_JOB FAIL（枚举 3 > 清单 2×0.95）" \
  || bad "C1 清单失配未检出: $(echo "$outv" | grep 定时)"
sed -i.bak 's#| ReportJob |#| CleanJob | `src/main/java/com/demo/CleanJob.java` | @Scheduled cron 30 分 | t_user | — | 清理 |\n| ReportJob |#' \
  "${SKILL}/references/reference-manual.md" && rm -f "${SKILL}/references/reference-manual.md.bak"
outv="$(bash "${PARADIGM}/scripts/inventory-verify.sh" "${PROJ}" --skill-dir "${SKILL}" --form backend --tsv 2>/dev/null || true)"
echo "$outv" | grep -F '定时 / 批处理任务' | grep -q 'PASS' \
  && ok "C2 清单补行后 PASS（枚举 3 = 清单 3）" || bad "C2 补行仍 FAIL: $(echo "$outv" | grep 定时)"

echo "FIELDCHANGE-E2E OK：漏改字段防线场景回归通过（生成 + 改字段 + 加任务全链路）"
