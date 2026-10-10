#!/usr/bin/env bash
# detect-frameworks.sh —— 扫描项目依赖文件，识别 ACTIVE_FRAMEWORKS
# 用途：替代 AI 手工探查 §D.0.5（exploration-guide.md），机器判定框架列表
#
# 扫描文件：package.json / pom.xml / go.mod / pyproject.toml / requirements.txt
# 匹配源：内置 SIGNALS 依赖信号表（framework|pattern|file_type）；
#         探查信号全集（文件/注解/配置等）见生成器仓 assets/framework-signals.md（gen-framework-index.sh 生成，不入生成物）
# 用法: detect-frameworks.sh <项目目录> [--verbose]（--verbose 命中明细走 stderr，不污染 stdout）
#
# 兼容 bash 3.2（不用 declare -A）
# 缺陷修复（2026-09-10）：目录排除 pattern 须以 ${PROJ} 项目根前缀锚定，
# 不得以 */docs/* 裸模式排除——项目在含 docs/research 的路径下（如 worktree 分支
# docs/readme-restructure）时，裸模式把整棵项目子树排除，探测结果为空。
set -u

BASE="$(cd "$(dirname "${0}")/.." && pwd)"
PROJ="."; VERBOSE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose) VERBOSE=1; shift ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) PROJ="$1"; shift ;;
  esac
done

if [[ ! -d "$PROJ" ]]; then
  echo "✗ 项目目录不存在: $PROJ" >&2
  exit 1
fi

