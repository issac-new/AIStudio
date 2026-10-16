#!/bin/bash
# report-truth-anchor.test.sh — 报告真值三件套守门（run20 复盘 fix/run20-report-truth-trio）
# 四路守门：
#   ① stale 判定（往轮产物）：run16/run14 稿判陈旧、run20 稿不判、无声明位不判、
#      同句「上轮…RUN=」前缀不判（防 AN-PAYCORE §0 历史轮处置声明误报）；
#   ② 锚点活性：本地裸仓 fixture——分支在=活、分支无=死、查询异常 fail-open；
#   ③ ERR trap 摘除：等待环谓词假零「驱动异常退出」噪音（run20 实录 2138 条假警报）；
#   ④ 闸证 provenance：分支 testlog 头轮次提取（存在性≠本轮产物——run20 实锤
#      DEV-PAYCORE-C/N 为 run19/run16 证据仍计「6/6 在案」）。
# 判据源=mux/report_truth.py（生成器/审计器/驱动三处共用，禁两套正则）。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$HERE/mux/mx-scenario-lib.sh"
TMP="$(mktemp -d /tmp/report-truth-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
_rc=0
fail() { echo "FAIL: $*"; _rc=1; }

# ── ① stale 判定（纯函数，真实语料形状） ──
python3 - "$TMP" <<'PY' || fail "① stale 判定用例失败"
import sys
sys.path.insert(0, __import__('os').environ.get('HARNESS_MUX', '.') or '.')
sys.path.insert(0, '/Users/cuishi/lab/ncwk/simharness/mux')
import report_truth as rt

RUN = '20261015-v8-run20'
cases = [
    # (名, 文本, 期望 stale)
    ('run16 系分稿（真实形状）', '# AN-PAYCORE 系统分析稿\n\n- 轮次：RUN=20261012-v8-run16（本轮从零复核重立）\n- 执行人：chen\n', True),
    ('run14 系分稿（表格形状）', '# AN-MP 系统分析\n\n| 项目 | 内容 |\n|---|---|\n| 轮次 | RUN=20261010-v8-run14（从零重新执行）；v1.1 为 run15 增量刷新 |\n', True),
    ('run20 系分稿', '# AN-CHWX\n\n- 派发标识：RUN=20261015-v8-run20\n- 责任人：hu\n', False),
    ('无声明位（注册表类）', '# roster\n\n| 账号 | 角色 |\n|---|---|\n| @bella | BA |\n', False),
    ('上轮前缀提及不误判', '# 复盘稿\n\n- 上轮对照：RUN=20261013-v8-run19 首过率 5/6\n- 轮次：RUN=20261015-v8-run20\n', False),
    ('历史轮处置声明段不误判', '# AN-PAYCORE\n\n- 轮次：RUN=20261015-v8-run20\n\n## 0. 历史轮处置声明\norigin/main 已存在前轮（run15）同名稿（RUN=20261011-v8-run15）。\n', False),
    ('头部窗口外不提（正文中段）', '# 稿\n\n- 轮次：RUN=20261015-v8-run20\n\n## 3. 参照\n详见 RUN=20261012-v8-run16 的处置。\n', False),
]
bad = []
for name, text, want in cases:
    got, declared = rt.stale_verdict(text, RUN)
    if got != want:
        bad.append(f'{name}: want stale={want} got={got} (declared={declared!r})')
# run_id 空=不判（旧轮兼容）
if rt.stale_verdict('- 轮次：RUN=20261012-v8-run16\n', '')[0]:
    bad.append('run_id 空应不判')
if bad:
    print('\n'.join(bad)); sys.exit(1)
print('① stale 判定 7 用例全过')
PY

# ── ② 锚点活性（本地裸仓 fixture，无网络） ──
BARE="$TMP/bare.git"; git init -q --bare "$BARE"
WT="$TMP/wt"; git init -q "$WT"
git -C "$WT" config user.email t@t; git -C "$WT" config user.name t
echo x > "$TMP/wt/f"; git -C "$WT" add f; git -C "$WT" commit -qm init
git -C "$WT" branch -M main
git -C "$WT" remote add origin "$BARE"; git -C "$WT" push -q origin main
# anchor_alive 按 origin 名 ls-remote——被测仓须是配了 origin 的 clone（生成器传
# 中央仓 .git 即此形态）；裸仓自身无 origin remote 名，直接测会恒真。
CLONE="$TMP/clone"; git clone -q "$BARE" "$CLONE" 2>/dev/null
python3 - "$BARE" <<'PY' || fail "② 锚点活性用例失败"
import sys
sys.path.insert(0, '/Users/cuishi/lab/ncwk/simharness/mux')
import report_truth as rt
bare = sys.argv[1]
import os
clone = os.path.join(os.path.dirname(bare.rstrip("/")), "clone", ".git")
assert rt.anchor_alive(clone, 'main') is True, '分支在=活'
assert rt.anchor_alive(clone, 'integration/RFD-001') is False, '分支无=死'
assert rt.anchor_alive(bare, '') is True, '空分支名=不判'
assert rt.anchor_alive('/nonexistent/repo.git', 'main') is True, '查询异常 fail-open'
print('② 锚点活性 4 用例全过')
PY

