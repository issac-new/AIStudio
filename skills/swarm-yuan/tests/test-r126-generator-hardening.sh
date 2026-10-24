#!/usr/bin/env bash
# test-r126-generator-hardening.sh — R126 生成器加固回归锁
#
# 覆盖审计发现（generate-skill.sh）：
#   ① auto 档文件计数 find|head 在 set -euo pipefail 下 SIGPIPE abort（真实规模项目必现，
#     测试夹具文件少不触发——WP-R Bug#1 同族漏网）
#   ② 框架信号计数 `|| echo 0` 双零陷阱（grep -c 零命中已打印 0，再补一个 → 算术语法错误）
#   ③ verify_completeness strict 下 grep -c|xargs 无 || true——空 decisions.jsonl 被
#     set -e 静默中止（误报形态而非「缺少决策记录」明示）
#   ④ 交付形态 DoD 在位性检查是死代码（_DELIVERY_SHAPES 只在 create 流赋值，
#     verify 路径恒空；且 trace_miss 紧接着被 awk 赋值覆盖）——R126 接线为懒计算+追加
#   ⑤ _conf_var_filled 单一判据（单引号/裸值已填不再误判空）
#   ⑥ _user_acknowledged_empty 数组空值形态修复（FOO=()  # 注释 判定已确认）
#   ⑦ check_framework_globs 沿 conf 链（core→arch→patch）读取 + 单引号已填不误报
#   ⑧ strict 零可检查文件 fail-closed（旧版打印 ✓ 放行）
#   ⑨ rollback 撤销未实例化的 framework-knowledge.md 骨架（整体撤销承诺对齐）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
GEN="$BASE/scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/r126g.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 态1：SIGPIPE——多文件项目 auto 档 create 不 abort =====
P1="$TMP/p1"; mkdir -p "$P1"
# 3000 个文件确保 find 输出超 pipe 缓冲（head 截断时 find 必收 SIGPIPE）；
# PROFILE_LITE_MAX_FILES 调小让 head 尽早关闭管道，扩大旧版必崩窗口。
for i in $(seq 1 3000); do : > "$P1/file-$i.txt"; done
out="$(PROFILE_LITE_MAX_FILES=3 bash "$GEN" demo1 "$P1" "$TMP/out1" 2>&1)"; rc=$?
if [[ $rc -eq 0 && -f "$TMP/out1/demo1/SKILL.md" ]]; then
  ok "态1 3000 文件项目 auto 档 create 完成（SIGPIPE 已掩）"
else
  bad "态1 create rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi

# ===== 态2：双零陷阱——依赖清单零匹配行不 abort =====
P2="$TMP/p2"; mkdir -p "$P2"
printf '// 注释\n' > "$P2/pom.xml"          # 无 artifactId 行
printf '{}' > "$P2/package.json"              # 无依赖行
printf 'module example.com/x\n' > "$P2/go.mod"
printf '[package]\n' > "$P2/Cargo.toml"       # 无 kv 行
out="$(bash "$GEN" demo2 "$P2" "$TMP/out2" 2>&1)"; rc=$?
if [[ $rc -eq 0 && -f "$TMP/out2/demo2/SKILL.md" ]]; then
  ok "态2 零匹配依赖清单 create 完成（无双零算术错误）"
else
  bad "态2 create rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi

# ===== 态3：strict + 空 decisions.jsonl → 明示「缺少决策记录」而非静默中止 =====
S3="$TMP/s3"; mkdir -p "$S3/references" "$S3/scripts" "$S3/.swarm-yuan"
cat > "$S3/SKILL.md" <<'EOF'
---
name: s3
status: draft
---
# s3
EOF
: > "$S3/.swarm-yuan/decisions.jsonl"   # 存在但零有效行（grep -c 输出 0 且 exit 1 的触发形态）
out="$(bash "$GEN" --verify-completeness "$S3" --strict 2>&1)"; rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '缺少决策记录'; then
  ok "态3 strict 空 decisions 明示缺记录（不再静默 abort）"
else
  bad "态3 rc=$rc out=$(printf '%s' "$out" | tail -3)"
fi

