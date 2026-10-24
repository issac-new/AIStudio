#!/usr/bin/env bash
# test-relations-extract.sh — relations-extract.sh 多态测试（R21-D）
# 态1: TS/JS/py 混合项目 import 边提取与解析（跨目录/扩展名补全/自环排除）
# 态2: --verify 抽样核验（全绿 + 断边检出）
# 态3: --stable-diff 消费接线（gates-warn 传播段读边集召回 1 跳下游）
# 态4: Go/Java 解析（module 剥离 / 包路径映射）
# 态5: MyBatis mapper XML 声明式边（mapper-binding/data-mapping——漏改字段防线）
# 态6: Spring bean XML / JPA orm.xml / hbm.xml 装配边（横向清剿轮）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
SH="scripts/relations-extract.sh"
TMP="$(mktemp -d /tmp/relxt.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：TS/JS/py 混合提取 ---
mkdir -p "$TMP/proj/src/components" "$TMP/proj/src/pages" "$TMP/proj/src"
printf 'export function Table(): void {}\n' > "$TMP/proj/src/components/Table.tsx"
printf "import { Table } from '../components/Table';\nexport function Page(): void { Table(); }\n" > "$TMP/proj/src/pages/List.tsx"
printf "import Table from './Table';\n" > "$TMP/proj/src/components/Wrapper.js"
printf 'def helper(): pass\n' > "$TMP/proj/src/util.py"
printf 'from .util import helper\n' > "$TMP/proj/src/app.py"
out="$(bash "$SH" "$TMP/proj" --out "$TMP/proj/relations.jsonl" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态1 exit 0" || bad "态1 exit=$rc: $out"
E="$TMP/proj/relations.jsonl"
[[ -f "$E" ]] && ok "态1 边集落盘" || bad "态1 边集未生成"
grep -qF '{"from":"src/pages/List.tsx","to":"src/components/Table.tsx","kind":"import","evidence":"import@src/pages/List.tsx:1"}' "$E" \
  && ok "态1 跨目录 TS 边（../ 解析 + .tsx 补全）" || bad "态1 List→Table 边缺失"
grep -qF '"from":"src/components/Wrapper.js","to":"src/components/Table.tsx"' "$E" \
  && ok "态1 同目录 JS→TS 边（./ 解析 + 跨扩展名）" || bad "态1 Wrapper→Table 边缺失"
grep -qF '"from":"src/app.py","to":"src/util.py"' "$E" \
  && ok "态1 py 相对导入边" || bad "态1 app→util 边缺失"
_ecn=$(grep -c . "$E"); [[ "$_ecn" -eq 3 ]] && ok "态1 边数=3（无多余/自环）" || bad "态1 边数=${_ecn}（期望 3）"

# --- 态 2：--verify 全绿 + 断边检出 ---
out="$(bash "$SH" "$TMP/proj" --out "$E" --verify 2>&1)"
echo "$out" | grep -qF '抽样核验通过' && ok "态2 全绿核验（3/3）" || bad "态2 全绿核验异常: $out"
# 断一条边（删 from 文件）→ RELATION_MISS
rm "$TMP/proj/src/components/Wrapper.js"
out="$(bash "$SH" "$TMP/proj" --out "$E" --verify 2>&1)"
echo "$out" | grep -qF 'RELATION_MISS	from 路径不存在: src/components/Wrapper.js' \
  && ok "态2 断边检出（from 失锚）" || bad "态2 断边未检出: $out"

# --- 态 3：--stable-diff 消费接线（传播段读边集召回下游） ---
# 构造最小目标技能形态：stable 层=src/components/Table.tsx（STABLE_GLOBS），下游=src/pages/List.tsx（边集 from）
printf 'export function Table(): void {}\n' > "$TMP/proj/src/components/Table.tsx"
SK="$TMP/skill"; mkdir -p "$SK/references" "$SK/scripts"
cp assets/gates-warn.sh "$SK/scripts/gates-warn.sh" 2>/dev/null || cp "$ROOT/assets/gates-warn.sh" "$SK/scripts/gates-warn.sh"
cat > "$SK/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP/proj"
STABLE_PROPAGATE=1
STABLE_PROPAGATE_HOPS=1
EOF
mkdir -p "$TMP/proj/.swarm-yuan"
# stable-diff 走 git diff 检出 stable_changed——用非 git 环境直接构造场景困难，
# 改为直接验证消费函数输入路径：手工模拟传播段读边集的行（与 gates-warn 3a' 同款管道）
_ds=$(grep -F '"to":"src/components/Table.tsx"' "$E" | sed -n 's/.*"from":"\([^"]*\)".*/\1/p')
printf '%s\n' "$_ds" | grep -qF 'src/pages/List.tsx' \
  && ok "态3 消费管道召回 1 跳下游（List.tsx 在边集 from 集）" \
  || bad "态3 消费管道未召回（got: ${_ds:-空}）"

