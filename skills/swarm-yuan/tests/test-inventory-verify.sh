#!/usr/bin/env bash
# test-inventory-verify.sh — inventory-verify.sh 双态测试（WP-P2/M1）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
SH="scripts/inventory-verify.sh"
TMP="$(mktemp -d /tmp/ivtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：后端项目，controller 维度枚举计数 == 清单计数 → PASS ---
mkdir -p "$TMP/proj/src" "$TMP/skill/references"
cat > "$TMP/proj/src/a.ts" <<'EOF'
router.get('/x', h1)
router.post('/y', h2)
EOF
cat > "$TMP/proj/src/b.ts" <<'EOF'
router.get('/z', h3)
EOF
# reference-manual.md §6 接口表：表头 1 行 + 3 数据行 = 3 个端点清单
cat > "$TMP/skill/references/reference-manual.md" <<'EOF'
# reference-manual
## §6 全量接口端点表
| 端点 | 方法 | 说明 |
|------|------|------|
| /x | GET | a |
| /y | POST | b |
| /z | GET | c |
EOF
out="$(bash "$SH" "$TMP/proj" --skill-dir "$TMP/skill" --form backend --tsv 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "后端态 exit 0" || bad "exit=$rc"
echo "$out" | grep -qE '后端 controller	3	3	1\.00	PASS' && ok "controller 3/3 PASS" || bad "controller 核验异常: $out"

# --- 态 2：枚举计数 > 清单计数（漏列）→ FAIL + 比率 <0.95 ---
cat > "$TMP/proj/src/c.ts" <<'EOF'
router.get('/w', h4)
router.post('/v', h5)
EOF
out="$(bash "$SH" "$TMP/proj" --skill-dir "$TMP/skill" --form backend --tsv 2>/dev/null)"
echo "$out" | grep -qE '后端 controller	5	3	0\.60	FAIL' && ok "漏列 5/3 FAIL" || bad "漏列核验异常: $out"

# --- 态 3：维度错配 lint（声明 backend 却有 UI 组件文件）→ DIM_MISMATCH ---
mkdir -p "$TMP/proj2/src" "$TMP/skill2/references"
printf '<template><div/></template>\n' > "$TMP/proj2/src/x.vue"
printf 'router.get("/a", h)\n' > "$TMP/proj2/src/c.ts"
cat > "$TMP/skill2/references/reference-manual.md" <<'EOF'
# reference-manual
## §6 全量接口端点表
| 端点 | 方法 |
| /a | GET |
EOF
out="$(bash "$SH" "$TMP/proj2" --skill-dir "$TMP/skill2" --form backend 2>/dev/null)"
echo "$out" | grep -qF 'DIM_MISMATCH' && ok "backend+UI 文件 → DIM_MISMATCH" || bad "错配未检出: $out"

# --- 态 4：fail-open（无 reference-manual.md → exit 0 + 提示）---
mkdir -p "$TMP/proj3/src" "$TMP/skill3"
printf 'router.get("/a", h)\n' > "$TMP/proj3/src/c.ts"
out="$(bash "$SH" "$TMP/proj3" --skill-dir "$TMP/skill3" --form backend 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF 'reference-manual.md' && ok "无清单 fail-open" || bad "态4 异常 rc=$rc: $out"

# --- 态 5：确定性（同输入连跑两次 byte-identical 的 TSV 明细段）---
o1="$(bash "$SH" "$TMP/proj" --skill-dir "$TMP/skill" --form backend --tsv 2>/dev/null)"
o2="$(bash "$SH" "$TMP/proj" --skill-dir "$TMP/skill" --form backend --tsv 2>/dev/null)"
[[ "$o1" == "$o2" ]] && ok "确定性 byte-identical" || bad "两次输出不一致"

# --- 态 6：WP-Q1A --path-check：§4 表格登记路径在仓库中不存在 → HALLUCINATION ---
mkdir -p "$TMP/proj6/src" "$TMP/skill6/references" "$TMP/skill6/scripts"
printf 'router.get("/a", h)\n' > "$TMP/proj6/src/c.ts"
printf 'class OrderService:\n    pass\n' > "$TMP/proj6/src/order_svc.py"
cat > "$TMP/skill6/references/reference-manual.md" <<'EOF'
## §4 组件清单

| 业务名 | 路径 | 端点 | 说明 |
|--------|------|------|------|
| 订单服务 | `src/order_svc.py` | /api/orders | 真实存在 |
| 幽灵模块 | `src/ghost_module.py` | /api/ghost | 不存在（应被检出） |
EOF
echo "PROJECT_FORM=backend" > "$TMP/skill6/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj6" --skill-dir "$TMP/skill6" --form backend --tsv --path-check 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态6 exit 0（path-check 是 fail-open 输出，不阻断 exit）" || bad "态6 exit=$rc"
echo "$out" | grep -qF 'HALLUCINATION	清单登记路径不存在: src/ghost_module.py' && ok "态6 HALLUCINATION 行命中" || bad "态6 未检出 ghost_module.py"
# 真实存在路径不应出 HALLUCINATION
echo "$out" | grep -qF 'HALLUCINATION' && echo "$out" | grep -vF 'ghost_module.py' | grep -qF 'HALLUCINATION' && bad "态6 误伤真实路径" || ok "态6 仅幽灵路径被命中"

