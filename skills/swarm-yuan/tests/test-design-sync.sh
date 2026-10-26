#!/usr/bin/env bash
# test-design-sync.sh — 设计文档同步（DESIGN_SYNC）守门测试（2026-10-26 立法轮）
# 判定矩阵（spf_design_sync_check 纯函数级）+ L2 spec-first-pre-commit 端到端四场景。
# 断言锚：违规描述内容（missing-declaration/unfulfilled）与 L2 exit 码、stderr 文案，非只看退出码。
set -euo pipefail
cd "$(dirname "${0}")/.." || exit 1
LIB="assets/spec-first-lib.sh"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
skip(){ echo "  ⊘ $1"; }
TMP="$(mktemp -d /tmp/dsync.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck disable=SC1090
. "$LIB"

# ===== ① spf_design_docs 解析（行尾注释/引号数组/占位自引用，与 spf_writable_dirs 同链） =====
mkdir -p "$TMP/cfg"
cat > "$TMP/cfg/precheck.conf" <<'EOF'
DESIGN_SYNC_REQUIRED="${DESIGN_SYNC_REQUIRED:-0}"
DESIGN_DOCS=("docs/design.md" "docs/ledger.md")  # 项目设计正本/总账
EOF
[[ "$(spf_design_docs "$TMP/cfg/precheck.conf")" == 'docs/design.md docs/ledger.md' ]] \
  && ok "1a DESIGN_DOCS 引号数组+行尾注释剥净" \
  || bad "1a DESIGN_DOCS 解析异常：[$(spf_design_docs "$TMP/cfg/precheck.conf")]"
[[ "$(spf_conf_val "$TMP/cfg/precheck.conf" DESIGN_SYNC_REQUIRED)" == "0" ]] \
  && ok "1b 自引用默认求值（占位剥壳）" || bad "1b 自引用默认未剥"

# ===== ② spf_design_sync_check 判定矩阵（临时 git 仓做变更集） =====
PJ="$TMP/proj"
git init -q -b main "$PJ" >/dev/null 2>&1 || git init -q "$PJ"
git -C "$PJ" config user.email t@t.local && git -C "$PJ" config user.name t
mkdir -p "$PJ/src" "$PJ/docs/specs" && echo hello > "$PJ/src/a.txt" && git -C "$PJ" add -A && git -C "$PJ" commit -qm init
git -C "$PJ" checkout -qb feat/x
printf 'code\n' > "$PJ/src/a.txt" && git -C "$PJ" add -A
# 变更集（staged branch）含 src/a.txt + spec，不含 docs/design.md（touched 兑现对照用）

_mkspec() {  # $1=声明段形态：none|touched|absent
  cat > "$PJ/docs/specs/2026-01-01-x.md" <<EOF
# 测试 spec

## 决策记录

| # | 决策 | 类型 |
|---|---|---|
| D1 | 测试 | Mechanical |

$(if [[ "$1" == none ]]; then cat <<'EOS'
## 设计文档影响

- DESIGN_SYNC: none —— 纯测试 fixture，无产品/架构面影响
EOS
elif [[ "$1" == touched ]]; then cat <<'EOS'
## 设计文档影响

- DESIGN_SYNC: touched
  - docs/design.md —— 版本行+变更记录表
EOS
fi)
EOF
  git -C "$PJ" add "$PJ/docs/specs/2026-01-01-x.md" 2>/dev/null || git -C "$PJ" add docs/specs/2026-01-01-x.md
}

# 2a 开关关（conf 值非 1）恒放行：spf_conf_val 读文件而非环境（环境注入无效属预期），
# 故开关态由临时改写 conf 文件承载（fail-open 面=conf 半配置）。
printf 'DESIGN_SYNC_REQUIRED=0\nDESIGN_DOCS=("docs/design.md")\n' > "$TMP/cfg/precheck.conf"
[[ -z "$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')" ]] \
  && ok "2a DESIGN_SYNC_REQUIRED=0 恒放行（开关关）" || bad "2a 开关关仍拦"

# 2b 半配置 fail-open：开关 1 但 DESIGN_DOCS 空
printf 'DESIGN_SYNC_REQUIRED=1\nDESIGN_DOCS=()\n' > "$TMP/cfg/precheck.conf"
[[ -z "$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')" ]] \
  && ok "2b DESIGN_DOCS 空=fail-open（opt-in 两半齐才生效）" || bad "2b 半配置误拦"

printf 'DESIGN_SYNC_REQUIRED=1\nDESIGN_DOCS=("docs/design.md")\n' > "$TMP/cfg/precheck.conf"

