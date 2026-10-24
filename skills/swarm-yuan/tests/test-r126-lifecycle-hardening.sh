#!/usr/bin/env bash
# test-r126-lifecycle-hardening.sh — R126 生命周期工具链加固回归锁
#
# 覆盖审计发现：
#   ① project-fingerprint last-good 红线对 new_total=0 失明（项目清空/扫描失败这种
#     最恶劣的 100% 骤降反而放行覆写基线）
#   ② relations-extract Rust crate 空名集合 → case 模式 `crate|)` bash 语法错误整段崩溃
#   ③ 源文件清单 head -N 截断五处零披露（大仓边集静默缺斤短两）→ _capped 统一披露
#   ④ Java import/typeAlias 递归 grep 无排除链（扫进 .git/target/node_modules 产假边）
#   ⑤ XML 属性正则零容差（namespace = "x" 空白/单引号形态静默漏边）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
FP="$BASE/scripts/project-fingerprint.sh"
RX="$BASE/scripts/relations-extract.sh"
TMP="$(mktemp -d /tmp/r126l.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 态1：fingerprint 零总数红线（100% 骤降拒写） =====
P1="$TMP/p1"; mkdir -p "$P1"
for i in 1 2 3 4 5; do printf 'x\n' > "$P1/f$i.txt"; done
bash "$FP" "$P1" --write >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 && -f "$P1/.swarm-yuan/project-fingerprint" ]] && ok "态1 基线建立" || bad "态1 基线未建 rc=$rc"
rm -f "$P1"/f*.txt                       # 项目清空（最恶劣骤降）
out="$(bash "$FP" "$P1" --write 2>&1)"; rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '骤降到 0'; then
  ok "态1 清零拒写（100% 骤降红线）"
else
  bad "态1 清零未拦截 rc=${rc}：$out"
fi
out="$(bash "$FP" "$P1" --write --force 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态1 --force 显式覆盖放行（UserChallenge 通道保留）" || bad "态1 --force rc=$rc"
# 小规模变化不误伤（五删一 = -20%，红线 50%）
P1b="$TMP/p1b"; mkdir -p "$P1b"
for i in 1 2 3 4 5; do printf 'x\n' > "$P1b/f$i.txt"; done
bash "$FP" "$P1b" --write >/dev/null 2>&1
rm -f "$P1b/f5.txt"
out="$(bash "$FP" "$P1b" --write 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态1b 小规模变化（-20%）不误拦" || bad "态1b rc=${rc}：$out"

# ===== 态2：Rust crate 空名集合不崩（case 空模式语法错误根治） =====
P2="$TMP/p2"; mkdir -p "$P2/src"
printf '[package]\n' > "$P2/Cargo.toml"          # 无 name 行 → crate 名集合为空
printf 'use crate::helper;\nfn main() {}\n' > "$P2/src/main.rs"
printf 'pub fn helper() {}\n' > "$P2/src/helper.rs"
out="$(bash "$RX" "$P2" --out "$P2/relations.jsonl" 2>&1)"; rc=$?
if [[ $rc -eq 0 ]]; then
  ok "态2 crate 空名集合提取不崩（rc=0）"
else
  bad "态2 rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi

# ===== 态3：_capped 截断披露（函数级：超限 stderr 明示 + stdout 截断正确） =====
eval "$(awk '/^_capped\(\)/,/^}/' "$RX")"
_cap_out="$(seq 5 | _capped 3 "测试族" 2>"$TMP/cap.err")"
_cap_err="$(cat "$TMP/cap.err")"
if [[ "$(printf '%s\n' "$_cap_out" | wc -l | tr -d ' ')" == "3" ]] && printf '%s' "$_cap_err" | grep -q '超上限 3'; then
  ok "态3 _capped 截断+披露（stdout 前 3 行，stderr 报 5 超 3）"
else
  bad "态3 capped 行为异常 out=$_cap_out err=$_cap_err"
fi
_cap_ok="$(seq 3 | _capped 3 "测试族" 2>&1 >/dev/null)"
[[ -z "$_cap_ok" ]] && ok "态3 未超限零披露（不多话）" || bad "态3 未超限误披露: $_cap_ok"

# ===== 态4：Java 排除链——target/ 下文件不产生边 =====
P4="$TMP/p4"; mkdir -p "$P4/src/main/java/com/real" "$P4/target/generated/com/fake"
printf 'package com.real;\npublic class B {}\n' > "$P4/src/main/java/com/real/B.java"
printf 'package com.real;\nimport com.real.B;\npublic class A { B b; }\n' > "$P4/src/main/java/com/real/A.java"
printf 'package com.fake;\nimport com.real.B;\npublic class Fake { B b; }\n' > "$P4/target/generated/com/fake/Fake.java"
bash "$RX" "$P4" --out "$P4/relations.jsonl" >/dev/null 2>&1
if [[ -f "$P4/relations.jsonl" ]]; then
  grep -q '"from":"src/main/java/com/real/A.java"' "$P4/relations.jsonl" \
    && ok "态4 真实源文件边在" || bad "态4 真实边缺失: $(cat "$P4/relations.jsonl")"
  grep -q '"from":"target/' "$P4/relations.jsonl" \
    && bad "态4 target/ 假边产生（排除链失效）" || ok "态4 target/ 产假边被排除"
else
  bad "态4 relations.jsonl 未生成"
fi

# ===== 态5：XML 属性空白/单引号容差（mapper-binding 不forms漏边） =====
P5="$TMP/p5"; mkdir -p "$P5/src/main/java/com/demo" "$P5/src/main/resources/mapper"
printf 'package com.demo;\npublic interface UserMapper {}\n' > "$P5/src/main/java/com/demo/UserMapper.java"
printf 'package com.demo;\npublic class User {}\n' > "$P5/src/main/java/com/demo/User.java"
cat > "$P5/src/main/resources/mapper/UserMapper.xml" <<'EOF'
<?xml version="1.0"?>
<mapper namespace = "com.demo.UserMapper">
  <resultMap id="BaseResultMap" type = "com.demo.User">
    <id column = "id" property = "id"/>
  </resultMap>
  <select id="findOne" resultType = "com.demo.User">SELECT * FROM t_user</select>
</mapper>
EOF
cat > "$P5/src/main/resources/mapper/SqMapper.xml" <<'EOF'
<?xml version="1.0"?>
<mapper namespace='com.demo.UserMapper'>
</mapper>
EOF
bash "$RX" "$P5" --out "$P5/relations.jsonl" >/dev/null 2>&1
E5="$P5/relations.jsonl"
grep -qF '"kind":"mapper-binding","evidence":"namespace@src/main/resources/mapper/UserMapper.xml:2"' "$E5" \
  && ok "态5 空白属性 namespace = \"...\" 出边" || bad "态5 空白形态漏边: $(cat "$E5" 2>/dev/null)"
grep -q '"kind":"data-mapping"' "$E5" \
  && ok "态5 空白属性 resultMap type = 出边" || bad "态5 resultMap 空白形态漏边"
grep -q 'SqMapper.xml' "$E5" \
  && ok "态5 单引号 namespace 出边" || bad "态5 单引号形态漏边"
grep -q '"kind":"field-mapping"' "$E5" \
  && ok "态5 空白 column/property 字段级边在" || bad "态5 字段级边漏（awk 状态机容差失效）"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-r126-lifecycle-hardening 全绿（指纹红线/crate 空集/截断披露/排除链/XML 容差）"
else
  echo "✗ test-r126-lifecycle-hardening 存在失败项" >&2
fi
exit $FAIL