# 80 个已知框架 ID（来自 assets/framework-gates/*.sh 文件名；与 facts.conf FACT_FRAMEWORKS=80 对齐）
KNOWN_FWS=""
for f in "$BASE"/assets/framework-gates/*.sh; do
  [[ -f "$f" ]] || continue
  KNOWN_FWS="${KNOWN_FWS} $(basename "$f" .sh)"
done

# 框架信号表（从 framework-gates 头部 # gates: 行提取依赖信号）
# 格式：framework_id|package_pattern
# 用 framework-gates 头部的 # ruleset: 行 + 文件名匹配
_tmpfile="$(mktemp /tmp/dfw.XXXXXX)"

# 简化的框架→依赖信号映射（覆盖 80 框架的主要识别模式；cargo/dockerfile 走 file_exists 自动探测，kubernetes/flutter 等仍须手配，见下方注释）
# 按依赖文件类型组织
cat > "$_tmpfile" <<'SIGNALS'
# format: framework_id|pattern|file_type
# file_type: pkgjson(package.json deps) / composer(composer.json require) / pom(pom.xml artifactId) / gomod(go.mod require) / pyreq(requirements.txt) / pyproject(pyproject.toml) / file_exists(文件存在型，signal=项目根相对路径)
spring-boot|org.springframework.boot|pom
spring-cloud|org.springframework.cloud|pom
spring-data-jpa|org.springframework.data|pom
spring-security|org.springframework.security|pom
spring-batch|org.springframework.batch|pom
mybatis|org.mybatis|pom
mybatis|mybatis|pyreq
mybatis|mybatis|pyproject
dubbo|org.apache.dubbo|pom
nacos|com.alibaba.nacos|pom
nacos|nacos-sdk-python|pyreq
rocketmq|org.apache.rocketmq|pom
seata|io.seata|pom
sentinel|com.alibaba.csp|pom
sentinel|sentinel|pyreq
sharding|org.apache.shardingsphere|pom
elasticsearch|org.elasticsearch|pom
elasticsearch|elasticsearch-java|pom
# 以下大数据/数据库规则集此前无任何探测信号，
# ACTIVE_FRAMEWORKS 恒空、门禁永不注入（"规则集在册≠链路可达"同族，靠全量审计暴露而非换栈碰运气）
hive|org.apache.hive|pom
spark|org.apache.spark|pom
tdengine|com.taosdata|pom
tdengine|taospy|pyreq
opengauss|org.opengauss|pom
elasticsearch|elasticsearch|pyreq
netty|io.netty|pom
jackson|com.fasterxml.jackson|pom
lombok|org.projectlombok|pom
mapstruct|org.mapstruct|pom
xxl-job|com.xuxueli|pom
elasticjob|org.apache.shardingsphere.elasticjob|pom
quartz|org.quartz-scheduler|pom
antd|antd|pkgjson
antd|@ant-design/icons|pkgjson
vue|vue|pkgjson
vue|pinia|pkgjson
react|react|pkgjson
angular|@angular/core|pkgjson
element|element-plus|pkgjson
element|element-ui|pkgjson
naiveui|naive-ui|pkgjson
nextjs|next|pkgjson
nuxt|nuxt|pkgjson
vite|vite|pkgjson
webpack|webpack|pkgjson
tailwind|tailwindcss|pkgjson
koa|koa|pkgjson
express|express|pkgjson
fastify|fastify|pkgjson
nestjs|@nestjs/core|pkgjson
django|Django|pyreq
django|django|pyproject
fastapi|fastapi|pyreq
fastapi|fastapi|pyproject
flask|Flask|pyreq
flask|flask|pyproject
sqlalchemy|SQLAlchemy|pyreq
sqlalchemy|sqlalchemy|pyproject
pytest|pytest|pyreq
pytest|pytest|pyproject
langchain|langchain|pyreq
langchain|langchain|pyproject
kratos|github.com/go-kratos|gomod
gin|github.com/gin-gonic|gomod
gorm|gorm.io/gorm|gomod
gorm|github.com/jinzhu/gorm|gomod
# Go 生态中间件信号缺位——
# go.mod 含 github.com/redis/go-redis/v9、gorm.io/driver/mysql 均漏报（gomod 行此前只有
# kratos/gin/gorm/terraform 四族；Java/Py/Node 的 redis/mysql 各有 pom/pyreq 行，Go 零覆盖）。
redis|github.com/redis/go-redis|gomod
redis|github.com/gomodule/redigo|gomod
mysql|gorm.io/driver/mysql|gomod
mysql|github.com/go-sql-driver/mysql|gomod
prisma|@prisma/client|pkgjson
prisma|prisma|pkgjson
typeorm|typeorm|pkgjson
validation|express-validator|pkgjson
validation|class-validator|pkgjson
jest-vitest|jest|pkgjson
jest-vitest|vitest|pkgjson
junit5-mockito|org.junit.jupiter|pom
junit5-mockito|org.mockito|pom
mysql|mysql-connector|pom
mysql|mysql|pyreq
postgresql|postgresql|pom
postgresql|psycopg2|pyreq
sqlserver|com.microsoft.sqlserver|pom
dameng|com.dameng|pom
dameng|dm-python|pyreq
redis|redis|pom
redis|redis|pyreq
redis|ioredis|pkgjson
kafka|org.apache.kafka|pom
kafka|kafka-python|pyreq
kafka|kafkajs|pkgjson
rabbitmq|com.rabbitmq|pom
rabbitmq|pika|pyreq
rabbitmq|amqplib|pkgjson
paimon|org.apache.paimon|pom
kettle|pentaho|pom
terraform|hashicorp/terraform|gomod
# 补全缺失信号
celery|celery|pyreq
celery|celery|pyproject
flink|org.apache.flink|pom
flink|flink-python|pyreq
flink|apache-flink|pyproject
# druid（双信号 groupId+artifactId 兜底）
druid|com.alibaba.druid|pom
druid|druid-spring-boot-starter|pom
# 回归发现（2026-08-27 RuoYi 回归）：SpringBoot 4 适配版 druid-spring-boot-4-starter
# （groupId 为 com.alibaba 非 com.alibaba.druid）两旧信号均不中 → 主流项目漏探。
# 宽信号覆盖 1/2/3/4 starter（依赖命中即高置信）。
druid|druid-spring-boot|pom
# opentelemetry（可观测性）——三语言生态信号
opentelemetry|@opentelemetry/api|pkgjson
opentelemetry|opentelemetry-sdk|pyproject
opentelemetry|opentelemetry|pyreq
opentelemetry|go.opentelemetry.io/otel|gomod
opentelemetry|io.opentelemetry|pom
# file_exists 型信号——
# 原实现只做依赖字符串匹配，"Cargo.toml 文件存在即激活"的 cargo 规则集激活语义无法表达，
# Rust 项目 ACTIVE_FRAMEWORKS 恒空、10 条 cargo 门禁不会自动注入（违反零手动配置）。
# signal 字段=项目根相对文件路径，存在即命中（高置信：Cargo.toml 是 Cargo 工程清单）。
cargo|Cargo.toml|file_exists
# dockerfile（IaC 容器镜像）——文件存在型，同 file_exists 通道（v2.16.1 起可自动探测）
dockerfile|Dockerfile|file_exists
# file_glob 型信号——
# framework-signals.md §D.0.5 本就记载 dotnet 三条文件信号（*.csproj 含 Sdk / Program.cs /
# using Microsoft.AspNetCore），但检测器无对应通道，ACTIVE_FRAMEWORKS 恒空、10 条 fw_dotnet_*
# 门禁不自动注入（"规则集在册≠链路可达"，同 cargo file_exists 家族）。新增 file_glob 通道：
# signal=文件名 glob（全工程 find，排除 bin/obj/node_modules/.git），命中即激活。
# csproj/fsproj 全覆盖（sln/slnx 非必需文件不作信号）。
dotnet|*.csproj|file_glob
dotnet|*.fsproj|file_glob
# 12 个规则集探测表零信号 → 门禁链路不可达，
# 其中 10 个有确定性机械信号，已补齐；doris/rag-pipeline 无干净信号保持手动（见下注）。
kubernetes|deployment.yaml|file_glob
flutter|pubspec.yaml|file_exists
harmonyos|*.ets|file_glob
c-cpp|CMakeLists.txt|file_exists
android|app/src/main/AndroidManifest.xml|file_exists
ios-swiftui|project.pbxproj|file_glob
# PHP+composer 生态此前 79 规则集零覆盖、探测零信号——
# composer.json 是 PHP 工程清单（file_exists 高置信），composer.lock/artisan 为补充信号，
# *.php 文件存在型兜底（无 composer 的 legacy PHP 项目）。composer.json 依赖字符串匹配
# （laravel/framework 等）留待子规则集按需增行，本行级只定 php 生态激活。
php|composer.json|file_exists
php|php|composer
php|composer.lock|file_exists
php|artisan|file_exists
php|*.php|file_glob
# Ruby+Bundler 生态此前 80 规则集零覆盖、探测零信号——
# Gemfile 是 Ruby 工程清单（file_exists 高置信），Rakefile 为任务入口补充信号，
# *.gemspec 存在即 gem 开发场景（file_glob 兜底）。Gemfile.lock 不作独立信号（与 Gemfile
# 同现无增量信息）；rails/sinatra 等 gem 名字符串匹配留待子规则集按需增行，本行级只定 ruby 生态激活。
ruby|Gemfile|file_exists
ruby|Rakefile|file_exists
ruby|*.gemspec|file_glob
# doris：无干净机械信号（Doris 客户端依赖形态杂：flink-connector/jdbc-catalog 均非项目级强信号）——保持手动配置 ACTIVE_FRAMEWORKS=("doris")
# rag-pipeline：RAG 模式规则集非依赖可探测（langchain 等组件有自己的 id）——设计上手动激活
# react-native（移动端跨平台 JS/TS）——package.json dependencies 含 react-native 即激活
react-native|react-native|pkgjson
# flutter（移动端跨平台 Dart）——detect-frameworks.sh 不支持 file 类型探测
# （pubspec.yaml 文件存在即激活，非依赖字符串匹配）。须手动配置 ACTIVE_FRAMEWORKS=("flutter")
# 以下 3 框架无 SIGNALS 信号行（detect 不自动探测），须手动配置 ACTIVE_FRAMEWORKS：
# android（移动端原生）--build.gradle/AndroidManifest.xml 文件存在即激活，非依赖字符串匹配。
#   须手动配置 ACTIVE_FRAMEWORKS=("android")
# opengauss（关系型数据库）--SQL/配置文件存在型，与 dockerfile 同属文件存在型探测。
#   须手动配置 ACTIVE_FRAMEWORKS=("opengauss")
# rag-pipeline（LLM 检索增强生成管线）--langchain/llamaindex 在 pyreq/pyproject 有信号但
#   作为独立 ruleset 未列入 SIGNALS。须手动配置 ACTIVE_FRAMEWORKS=("rag-pipeline")
SIGNALS

# 重构依赖收集——分桶(file_type) + pom 同时提取 groupId+artifactId +
# 递归扫描子模块 pom/package.json + pkgjson 短词单词边界。消除三个子根因:
#   ① pom 信号用 groupId 但只提取 artifactId → 27个 groupId 信号失效
#   ② file_type 字段被忽略 → 跨语言误匹配(pyreq 信号命中 Java pom)
#   ③ 不递归子模块 → Maven 多模块项目根 pom 无依赖全漏
# 兼容 bash 3.2(不用 declare -A,用分桶变量)
_pom_deps=""
_pkgjson_deps=""
_gomod_deps=""
_pyreq_deps=""
_pyproject_deps=""
_composer_deps=""

# --- package.json: 递归扫描(前端 monorepo),排除 node_modules ---
# 提取 dependencies + devDependencies 的 key(pkg 名)
# \s 在 BSD sed(macOS)不识别,改 [[:space:]];提取后 trim 前导空白(边界匹配依赖纯净 key)
while IFS= read -r _pj; do
  # 冒号后空白改为可选 + 单行 JSON 兜底——紧凑/单行 JSON（npm 生成常见）
  # 此前 `^[[:space:]]+"..."` 只匹配行首 key，单行 JSON 的 key 全在行中间被漏检。
  if command -v python3 >/dev/null 2>&1; then
    _deps=$(python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    for sec in ('dependencies','devDependencies','peerDependencies'):
        for k in (d.get(sec) or {}): print(k)
except Exception: pass
" "$_pj" 2>/dev/null || true)
  else
    # 无 python3 降级：行首 + 行内 "key":" 双模式提取
    _deps=$(grep -oE '(^|,|\{)[[:space:]]*"[^"]+":[[:space:]]?' "$_pj" 2>/dev/null | sed -E 's/.*"([^"]+)":.*/\1/' || true)
  fi
  _pkgjson_deps="${_pkgjson_deps}