# 2c spec 缺声明段 → missing-declaration
_mkspec absent
_r="$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')"
case "$_r" in missing-declaration:*) ok "2c 缺声明段拦（missing-declaration）" ;; *) bad "2c 缺声明段未拦：[$_r]" ;; esac
# rc=0 契约（输出非空但恒 rc 0）
spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch' >/dev/null \
  && ok "2c-2 恒 rc=0 契约（违规走输出不走退出码）" || bad "2c-2 违规时 rc 非零，破坏 hook 契约"

# 2d none 放行
_mkspec none
[[ -z "$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')" ]] \
  && ok "2d DESIGN_SYNC: none 放行（合理性归节点⑦审查）" || bad "2d none 被误拦"

# 2e touched 未兑现 → unfulfilled（design.md 不在变更集）
_mkspec touched
_r="$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')"
case "$_r" in unfulfilled:*design.md*) ok "2e touched 未兑现拦（unfulfilled 指名文档）" ;; *) bad "2e 未兑现未拦：[$_r]" ;; esac

# 2f touched 兑现 → 放行（design.md 并入 staged）
printf 'D\n' > "$PJ/docs/design.md" && git -C "$PJ" add docs/design.md
[[ -z "$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "docs/specs/2026-01-01-x.md" 'staged branch')" ]] \
  && ok "2f touched 兑现放行（声明与兑现同一批）" || bad "2f 兑现后仍拦"

# 2g 绝对路径 spec 也能解析（L2 传绝对路径形态）
[[ -z "$(spf_design_sync_check "$PJ" "$TMP/cfg/precheck.conf" "$PJ/docs/specs/2026-01-01-x.md" 'staged branch')" ]] \
  && ok "2g spec 绝对路径形态同判（L2 调用形态）" || bad "2g 绝对路径形态误判"

