#!/usr/bin/env bash
# test-r124-jvm-regression.sh — R124 trade-forge 全栈回归轮缺陷锁
# 背景：trade-forge（Spring Boot 3 + ShardingSphere 5.5.3 分库分表 + Druid + MyBatis +
# Spring Batch + Dubbo + RocketMQ + Vue3/Element Plus）真实项目首跑门禁与样例构建暴露
# 生成器缺陷，此测试防复发（编号对齐轮档 docs/research/R124-jvm-fullstack-regression.md §二）：
#   D2  detect-frameworks 漏探裸坐标 com.alibaba:druid（ShardingSphere 底层池/手工 Bean 形态）
#       ——修复=pomga 桶（<dependency> 的 groupId:artifactId 成对精确匹配），裸名子串会误伤
#       org.apache.druid:druid-*（Apache Druid 分析库）。锁=正负双态（态2）。
#   D3  fw_dubbo_version_required 把 Javadoc 注释里的 @DubboService 字样当注解——
#       修复=命中行剥注释（`*`/`/*`/`//` 开头行不算注解行）。锁=dubbo compliant 夹具
#       （Javadoc 已含 @DubboService 字样）零 warn（态1a）。
#   D4  fw_dubbo_timeout_idempotent 显式 retries=0 仍报"未显式声明"——修复=三态判定
#       （>0 warn / =0 pass / 未声明 warn）。锁=同上夹具（注解带 retries = 0）（态1b）。
#   D5  fw_dubbo_registry 不认 YAML 嵌套 registry:/address: N/A——修复=同文件
#       registry: 块 + 任意非空 address: 视为已配置。锁=同上夹具（application.yml 嵌套态）（态1c）。
#   D6  check_method_size 扫进 node_modules/target/dist（第三方依赖 95 条噪音）——修复=
#       find 排除依赖目录。锁=合成项目：node_modules 长函数不报、src 长函数照报（态6）。
#   D7  fw_element_on_demand_import 把具名 import { ElMessage } 当全量 import——修复=
#       只匹配默认/命名空间/副作用 import 形态。锁=element compliant（具名 import）零 warn +
#       violating（默认 import）仍报（态3a）。
#   D8  fw_element_imperative_api 多行 grep 结果只给首行加文件名前缀，续行被当文件名必报
#       "未 import"——修复=逐行前缀。锁=element compliant（import { ElMessage } + 使用）零 warn（态3b）。
#   D9  fw_jest_mock_hoisted 对不引用模块顶层变量的自包含工厂也报警——修复=只在工厂体
#       引用模块顶层 const/let/var 时报警。锁=jest compliant（vi.hoisted / 自包含）零 warn +
#       violating（引用顶层 mockReturn）仍报（态4）。
#   D10 fw_sharding_key_in_dml/order_merge 列名在 SET/ORDER BY 出现即算"带分片键"（ORDER BY
#       order_id 掩盖缺键）——修复=谓词位置判据（WHERE 段内 key =/IN/BETWEEN/范围比较）。
#       锁=合成 mapper 三态：ORDER BY 掩盖形态报 / WHERE 谓词形态不报 / SET 子句键不算（态5）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

B="$(pwd)"
REPO_ROOT="$(cd "$B/.." && pwd)"

# 在临时目录组装「注入式 precheck」并对其 conf 指向的 cwd 执行 --framework / --method-size。
# 用法：fw_gate_run <framework-id> <workdir>  → stdout=完整门禁输出
fw_gate_run() {
  local fw="$1" workdir="$2" t
  t="$(mktemp -d /tmp/r124fw.XXXXXX)"
  mkdir -p "$t/scripts"
  cp "$B/assets/precheck.sh" "$t/scripts/precheck.sh"
  local g
  for g in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    [[ -f "$B/assets/$g" ]] && cp "$B/assets/$g" "$t/scripts/$g"
  done
  sed "s|__REPO_ROOT__|$REPO_ROOT|g" "$workdir/precheck.conf" > "$t/scripts/precheck.conf"
  awk -v frag="$B/assets/framework-gates/$fw.sh" '
    /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
    /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
    !skip { print }
  ' "$t/scripts/precheck.sh" > "$t/scripts/p2.sh" && mv "$t/scripts/p2.sh" "$t/scripts/precheck.sh"
  ( cd "$workdir" && bash "$t/scripts/precheck.sh" --framework ) 2>&1
  rm -rf "$t"
}