# --- 态 7：WP-Q1A --stability-audit：标注「禁止改」但近 90 天有 churn → STABILITY_WARN ---
mkdir -p "$TMP/proj7/src" "$TMP/skill7/references" "$TMP/skill7/scripts"
cd "$TMP/proj7" && git init -q 2>/dev/null && git add -A && git -c user.email=t@t -c user.name=t commit -qm "init" >/dev/null 2>&1 || true
printf 'def a(): pass\n' > "$TMP/proj7/src/payment.py"
cd "$TMP/proj7" && git add -A && git -c user.email=t@t -c user.name=t commit -qm "touch payment.py" 2>/dev/null
cd "$TMP/proj7" 2>/dev/null && printf 'def b(): pass\n' >> src/payment.py && git add -A && git -c user.email=t@t -c user.name=t commit -qm "touch payment.py again" 2>/dev/null
cd "$ROOT" || exit 1
cat > "$TMP/skill7/references/reference-manual.md" <<'EOF'
## §4 组件清单

| 业务名 | 路径 | 说明 |
|--------|------|------|
| 支付服务 | `src/payment.py` | 支付（禁止改） |
EOF
echo "PROJECT_FORM=backend" > "$TMP/skill7/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj7" --skill-dir "$TMP/skill7" --form backend --tsv --stability-audit 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态7 exit 0（stability-audit 是 advisory，永不 fail）" || bad "态7 exit=$rc"
echo "$out" | grep -qE 'STABILITY_WARN.*src/payment.py.*禁止改但近 90 天变更' && ok "态7 STABILITY_WARN 命中（禁止改 vs churn）" || bad "态7 未检出 STABILITY_WARN"

# --- 态 8：WP-Q1A --stability-audit：标注「稳定」但 fan-in=0 → STABILITY_WARN ---
mkdir -p "$TMP/proj8/src" "$TMP/skill8/references" "$TMP/skill8/scripts"
printf 'def x(): pass\n' > "$TMP/proj8/src/standalone.py"
cd "$TMP/proj8" && git init -q 2>/dev/null && git add -A && git -c user.email=t@t -c user.name=t commit -qm "init" >/dev/null 2>&1
cd "$ROOT" || exit 1
cat > "$TMP/skill8/references/reference-manual.md" <<'EOF'
## §4 组件清单

| 业务名 | 路径 | 说明 |
|--------|------|------|
| 单例组件 | `src/standalone.py` | 独立模块【稳定】 |
EOF
echo "PROJECT_FORM=backend" > "$TMP/skill8/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj8" --skill-dir "$TMP/skill8" --form backend --tsv --stability-audit 2>/dev/null)"; rc=$?
echo "$out" | grep -qE 'STABILITY_WARN.*src/standalone.py.*fan-in=0' && ok "态8 STABILITY_WARN 命中（稳定 vs fan-in=0）" || bad "态8 未检出 STABILITY_WARN: $out"

# --- 态 9：WP-Q1A §10/§11 等非 §4/§6/§9 段不应被抽到（避免错纳）---
mkdir -p "$TMP/proj9/src" "$TMP/skill9/references" "$TMP/skill9/scripts"
printf 'def y(): pass\n' > "$TMP/proj9/src/in_ten.py"
cd "$TMP/proj9" && git init -q 2>/dev/null && git add -A && git -c user.email=t@t -c user.name=t commit -qm "init" >/dev/null 2>&1
cd "$ROOT" || exit 1
cat > "$TMP/skill9/references/reference-manual.md" <<'EOF'
## §4 组件清单

| 业务名 | 路径 | 说明 |
|--------|------|------|
| A | `src/in_ten.py` | 应被抽 |

## §10 多余节

| 业务名 | 路径 | 说明 |
|--------|------|------|
| Z | `src/in_ten.py` | §10 应忽略 |
EOF
echo "PROJECT_FORM=backend" > "$TMP/skill9/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj9" --skill-dir "$TMP/skill9" --form backend --tsv --path-check --stability-audit 2>/dev/null)"
# §10 行不应产生 STABILITY_WARN（因为根本不应被抽出）
echo "$out" | grep -qE 'STABILITY_WARN.*src/in_ten.py.*fan-in' && bad "态9 §10 被错误纳入" || ok "态9 §10 排除正确"
# §4 行存在 + 真实路径 → 无 HALLUCINATION
echo "$out" | grep -qF 'HALLUCINATION' && bad "态9 真实路径误报 HALLUCINATION" || ok "态9 真实路径通过"

