#!/usr/bin/env bash
# test-detect-frameworks.sh — detect-frameworks.sh --verbose 双态测试（WP-P1）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/detect-frameworks.sh"
TMP="$(mktemp -d /tmp/dfwtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 态 1：含 react/express 依赖的 package.json → 命中 + verbose 明细
mkdir -p "$TMP/p1"
cat > "$TMP/p1/package.json" <<'EOF'
{
  "dependencies": {
    "react": "^19.0.0",
    "express": "^4.21.0"
  }
}
EOF
out=$(bash "$SH" "$TMP/p1" --verbose 2>"$TMP/err")
echo "$out" | grep -qF '"react"' && echo "$out" | grep -qF '"express"' \
  && ok "ACTIVE_FRAMEWORKS 命中" || bad "命中异常: $out"
grep -qF 'react|react|pkgjson' "$TMP/err" && ok "verbose 明细 react" || bad "明细缺失"
grep -qF 'express|express|pkgjson' "$TMP/err" && ok "verbose 明细 express" || bad "明细缺失"
echo "$out" | grep -qF 'framework|pattern' && bad "stdout 被明细污染" || ok "stdout 未污染"

# 态 2：空目录 → ACTIVE_FRAMEWORKS=() exit 0
mkdir -p "$TMP/p2"
out=$(bash "$SH" "$TMP/p2" 2>/dev/null); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF 'ACTIVE_FRAMEWORKS=()' \
  && ok "空项目双态" || bad "空项目异常: rc=$rc out=$out"

# 态 3（R25-PR3 回归锚）：.venv 内第三方包自带的 package.json 不得计入项目框架
# 实仓实证（flask 仓库）：.venv/lib/.../pyright/dist/package.json 含 webpack 依赖 →
# 探出 webpack（项目实际是纯 Python 项目）。修复：find 排除 .venv/venv/site-packages。
mkdir -p "$TMP/p3/.venv/lib/python3.13/site-packages/sometool/dist"
cat > "$TMP/p3/.venv/lib/python3.13/site-packages/sometool/dist/package.json" <<'EOF'
{ "name": "@sometool/dist", "dependencies": { "webpack": "^5.0.0" } }
EOF
out=$(bash "$SH" "$TMP/p3" 2>/dev/null)
echo "$out" | grep -qF '"webpack"' && bad "态3 venv 污染：第三方包依赖被探为项目框架" || ok "态3 venv 内 package.json 被排除"
# 同仓项目自身的 package.json 仍正常探测
mkdir -p "$TMP/p3/app"
cat > "$TMP/p3/app/package.json" <<'EOF'
{ "dependencies": { "koa": "^2.15.0" } }
EOF
out=$(bash "$SH" "$TMP/p3" 2>/dev/null)
echo "$out" | grep -qF '"koa"' && ok "态3 项目自身 package.json 仍命中" || bad "态3 自身探测被误伤: $out"

# 态 5（R48-G1 跨栈补齐锚）：12 规则集零信号 → 10 个补机械信号的正负双态
# 正态：文件型（flutter/harmonyos/c-cpp/android/ios-swiftui/kubernetes）+ pom/pyreq 型（hive/spark/tdengine/opengauss）
mkdir -p "$TMP/p5/app/src/main" "$TMP/p5/hm" "$TMP/p5/ios/xx.xcodeproj" "$TMP/p5/deploy"
touch "$TMP/p5/pubspec.yaml" "$TMP/p5/CMakeLists.txt" "$TMP/p5/app/src/main/AndroidManifest.xml" \
      "$TMP/p5/hm/Page.ets" "$TMP/p5/ios/xx.xcodeproj/project.pbxproj" "$TMP/p5/deploy/deployment.yaml"
cat > "$TMP/p5/pom.xml" <<'POMEOF'
<project><dependencies>
<dependency><groupId>org.apache.hive</groupId><artifactId>hive-exec</artifactId></dependency>
<dependency><groupId>com.taosdata.jdbc</groupId><artifactId>taos-jdbcdriver</artifactId></dependency>
<dependency><groupId>org.opengauss</groupId><artifactId>opengauss-jdbc</artifactId></dependency>
<dependency><groupId>org.apache.spark</groupId><artifactId>spark-core_2.12</artifactId></dependency>
</dependencies></project>
POMEOF
out=$(bash "$SH" "$TMP/p5" 2>/dev/null)
for fw in kubernetes flutter harmonyos c-cpp android ios-swiftui hive spark tdengine opengauss; do
  echo "$out" | grep -qF "\"$fw\"" && ok "态5 命中 $fw" || bad "态5 未命中 $fw: $out"
done
# 负态：空目录不误报（file_glob 全工程扫描的噪音风险）
mkdir -p "$TMP/p5n"
out=$(bash "$SH" "$TMP/p5n" 2>/dev/null)
echo "$out" | grep -qF 'ACTIVE_FRAMEWORKS=()' && ok "态5 负态空项目零命中" || bad "态5 负态误报: $out"

# 态 6（trade-forge 回归锚）：pomga 成对精确匹配——裸 com.alibaba:druid（ShardingSphere 底层池/手工 Bean 形态）命中；
# 跨厂商同名 org.apache.druid:druid-server（Apache Druid 分析库）不得被探为 druid 连接池。
mkdir -p "$TMP/p6"
cat > "$TMP/p6/pom.xml" <<'POMEOF'
<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent>
  <groupId>com.example</groupId><artifactId>druid-user-app</artifactId>
  <dependencies>
    <dependency><groupId>com.alibaba</groupId><artifactId>druid</artifactId><version>1.2.20</version></dependency>
  </dependencies>
</project>
POMEOF
out=$(bash "$SH" "$TMP/p6" 2>/dev/null)
echo "$out" | grep -qF '"druid"' && ok "态6 裸 com.alibaba:druid 经 pomga 命中" || bad "态6 裸 druid 坐标漏探: $out"
mkdir -p "$TMP/p6n"
cat > "$TMP/p6n/pom.xml" <<'POMEOF'
<project><dependencies>
<dependency><groupId>org.apache.druid</groupId><artifactId>druid-server</artifactId></dependency>
<dependency><groupId>org.apache.druid</groupId><artifactId>druid-processing</artifactId></dependency>
</dependencies></project>
POMEOF
out=$(bash "$SH" "$TMP/p6n" 2>/dev/null)
echo "$out" | grep -qF '"druid"' && bad "态6 负态：Apache Druid 分析库被误探为 Alibaba Druid 连接池" || ok "态6 负态 org.apache.druid 不误报"



[[ $FAIL -eq 0 ]] && { echo "PASS test-detect-frameworks"; exit 0; } || { echo "FAIL test-detect-frameworks" >&2; exit 1; }