#!/bin/bash
# run30-burn-verify.test.sh — 凭证核验健壮性批守门（2026-11-13，burn-20261113 虚报误判实录根治）
# 覆盖：①文件在树判定去管道化（git 路径过滤，无 | grep -q 语义面）；
#       ②stderr 留证（git 层报错不再被吞）；③连续同因失败双通道交叉验证
#       （矛盾=核验通道异常，暂停虚报判词）；④回灌文案动态化（携带真实失败形态）。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$HERE/mux/mx-scenario-lib.sh"
DRV="$HERE/aipay-scenario.sh"
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=1; }

# ── ①主判定去管道化：精确路径 ls-tree（字面 pathspec，无 | grep -q 主判定）──
VFN="$(sed -n '/^verify_done_evidence()/,/^}/p' "$LIB")"
[[ -n "$VFN" ]] || { echo "FAIL 提取 verify_done_evidence 失败"; exit 1; }
grep -q 'ls-tree "$sha" -- "docs/analysis/${rfd}-tasklist.md"' "$LIB" \
  && ok "①精确路径 ls-tree 主判定在位" \
  || bad "①精确路径 ls-tree 形态缺失"
MAIN_LINE="$(printf '%s' "$VFN" | grep '_ve_ls=$(git -C "$DIRECTOR_CLONE" ls-tree')"
if printf '%s' "$MAIN_LINE" | grep -qE '\|[[:space:]]*grep'; then
  bad "①主判定行残留 grep 管道"
else
  ok "①主判定行无 grep 管道（宽匹配仅交叉通道）"
fi

# ── ②stderr 留证：git 调用失败分支带原始报错（2>&1 捕获 + 截断回显）──
grep -q '_ve_err=$(git -C "$DIRECTOR_CLONE" cat-file -e "$sha^{commit}" 2>&1)' "$LIB" \
  && ok "②commit 存在核 stderr 捕获在位" || bad "②commit 存在核 stderr 仍被吞"
grep -q '_ve_ls=$(git -C "$DIRECTOR_CLONE" ls-tree "$sha"' "$LIB" \
  && ok "②主判定 stderr 捕获在位" || bad "②主判定 stderr 仍被吞"
grep -qE '\$\{_ve_(err|ls):0:200\}' "$LIB" \
  && ok "②git 报错截 200 字符回显 note" || bad "②留证无截断回显"

# ── ③双通道交叉验证：连续 ≥5 次缺席启用 ls-tree 宽匹配；矛盾=通道异常不定罪 ──
grep -q '_vf_fail_cnt" -ge 5' "$LIB" && ok "③连续 5 次阈值在位" || bad "③阈值缺"
grep -q 'ls-tree -r --name-only "$sha" 2>/dev/null | grep -q "${rfd}-tasklist.md"' "$LIB" \
  && ok "③第二通道 ls-tree 宽匹配在位" || bad "③第二通道缺"
grep -q 'verify-channel-inconsistent' "$LIB" \
  && ok "③矛盾记 issue（verify-channel-inconsistent）" || bad "③矛盾不落 issue"
grep -q '暂不定罪虚报' "$LIB" && ok "③矛盾时暂停虚报判词" || bad "③矛盾仍定罪"
# git 报错分流：fatal/error 前缀不进虚报判词
grep -q '"\$_ve_ls" == fatal:\|"\$_ve_ls" == error:' "$LIB" \
  && ok "③git 报错分流（fatal/error 前缀）" || bad "③git 报错未分流"

# ── ④回灌文案动态化 ──
grep -q '_vf_last_fail' "$DRV" \
  && ok "④回灌文案携带 _vf_last_fail 真实失败形态" || bad "④回灌仍是固定文案"
grep -q '凭证核验未通过，失败原因' "$DRV" \
  && ok "④回灌句式含失败原因行" || bad "④失败原因句式缺"

# ── 行为验证：精确路径 ls-tree 三分支语义（真 git 夹具，不 source 全函数）──
T="$(mktemp -d)"
git -C "$T" init -q -b main
git -C "$T" -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
mkdir -p "$T/docs/analysis" && echo x > "$T/docs/analysis/RFD-001-tasklist.md"
git -C "$T" add -A && git -C "$T" -c user.email=t@t -c user.name=t commit -q -m tasklist
SHA=$(git -C "$T" rev-parse HEAD)
OUT=$(git -C "$T" ls-tree "$SHA" -- docs/analysis/RFD-001-tasklist.md 2>&1)
[[ "$OUT" == *RFD-001-tasklist.md* ]] \
  && ok "行为：命中分支（输出含路径行）" || bad "行为：命中分支失效=$OUT"