# --- 态 10：R21-A recipes.md 表格行路径 path-check（配方幻觉复用件检出 + 散文命令不误伤）---
mkdir -p "$TMP/proj10/src" "$TMP/skill10/references" "$TMP/skill10/scripts"
printf 'export function Table(): void {}\n' > "$TMP/proj10/src/Table.tsx"
cat > "$TMP/skill10/references/recipes.md" <<'EOF'
# recipes.md
## §A 业务功能清单

| 功能 | 入口路径 | 复用组件 | 接口 | 数据 | 测试 |
|------|----------|----------|------|------|------|
| 列表页 | `src/pages/List.tsx` | `src/Table.tsx` | GET /api/x | x 表 | `tests/list.spec.ts` |

## §B 任务配方

### 配方：新增页面

- **触发场景**：新增列表页
- **前置查询**：查 §4 组件清单
- **复用件清单**：

| 复用件路径 | 用途 |
|------------|------|
| `src/Phantom.vue` | 不存在（应被检出） |

- **胶水步骤**：新页面 + 路由注册
- **门禁与验证序列**：`bash scripts/precheck.sh --all` + TEST_CMD（散文命令反引号不进 path-check）
EOF
echo "PROJECT_FORM=frontend" > "$TMP/skill10/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj10" --skill-dir "$TMP/skill10" --form frontend --tsv --path-check 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态10 exit 0" || bad "态10 exit=$rc"
# 三个不存在路径（List.tsx/Phantom.vue/list.spec.ts）应命中 recipes HALLUCINATION
echo "$out" | grep -qF 'HALLUCINATION	配方引用路径不存在: src/Phantom.vue' && ok "态10 recipes 幻灵复用件命中" || bad "态10 未检出 Phantom.vue"
echo "$out" | grep -qF '配方引用路径不存在: src/pages/List.tsx' && ok "态10 recipes §A 幽灵入口命中" || bad "态10 未检出 §A List.tsx"
# 真实存在路径（Table.tsx）不误伤；散文行 precheck.sh 命令不进
echo "$out" | grep -qF '配方引用路径不存在: src/Table.tsx' && bad "态10 误伤真实路径 Table.tsx" || ok "态10 真实复用件通过"
echo "$out" | grep -qF 'precheck.sh' && bad "态10 散文命令被误纳" || ok "态10 散文命令不进 path-check"

# --- 态 11：R21-C tests 维度——测试文件枚举 ↔ §测试案例 清单计数核验 ---
mkdir -p "$TMP/proj11/src" "$TMP/proj11/tests" "$TMP/skill11/references" "$TMP/skill11/scripts"
printf 'export function A(): void {}\n' > "$TMP/proj11/src/a.ts"
printf 'import { A } from "../src/a";\ntest("a", () => { expect(A()).toBeUndefined(); });\n' > "$TMP/proj11/tests/a.test.ts"
printf 'import { A } from "../src/a";\ntest("b", () => {});\n' > "$TMP/proj11/tests/b.spec.ts"
cat > "$TMP/skill11/references/reference-manual.md" <<'EOF'
## §测试案例（check §1）

| 路径 | 说明与约束 |
|------|------------|
| `tests/a.test.ts` | A 单测 |
| `tests/b.spec.ts` | b 单测 |
EOF
echo "PROJECT_FORM=frontend" > "$TMP/skill11/scripts/precheck.conf"
out="$(bash "$SH" "$TMP/proj11" --skill-dir "$TMP/skill11" --form frontend --tsv 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态11 exit 0" || bad "态11 exit=$rc"
echo "$out" | grep -qF $'测试文件\t2\t' && echo "$out" | grep -F '测试文件' | grep -q 'PASS' \
  && ok "态11 tests 维度枚举2 清单覆盖 PASS" || bad "态11 tests 维度行异常: $(echo "$out" | grep 测试文件)"
# 零测试项目不误报：态 1 的 proj（无测试文件）跑全维度应无测试文件 FAIL 行
out1="$(bash "$SH" "$TMP/proj" --skill-dir "$TMP/skill" --form backend --tsv 2>/dev/null)"
echo "$out1" | grep -F '测试文件' | grep -qF 'FAIL' && bad "态11 零测试项目误报 FAIL" || ok "态11 零测试项目无 FAIL"