${_deps}"
done < <(find "$PROJ" -name package.json -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/site-packages/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/vendor/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# --- pom.xml: 递归扫描子模块(排除 target),同时提取 groupId 和 artifactId ---
# 关键: pom 信号 pattern 多为 groupId(org.apache.dubbo),须提取 <groupId> 才能命中
while IFS= read -r _pom; do
  # 提取 artifactId
  # BSD sed(macOS)BRE 模式不支持 \?,须用 -E(ERE);否则标签不剥离,groupId 信号匹配失效
  _a=$(grep -oE '<artifactId>[^<]+</artifactId>' "$_pom" 2>/dev/null | sed -E 's/<\/?artifactId>//g' || true)
  # 提取 groupId(原 logic 只取 artifactId,27个 groupId 信号全失效)
  _g=$(grep -oE '<groupId>[^<]+</groupId>' "$_pom" 2>/dev/null | sed -E 's/<\/?groupId>//g' || true)
  _pom_deps="${_pom_deps}
${_a}
${_g}"
done < <(find "$PROJ" -name pom.xml -not -path '*/target/*' -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/site-packages/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/vendor/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# --- go.mod: 只读根(Go 项目通常单 go.mod;多模块各自 go.mod 也递归) ---
while IFS= read -r _gm; do
  _deps=$(grep -E '^[[:space:]]*[a-z]' "$_gm" 2>/dev/null | awk '{print $1}' || true)
  _gomod_deps="${_gomod_deps}
${_deps}"
done < <(find "$PROJ" -name go.mod -not -path '*/.git/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/site-packages/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/vendor/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# --- requirements.txt: 递归(Python 多环境/子项目) ---
# \s 在 BSD sed(macOS) 是字面字母 s（requests→requet），
# 改 [[:space:]]——本文件 :180 已立此规，这两处是漏改点。
while IFS= read -r _rq; do
  _deps=$(grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$_rq" 2>/dev/null | sed -E 's/[=<>~!].*//; s/\[.*//; s/[[:space:]]//g' || true)
  _pyreq_deps="${_pyreq_deps}
${_deps}"
done < <(find "$PROJ" -name requirements.txt -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/vendor/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# --- pyproject.toml: 递归 ---
# 回归发现（2026-08-27 fastapi-tpl 回归）：现代 pyproject 依赖在 [project] dependencies
# 数组双引号串中（"fastapi[standard]>=0.141"），原 grep 只认裸 key 行首（^字母），
# array 元素行首是引号 → 整桶零命中 → fastapi/sqlmodel/alembic 全漏探。
# 修复：双桶——裸 key 行 + 数组元素（含引号串）各抽一份。
while IFS= read -r _pp; do
  _deps=$(grep -E '^[[:space:]]*[a-zA-Z]' "$_pp" 2>/dev/null | sed -E 's/[=<>~!].*//; s/\[.*//; s/"//g; s/[[:space:]]//g' || true)
  # array 元素：引号串里的包名（"fastapi[standard]>=x"、"sqlmodel>=y"）剥引号+截版本
  _arr_deps=$(grep -oE '"[a-zA-Z][a-zA-Z0-9_-]*(\[[^"]*\])?[=<>~!][^"]*"' "$_pp" 2>/dev/null | sed -E 's/"//g; s/\[.*//; s/[=<>~!].*//' || true)
  _pyproject_deps="${_pyproject_deps}
${_deps}
${_arr_deps}"
done < <(find "$PROJ" -name pyproject.toml -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/vendor/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# --- composer.json require/require-dev（composer 通道——PHP 生态依赖字符串
# 匹配通道，laravel/symfony 等子规则集细分的前置；PHP 信号此前只能 file_exists/file_glob 激活）---
# awk 状态机只取 require / require-dev 段内的键（vendor/name 与 php/ext-*），跳过其余 JSON 键防误报
while IFS= read -r _cj; do
  _deps=$(LC_ALL=C awk '
    /"(require|require-dev)"[[:space:]]*:/ { inreq=1; next }
    inreq && /^([[:space:]]*}|[[:space:]]*"\}/) { inreq=0 }
    inreq {
      if (match($0, /"[^"]+"[[:space:]]*:/)) {
        k=substr($0, RSTART, RLENGTH); gsub(/"[[:space:]]*:$/, "", k); gsub(/^"/, "", k); print k
      }
    }' "$_cj" 2>/dev/null || true)
  _composer_deps="${_composer_deps}
${_deps}"
done < <(find "$PROJ" -name composer.json -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path "${PROJ}/research/*" -not -path "${PROJ}/docs/*" -not -path "${PROJ}/third_party/*" -not -path "${PROJ}/tests/fixtures/*" -not -path "${PROJ}/tests/gate-fixtures/*" 2>/dev/null || true)

# 匹配信号表,输出命中的框架 ID
# 强制使用 file_type 分桶匹配,消除跨语言误匹配
# pkgjson 短词加单词边界,消除 next→i18next 子串误报
_detected=""
_detail=""
while IFS='|' read -r fw pattern ftype; do
  [[ "$fw" =~ ^# ]] && continue
  [[ -z "$fw" || -z "$pattern" ]] && continue
  # 按 ftype 选对应桶
  case "$ftype" in
    pom)       _bucket="$_pom_deps" ;;
    pkgjson)   _bucket="$_pkgjson_deps" ;;
    gomod)     _bucket="$_gomod_deps" ;;
    pyreq)     _bucket="$_pyreq_deps" ;;
    pyproject) _bucket="$_pyproject_deps" ;;
    composer)  _bucket="$_composer_deps" ;;
    file_exists) _bucket="" ;;  # 文件存在型，不走依赖桶
    file_glob) _bucket="" ;;    # 文件名 glob 型，不走依赖桶
    *)         continue ;;
  esac
  _hit=0
  if [[ "$ftype" == "file_exists" ]]; then
    # signal=项目根相对文件路径，存在即命中（cfg 高置信：清单/入口文件）
    [[ -f "$PROJ/$pattern" ]] && _hit=1
  elif [[ "$ftype" == "file_glob" ]]; then
    # signal=文件名 glob，全工程 find 命中即激活（排除构建产物与依赖目录防噪音）
    find "$PROJ" -name "$pattern" -not -path '*/bin/*' -not -path '*/obj/*' \
      -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit 2>/dev/null \
      | grep -q . && _hit=1
  elif [[ "$ftype" == "pkgjson" || "$ftype" == "composer" ]]; then
    # pkgjson: 单词边界匹配,消除子串误报(next→i18next / vue→vuepress 等)
    # 边界: 行首 或 / 或 @ 之后,且 pattern 后跟 行尾 或 - / @ . _
    # pattern 可能含正则元字符(如 @ant-design 的 @),用 grep -E 需转义;这里 pattern
    # 多为简单标识符,对含特殊字符的用 grep -qF 兜底(无边界但精确)
    if [[ "$pattern" =~ ^@[^/]+$ ]]; then
      # scope 前缀形态（@xxx 不含 /）
      # 信号此前落入下方 grep -qxF 整行精确匹配——依赖桶里是 @nestjs/common 等完整包名，
      # 裸 @nestjs 永不命中（死信号，同族 @ant-design 共 2 条，同属"规则集在册≠链路可达"）。
      # 修：scope 前缀走 ^@xxx/ 前缀匹配（@nestjs → @nestjs/ 前缀即命中）；
      # 信号表两条死信号已改完整包名（@nestjs/core、@ant-design/icons，对齐 @angular/core 惯例），
      # 本分支是造表防御——未来再写前缀形态也能命中。
      printf '%s\n' "$_bucket" | grep -qE "^${pattern}/" && _hit=1
    elif [[ "$pattern" == *@* || "$pattern" == *.* ]]; then
      # scoped 包(@xxx/yyy)或含点的,固定字符串精确匹配(自带边界)
      printf '%s\n' "$_bucket" | grep -qxF "$pattern" && _hit=1
    else
      # 普通包名,加单词边界: (^|/|@)pattern($|-|/|@|.|_)
      printf '%s\n' "$_bucket" | grep -qE "(^|/|@)${pattern}(\$|-|/|@|\.|_)" && _hit=1
    fi
  else
    # pom/gomod/pyreq/pyproject: groupId/artifactId/模块名,固定字符串包含匹配
    # (groupId 如 org.apache.dubbo 是完整前缀,包含匹配即可;artifactId 短名同理)
    # py* 大小写不敏感（pip 包名大小写不敏感，
    # 信号表 Django/Flask/SQLAlchemy 是 PyPI 大名,requirements.txt 通行小写）；
    # pom/gomod 保持大小写敏感（Java groupId/Go module 通行小写,精确性优先）。
    case "$ftype" in
      pyreq|pyproject) printf '%s\n' "$_bucket" | grep -qiF "$pattern" && _hit=1 ;;
      *)               printf '%s\n' "$_bucket" | grep -qF "$pattern" && _hit=1 ;;
    esac
  fi
  if [[ "$_hit" -eq 1 ]]; then
    case " $_detected " in
      *" $fw "*) ;;
      *) _detected="${_detected}${_detected:+ }$fw" ;;
    esac
    if [[ "$VERBOSE" -eq 1 ]]; then
      _detail="${_detail}${fw}|${pattern}|${ftype}|依赖命中=高