# ---------- 态1（D3/D4/D5）dubbo compliant 夹具：三只 warn 门零报警 ----------
dubbo_out="$(fw_gate_run dubbo tests/fixtures/dubbo/compliant)"
if printf '%s\n' "$dubbo_out" | grep -qE '⚠ fw_dubbo_version_required'; then
  bad "态1a 注释提及 @DubboService 被当注解（D3 回归）"
else
  ok "态1a 注释提及 @DubboService 不再误报（D3）"
fi
if printf '%s\n' "$dubbo_out" | grep -qE '⚠ fw_dubbo_timeout_idempotent'; then
  bad "态1b 显式 retries=0 仍报未声明（D4 回归）"
else
  printf '%s\n' "$dubbo_out" | grep -q '已显式 retries=0' \
    && ok "态1b 显式 retries=0 报 pass（D4）" || bad "态1b retries=0 pass 行缺失（判据漂移）"
fi
if printf '%s\n' "$dubbo_out" | grep -qE '⚠ fw_dubbo_registry'; then
  bad "态1c YAML 嵌套 registry.address 未识别（D5 回归）"
else
  ok "态1c YAML 嵌套 registry: address: N/A 视为已配置（D5）"
fi
# 夹具形态在位（防静默删掉致锁失效）
grep -q 'retries = 0' tests/fixtures/dubbo/compliant/OrderServiceImpl.java \
  && grep -q '@DubboService' tests/fixtures/dubbo/compliant/OrderServiceImpl.java \
  && grep -qE '^  registry:' tests/fixtures/dubbo/compliant/application.yml \
  && ok "态1d dubbo compliant 夹具三锁形态在位" \
  || bad "态1d dubbo compliant 夹具锁形态缺失"

# ---------- 态2（D2）detect-frameworks pomga 双态 ----------
t2="$(mktemp -d /tmp/r124pomga.XXXXXX)"
mkdir -p "$t2/p" "$t2/n"
cat > "$t2/p/pom.xml" <<'POM'
<project><dependencies>
<dependency><groupId>com.alibaba</groupId><artifactId>druid</artifactId></dependency>
</dependencies></project>
POM
cat > "$t2/n/pom.xml" <<'POM'
<project><dependencies>
<dependency><groupId>org.apache.druid</groupId><artifactId>druid-server</artifactId></dependency>
</dependencies></project>
POM
outp="$(bash scripts/detect-frameworks.sh "$t2/p" 2>/dev/null)"
outn="$(bash scripts/detect-frameworks.sh "$t2/n" 2>/dev/null)"
printf '%s' "$outp" | grep -q '"druid"' && ok "态2a 裸 com.alibaba:druid 经 pomga 命中（D2）" || bad "态2a 裸 druid 坐标漏探（D2 回归）"
printf '%s' "$outn" | grep -q '"druid"' && bad "态2b org.apache.druid 误报为 Alibaba Druid（D2 精度回归）" || ok "态2b org.apache.druid 不误报（D2）"
rm -rf "$t2"

# ---------- 态3（D7/D8）element 夹具：具名 import 合规 + 默认 import 违规 ----------
el_ok="$(fw_gate_run element tests/fixtures/element/compliant)"
el_bad="$(fw_gate_run element tests/fixtures/element/violating)"
if printf '%s\n' "$el_ok" | grep -qE '⚠ fw_element_on_demand_import'; then
  bad "态3a 具名 import { ElMessage } 被当全量 import（D7 回归）"
else
  ok "态3a 具名 import 不再报全量（D7）"
fi
printf '%s\n' "$el_bad" | grep -qE '⚠ fw_element_on_demand_import' \
  && ok "态3b 默认 import element-plus 仍报（D7 真阳性保持）" || bad "态3b violating 默认 import 漏报（D7 过度收紧）"
if printf '%s\n' "$el_ok" | grep -qE '⚠ fw_element_imperative_api'; then
  bad "态3c 已 import ElMessage 的使用行报未 import（D8 回归）"
else
  ok "态3c 命中行文件名前缀完整，已 import 不误报（D8）"
fi

# ---------- 态4（D9）jest-vitest 夹具：自包含工厂合规 + 顶层变量引用违规 ----------
jt_ok="$(fw_gate_run jest-vitest tests/fixtures/jest-vitest/compliant)"
jt_bad="$(fw_gate_run jest-vitest tests/fixtures/jest-vitest/violating)"
if printf '%s\n' "$jt_ok" | grep -qE '⚠ fw_jest_mock_hoisted'; then
  bad "态4a 自包含/vi.hoisted 工厂报 mock_hoisted（D9 回归）"