# ── ③ ERR trap 摘除（等待环谓词假零噪音） ──
# 沙箱供给 lib 依赖链（mx-lib.sh 以 AIPAY_SIM_ROOT 定锚 HERMES_ROOT；缺链 source
# 半途死=函数未定义，旧版测试会空转假过——helper 未定义显式记败）。
mkdir -p "$TMP/evid" "$TMP/sim/hermes"; : > "$TMP/state.env"
ERRLOG="$TMP/err.log"; SRCLOG="$TMP/src.err"
bash -c '
set -eE
trap "echo \"[ERR] 驱动异常退出 rc=\$?\" >> '"$ERRLOG"'" ERR
export AIPAY_SIM_ROOT="'"$TMP"'/sim" EVID_DIR="'"$TMP"'/evid" STATE="'"$TMP"'/state.env" SCRIPT_DIR="'"$HERE"'"
source "'"$HERE"'/mux/mx-lib.sh" >/dev/null 2>&1
source "'"$LIB"'" >/dev/null 2>'"$SRCLOG"'
type mx_wait_eval >/dev/null 2>&1 || { echo "helper 未定义（lib source 失败）" >> '"$ERRLOG"'; exit 9; }
mx_wait_eval false || true
mx_wait_eval true || true
echo done
' >/dev/null 2>&1
if [ -s "$ERRLOG" ]; then
  fail "③ 等待环谓词假仍触发 ERR 噪音：$(cat "$ERRLOG")"
elif ! grep -q "helper" "$SRCLOG" 2>/dev/null; then
  echo "③ ERR trap 摘除：谓词假零噪音过（helper 定义实证）"
else
  fail "③ lib source 异常：$(tail -2 "$SRCLOG")"
fi
# 对照：裸谓词（无 helper）在同等 trap 下应仍能触发（证明测试有区分度）
ERRLOG2="$TMP/err2.log"
bash -c '
set -eE
trap "echo ERR >> '"$ERRLOG2"'" ERR
if false >/dev/null 2>&1; then :; fi
echo done
' >/dev/null 2>&1
[ -s "$ERRLOG2" ] && fail "③ 对照组异常：if 保护语境竟未触发（bash 行为已变，helper 仍需保留但测试区分度失效——复查）" || true

# ── ④ 闸证 provenance（fixture 中央仓：陈旧/新鲜两 testlog） ──
FC="$TMP/sim/central/aipaydev"   # lib 约定位（DIRECTOR_CLONE=$SIM_ROOT/central/aipaydev）
mkdir -p "$FC"
git init -q "$FC"; git -C "$FC" config user.email t@t; git -C "$FC" config user.name t
mkdir -p "$FC/docs/evidence"
printf 'DEV-PAYCORE-C testlog（G3 补证，RUN=20261013-v8-run19）\n Tests 60 passed\n' > "$FC/docs/evidence/DEV-PAYCORE-C-testlog.txt"
printf 'DEV-CHWX testlog\nRUN=20261015-v8-run20 BRANCH=feat/DEV-CHWX COMMIT=9df3153\n Tests 37 passed\n' > "$FC/docs/evidence/DEV-CHWX-testlog.txt"
git -C "$FC" add -A && git -C "$FC" commit -qm seed && git -C "$FC" branch -M main
BARE2="$TMP/fake-origin.git"; git init -q --bare "$BARE2"
git -C "$FC" remote add origin "$BARE2"; git -C "$FC" push -q origin main
bash -c '
  export AIPAY_SIM_ROOT="'"$TMP"'/sim" EVID_DIR="'"$TMP"'/evid" STATE="'"$TMP"'/state.env" SCRIPT_DIR="'"$HERE"'"
  source "'"$HERE"'/mux/mx-lib.sh" >/dev/null 2>&1
  source "'"$LIB"'" >/dev/null 2>&1
  r1="$(repo_branch_runtag main docs/evidence/DEV-PAYCORE-C-testlog.txt)"
  r2="$(repo_branch_runtag main docs/evidence/DEV-CHWX-testlog.txt)"
  [ "$r1" = "20261013-v8-run19" ] || { echo "陈旧 testlog 头轮次提取错: [$r1]"; exit 1; }
  [ "$r2" = "20261015-v8-run20" ] || { echo "新鲜 testlog 头轮次提取错: [$r2]"; exit 1; }
  echo "④ 闸证 provenance：陈旧/新鲜两态提取正确"
' || fail "④ repo_branch_runtag 提取失败"

[ "$_rc" -eq 0 ] && echo "report-truth-anchor 全绿" || echo "report-truth-anchor 存在失败（上方 FAIL 行）"
exit $_rc