# ===== 态4：交付形态 DoD 接线——嗅探到形态而 workflow 无「交付形态」段须留痕 =====
P4="$TMP/p4proj"; mkdir -p "$P4"; printf 'FROM scratch\n' > "$P4/Dockerfile"
S4="$TMP/s4"; mkdir -p "$S4/references" "$S4/scripts"
cat > "$S4/SKILL.md" <<'EOF'
---
name: s4
status: draft
---
# s4
EOF
cat > "$S4/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P4"
EOF
# 节点段含追踪+方法论两要素（隔离 DoD 变量，不让节点缺要素噪音混入）
cat > "$S4/references/workflow.md" <<'EOF'
# workflow
## 节点⑤：编码
- 调用追踪：trace-log.sh 落盘
- 方法论引用：references/dev-guide.md
EOF
out="$(bash "$GEN" --verify-completeness "$S4" --strict 2>&1)"; rc=$?
if printf '%s' "$out" | grep -q '缺交付形态 DoD 段'; then
  ok "态4 DoD 在位性执法触发（接线后死代码复活）"
else
  bad "态4 DoD 检查未触发 rc=$rc out=$(printf '%s' "$out" | tail -5)"
fi
# 对照：workflow 含「交付形态」段则该缺项不再出现
printf '\n## 交付形态\nbackend-service：启动冒烟。\n' >> "$S4/references/workflow.md"
out="$(bash "$GEN" --verify-completeness "$S4" --strict 2>&1)"
printf '%s' "$out" | grep -q '缺交付形态 DoD 段' \
  && bad "态4 含交付形态段仍误报" || ok "态4 含交付形态段不误报"

# ===== 态5：_conf_var_filled 形态矩阵（函数级） =====
eval "$(awk '/^_conf_var_filled\(\)/,/^}/' "$GEN")"
cvf_fail=0
for filled in 'V="x"' "V='x'" 'V=("x")' "V=('x')" 'V=x' 'V=("x" "y")'; do
  _conf_var_filled "$filled" || { cvf_fail=1; bad "态5 已填误判空: $filled"; }
done
for empty in 'V=' 'V=""' "V=''" 'V=()' 'V=("")' 'V=()  # 注释'; do
  _conf_var_filled "$empty" && { cvf_fail=1; bad "态5 空值误判已填: $empty"; }
done
[[ $cvf_fail -eq 0 ]] && ok "态5 _conf_var_filled 六填六空全对"

# ===== 态6：_user_acknowledged_empty 数组形态（函数级） =====
eval "$(awk '/^_tpl_line_for_var\(\)/,/^}/' "$GEN")"
eval "$(awk '/^_user_acknowledged_empty\(\)/,/^}/' "$GEN")"
A6="$TMP/assets6"; mkdir -p "$A6"
printf 'BAR="" # 模板原生注释\n' > "$A6/precheck.conf"
ASSETS_DIR="$A6"
uae_fail=0
_user_acknowledged_empty 'FOO=()  # 本项目无此概念' || { uae_fail=1; bad "态6 数组空值+确认注释被判未确认"; }
_user_acknowledged_empty 'FOO="" # 无此概念'        || { uae_fail=1; bad "态6 标量空值+确认注释被判未确认"; }
_user_acknowledged_empty 'FOO=()'                   && { uae_fail=1; bad "态6 无注释空值误判已确认"; }
_user_acknowledged_empty 'BAR="" # 模板原生注释'     && { uae_fail=1; bad "态6 与模板逐字相同误判已确认"; }
_user_acknowledged_empty 'BAR="" # 模板原生注释+已确认无' || true   # 注释被改写=确认 → rc 0
_user_acknowledged_empty 'BAR="" # 模板原生注释+已确认无' || { uae_fail=1; bad "态6 改写注释的模板行被判未确认"; }
_user_acknowledged_empty 'FOO=""  # TODO(framework-gates)' && { uae_fail=1; bad "态6 TODO 标记误判已确认"; }
[[ $uae_fail -eq 0 ]] && ok "态6 _user_acknowledged_empty 五形态全对（含 R109-D9 数组场景）"