else
  ok "态4a 自包含工厂零误报（D9）"
fi
printf '%s\n' "$jt_bad" | grep -qE '⚠ fw_jest_mock_hoisted' \
  && ok "态4b 引用模块顶层变量的工厂仍报（D9 真阳性保持）" || bad "态4b violating 顶层变量引用漏报（D9 过度收紧）"

# ---------- 态5（D10）sharding 谓词位置判据三态（合成 mapper） ----------
t5="$(mktemp -d /tmp/r124shard.XXXXXX)"
mkdir -p "$t5/mapper"
cat > "$t5/mapper/MaskMapper.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="x">
  <!-- 形态 a：ORDER BY 列名掩盖缺键（修复前 pass，修复后须 warn） -->
  <select id="maskedByOrderBy" resultType="map">
    SELECT order_id, amount FROM t_trade_order
    WHERE status = #{status}
    ORDER BY created_at DESC, order_id DESC
    LIMIT #{limit} OFFSET #{offset}
  </select>
  <!-- 形态 b：WHERE 段分片键谓词（合规，不报） -->
  <select id="keyedInWhere" resultType="map">
    SELECT order_id, amount FROM t_trade_order
    WHERE order_id = #{orderId}
    ORDER BY created_at DESC
    LIMIT #{limit}
  </select>
  <!-- 形态 c：UPDATE 分片键只在 SET 子句（修复前 pass，修复后须 fail） -->
  <update id="keyOnlyInSet">
    UPDATE t_trade_order SET order_id = #{newId} WHERE status = #{status}
  </update>
  <!-- 形态 d：UPDATE 带分片键谓词（合规，不报） -->
  <update id="keyedInWhereUpdate">
    UPDATE t_trade_order SET status = #{status} WHERE order_id = #{orderId}
  </update>
</mapper>
XML
cat > "$t5/precheck.conf" <<CONF
PROJECT_DIR="$t5"
ACTIVE_FRAMEWORKS=("sharding")
MYBATIS_MAPPER_DIRS=("$t5/mapper")
SHARDED_TABLES=("t_trade_order")
SHARDING_KEY_COLUMNS=("t_trade_order=order_id")
SHARDING_BROADCAST_TABLES=("t_dict")
CONF
sh_out="$(fw_gate_run sharding "$t5")"
printf '%s\n' "$sh_out" | grep -q 'maskedByOrderBy' \
  && ok "态5a ORDER BY 列名掩盖缺键被报（D10）" || bad "态5a ORDER BY 掩盖形态漏报（D10 回归）"
printf '%s\n' "$sh_out" | grep -q 'keyedInWhere ' \
  && bad "态5b WHERE 段分片键谓词被误报（D10 过度收紧）" || ok "态5b WHERE 谓词形态不报（D10）"
printf '%s\n' "$sh_out" | grep -q 'keyOnlyInSet' \
  && ok "态5c UPDATE 分片键只在 SET 被报（D10）" || bad "态5c SET 子句键掩盖漏报（D10 回归）"
printf '%s\n' "$sh_out" | grep -q 'keyedInWhereUpdate' \
  && bad "态5d 带分片键谓词的 UPDATE 被误报（D10 过度收紧）" || ok "态5d 谓词 UPDATE 不报（D10）"
rm -rf "$t5"

# ---------- 态6（D6）check_method_size 排除依赖目录（合成项目） ----------
t6="$(mktemp -d /tmp/r124msz.XXXXXX)"
mkdir -p "$t6/frontend/src" "$t6/frontend/node_modules/third"
long_fn() {
  echo "function bigOne(param) {"
  for i in $(seq 1 70); do echo "  // filler line $i"; done
  echo "  return param;"; echo "}"
}
long_fn > "$t6/frontend/src/app.js"
long_fn > "$t6/frontend/node_modules/third/dep.js"
cat > "$t6/precheck.conf" <<CONF
PROJECT_DIR="$t6"
WRITABLE_DIRS=("frontend")
CONF
t6r="$(mktemp -d /tmp/r124mszr.XXXXXX)"
mkdir -p "$t6r/scripts"
cp "$B/assets/precheck.sh" "$t6r/scripts/precheck.sh"
for g in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "$B/assets/$g" ]] && cp "$B/assets/$g" "$t6r/scripts/$g"
done
cp "$t6/precheck.conf" "$t6r/scripts/precheck.conf"
msz_out="$( cd "$t6" && bash "$t6r/scripts/precheck.sh" --method-size 2>&1 )"
rm -rf "$t6" "$t6r"
printf '%s\n' "$msz_out" | grep -q 'node_modules' \
  && bad "态6a node_modules 第三方代码进方法粒度扫描（D6 回归）" || ok "态6a node_modules 被排除（D6）"