# --- 态 12（R23 回归 D5）：node_modules 第三方包不污染枚举计数 ---
mkdir -p "$TMP/proj12/src" "$TMP/proj12/node_modules/express/lib" "$TMP/skill12/references"
cat > "$TMP/proj12/src/a.js" <<'EOF'
router.get('/x', h1)
EOF
cat > "$TMP/proj12/node_modules/express/lib/express.js" <<'EOF'
router.get('/fake', h)
router.post('/fake', h)
router.get('/fake2', h)
EOF
cat > "$TMP/skill12/references/reference-manual.md" <<'EOF'
# reference-manual
## §6 接口端点
| 路径 | 说明 |
|------|------|
| /x | GET |
EOF
out12="$(bash "$SH" "$TMP/proj12" --skill-dir "$TMP/skill12" --form backend --tsv 2>/dev/null)"
echo "$out12" | grep -F '接口端点' | grep -qF $'接口端点\t1\t' \
  && ok "态12 node_modules 不污染端点枚举（枚举=1，非 4）" \
  || bad "态12 端点计数被污染: $(echo "$out12" | grep 接口端点)"

# --- 态 13：数据映射三维度（实体/mapper XML/调度任务）枚举 ↔ 清单计数核验 ---
mkdir -p "$TMP/proj13/src/main/java/com/demo/entity" "$TMP/proj13/src/main/java/com/demo/job" \
         "$TMP/proj13/src/main/resources/mapper" "$TMP/proj13/target/classes/mapper" "$TMP/skill13/references"
printf 'package com.demo.entity;\n@TableName("t_user")\npublic class User { }\n' > "$TMP/proj13/src/main/java/com/demo/entity/User.java"
printf 'package com.demo.entity;\n@TableName("t_order")\npublic class Order { }\n' > "$TMP/proj13/src/main/java/com/demo/entity/Order.java"
printf '<mapper namespace="com.demo.UserMapper"><select id="x" resultType="com.demo.entity.User">SELECT 1</select></mapper>\n' > "$TMP/proj13/src/main/resources/mapper/UserMapper.xml"
printf '<mapper namespace="com.demo.OrderMapper"><select id="y" resultType="com.demo.entity.Order">SELECT 1</select></mapper>\n' > "$TMP/proj13/src/main/resources/mapper/OrderMapper.xml"
cp "$TMP/proj13/src/main/resources/mapper/UserMapper.xml" "$TMP/proj13/target/classes/mapper/UserMapper.xml"
printf 'package com.demo.job;\nimport org.springframework.batch.core.configuration.annotation.EnableBatchProcessing;\n@EnableBatchProcessing\npublic class BatchJobConfig { }\n' > "$TMP/proj13/src/main/java/com/demo/job/BatchJobConfig.java"
printf 'package com.demo.job;\nimport org.springframework.scheduling.annotation.Scheduled;\npublic class ReportJob { @Scheduled(cron="0 0 * * * *") void run() { } }\n' > "$TMP/proj13/src/main/java/com/demo/job/ReportJob.java"
cat > "$TMP/skill13/references/reference-manual.md" <<'EOF'
# reference-manual
## §5 调用链路说明
### 调度/批处理任务表
| 构件 | 入口 | 说明 |
|------|------|------|
| 批处理导入 | `src/main/java/com/demo/job/BatchJobConfig.java` | 每日导入 |
| 小时报表 | `src/main/java/com/demo/job/ReportJob.java` | cron 小时 |
## §9 模型与映射清单
| 构件 | 路径 | 说明 |
|-------------|------|------|
| User 实体 | `src/main/java/com/demo/entity/User.java` | t_user |
| Order 实体 | `src/main/java/com/demo/entity/Order.java` | t_order |
| UserMapper SQL | `src/main/resources/mapper/UserMapper.xml` | →User |
| OrderMapper SQL | `src/main/resources/mapper/OrderMapper.xml` | →Order |
EOF
out13="$(bash "$SH" "$TMP/proj13" --skill-dir "$TMP/skill13" --form backend --tsv 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态13 exit 0" || bad "态13 exit=$rc: $out13"
echo "$out13" | grep -F '数据模型' | grep -qF $'数据模型 / ORM 实体\t2\t4\t1.00\tPASS' \
  && ok "态13 实体维度 枚举2/清单4 PASS（§9 共表 ≥ 语义）" || bad "态13 实体维度异常: $(echo "$out13" | grep 数据模型)"
echo "$out13" | grep -F 'mapper XML' | grep -qF $'MyBatis mapper XML（SQL 声明层）\t2\t4\t1.00\tPASS' \
  && ok "态13 mapper XML 维度 枚举2/清单4 PASS（target/ 排除）" || bad "态13 XML 维度异常: $(echo "$out13" | grep mapper)"
echo "$out13" | grep -F '定时 / 批处理任务' | grep -qF $'定时 / 批处理任务（job 入口）\t2\t2\t1.00\tPASS' \
  && ok "态13 调度任务维度 2/2 PASS" || bad "态13 任务维度异常: $(echo "$out13" | grep 定时)"