# --- 态 4：Go module 剥离 + Java 包路径映射 ---
mkdir -p "$TMP/go/internal/svc" "$TMP/go/cmd/app"
printf 'module example.com/demo\n\ngo 1.21\n' > "$TMP/go/go.mod"
printf 'package svc\nfunc F() {}\n' > "$TMP/go/internal/svc/svc.go"
printf 'package main\nimport (\n\t"example.com/demo/internal/svc"\n)\nfunc main() { svc.F() }\n' > "$TMP/go/cmd/app/main.go"
out="$(bash "$SH" "$TMP/go" --out "$TMP/go/relations.jsonl" 2>&1)"
grep -qF '"from":"cmd/app/main.go","to":"internal/svc"' "$TMP/go/relations.jsonl" \
  && ok "态4 Go module 剥离边" || bad "态4 Go 边缺失: $(cat "$TMP/go/relations.jsonl" 2>/dev/null)"
mkdir -p "$TMP/java/src/main/java/com/example/pkg"
printf 'package com.example.pkg;\npublic class Util {}\n' > "$TMP/java/src/main/java/com/example/pkg/Util.java"
printf 'package com.example;\nimport com.example.pkg.Util;\npublic class App {}\n' > "$TMP/java/src/main/java/com/example/App.java"
out="$(bash "$SH" "$TMP/java" --out "$TMP/java/relations.jsonl" 2>&1)"
grep -qF '"from":"src/main/java/com/example/App.java","to":"src/main/java/com/example/pkg/Util.java"' "$TMP/java/relations.jsonl" \
  && ok "态4 Java 包路径映射边" || bad "态4 Java 边缺失: $(cat "$TMP/java/relations.jsonl" 2>/dev/null)"

# --- 态 4b：CommonJS require() 相对导入（R23 回归 D1：原模式不容左括号，0 边） ---
mkdir -p "$TMP/cjs/src/routes" "$TMP/cjs/src/services" "$TMP/cjs/src/models"
printf 'const express = require("express");\nconst router = express.Router();\nrouter.get("/", (q,s) => s.json({}));\nmodule.exports = router;\n' > "$TMP/cjs/src/routes/tasks.js"
printf "const { create } = require('../models/task');\nfunction add(p) { return create(p); }\nmodule.exports = { add };\n" > "$TMP/cjs/src/services/task-service.js"
printf 'function create(p) { return p; }\nmodule.exports = { create };\n' > "$TMP/cjs/src/models/task.js"
out="$(bash "$SH" "$TMP/cjs" --out "$TMP/cjs/relations.jsonl" 2>&1)"
grep -qF '"from":"src/services/task-service.js","to":"src/models/task.js"' "$TMP/cjs/relations.jsonl" \
  && ok "态4b CommonJS require('../') 相对导入边" || bad "态4b require 边缺失: $(cat "$TMP/cjs/relations.jsonl" 2>/dev/null)"
_cjsn=$(grep -c . "$TMP/cjs/relations.jsonl"); [[ "$_cjsn" -eq 1 ]] && ok "态4b 边数=1（裸包 require 不计边）" || bad "态4b 边数=${_cjsn}（期望 1，express 裸包不应成边）"

# --- 态 4c：Python 绝对导入（R28-DF3：原实现只认相对导入，绝对导入主流项目 0 边） ---
mkdir -p "$TMP/absimp/app/services" "$TMP/absimp/app/models"
printf 'from app.models.user import User\n' > "$TMP/absimp/app/models/__init__.py"
printf 'from sqlalchemy import Column\n' > "$TMP/absimp/app/models/user.py"
printf 'from app.models import User\nfrom app.services import task_service\nimport app.database\n\ndef run():\n    return task_service.add({})\n' > "$TMP/absimp/app/main.py"
printf 'def add(p): return p\n' > "$TMP/absimp/app/services/task_service.py"
printf 'SessionLocal = object\n' > "$TMP/absimp/app/database.py"
out="$(bash "$SH" "$TMP/absimp" --out "$TMP/absimp/relations.jsonl" 2>&1)"
grep -qF '"from":"app/main.py","to":"app/services/task_service.py"' "$TMP/absimp/relations.jsonl" \
  && ok "态4c from app.services import X → 子模块绝对导入边" || bad "态4c 子模块边缺失: $(cat "$TMP/absimp/relations.jsonl" 2>/dev/null)"