OUT=$(git -C "$T" ls-tree "$SHA" -- docs/analysis/RFD-999-tasklist.md 2>&1)
[[ -z "$OUT" ]] \
  && ok "行为：真缺席分支（空输出且非 fatal——不会误分流为通道异常）" \
  || bad "行为：缺席分支形态异常（误分流风险）=$OUT"
ERR=$(git -C "$T" ls-tree "0deadbeef" -- docs/analysis/RFD-001-tasklist.md 2>&1 || true)
[[ "$ERR" == fatal:* ]] \
  && ok "行为：通道报错分支（fatal 前缀可分流）" || bad "行为：报错分支形态=$ERR"
# 交叉第二通道语义：全树宽匹配对放错位置产物仍可命中（通道差异可检测）
mkdir -p "$T/other" && echo y > "$T/other/RFD-002-tasklist.md"
git -C "$T" add -A && git -C "$T" -c user.email=t@t -c user.name=t commit -q -m misplaced
SHA2=$(git -C "$T" rev-parse HEAD)
if git -C "$T" ls-tree -r --name-only "$SHA2" 2>/dev/null | grep -q "RFD-002-tasklist.md"; then
  ok "行为：交叉通道宽匹配命中放错位置产物"
else
  bad "行为：交叉通道宽匹配失效"
fi

# ── bash 语法 ──
bash -n "$LIB" && ok "bash -n mx-scenario-lib.sh" || bad "mx-scenario-lib.sh 语法错"
bash -n "$DRV" && ok "bash -n aipay-scenario.sh" || bad "aipay-scenario.sh 语法错"


# ── ⑤烧机收据第三态 burn-waived（2026-11-13 根治批：外部归因豁免产品化）──
MR="$HERE/mux/mx-mechanism-receipt.py"
grep -q "add_parser('waive')" "$MR" && ok "⑤waive 子命令在位" || bad "⑤waive 子命令缺"
grep -q "WAIVER_TTL_S" "$MR" && grep -q "24 \* 3600" "$MR" && ok "⑤24h 新鲜窗在位" || bad "⑤豁免 TTL 缺"
grep -q "fail_lines=" "$MR" && grep -q "re.search" "$MR" && ok "⑤fail_lines 判据从 reasons 解析" || bad "⑤fail_lines 判据形态错"
grep -q "从未烧机不可豁免" "$MR" && ok "⑤从未烧机无豁免权（fail-closed）" || bad "⑤无收据豁免缺口"
grep -q "多重失败先修复再烧" "$MR" && ok "⑤多重失败不豁免" || bad "⑤多重失败豁免口子"
grep -q "verify-latest WAIVED" "$MR" && ok "⑤verify-latest 认豁免（第三态输出）" || bad "⑤第三态输出缺"
python3 -I -m py_compile "$MR" && ok "⑤py_compile mx-mechanism-receipt.py" || bad "⑤receipt 工具语法错"


# ── ⑥熔断催办指数退避（2026-11-14 run30 慢点根治：固定 300s 对冷态 agent 纯轰炸）──
SUP="$HERE/mux/run-driver-supervisor.sh"
grep -q '_nudge_next=$_WM; _nudge_gap=$_NG; _nudges=0' "$SUP" && ok "⑥退避状态初始化在位（首催准点）" || bad "⑥退避状态缺"
grep -q '_nudge_gap=\$(( _nudge_gap \* 2 ))' "$SUP" && ok "⑥间隔翻倍在位" || bad "⑥翻倍缺"
grep -q '_nudge_gap > 1800' "$SUP" && ok "⑥1800s 封顶在位" || bad "⑥封顶缺"
grep -q '_nudges == 10' "$SUP" && ok "⑥10 次升级语义保留" || bad "⑥升级语义漂移"
grep -q '累计 \${_wd}s' "$SUP" && ok "⑥升级记单累计秒数（修 _nudges×_NG 失真）" || bad "⑥记单时间式旧"
if grep -q '(_wd - _WM) % _NG == 0' "$SUP"; then bad "⑥旧固定间隔判定残留"; else ok "⑥旧固定间隔判定清除"; fi

[ "$fails" = 0 ] && echo "ALL-PASS" || { echo "HAS-FAIL"; exit 1; }