# 漏列场景：§9 删到只剩 1 行 → 枚举 2 清单 1 → 0.50 FAIL（数据模型维度整维缺失检出）
cat > "$TMP/skill13/references/reference-manual.md" <<'EOF'
# reference-manual
## §9 模型与映射清单
| 构件 | 路径 | 说明 |
|-------------|------|------|
| User 实体 | `src/main/java/com/demo/entity/User.java` | t_user |
EOF
out13b="$(bash "$SH" "$TMP/proj13" --skill-dir "$TMP/skill13" --form backend --tsv 2>/dev/null)"
echo "$out13b" | grep -F '数据模型' | grep -q 'FAIL' \
  && ok "态13 §9 整维缩水 → 数据模型维度 FAIL" || bad "态13 缩水未检出: $(echo "$out13b" | grep 数据模型)"
# path-check：§5 调度任务表路径不存在 → HALLUCINATION 检出（§5 自本维度起进 path-check 抽取面）
cat > "$TMP/skill13/references/reference-manual.md" <<'EOF'
# reference-manual
## §5 调用链路说明
### 调度/批处理任务表
| 构件 | 入口 | 说明 |
|------|------|------|
| 小时报表 | `src/main/java/com/demo/job/ReportJobGone.java` | cron 小时 |
EOF
out13c="$(bash "$SH" "$TMP/proj13" --skill-dir "$TMP/skill13" --form backend --path-check --tsv 2>/dev/null)"
echo "$out13c" | grep -qF 'ReportJobGone.java' \
  && ok "态13 §5 任务表幻觉路径检出（HALLUCINATION）" || bad "态13 §5 幻觉路径未检出: $(echo "$out13c" | grep -c HALLUCINATION)"

# --- 态 13d（R28-DF2 回归锚）：SQLAlchemy 声明式实体须进数据模型维度枚举 ---
# 修复前 DIM_DATA_MODEL_CMD 只认 JPA/MyBatis-Plus/Mongo/Prisma/mongoose/sequelize 形态，
# __tablename__=（SQLAlchemy DeclarativeBase 强特征）未覆盖 → fastapi+sqlalchemy 项目实体漏报 0。
mkdir -p "$TMP/proj13d/app/models" "$TMP/skill13d/references"
cat > "$TMP/proj13d/app/models/user.py" <<'EOF'
from sqlalchemy import Column, Integer, String
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
EOF
cat > "$TMP/skill13d/references/reference-manual.md" <<'EOF'
# reference-manual
## §9 模型与映射清单
| 构件 | 路径 | 说明 |
|------|------|------|
| User 实体 | `app/models/user.py` | users 表 |
EOF
out13d="$(bash "$SH" "$TMP/proj13d" --skill-dir "$TMP/skill13d" --form backend --tsv 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "态13d exit 0" || bad "态13d exit=$rc: $out13d"
echo "$out13d" | grep -F '数据模型' | grep -qF $'数据模型 / ORM 实体\t1\t1\t1.00\tPASS' \
  && ok "态13d SQLAlchemy __tablename__ 实体 枚举1/清单1 PASS" || bad "态13d 实体维度异常: $(echo "$out13d" | grep 数据模型)"


# --- 态 14：DIM_ORM_SCHEMA 维度（schema/迁移资产 ↔ §8 数据字典清单核验，横向清剿轮） ---
mkdir -p "$TMP/proj14/prisma" "$TMP/proj14/shop/migrations" "$TMP/proj14/db/migration" "$TMP/skill14/references"
printf 'model User { id Int @id }\n' > "$TMP/proj14/prisma/schema.prisma"
printf 'from django.db import migrations\nclass M(migrations.Migration):\n    dependencies = []\n' > "$TMP/proj14/shop/migrations/0001_initial.py"
printf 'CREATE TABLE t_user (id INT);\n' > "$TMP/proj14/db/migration/V1__init.sql"
printf 'CREATE TABLE t_old (id INT);\n' > "$TMP/proj14/target_copy_V9.sql" 2>/dev/null || true
mkdir -p "$TMP/proj14/node_modules/fake/migrations" && printf 'x\n' > "$TMP/proj14/node_modules/fake/migrations/evil.py"
cat > "$TMP/skill14/references/reference-manual.md" <<'EOF'
# reference-manual
## §8 数据字典及数据规范
| 构件 | 路径 | 说明 |
|------|------|------|
| prisma schema | `prisma/schema.prisma` | User 模型 |
| Django 迁移 | `shop/migrations/0001_initial.py` | 初始 |
| Flyway 迁移 | `db/migration/V1__init.sql` | V1 |
EOF
out14="$(bash "$SH" "$TMP/proj14" --skill-dir "$TMP/skill14" --form backend --tsv 2>/dev/null)"
echo "$out14" | grep -F 'ORM schema' | grep -qF 'ORM schema / 迁移资产' && echo "$out14" | grep -F 'ORM schema' | grep -q 'PASS' \
  && ok "态14 ORM schema 维度 枚举3/清单3 PASS（node_modules 与 target 排除）" || bad "态14 维度异常: $(echo "$out14" | grep 'ORM schema')"
