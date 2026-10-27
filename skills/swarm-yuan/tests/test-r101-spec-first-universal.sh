#!/usr/bin/env bash
# test-r101-spec-first-universal.sh — 四层拦截守门测试（R101）
# 覆盖：①判定库矩阵（解析链历史坑回归）②L2 pre-commit 三态 ③L3 门禁三态
# ④诚实降级线双向断言 ⑤成套分发登记。判据锚：docs/research/R101-spec-first-universal.md。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
LIB="assets/spec-first-lib.sh"
PC="assets/hooks/spec-first-pre-commit.sh"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
TMP="$(mktemp -d /tmp/r101.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck disable=SC1090
. "$LIB"

# ===== ① 判定库矩阵 =====
mkdir -p "$TMP/cfg"
cat > "$TMP/cfg/precheck.conf" <<EOF
PROJECT_DIR="$TMP/proj"
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"  # MEASURE 注释
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"  # MEASURE 注释
WRITABLE_DIRS=("src" "app")  # MEASURE 注释
EOF
# 1a 自引用默认解析（R75-D3 死代码坑：字面 ${SPEC_REQUIRED:-1} ≠ "1"）
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SPEC_REQUIRED)" == "1" ]] && ok "1a SPEC_REQUIRED 自引用默认求值为 1" || bad "1a 自引用默认解析失败"
# 1b SPEC_GLOB 自引用默认
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SPEC_GLOB)" == "docs/specs/*.md" ]] && ok "1b SPEC_GLOB 自引用默认" || bad "1b SPEC_GLOB 解析失败"
# 1c <占位符> 不剥（fail-gate-hook 语义；剥离属 state-machine 包装层）
printf 'SPEC_GLOB="<占位符>"\n' >> "$TMP/cfg/precheck.conf"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" SPEC_GLOB)" == "<占位符>" ]] && ok "1c 占位符不剥（fail-gate 语义保留）" || bad "1c 占位符被误剥"
# 1d 未配置键=空、缺失文件=空（恒 rc=0）
[[ -z "$(spf_conf_val "$TMP/cfg/precheck.conf" NOT_SET)" ]] && spf_conf_val "$TMP/cfg/precheck.conf" NOT_SET >/dev/null && ok "1d 未配置键空且 rc=0" || bad "1d 未配置键行为异常"
spf_conf_val "$TMP/no-such.conf" SPEC_REQUIRED >/dev/null && ok "1d2 缺失文件恒 rc=0" || bad "1d2 缺失文件非零退出"
# 1e WRITABLE_DIRS 行尾注释括号剥离（D5 坑）
_wd="$(spf_writable_dirs "$TMP/cfg/precheck.conf")"
[[ "$_wd" == "src app" ]] && ok "1e WRITABLE_DIRS 行尾注释解析=src app" || bad "1e WRITABLE_DIRS 解析异常: ${_wd}"
# 1f 已批准 spec 判定
mkdir -p "$TMP/proj/docs/specs"
printf '# X\n## 决策记录\n- 方案 A\n' > "$TMP/proj/docs/specs/001.md"
[[ "$(spf_find_approved_spec "$TMP/proj" 'docs/specs/*.md')" == "$TMP/proj/docs/specs/001.md" ]] && ok "1f 含决策记录段=已批准" || bad "1f 已批准判定失败"
printf '# X\n## 决策记录\n待填充\n' > "$TMP/proj/docs/specs/002.md"
[[ -z "$(spf_find_approved_spec "$TMP/proj-noapp" 'docs/specs/*.md')" ]] && ok "1f2 无命中=空" || bad "1f2 空根误报"
# 1g 路径匹配：段命中/根前缀命中/miss
spf_path_in_dirs "/x/y/proj/src/a.py" "/x/y/proj" src app && ok "1g 段命中 */src/*" || bad "1g 段命中失败"
spf_path_in_dirs "/x/y/proj/app/b.py" "/x/y/proj" src app && ok "1g2 第二目录命中" || bad "1g2 多目录失败"
spf_path_in_dirs "/x/y/proj/docs/c.md" "/x/y/proj" src app && bad "1g3 docs 误命中" || ok "1g3 可写区外不命中"
# 1h draft 判定
printf -- '---\nstatus: draft\n---\n' > "$TMP/SKILL.md"
spf_is_draft "$TMP/SKILL.md" && ok "1h draft 判定" || bad "1h draft 未判出"
spf_is_draft "" || ok "1h2 空路径非 draft" || bad "1h2 空路径误判 draft"
printf -- '---\nstatus: active\n---\n' > "$TMP/SKILL2.md"
spf_is_draft "$TMP/SKILL2.md" || ok "1h3 active 非 draft" || bad "1h3 active 误判"

# ===== ② L2 pre-commit 三态（临时 git 仓库端到端） =====
G="$TMP/gitskill"; mkdir -p "$G/scripts"
cp "$PC" "$G/scripts/"; cp "$LIB" "$G/scripts/"
printf -- '---\nstatus: active\n---\n' > "$G/SKILL.md"
cat > "$G/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP/gitproj"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
EOF
GP="$TMP/gitproj"
mkdir -p "$GP"
(
  cd "$GP" 2>/dev/null || exit 1
  git init -q . && git config user.email t@t && git config user.name t
  # base commit 必须有：L3 的 _git_changed_files 兜底链是 diff base...HEAD → diff HEAD，
  # 无任何 commit 时两者皆空（检测面为空 → 3a 假通过）
  mkdir -p docs && echo base > docs/base.md && git add -A && git commit -qm base
  mkdir -p src && echo hi > src/a.py && git add src/a.py
) >/dev/null 2>&1
if (cd "$GP" && bash "$G/scripts/spec-first-pre-commit.sh") >/dev/null 2>&1; then
  bad "2a 无 spec staged src 未拦"
else
  ok "2a 无 spec staged src 拦截（exit 1）"
fi
grep -q '"tool":"git-commit"' "$GP/.swarm-yuan/gate-deny.jsonl" 2>/dev/null && ok "2b deny 落盘 gate-deny.jsonl" || bad "2b deny 未落盘"
mkdir -p "$GP/docs/specs" && printf '# X\n## 决策记录\n- A\n' > "$GP/docs/specs/001.md"
git -C "$GP" add docs/specs/001.md  # L2 校验实际提交快照，批准必须随提交落盘
(cd "$GP" && bash "$G/scripts/spec-first-pre-commit.sh") >/dev/null 2>&1 && ok "2c 已暂存批准 spec 放行" || bad "2c 已暂存 spec 误拦"
# 2d draft 放行
printf -- '---\nstatus: draft\n---\n' > "$G/SKILL.md"
(cd "$GP" && bash "$G/scripts/spec-first-pre-commit.sh") >/dev/null 2>&1 && ok "2d draft 骨架放行" || bad "2d draft 误拦"
printf -- '---\nstatus: active\n---\n' > "$G/SKILL.md"
# 2e 库缺失 fail-open 放行（披露哲学一致；成套分发由 ⑤ 锁）
mv "$G/scripts/spec-first-lib.sh" "$G/lib.bak"
(cd "$GP" && bash "$G/scripts/spec-first-pre-commit.sh") >/dev/null 2>&1 && ok "2e 判定库缺失 fail-open 放行" || bad "2e 缺库误拦（应放行）"
mv "$G/lib.bak" "$G/scripts/spec-first-lib.sh"

# ===== ③ L3 门禁三态 =====
S="$TMP/skillcopy"; mkdir -p "$S"
cp assets/precheck.sh assets/gates-warn.sh assets/gates-strict.sh assets/gates-advisory.sh \
   assets/gate-enforce-level.conf assets/spec-first-lib.sh "$S/" 2>/dev/null
cat > "$S/precheck.conf" <<EOF
PROJECT_DIR="$GP"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
GATE_ENFORCE_DENY=""
EOF
rm -f "$GP/docs/specs/001.md"
out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1) && rc=0 || rc=1
if [[ "$rc" -eq 1 && "$(printf '%s' "$out" | grep -c gate_spec_first_missing)" -ge 1 ]]; then
  ok "3a 无 spec + src 变更 FAIL（gate_spec_first_missing）"
else
  bad "3a 门禁未 FAIL: $rc"
fi
printf '# X\n## 决策记录\n- A\n' > "$GP/docs/specs/001.md"
out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1)
printf '%s' "$out" | grep -q "已批准 spec" && ok "3b 有 spec PASS" || bad "3b 有 spec 未 PASS: $out"
# 3c 开关关 SKIPPED 披露
sed -i.bak 's|SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"|SPEC_REQUIRED="0"|' "$S/precheck.conf"
out=$(cd "$GP" && bash "$S/precheck.sh" --spec-first 2>&1)
printf '%s' "$out" | grep -q "SKIPPED" && ok "3c 开关关 ⊘ SKIPPED 披露" || bad "3c 未披露跳过: $out"
# 3d 核心序列含 spec-first（--all 执行面）
out=$(cd "$GP" && bash "$S/precheck.sh" --all 2>&1)
printf '%s' "$out" | grep -q "spec-first 流程门" && ok "3d --all 序列含 spec-first" || bad "3d --all 未执行 spec-first"

# ===== ④ 诚实降级线双向断言（ta_build_body 按宿主） =====
TB_DIR="$PWD/assets/tool-adapters"
for t in kimi gemini cursor windsurf opencode; do
  body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk' '$t'" 2>/dev/null)
  if printf '%s' "$body" | grep -q "已渲染写时拦截配置（L1，官方 schema 文档锚、未活体实证）"; then
    ok "4$t 降级线渲染（R103 起=已渲染未实证态明示）"
  else
    bad "4$t 降级线缺失"
  fi
done
for t in claude codex zcode; do
  body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk' '$t'" 2>/dev/null)
  if printf '%s' "$body" | grep -q "已接 spec-first deny"; then
    ok "4$t 纵深线渲染（L1 已接）"
  else
    bad "4$t 纵深线缺失"
  fi
done
# 4g 无 tool 参数向后兼容（无能力行）
body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk'" 2>/dev/null)
if printf '%s' "$body" | grep -q "写时拦截" ; then bad "4g 空参数应无能力行"; else ok "4g 空 tool 参数向后兼容"; fi

# ===== ⑤ 成套分发登记（UNIVERSAL_FILES 两新条目） =====
grep -q '"scripts/spec-first-lib.sh|assets|lite"' scripts/generate-skill.sh && ok "5a UNIVERSAL_FILES 含判定库（lite）" || bad "5a 判定库未登记"
grep -q '"scripts/spec-first-pre-commit.sh|hook|standard"' scripts/generate-skill.sh && ok "5b UNIVERSAL_FILES 含 pre-commit（standard）" || bad "5b pre-commit 未登记"
grep -q '^FACT_GATES_BUDGET=56' assets/facts.conf && ok "5c 门禁预算修订登记（56）" || bad "5c 预算键未修订"
grep -q '^FACT_SPEC_WRITE_HOOK_HOSTS=3' assets/facts.conf && ok "5d 写时强拦宿主记账（3）" || bad "5d 宿主记账缺失"

if [[ $FAIL -eq 0 ]]; then echo "test-r101-spec-first-universal: PASS"; else echo "test-r101-spec-first-universal: FAIL" >&2; fi
exit $FAIL

# R101-D8b（挂账清偿批）：WRITABLE_DIRS 多层可见性——patch 覆盖层对 L1/L2 生效（末层胜出）
_multi_test() {
  local d="$1" 
  printf '. "%s/lib.sh"
wd="$(spf_writable_dirs "%s/conf")"
[[ "$wd" == "docs extra" ]] && echo MULTI-OK || echo "wd=[$wd]"
' "$d" "$d" > "$d/t.sh"
  bash "$d/t.sh"
}
_mw="$(mktemp -d "${TMPDIR:-/tmp}/spf-multi.XXXXXX")"
mkdir -p "$_mw"
cp "$(dirname "$0")/../assets/spec-first-lib.sh" "$_mw/lib.sh"
printf 'WRITABLE_DIRS=("src")
' > "$_mw/conf"
printf 'WRITABLE_DIRS=("docs" "extra")
' > "$_mw/patch.tmp"
# patch 层文件名须为 precheck.patch.conf（spf_writable_dirs 按层文件名扫描）
mv "$_mw/patch.tmp" "$_mw/precheck.patch.conf"
_out="$(_multi_test "$_mw")"
[[ "$_out" == "MULTI-OK" ]] && echo "  ✓ WRITABLE_DIRS patch 层覆盖对 hook 判定库可见（末层胜出）" || echo "  ✗ 多层可见性失败: $_out"
rm -rf "$_mw"