# ===== 态7：check_framework_globs 链式 conf + 单引号已填 =====
# 7a：ACTIVE_FRAMEWORKS 在主 conf，已填变量在 patch 覆盖层且单引号——旧版双盲误报
S7="$TMP/s7"; mkdir -p "$S7/scripts"
printf -- '---\nname: s7\nstatus: draft\n---\n# s7\n' > "$S7/SKILL.md"
printf '# ruleset: koa  requires_conf: KOA_SRC_GLOBS KOA_SOCKETIO_FILE_GLOBS KOA_SOCKETIO_NAMESPACE_REQUIRED KOA_SOCKETIO_FORBIDDEN_BARE_SOCKET\n' > "$S7/scripts/precheck.sh"
cat > "$S7/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP"
ACTIVE_FRAMEWORKS=("koa")
KOA_SRC_GLOBS=()
EOF
cat > "$S7/scripts/precheck.patch.conf" <<'EOF'
KOA_SRC_GLOBS='src/**/*.ts'
EOF
out="$(bash "$GEN" --check-framework-globs "$S7" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态7a patch 覆盖层单引号已填被看见（链式 conf）" \
  || bad "态7a 误报空转 rc=${rc}：$(printf '%s' "$out" | tail -2)"
# 7b：patch 里改回空数组 → 仍须判空转（防矫枉过正假放行）
printf 'KOA_SRC_GLOBS=()\n' > "$S7/scripts/precheck.patch.conf"
out="$(bash "$GEN" --check-framework-globs "$S7" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && ok "态7b patch 覆盖层置空仍判空转（无假放行）" \
  || bad "态7b 空值漏判 rc=${rc}：$(printf '%s' "$out" | tail -2)"

# 7c（R128）：conf 链首文件对框架变量零命中 → 旧版空值位置列举管道 pipefail 中止整个子命令
# （rc=1 且连 ✗ 都不输出，静默失败）；修复后须明示「框架 glob 全空」
S7c="$TMP/s7c"; mkdir -p "$S7c/scripts"
printf -- '---\nname: s7c\nstatus: draft\n---\n# s7c\n' > "$S7c/SKILL.md"
printf '# ruleset: koa  requires_conf: KOA_SRC_GLOBS\n' > "$S7c/scripts/precheck.sh"
cat > "$S7c/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP"
ACTIVE_FRAMEWORKS=("koa")
EOF
out="$(bash "$GEN" --check-framework-globs "$S7c" 2>&1)"; rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '框架 glob 全空'; then
  ok "态7c conf 零命中时明示全空（不再 pipefail 静默中止）"
else
  bad "态7c rc=${rc} 静默/误报：$(printf '%s' "$out" | tail -2)"
fi

# ===== 态8：strict 零可检查文件 fail-closed =====
S8="$TMP/s8"; mkdir -p "$S8"
out="$(bash "$GEN" --verify-completeness "$S8" --strict 2>&1)"; rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '拒绝放行'; then
  ok "态8 strict 空目录 fail-closed"
else
  bad "态8 rc=$rc out=$out"
fi

# ===== 态9：rollback 撤销未实例化骨架 =====
S9="$TMP/s9"; mkdir -p "$S9/scripts"
printf -- '---\nname: s9\nstatus: draft\n---\n# s9\n' > "$S9/SKILL.md"
printf '# >>> swarm-yuan:framework-gates >>>\n# <<< swarm-yuan:framework-gates <<<\n' > "$S9/scripts/precheck.sh"
cat > "$S9/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP"
ACTIVE_FRAMEWORKS=("koa")
EOF
out="$(bash "$GEN" --inject-frameworks "$S9" 2>&1)"; rc=$?
if [[ $rc -eq 0 && -f "$S9/references/framework-knowledge.md" ]]; then
  ok "态9 注入生成骨架"
else
  bad "态9 注入 rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi
out="$(bash "$GEN" --rollback-frameworks "$S9" 2>&1)"; rc=$?
if [[ $rc -eq 0 && ! -f "$S9/references/framework-knowledge.md" ]]; then
  ok "态9 回滚撤销未实例化骨架"
else
  bad "态9 回滚 rc=$rc 骨架残留=$(test -f "$S9/references/framework-knowledge.md" && echo 在 || echo 无)：$(printf '%s' "$out" | tail -3)"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-r126-generator-hardening 全绿（9 态）"
else
  echo "✗ test-r126-generator-hardening 存在失败项" >&2
fi
exit $FAIL