cat > "$TMP/skill14/references/reference-manual.md" <<'EOF'
# reference-manual
## §8 数据字典及数据规范
| 构件 | 路径 | 说明 |
|------|------|------|
| prisma schema | `prisma/schema.prisma` | User 模型 |
EOF
out14b="$(bash "$SH" "$TMP/proj14" --skill-dir "$TMP/skill14" --form backend --tsv 2>/dev/null)"
echo "$out14b" | grep -F 'ORM schema' | grep -q 'FAIL' \
  && ok "态14 迁移资产漏列 → FAIL（枚举3/清单1）" || bad "态14 漏列未检出: $(echo "$out14b" | grep 'ORM schema')"

# --- 态 15（R30-D4）：Prisma schema 进数据模型枚举 + express 大写 Router 端点形态 ---
# 真实执勤实证（2026-09-16 Node 栈 shop-api）：schema.prisma 3 模型枚举 0（特征表
# 缺 Prisma，--include 无 *.prisma）；productsRouter.get( 大写 R 形态 5 端点只中
# app.get 1 个（字面小写 router. 不认 <name>Router.）。同 R28 缺 SQLAlchemy 根因模式。
mkdir -p "$TMP/proj15/prisma" "$TMP/proj15/src/routes" "$TMP/skill15/references"
cat > "$TMP/proj15/prisma/schema.prisma" <<'EOF'
model Product { id Int @id }
model Order { id Int @id }
EOF
cat > "$TMP/proj15/src/routes/products.ts" <<'EOF'
productsRouter.post('/', h1)
productsRouter.get('/', h2)
productsRouter.get('/:id', h3)
productsRouter.post('/:id/stock', h4)
EOF
cat > "$TMP/proj15/src/app.ts" <<'EOF'
app.get('/health', h5)
EOF
cat > "$TMP/skill15/references/reference-manual.md" <<'EOF'
# reference-manual
## §9 模型与映射清单
| 构件 | 路径 | 说明 |
|------|------|------|
| prisma schema | `prisma/schema.prisma` | Product/Order |
EOF
out15="$(bash "$SH" "$TMP/proj15" --skill-dir "$TMP/skill15" --form backend --tsv 2>/dev/null)"
echo "$out15" | grep -F '数据模型' | grep -qF $'数据模型 / ORM 实体\t1\t' \
  && ok "态15 Prisma schema 进数据模型枚举（枚举=1 非 0）" || bad "态15 Prisma 漏报: $(echo "$out15" | grep 数据模型)"
echo "$out15" | grep -F '接口端点' | grep -qF $'接口端点\t5\t' \
  && ok "态15 <name>Router. 大写形态端点全检出（4 router + 1 app = 5）" || bad "态15 端点漏报: $(echo "$out15" | grep 接口端点)"
# 态 15b：枚举 0 + 清单非空 → ENUM_ZERO_DIM 披露（store 维度 Prisma 项目必零命中）
out15b="$(bash "$SH" "$TMP/proj15" --skill-dir "$TMP/skill15" --form backend 2>/dev/null)"
echo "$out15b" | grep -qF 'ENUM_ZERO_DIM' \
  && ok "态15b 枚举零命中维度披露 ENUM_ZERO_DIM（防假通过静默）" || bad "态15b 无披露: $out15b"

# --- 态 16（R33-D1 回归锚）：两列表头「| 路径 | 说明与约束 |」不得计入清单行数 ---
# 修复前 A7 后态正则只认首格关键词，说明在第二格的骨架标准表头被计成数据行（每表 +1 虚高）→ 假 FAIL。
mkdir -p "$TMP/proj16/src" "$TMP/skill16/references"
printf "router.get('/x', h)\nrouter.get('/y', h)\nrouter.get('/z', h)\n" > "$TMP/proj16/src/a.ts"
cat > "$TMP/skill16/references/reference-manual.md" <<'EOF'
# reference-manual
## §6 接口清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/a.ts` | GET /x（稳定） |
| `src/a.ts` | GET /y（稳定） |
| `src/a.ts` | GET /z（稳定） |
EOF
out16="$(bash "$SH" "$TMP/proj16" --skill-dir "$TMP/skill16" --form backend --tsv 2>/dev/null)"
echo "$out16" | grep -qE '后端 controller	3	3	1\.00	PASS' \
  && ok "态16 骨架两列表头不计入清单行（3/3 PASS）" || bad "态16 表头被误计: $(echo "$out16" | grep controller)"