# 2h governing 选择器排除表（正本自身含「## 决策记录」章不得抢注——2026-10-26 立法轮实证缺陷）
_mkspec touched   # spec 含声明段（touched design.md）
printf '# 正本\n\n## 决策记录\n\nI1 测试。\n\n## 设计文档影响\n\n- DESIGN_SYNC: touched\n  - docs/design.md —— 行\n' > "$PJ/docs/design.md"
git -C "$PJ" add docs/design.md docs/specs/2026-01-01-x.md
_sel_plain="$(spf_find_governing_spec "$PJ" "docs/specs/*.md" 'staged branch' "$TMP/cfg/precheck.conf" index)"
_sel_excl="$(spf_find_governing_spec "$PJ" "docs/specs/*.md" 'staged branch' "$TMP/cfg/precheck.conf" index docs/design.md)"
case "$_sel_plain" in *2026-01-01-x.md*) [[ -z "$_sel_excl" || "$_sel_excl" == *"2026-01-01-x.md"* ]] ;; *) true ;; esac
# 正本不在 SPEC_GLOB 外的常规态下排除表不改变 spec 命中；关键断言：正本进 glob 时（正本在 docs/specs/ 的仓形态）
# 用专测目录模拟：把正本造进 glob 目录再验排除生效
mkdir -p "$PJ/docs/specs"
printf '# 正本\n\n## 决策记录\n\nI1。\n' > "$PJ/docs/specs/2026-01-02-ledger.md"
git -C "$PJ" add docs/specs/2026-01-02-ledger.md
_sel2="$(spf_find_governing_spec "$PJ" "docs/specs/*.md" 'staged branch' "$TMP/cfg/precheck.conf" index)"
_sel3="$(spf_find_governing_spec "$PJ" "docs/specs/*.md" 'staged branch' "$TMP/cfg/precheck.conf" index docs/specs/2026-01-02-ledger.md)"
if [[ "$_sel2" == *"2026-01-02-ledger.md" ]] && [[ "$_sel3" == *"2026-01-01-x.md" ]]; then
  ok "2h 选择器排除表：正本抢注被排除后命中真 spec"
elif [[ "$_sel3" == *"2026-01-01-x.md" ]]; then
  ok "2h 选择器排除表：排除后命中真 spec（正本未抢注序）"
else
  bad "2h 选择器排除异常：plain=[$_sel2] excl=[$_sel3]"
fi
git -C "$PJ" reset -q HEAD -- docs/specs/2026-01-02-ledger.md 2>/dev/null || true
rm -f "$PJ/docs/specs/2026-01-02-ledger.md"

# ===== ③ L2 端到端（spec-first-pre-commit.sh 直调；conf/库/钩子成套 fixture） =====
SK="$TMP/skill"; mkdir -p "$SK/scripts"
cp assets/spec-first-lib.sh "$SK/scripts/"
cp assets/hooks/spec-first-pre-commit.sh "$SK/scripts/"
printf 'status: active\n' > "$SK/SKILL.md"
cat > "$SK/scripts/precheck.conf" <<'EOF'
SPEC_REQUIRED=1
SPEC_GLOB=docs/specs/*.md
WRITABLE_DIRS=("src")
DESIGN_SYNC_REQUIRED=1
DESIGN_DOCS=("docs/design.md")
BASE_BRANCH=main
EOF

_run_l2() { ( cd "$PJ" && bash "$SK/scripts/spec-first-pre-commit.sh" ) 2>"$TMP/l2.err"; }

# 3a touched 未兑现 → L2 拦（exit 1，stderr 含 unfulfilled + gates=design-sync 落盘）
git -C "$PJ" reset -q docs/design.md 2>/dev/null && rm -f "$PJ/docs/design.md"
_r="$(_run_l2; echo "rc=$?")" || true
if [[ "$_r" == "rc=1" ]] && grep -q 'unfulfilled' "$TMP/l2.err"; then
  ok "3a L2 拦 touched 未兑现（exit 1 + stderr unfulfilled）"
else
  bad "3a L2 未按预期拦（$_r / $(cat "$TMP/l2.err"))"
fi
grep -q '"gates":"design-sync"' "$PJ/.swarm-yuan/gate-deny.jsonl" 2>/dev/null \
  && ok "3a-2 deny 落盘 gate-deny.jsonl（gates=design-sync）" || bad "3a-2 deny 未落盘或 gates 字段异常"

# 3b 补入 design.md 同批 → L2 放行
printf 'D\n' > "$PJ/docs/design.md" && git -C "$PJ" add docs/design.md
_r="$(_run_l2; echo "rc=$?")" || true
[[ "$_r" == "rc=0" ]] && ok "3b L2 放行 touched 已兑现（exit 0）" || bad "3b 兑现后仍拦（$(cat "$TMP/l2.err"))"

# 3c 改声明 none（且撤出 design.md）→ L2 放行
git -C "$PJ" reset -q docs/design.md 2>/dev/null; rm -f "$PJ/docs/design.md"
_mkspec none
_r="$(_run_l2; echo "rc=$?")" || true
[[ "$_r" == "rc=0" ]] && ok "3c L2 放行 none 声明（exit 0）" || bad "3c none 被误拦（$(cat "$TMP/l2.err"))"

# 3d 撤声明段（spec 仅决策记录）→ L2 拦 missing-declaration
_mkspec absent
_r="$(_run_l2; echo "rc=$?")" || true
if [[ "$_r" == "rc=1" ]] && grep -q 'missing-declaration' "$TMP/l2.err"; then
  ok "3d L2 拦 spec 缺声明段（exit 1 + missing-declaration）"
else
  bad "3d L2 缺声明段未拦（$_r / $(cat "$TMP/l2.err"))"
fi

# 3e 正本与 spec 同在变更集（正本含决策记录章模拟抢注形态）→ L2 放行且不误中正本
_mkspec touched
printf '# 正本\n\n## 决策记录\n\nI1。\n' > "$PJ/docs/design.md"
git -C "$PJ" add docs/design.md docs/specs/2026-01-01-x.md
_r="$(_run_l2; echo "rc=$?")" || true
[[ "$_r" == "rc=0" ]] && ok "3e L2 放行正本+spec 同批（选择器排除正本不误拦）" || bad "3e 正本抢注误拦（$(cat "$TMP/l2.err"))"

# 3f 正本修订在变更集但无治理 spec（撤出 spec）→ L2 拦 unowned-doc-change
git -C "$PJ" reset -q HEAD -- docs/specs/ 2>/dev/null || true
rm -f "$PJ/docs/specs/2026-01-01-x.md"
git -C "$PJ" add -A 2>/dev/null || true
_r="$(_run_l2; echo "rc=$?")" || true
if [[ "$_r" == "rc=1" ]] && grep -q 'unowned-doc-change' "$TMP/l2.err"; then
  ok "3f L2 拦正本修订无治理 spec（unowned-doc-change）"
else
  bad "3f 无治理 spec 未拦（$_r / $(cat "$TMP/l2.err"))"
fi

# ===== ④ 静态锚：调用点落位（L2/L3 消费 lib 单一事实源） =====
grep -q 'spf_design_sync_check' assets/hooks/spec-first-pre-commit.sh \
  && ok "4a L2 调用 spf_design_sync_check" || bad "4a L2 缺调用点"
grep -q 'spf_design_sync_check' assets/gates-warn.sh \
  && ok "4b L3（check_spec_first）调用 spf_design_sync_check" || bad "4b L3 缺调用点"
grep -q 'DESIGN_SYNC_REQUIRED' assets/precheck.conf \
  && ok "4c conf 模板含 DESIGN_SYNC_REQUIRED（opt-in 默认关）" || bad "4c conf 模板缺变量"

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "PASS: design-sync 判定矩阵 + L2 端到端四场景全绿"
  exit 0
else
  echo "FAIL: design-sync 守门存在失败项" >&2
  exit 1
fi
