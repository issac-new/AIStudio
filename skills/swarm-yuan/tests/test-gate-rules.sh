#!/usr/bin/env bash
# test-gate-rules.sh — R13 批次2：rules.d 三值求值器测试
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/gate-rules.sh"
TMP="$(mktemp -d /tmp/grtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

mkdir -p "$TMP/rules.d"
cat > "$TMP/rules.d/test.rules" <<'REOF'
# test rules
git status        → allow   # 只读
git push *        → prompt  # 推进态
rm -rf *          → forbid  # 不可逆；替代：git clean -n
npm publish *     → forbid  # 发布门；替代：release 流程
REOF

# 态1 allow：只读命令
out=$(bash "$SH" "$TMP/rules.d" "git status" --quiet 2>/dev/null); rc=$?
[[ "$out" == "allow" && $rc -eq 0 ]] && ok "态1 allow 判定+exit 0" || bad "态1: $out rc=$rc"

# 态2 prompt：推进态
out=$(bash "$SH" "$TMP/rules.d" "git push origin main" --quiet 2>/dev/null); rc=$?
[[ "$out" == "prompt" && $rc -eq 3 ]] && ok "态2 prompt 判定+exit 3" || bad "态2: $out rc=$rc"

# 态3 forbid：不可逆
out=$(bash "$SH" "$TMP/rules.d" "rm -rf /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态3 forbid 判定+exit 2" || bad "态3: $out rc=$rc"

# 态4 裸命令命中 " *" 规则（尾参可缺省）
out=$(bash "$SH" "$TMP/rules.d" "npm publish" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态4 尾 * 可缺省命中" || bad "态4: $out rc=$rc"

# 态4b R36-D9：3+ token pattern 的"尾 * 可缺省"（原实现只覆盖两 token，
# "docker compose down -v *" 对裸命令静默降级 prompt）
cat > "$TMP/rules.d/t4b.rules" <<'REOF'
docker compose down -v * → forbid # 会清库；替代：docker compose stop
REOF
out=$(bash "$SH" "$TMP/rules.d" "docker compose down -v" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态4b 3+token 裸命令命中" || bad "态4b: $out rc=$rc"
out=$(bash "$SH" "$TMP/rules.d" "docker compose down -v --remove-orphans" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态4b 3+token 带尾参命中" || bad "态4b 带参: $out rc=$rc"

# 态5 未命中 → prompt 兜底
out=$(bash "$SH" "$TMP/rules.d" "make build" --quiet 2>/dev/null); rc=$?
[[ "$out" == "prompt" && $rc -eq 3 ]] && ok "态5 未命中兜底 prompt" || bad "态5: $out rc=$rc"

# 态6 无规则文件 → prompt（fail-closed 到审批）
out=$(bash "$SH" "$TMP/empty-dir" "any cmd" --quiet 2>/dev/null); rc=$?
mkdir -p "$TMP/empty-dir"
out=$(bash "$SH" "$TMP/empty-dir" "any cmd" --quiet 2>/dev/null); rc=$?
[[ "$out" == "prompt" && $rc -eq 3 ]] && ok "态6 无规则=不静默放行" || bad "态6: $out rc=$rc"

# 态7 FORBID 消息含替代方案（stderr，给模型的 API）
err=$(bash "$SH" "$TMP/rules.d" "rm -rf x" 2>&1 1>/dev/null)
echo "$err" | grep -q 'FORBID' && echo "$err" | grep -q '替代' && ok "态7 FORBID 带替代方案" || bad "态7: $err"

# 态8 取最严：同命令 allow+forbid 双规则 → forbid
cat >> "$TMP/rules.d/test.rules" <<'REOF'
git status *      → forbid  # 冲突测试；替代：无
REOF
out=$(bash "$SH" "$TMP/rules.d" "git status" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态8 多规则取最严" || bad "态8: $out rc=$rc"

# 态9 默认规则集（仓库自带）冒烟
out=$(bash "$SH" assets/rules.d "sudo rm -rf /" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" ]] && ok "态9 默认规则集 forbid 冒烟" || bad "态9: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "git diff --stat" --quiet 2>/dev/null)
[[ "$out" == "allow" ]] && ok "态9 默认规则集 allow 冒烟" || bad "态9b: $out"

# ===== 态16-20d（R125）：复合命令与包装词不得把 forbid 藏到首词之外 =====
# 旧实现只对整条命令的首词/首两词求值：`git status && rm -rf /` 首词 allow 即整条放行。
out=$(bash "$SH" assets/rules.d "git status && rm -rf /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态16 && 复合命令第二段 forbid" || bad "态16: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "git status; npm publish" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态17 ; 复合命令第二段 forbid" || bad "态17: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "bash -c 'npm publish'" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态18 bash -c 内层命令求值" || bad "态18: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "env A=1 npm publish" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态19 env 赋值前缀归一" || bad "态19: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "/usr/bin/npm publish" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态20 命令绝对路径归一" || bad "态20: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "git status && git diff" --quiet 2>/dev/null); rc=$?
[[ "$out" == "allow" && $rc -eq 0 ]] && ok "态20b 只读复合命令仍 allow" || bad "态20b: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "echo 'a; rm -rf /'" --quiet 2>/dev/null); rc=$?
[[ "$out" == "prompt" ]] && ok "态20c 引号内分隔符不拆段" || bad "态20c: $out rc=$rc"
exp=$(bash "$SH" assets/rules.d "git status && npm publish" --explain 2>&1 >/dev/null)
printf '%s' "$exp" | grep -q 'segment=npm publish' && printf '%s' "$exp" | grep -q 'decision=forbid' \
  && ok "态20d --explain 回放命中段" || bad "态20d: $exp"

# ===== --persist 审批沉淀（impl-conformance 补齐，DESIGN §5.2）=====
_pdir="$TMP/persist-rules"; mkdir -p "$_pdir" "$TMP/proj"
# 态10 沉淀 allow 规则 + 决策落痕（trace-log 在 ../assets，生成器布局）
PROJECT_DIR="$TMP/proj" bash "$SH" "$_pdir" --persist "cargo test *" allow "本地测试放行" --goal g-test 2>/dev/null
rc=$?
[[ -f "$_pdir/approved.rules" ]] && grep -q 'cargo test \* → allow' "$_pdir/approved.rules" && [[ $rc -eq 0 ]] \
  && ok "态10 沉淀写入 approved.rules" || bad "态10 rc=$rc"
grep -q '"goal_id":"g-test"' "$TMP/proj/.swarm-yuan/decisions.jsonl" 2>/dev/null \
  && ok "态10b decisions.jsonl 落痕（含 goal_id）" || bad "态10b 决策未落痕"

# 态11 沉淀后判定生效（allow 放行）
out=$(bash "$SH" "$_pdir" "cargo test --all" --quiet 2>/dev/null)
[[ "$out" == "allow" ]] && ok "态11 沉淀规则即生效" || bad "态11: $out"

# 态12 幂等防线：同 pattern 重复沉淀拒绝
bash "$SH" "$_pdir" --persist "cargo test *" prompt "改判尝试" >/dev/null 2>&1; rc=$?
[[ $rc -eq 1 ]] && ok "态12 重复 pattern 拒绝" || bad "态12 rc=${rc}（应 1）"

# 态13 forbid 无替代拒绝（行格式纪律）
bash "$SH" "$_pdir" --persist "cargo clean" forbid "就是不让跑" >/dev/null 2>&1; rc=$?
[[ $rc -eq 1 ]] && ok "态13 forbid 无「替代：」拒绝" || bad "态13 rc=${rc}（应 1）"

# 态14 非法 verdict 拒绝
bash "$SH" "$_pdir" --persist "make *" maybe "非法值" >/dev/null 2>&1; rc=$?
[[ $rc -eq 1 ]] && ok "态14 非法 verdict 拒绝" || bad "态14 rc=${rc}（应 1）"

# 态15 forbid 带替代沉淀成功 + FORBID 消息带替代
bash "$SH" "$_pdir" --persist "cargo clean" forbid "删产物拖慢验证；替代：cargo clean -p <crate> 单包清理" >/dev/null 2>&1; rc=$?
[[ $rc -eq 0 ]] && ok "态15 forbid 带替代可沉淀" || bad "态15 rc=$rc"
err=$(bash "$SH" "$_pdir" "cargo clean" 2>&1 >/dev/null)
printf '%s' "$err" | grep -q '替代：cargo clean -p' && ok "态15b FORBID 消息带替代" || bad "态15b: $err"

# ===== 态21（R126）：拼写变体与大小写不得绕过 forbid =====
# 修复前：规则表只有字面 `rm -rf *`，rm -fr/-fR/--recursive/拆写变体与 RM 大写形态
# （APFS 大小写不敏感下真执行）全部落到 prompt/allow。
out=$(bash "$SH" assets/rules.d "rm -fr /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态21a rm -fr 换位变体 forbid" || bad "态21a: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "rm -f -r /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态21b rm -f -r 拆写变体 forbid" || bad "态21b: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "rm --recursive /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态21c rm --recursive 长选项 forbid" || bad "态21c: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "RM -RF /tmp/x" --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态21d RM -RF 大写形态 forbid（APFS 实执行面）" || bad "态21d: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "Git Push origin main" --quiet 2>/dev/null); rc=$?
[[ "$out" == "prompt" ]] && ok "态21e Git Push 大小写混合命中 prompt" || bad "态21e: $out rc=$rc"
# 态21f：规则表承诺面——变体行全部带 forbid+替代（防新增变体行丢约束）
_aviol=$(grep -E '^rm ' assets/rules.d/bash-advance.rules | grep -v '→ forbid' || true)
[[ -z "$_aviol" ]] && ok "态21f 全部 rm 变体行 forbid 语义一致" || bad "态21f 变体行语义漂移: $_aviol"

# ===== 态22（R126）：check_sast_deep codex rc=2 降级分支不再吞 semgrep/opengrep 失败 =====
# 修复前：rc=2 降级后 `$bin scan` 的 _rc 与空 json 不检查（检查只在末尾 else 分支），
# 工具失败 → ERROR=0 → 直通「深度 SAST 检查通过」（R118 同族洞残留）。
# WP6：check_sast_deep 物理位置随 enforce 聚合变化——以域源为真值，聚合文件兜底
_sast_src="assets/gates/security/sast-deep.sh"
if [[ ! -f "$_sast_src" ]]; then
  for _f in assets/gates-strict.sh assets/gates-warn.sh assets/gates-advisory.sh; do
    grep -q '^check_sast_deep() {' "$_f" 2>/dev/null && { _sast_src="$_f"; break; }
  done
fi
_sast_branch="$(awk '/elif \[\[ \$_cs_rc -eq 2 \]\]/,/elif \[\[ \$_cs_rc -eq 0 \]\]/' "$_sast_src")"
printf '%s' "$_sast_branch" | grep -q '_rc -ne 0 || -z "$json"' \
  && ok "态22 rc=2 降级分支带 rc/空输出检查" || bad "态22 rc=2 分支仍吞工具失败"
printf '%s' "$_sast_branch" | grep -q 'local json _rc=0' \
  && ok "态22 _rc/_e/_w 局部声明（不再泄漏全局）" || bad "态22 局部声明缺失"

# ===== 态23（R128）：命令替换体（$(…)/`…`）内的 forbid 不得被外层首词掩盖 =====
# 修复前：_split_segments 只按 ; | & 切段，`echo $(rm -rf x)` 整段首词 echo 无规则 → prompt。
out=$(bash "$SH" assets/rules.d 'echo $(rm -rf /tmp/x)' --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态23a \$(…) 替换体 forbid" || bad "态23a: $out rc=$rc"
out=$(bash "$SH" assets/rules.d 'echo `rm -rf /tmp/x`' --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态23b 反引号替换体 forbid" || bad "态23b: $out rc=$rc"
out=$(bash "$SH" assets/rules.d 'echo $(echo $(rm -rf x))' --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态23c 嵌套 \$(…) forbid" || bad "态23c: $out rc=$rc"
out=$(bash "$SH" assets/rules.d "echo '\$(rm -rf x)'" --quiet 2>/dev/null); rc=$?
[[ "$out" != "forbid" ]] && ok "态23d 单引号内不展开不误判（${out}）" || bad "态23d 单引号字面量误判 forbid"
out=$(bash "$SH" assets/rules.d 'echo "$(npm publish)"' --quiet 2>/dev/null); rc=$?
[[ "$out" == "forbid" && $rc -eq 2 ]] && ok "态23e 双引号内替换体仍执行→forbid" || bad "态23e: $out rc=$rc"
out=$(bash "$SH" assets/rules.d 'git status' --quiet 2>/dev/null); rc=$?
[[ "$out" == "allow" && $rc -eq 0 ]] && ok "态23f 无替换体的 allow 不受影响" || bad "态23f: $out rc=$rc"

[[ $FAIL -eq 0 ]] && { echo "PASS test-gate-rules"; exit 0; } || { echo "FAIL test-gate-rules" >&2; exit 1; }
