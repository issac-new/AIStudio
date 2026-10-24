#!/usr/bin/env bash
# test-conf-render.sh — conf-render.sh 初稿渲染双态测试（WP-P4/M3）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/conf-render.sh"
TMP="$(mktemp -d /tmp/crtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
conf_var() { # $1=conf 文件 $2=变量名 → 源码后的值（R118：断言值而非引号风格）
  ( set +u; . "$1" 2>/dev/null; eval "printf '%s' \"\${$2:-}\"" )
}

# --- 态 1：TS 项目 → PROJECT_DIR/语言/包管理器 detected；LAYER_DEFS TODO:model ---
mkdir -p "$TMP/proj/src"
cat > "$TMP/proj/package.json" <<'EOF'
{ "name": "demo", "dependencies": { "react": "^19.0.0" } }
EOF
out="$(bash "$SH" "$TMP/proj" --profile standard 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "渲染 exit 0" || bad "exit=$rc"
grep -qE 'PROJECT_DIR=.*# AUTO:detected' <<<\"$out\" && ok "PROJECT_DIR detected" || bad "PROJECT_DIR 缺失: $out"
grep -qE "BUILD_CMD=.*# AUTO:default" <<<\"$out\" && ok "BUILD_CMD default" || bad "BUILD_CMD 缺失"
grep -qE 'LAYER_DEFS=.*# TODO:model' <<<\"$out\" && ok "LAYER_DEFS TODO:model" || bad "LAYER_DEFS 未留 TODO: $out"
grep -qE 'ACTIVE_FRAMEWORKS=.*react' <<<\"$out\" && ok "ACTIVE_FRAMEWORKS detected react" || bad "框架未探测: $out"

# --- 态 2：Java/Maven 项目 → BUILD_CMD maven detected ---
mkdir -p "$TMP/proj2/src/main/java"
cat > "$TMP/proj2/pom.xml" <<'EOF'
<project><modelVersion>4.0.0</modelVersion><dependencies>
<dependency><groupId>org.springframework.boot</groupId></dependency>
</dependencies></project>
EOF
out="$(bash "$SH" "$TMP/proj2" --profile standard 2>/dev/null)"
grep -qE 'BUILD_CMD=.*mvn.*# AUTO:detected' <<<\"$out\" && ok "Java BUILD_CMD mvn detected" || bad "态2 BUILD_CMD: $out"
grep -qE 'ACTIVE_FRAMEWORKS=.*spring-boot' <<<\"$out\" && ok "spring-boot detected" || bad "态2 框架: $out"

# --- 态 3：lite profile 不渲染 arch.conf/compliance.conf 段（section header 不得出现） ---
# 注：core 模板里的 `[[ -f .../precheck.arch.conf ]] && source ... || true` 功能行保留（lite 无兄弟时 no-op，
# 未来补 arch.conf 可自动加载），故用 section header `^# ===== precheck.arch.conf =====` 判定是否渲染了完整段。
out="$(bash "$SH" "$TMP/proj" --profile lite 2>/dev/null)"
grep -qE '^# ===== precheck\.arch\.conf =====' <<<\"$out\" && bad "lite 不应渲染 arch 段" || ok "lite 无 arch.conf 段"
grep -qE '^# ===== precheck\.compliance\.conf =====' <<<\"$out\" && bad "lite 不应渲染 compliance 段" || ok "lite 无 compliance.conf 段"

# --- 态 4：--out 落盘三文件 + TODO:model 清单 ---
mkdir -p "$TMP/out"
bash "$SH" "$TMP/proj" --profile standard --out "$TMP/out" >/dev/null 2>&1
[[ -f "$TMP/out/precheck.conf" ]] && ok "precheck.conf 落盘" || bad "precheck.conf 未落盘"
[[ -f "$TMP/out/precheck.arch.conf" ]] && ok "arch.conf 落盘" || bad "arch.conf 未落盘"
[[ ! -f "$TMP/out/precheck.compliance.conf" ]] && ok "standard 无 compliance.conf" || bad "standard 不应落 compliance"

# --- 态 5：确定性（同输入连跑两次 byte-identical）---
o1="$(bash "$SH" "$TMP/proj" --profile standard 2>/dev/null)"
o2="$(bash "$SH" "$TMP/proj" --profile standard 2>/dev/null)"
[[ "$o1" == "$o2" ]] && ok "确定性 byte-identical" || bad "两次不一致"

# --- 态 6（R23 回归 D3/D4）：TODO-model 清单保真 + 不列 deprecated 变量 ---
bash "$SH" "$TMP/proj" --profile standard --out "$TMP/out" >/dev/null 2>&1
grep -q '保留模板 "" 形态' "$TMP/out/TODO-model.txt" \
  && ok 'D3 TODO-model 文案字面 "" 保真（双引号串不被 shell 吞）' \
  || bad 'D3 TODO-model 文案失真（"" 被吞）'
grep -q 'SERVICE_DIRS' "$TMP/out/TODO-model.txt" \
  && bad 'D4 TODO-model 不应列 deprecated 变量 SERVICE_DIRS' \
  || ok 'D4 TODO-model 不列 deprecated 变量'

# --- 态 7-8（R25-PF1 回归锚）：Python 裸锁文件项目命令默认值须与本机现实对齐 ---
# 修复前：requirements.txt 只有 flask 也给 TEST_CMD=pytest / BUILD_CMD="python -m build"——
# 两者是第三方包，未声明未安装时默认值不可执行（真实执勤 notes-api 门禁真跑翻车）。
# 态 7：未声明 pytest → 标准库 unittest 兜底（default）+ BUILD_CMD 留空
mkdir -p "$TMP/pyproj1"
printf 'flask>=3.0\n' > "$TMP/pyproj1/requirements.txt"
out="$(bash "$SH" "$TMP/pyproj1" --profile standard 2>/dev/null)"
printf '%s\n' "$out" > "$TMP/pyproj1/rendered.conf"
_tc=$( conf_var "$TMP/pyproj1/rendered.conf" TEST_CMD )
_bc=$( conf_var "$TMP/pyproj1/rendered.conf" BUILD_CMD )
[[ "$_tc" == "python3 -m unittest discover -s tests" ]] \
  && ok "态7 未声明 pytest → unittest 零依赖兜底" || bad "态7 TEST_CMD: ${_tc}"
[[ -z "$_bc" ]] \
  && ok "态7 纯 requirements.txt → BUILD_CMD 留空" || bad "态7 BUILD_CMD: ${_bc}"
# 态 8：声明了 pytest → python3 -m pytest（detected；R28-DF1 裸 pytest 无 ini 项目收集失败）
mkdir -p "$TMP/pyproj2"
printf 'flask>=3.0\npytest>=8.0\n' > "$TMP/pyproj2/requirements.txt"
out="$(bash "$SH" "$TMP/pyproj2" --profile standard 2>/dev/null)"
printf '%s\n' "$out" > "$TMP/pyproj2/rendered.conf"
_tc=$( conf_var "$TMP/pyproj2/rendered.conf" TEST_CMD )
[[ "$_tc" == "python3 -m pytest" ]] \
  && ok "态8 声明 pytest → python3 -m pytest detected" || bad "态8 TEST_CMD: ${_tc}"

[[ $FAIL -eq 0 ]] && { echo "PASS test-conf-render"; exit 0; } || { echo "FAIL test-conf-render" >&2; exit 1; }