printf '%s\n' "$msz_out" | grep -q 'src/app.js' \
  && ok "态6b 项目源码超长方法仍报（D6 未过度收紧）" || bad "态6b src 超长方法漏报（D6 过度收紧）"

# ---------- 态7 离线包 --no-vendor（用户口径：除 npm/pip 可安装插件外）真构建 ----------
t7="$(mktemp -d /tmp/r124nv.XXXXXX)"
nv_log="$t7/build.log"
bash scripts/make-offline-bundle.sh "$t7/out" --no-vendor > "${nv_log}" 2>&1
nv_rc=$?
nv_zip="$(ls "$t7/out"/swarm-yuan-offline-*-novendor.zip 2>/dev/null | head -1)"
[[ "${nv_rc}" -eq 0 ]] && ok "态7a --no-vendor 构建 rc=0（不计缺件）" || bad "态7a --no-vendor 构建非零（rc=${nv_rc}）：$(tail -3 "${nv_log}" | tr '\n' ' ')"
[[ -n "${nv_zip}" ]] && ok "态7b 产物带 -novendor 后缀（与全量包可区分）" || bad "态7b 未找到 *-novendor.zip 产物"
if [[ -n "${nv_zip}" ]]; then
  mkdir -p "$t7/x" && ( cd "$t7/x" && unzip -q "${nv_zip}" )
  nv_root="$(ls -d "$t7/x"/swarm-yuan-offline-* | head -1)"
  nv_status="${nv_root}/vendor/vendor-status.tsv"
  nv_npm_pip_rows=$(grep -cE $'\t(npm|pip)\t' "${nv_status}" 2>/dev/null || true)
  nv_skipped=$(grep -cE $'\tskipped\t' "${nv_status}" 2>/dev/null || true)
  nv_failed=$(grep -cE $'\tfailed\t' "${nv_status}" 2>/dev/null || true)
  [[ "${nv_npm_pip_rows}" -gt 0 && "${nv_skipped}" -eq "${nv_npm_pip_rows}" ]] \
    && ok "态7c npm/pip 清单行全部登记 skipped（${nv_skipped}/${nv_npm_pip_rows}）" || bad "态7c skipped 登记不全（skipped=${nv_skipped} rows=${nv_npm_pip_rows}）"
  [[ "${nv_failed}" -eq 0 ]] && ok "态7d 零 failed 行" || bad "态7d 出现 failed 行 ${nv_failed}"
  [[ -z "$(ls -A "${nv_root}/vendor/npm" 2>/dev/null)" && -z "$(ls -A "${nv_root}/vendor/pip" 2>/dev/null)" ]] \
    && ok "态7e vendor/npm 与 vendor/pip 为空（不携带可安装插件）" || bad "态7e vendor 目录非空"
  [[ -f "${nv_root}/swarm-yuan/SKILL.md" && -f "${nv_root}/SHA256SUMS" && -f "${nv_root}/install-offline.sh" ]] \
    && ok "态7f 技能本体 + SHA256SUMS + 安装器齐备" || bad "态7f 包内缺技能本体/校验和/安装器"
  grep -q 'skipped' "${nv_root}/README-OFFLINE.md" && ok "态7g README-OFFLINE 披露 skipped 语义" || bad "态7g README 未披露 skipped 语义"
  # R133 契约升级：未随包条目不再只打印提示（旧锚 _print_skipped_hint 已随实现退役），而是自动经目标机 npm/pip 源安装
  grep -q '_rows_not_ok' "${nv_root}/install-offline.sh" && grep -q '经目标机 npm 源安装' "${nv_root}/install-offline.sh" \
    && ok "态7h 安装器对未随包条目走目标机 npm/pip 源安装（两层：vendor 优先→源兜底）" || bad "态7h 安装器缺走源安装逻辑"
fi
rm -rf "$t7"

[[ $FAIL -eq 0 ]] && { echo "PASS test-r124-jvm-regression"; exit 0; } || { echo "FAIL test-r124-jvm-regression" >&2; exit 1; }