# --- 态 17（R33-D2/D3/D4 回归锚）：Java 形态三连——@Getter 前缀不膨胀 / @GetMapping 端点检出 / domain 包实体入数据模型 ---
mkdir -p "$TMP/proj17/src/main/java/com/x/controller" "$TMP/proj17/src/main/java/com/x/domain" "$TMP/skill17/references"
cat > "$TMP/proj17/src/main/java/com/x/controller/ProductController.java" <<'EOF'
package com.x.controller;
import lombok.Getter;
@RestController
@RequestMapping("/api/products")
public class ProductController {
    @GetMapping("/{id}")
    public Object get() { return null; }
    @GetMapping
    public Object list() { return null; }
    @PostMapping
    public Object create() { return null; }
}
@Getter
class BusinessException {}
EOF
cat > "$TMP/proj17/src/main/java/com/x/domain/Product.java" <<'EOF'
package com.x.domain;
public class Product {
    public Long id;
}
EOF
cat > "$TMP/skill17/references/reference-manual.md" <<'EOF'
# reference-manual
## §6 接口清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/main/java/com/x/controller/ProductController.java` | GET /{id}（稳定） |
| `src/main/java/com/x/controller/ProductController.java` | GET 列表（稳定） |
| `src/main/java/com/x/controller/ProductController.java` | POST 创建（稳定） |

## §9 数据勾稽

| 路径 | 说明与约束 |
|------|--------------|
| `src/main/java/com/x/domain/Product.java` | 实体 Product（稳定） |
EOF
out17="$(bash "$SH" "$TMP/proj17" --skill-dir "$TMP/skill17" --form backend --tsv 2>/dev/null)"
echo "$out17" | grep -qE '后端 controller	3	3	1\.00	PASS' \
  && ok "态17 Java controller 枚举=3（@Getter/@RequestMapping/@RestController 不膨胀）" || bad "态17 controller 膨胀: $(echo "$out17" | grep controller)"
echo "$out17" | grep -qF $'接口端点	3\t' \
  && ok "态17 @GetMapping 端点全检出（旧死正则恒 0）" || bad "态17 端点漏报: $(echo "$out17" | grep 接口端点)"
echo "$out17" | grep -qF $'数据模型 / ORM 实体	1\t' \
  && ok "态17 纯 MyBatis domain 包实体进数据模型（包约定形态）" || bad "态17 实体漏报: $(echo "$out17" | grep 数据模型)"

# --- 态 18（R33-D5 回归锚）：ORM schema 多锚 §8 §9——迁移资产登记在 §9（lite 档形态）也核验 ---
mkdir -p "$TMP/proj18/db/migration" "$TMP/skill18/references"
printf 'CREATE TABLE t (id INT);\n' > "$TMP/proj18/db/migration/V1__init.sql"
cat > "$TMP/skill18/references/reference-manual.md" <<'EOF'
# reference-manual
## §9 数据勾稽

| 路径 | 说明与约束 |
|------|--------------|
| `db/migration/V1__init.sql` | 迁移基线（稳定） |
EOF
out18="$(bash "$SH" "$TMP/proj18" --skill-dir "$TMP/skill18" --form backend --tsv 2>/dev/null)"
echo "$out18" | grep -qE 'ORM schema / 迁移资产	1	1	1\.00	PASS' \
  && ok "态18 迁移资产 §9 登记可核验（RM_REF 多锚，lite 档形态）" || bad "态18 NO_LIST: $(echo "$out18" | grep 迁移资产)"

# --- 态 19（R33-D7a 回归锚）：入口层文件豁免 fan-in=0 warn ---
mkdir -p "$TMP/proj19/src" "$TMP/skill19/references"
cat > "$TMP/proj19/src/AlertController.java" <<'EOF'
@RestController
public class AlertController {
}
EOF
cd "$TMP/proj19" && git init -q 2>/dev/null && git add -A && git -c user.email=t@t -c user.name=t commit -qm "init" >/dev/null 2>&1
cd "$ROOT" || exit 1
cat > "$TMP/skill19/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/AlertController.java` | 入口层（稳定） |
EOF
out19="$(bash "$SH" "$TMP/proj19" --skill-dir "$TMP/skill19" --form backend --tsv --stability-audit 2>/dev/null)"
echo "$out19" | grep -qF 'AlertController.java 标注稳定但 fan-in=0' \
  && bad "态19 入口层 fan-in=0 误报未豁免: $out19" || ok "态19 入口层 fan-in=0 豁免（路由引用非 import）"

# --- 态 20（R33-D7b 回归锚）：forbid 标注 churn=1（出生提交）不 warn ---
mkdir -p "$TMP/proj20/src" "$TMP/skill20/references"
printf 'x\n' > "$TMP/proj20/src/core.py"
cd "$TMP/proj20" && git init -q 2>/dev/null && git add -A && git -c user.email=t@t -c user.name=t commit -qm "init core.py" >/dev/null 2>&1
cd "$ROOT" || exit 1
cat > "$TMP/skill20/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/core.py` | 核心逻辑（禁止改） |
EOF
out20="$(bash "$SH" "$TMP/proj20" --skill-dir "$TMP/skill20" --form backend --tsv --stability-audit 2>/dev/null)"
echo "$out20" | grep -qF 'core.py 标注禁止改但近 90 天变更' \
  && bad "态20 出生提交误报 churn: $out20" || ok "态20 forbid 出生提交（churn=1）不 warn"