"
    fi
  fi
done < "$_tmpfile"

rm -f "$_tmpfile"

if [[ "$VERBOSE" -eq 1 && -n "$_detail" ]]; then
  echo "" >&2
  echo "# --verbose 命中信号明细（framework|pattern|file_type|置信度）" >&2
  printf '%s' "$_detail" | sort -u >&2
fi

# 输出 ACTIVE_FRAMEWORKS 格式（可直接写入 precheck.arch.conf）
if [[ -n "$_detected" ]]; then
  # bash 数组格式
  echo "# 由 scripts/detect-frameworks.sh 自动探测（$(date -u +%Y-%m-%d)）"
  # 转成数组元素（带引号）
  _arr=""
  _cnt=0
  for fw in $_detected; do
    _arr="${_arr}${_arr:+ }\"$fw\""
    _cnt=$((_cnt+1))
  done
  echo "ACTIVE_FRAMEWORKS=($_arr)"
  echo "" >&2
  echo "探测到 ${_cnt} 个框架: $_detected" >&2
else
  echo "# 未探测到任何已知框架（scripts/detect-frameworks.sh $(date -u +%Y-%m-%d)）"
  echo "ACTIVE_FRAMEWORKS=()"
  echo "" >&2
  echo "未探测到已知框架（项目可能用自定义/冷门框架，需 AI 手工探查 §D.0.5）" >&2
fi