grep -qF '"from":"app/main.py","to":"app/models/__init__.py"' "$TMP/absimp/relations.jsonl" \
  && ok "态4c from app.models import User → 包 __init__ 边" || bad "态4c 包边缺失: $(cat "$TMP/absimp/relations.jsonl" 2>/dev/null)"
grep -qF '"from":"app/main.py","to":"app/database.py"' "$TMP/absimp/relations.jsonl" \
  && ok "态4c import app.database 纯 import 边" || bad "态4c import 边缺失: $(cat "$TMP/absimp/relations.jsonl" 2>/dev/null)"
grep -qF 'sqlalchemy' "$TMP/absimp/relations.jsonl" \
  && bad "态4c 第三方包 sqlalchemy 误报成边" || ok "态4c 第三方包不成边（项目外自然 miss）"

# --- 态 5：MyBatis mapper XML 声明式边（mapper-binding / data-mapping） ---
mkdir -p "$TMP/mb/src/main/resources/mapper" "$TMP/mb/src/main/java/com/demo" "$TMP/mb/src/main/java/com/other" "$TMP/mb/src/main/java/com/demo2"
printf 'package com.demo;\npublic interface UserMapper {}\n' > "$TMP/mb/src/main/java/com/demo/UserMapper.java"
printf 'package com.demo;\npublic class User { private String userName; }\n' > "$TMP/mb/src/main/java/com/demo/User.java"
printf 'package com.other;\npublic class Order {}\n' > "$TMP/mb/src/main/java/com/other/Order.java"
printf 'package com.demo2;\npublic class Order {}\n' > "$TMP/mb/src/main/java/com/demo2/Order.java"
cat > "$TMP/mb/src/main/resources/mapper/UserMapper.xml" <<'EOF'
<?xml version="1.0"?>
<mapper namespace="com.demo.UserMapper">
  <resultMap id="BaseResultMap" type="com.demo.User">
    <id column="id" property="id"/>
  </resultMap>
  <select id="countAll" resultType="long">SELECT COUNT(*) FROM t_user</select>
  <insert id="insert" parameterType="com.demo.User">INSERT INTO t_user (user_name) VALUES (#{userName})</insert>
</mapper>
EOF
cat > "$TMP/mb/src/main/resources/mapper/OrderMapper.xml" <<'EOF'
<?xml version="1.0"?>
<mapper namespace="com.demo.OrderMapper">
  <select id="selectOrders" resultType="Order">SELECT * FROM t_order</select>
</mapper>
EOF
cat > "$TMP/mb/src/main/resources/mybatis-config.xml" <<'EOF'
<configuration><typeAliases>
  <typeAlias alias="Order" type="com.other.Order"/>
</typeAliases></configuration>
EOF
out="$(bash "$SH" "$TMP/mb" --out "$TMP/mb/relations.jsonl" 2>&1)"
E="$TMP/mb/relations.jsonl"
grep -qF '{"from":"src/main/resources/mapper/UserMapper.xml","to":"src/main/java/com/demo/UserMapper.java","kind":"mapper-binding"' "$E" \
  && ok "态5 namespace→Mapper 接口（mapper-binding 边）" || bad "态5 mapper-binding 边缺失"
grep -qF '"from":"src/main/resources/mapper/UserMapper.xml","to":"src/main/java/com/demo/User.java","kind":"data-mapping","evidence":"resultMap@' "$E" \
  && ok "态5 resultMap type→实体（data-mapping 边）" || bad "态5 resultMap 边缺失"
grep -qF '"evidence":"parameterType@' "$E" \
  && ok "态5 parameterType→实体（data-mapping 边）" || bad "态5 parameterType 边缺失"
grep -qF '"to":"src/main/java/com/other/Order.java"' "$E" \
  && ok "态5 typeAlias 短名经别名映射解析（Order→com.other.Order）" || bad "态5 别名映射解析失败"
grep -q 'resultType="long"' "$E" && bad "态5 基础类型误成边" || ok "态5 resultType=long 基础类型跳过"
# 撤销别名映射 → 两个同名 Order.java → 短名多命中不猜（0 条短名边）
rm "$TMP/mb/src/main/resources/mybatis-config.xml"
bash "$SH" "$TMP/mb" --out "$TMP/mb/relations2.jsonl" >/dev/null 2>&1
_om=$(grep -c '"to":"src/main/java/.*Order\.java"' "$TMP/mb/relations2.jsonl"); [[ "$_om" -eq 0 ]] \
  && ok "态5 短名多命中不出边（机械不猜）" || bad "态5 短名多命中误出 ${_om} 条边"
# target/ 下的复制 XML 不重复出边
mkdir -p "$TMP/mb/target/classes/mapper"
cp "$TMP/mb/src/main/resources/mapper/UserMapper.xml" "$TMP/mb/target/classes/mapper/UserMapper.xml"
bash "$SH" "$TMP/mb" --out "$TMP/mb/relations3.jsonl" >/dev/null 2>&1
_tgn=$(grep -c '"from":"target/' "$TMP/mb/relations3.jsonl"); [[ "$_tgn" -eq 0 ]] \
  && ok "态5 target/ 构建产物排除" || bad "态5 target/ 下 XML 误出 ${_tgn} 条边"


# --- 态 6：Spring bean XML / JPA orm.xml / hbm.xml 声明式装配边（横向清剿轮） ---
mkdir -p "$TMP/sx/src/main/resources" "$TMP/sx/src/main/java/com/demo" "$TMP/sx/src/main/resources/META-INF"
printf 'package com.demo;\npublic class OrderService {}\n' > "$TMP/sx/src/main/java/com/demo/OrderService.java"
printf 'package com.demo;\npublic class User {}\n' > "$TMP/sx/src/main/java/com/demo/User.java"
cat > "$TMP/sx/src/main/resources/applicationContext.xml" <<'XEOF'
<?xml version="1.0"?>
<beans xmlns="http://www.springframework.org/schema/beans">
  <bean id="svc" class="com.demo.OrderService"/>
</beans>
XEOF
cat > "$TMP/sx/src/main/resources/META-INF/orm.xml" <<'XEOF'
<?xml version="1.0"?>
<entity-mappings xmlns="http://xmlns.jcp.org/xml/ns/persistence/orm">
  <entity class="com.demo.User" name="User"/>
</entity-mappings>
XEOF
out="$(bash "$SH" "$TMP/sx" --out "$TMP/sx/relations.jsonl" 2>&1)"
E="$TMP/sx/relations.jsonl"
grep -qF '"from":"src/main/resources/applicationContext.xml","to":"src/main/java/com/demo/OrderService.java","kind":"bean-wiring"' "$E" \
  && ok "态6 Spring bean class→Java（bean-wiring 边）" || bad "态6 bean-wiring 边缺失: $(cat "$E" 2>/dev/null)"
grep -qF '"from":"src/main/resources/META-INF/orm.xml","to":"src/main/java/com/demo/User.java","kind":"data-mapping"' "$E" \
  && ok "态6 JPA orm.xml entity class→实体（data-mapping 边）" || bad "态6 orm.xml 边缺失: $(cat "$E" 2>/dev/null)"
_e6=$(grep -c . "$E"); [[ "$_e6" -eq 2 ]] && ok "态6 边数=2" || bad "态6 边数=${_e6}（期望 2）"

# --- 态 4d（R30-D5）：单层 ../ 相对导入的 to 键归一（tests/ 目录主流形态）---
# 真实执勤实证（2026-09-16 Node 栈 shop-api）：tests/x.test.ts `from '../src/y'` 的边
# to 落成 "./src/y"——_norm_rel 单层 ../ 时 dir=dirname(base)="." 直接拼进输出，
# 与 src/ 下同目标边的干净路径键失配（--stable-diff 反查/查边集按 to 对账断链）。
mkdir -p "$TMP/d5/tests" "$TMP/d5/src/services"
printf 'import { S } from "../src/services/svc";\n' > "$TMP/d5/tests/a.test.ts"
printf 'import { S } from "../src/services/svc";\n' > "$TMP/d5/tests/b.test.ts"
printf 'export const S = 1;\n' > "$TMP/d5/src/services/svc.ts"
out="$(bash "$SH" "$TMP/d5" --out "$TMP/d5/relations.jsonl" 2>&1)"
E="$TMP/d5/relations.jsonl"
grep -qF '"to":"src/services/svc.ts"' "$E" \
  && ok "态4d 单层 ../ 边 to 键归一为干净相对路径" || bad "态4d to 键仍带 ./ 前缀: $(cat "$E" 2>/dev/null)"
_cnt=$(grep -cF '"to":"src/services/svc.ts"' "$E"); [[ "$_cnt" -eq 2 ]] \
  && ok "态4d 两条 tests→src 边都归一（计数=${_cnt}）" || bad "态4d 边数异常: $(cat "$E" 2>/dev/null)"
grep -qF '"to":"./src/' "$E" && bad "态4d 残留 ./ 前缀边: $(cat "$E")" || ok "态4d 无任何 ./ 前缀残留"

[[ $FAIL -eq 0 ]] && { echo "PASS test-relations-extract"; exit 0; } || { echo "FAIL test-relations-extract" >&2; exit 1; }