# --- 态 21（R56-D1 变异锁）：React colocated 测试不计入「前端 UI 组件」枚举 ---
# 2 源 .tsx + 2 *.test.tsx（DIM_TESTFILES 单列）→ UI 维必须 2/2 PASS；旧式全数 → 4/2 假 FAIL。
mkdir -p "$TMP/proj21/src" "$TMP/skill21/references"
printf 'export function App() {}\n' > "$TMP/proj21/src/App.tsx"
printf 'export function Board() {}\n' > "$TMP/proj21/src/Board.tsx"
printf 'test\n' > "$TMP/proj21/src/App.test.tsx"
printf 'test\n' > "$TMP/proj21/src/Board.test.tsx"
cat > "$TMP/skill21/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件库清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/App.tsx` | 导出 App（稳定） |
| `src/Board.tsx` | 导出 Board（稳定） |
EOF
out21="$(bash "$SH" "$TMP/proj21" --skill-dir "$TMP/skill21" --form frontend --tsv 2>/dev/null)"
echo "$out21" | grep -qE '前端 UI 组件	2	2	1\.00	PASS' \
  && ok "态21 测试文件不计 UI 组件（2/2 PASS，D1 锁）" \
  || bad "态21 UI 维计数被测试文件污染: $(echo "$out21" | grep 前端)"

# --- 态 22（R56-D2 变异锁）：库导出按文件计数（非 export 行）+ §4 §6 §9 多锚 ---
# 1 文件 6 个 ^export 行 → 枚举必须=1（文件级）；旧式行计数 → 6/1 假 FAIL。
# 追加 .tsx 导出（React 组件库形态须计入）+ *.test.ts 导出（测试面须排除）→ 枚举精确=2。
mkdir -p "$TMP/proj22/src" "$TMP/skill22/references"
cat > "$TMP/proj22/src/lib.ts" <<'EOF'
export const a = 1
export const b = 2
export const c = 3
export const d = 4
export const e = 5
export const f = 6
EOF
printf 'export function Widget() {}\n' > "$TMP/proj22/src/Widget.tsx"
printf 'export const helper = 1\n' > "$TMP/proj22/src/helper.test.ts"
cat > "$TMP/skill22/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件库清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/lib.ts` | 导出 a-f（稳定） |
| `src/Widget.tsx` | 导出 Widget（稳定） |
EOF
out22="$(bash "$SH" "$TMP/proj22" --skill-dir "$TMP/skill22" --form lib --tsv 2>/dev/null)"
echo "$out22" | grep -qE '库导出	2	2	1\.00	PASS' \
  && ok "态22 库导出文件级+tsx+排除测试（枚举精确 2，D2 锁）" \
  || bad "态22 库导出粒度/覆盖错配: $(echo "$out22" | grep 库导出)"

# --- 态 23（R56-D4 变异锁）：fan-in 排除 node_modules（否则第三方包灌水信号失真）---
# src/lonely.ts 无同名测试、项目内零引用；node_modules 下 100 个文件含 "lonely"——
# 排除链生效 → fan-in=0 warn（fan-in=0 分支）；旧式全扫 → fan-in≥100 且走"无同名测试"分支。
mkdir -p "$TMP/proj23/src" "$TMP/proj23/node_modules/dep" "$TMP/skill23/references"
printf 'export function lonely() {}\n' > "$TMP/proj23/src/lonely.ts"
i=1; while [ "$i" -le 100 ]; do printf '// lonely ref %s\n' "$i" > "$TMP/proj23/node_modules/dep/f$i.js"; i=$((i+1)); done
cat > "$TMP/skill23/references/reference-manual.md" <<'EOF'
# reference-manual
## §4 组件库清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/lonely.ts` | 导出 lonely（稳定） |
EOF
out23="$(bash "$SH" "$TMP/proj23" --skill-dir "$TMP/skill23" --form lib --tsv --stability-audit 2>/dev/null)"
echo "$out23" | grep -qE 'lonely\.ts 标注稳定但 fan-in=0' \
  && ok "态23 fan-in 排除 node_modules（=0，D4 锁）" \
  || bad "态23 fan-in 被第三方包灌水: $(echo "$out23" | grep lonely)"

[[ $FAIL -eq 0 ]] && { echo "PASS test-inventory-verify"; exit 0; } || { echo "FAIL test-inventory-verify" >&2; exit 1; }
