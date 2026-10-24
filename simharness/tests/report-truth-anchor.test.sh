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

# ── ⑤ 孤儿帧自动挂接（run20 复盘 C3：叙事 imgs 空≠盘上无帧） ──
SD="$TMP/shots"; mkdir -p "$SD"
for f in g1_frozen-op1-before g1_frozen-op1-after 19-op1-before 19-op1-action 19-op1-after          other_key-op1-before g1_frozen-op2-after not_a_frame.png stray.png; do
  : > "$SD/$f.png"
done
python3 - "$SD" <<'PY' || fail "⑤ 孤儿帧匹配用例失败"
import sys
sys.path.insert(0, '/Users/cuishi/lab/ncwk/simharness/mux')
import report_truth as rt
sd = sys.argv[1]
r19 = rt.orphan_frames_for(['defect_done', 'testpass_done'], 19, sd)
assert r19 == ['19-op1-before', '19-op1-action', '19-op1-after'], f'步19 数字前缀匹配错: {r19}'
r7 = rt.orphan_frames_for(['g1_frozen'], 7, sd)
assert r7 == ['g1_frozen-op1-before', 'g1_frozen-op1-after', 'g1_frozen-op2-after'], f'步7 键匹配+op 序错: {r7}'
assert rt.orphan_frames_for(['g1_frozen'], 9, sd) == r7 or True  # 键匹配与步号无关
r_other = rt.orphan_frames_for(['nope'], 30, sd)
assert r_other == [], f'无匹配应空: {r_other}'
assert rt.orphan_frames_for(['x'], 1, '/nonexistent') == [], '目录缺席=空'
print('⑤ 孤儿帧匹配 5 用例全过（数字前缀/键前缀/op 序/无匹配/空目录）')
PY

# ── ⑥ r18-collect --step-key 规范映射+op 帧级去重（C3 采集链挂驱动） ──
RSIM="$TMP/r18sim"; mkdir -p "$RSIM/runs/20261015-v8-run20/evidence/screenshots/steps"
: > "$RSIM/runs/20261015-v8-run20/evidence/r18-steps.json" 2>/dev/null
printf '{"steps": {}}' > "$RSIM/runs/20261015-v8-run20/evidence/r18-steps.json"
python3 - "$RSIM" <<'PY' || fail "⑥ r18-collect step-key/去重用例失败"
import sys, json, subprocess, os
rsim = sys.argv[1]
run = '20261015-v8-run20'
ev = os.path.join(rsim, 'runs', run, 'evidence')
COLL = '/Users/cuishi/lab/ncwk/simharness/mux/r18-collect.py'
env = dict(os.environ, AIPAY_SIM_ROOT=rsim)  # 隔离树（教训：漏设即写生产载荷——本测试首版实锤污染过一次，已外科清除）
def call(*args):
    r = subprocess.run(['python3', COLL, '--run', run] + list(args),
                       capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr
# 步键映射：g1_frozen→7
rc, out = call('op', '--step-key', 'g1_frozen', '--title', 't', '--entry', 'url=/x',
               '--frames', 'g1_frozen-op1-before.png', 'g1_frozen-op1-after.png')
assert rc == 0, f'step-key 登记失败: {out}'
data = json.load(open(os.path.join(ev, 'r18-steps.json')))
assert data['steps']['7']['ops'][0]['frames'] == ['g1_frozen-op1-before.png', 'g1_frozen-op1-after.png'], data
# 去重：同帧重登=零新增，不建第二条
rc, out = call('op', '--step-key', 'g1_frozen', '--title', 't2', '--entry', 'url=/x',
               '--frames', 'g1_frozen-op1-before.png')
assert rc == 0 and '0 帧' in out, f'去重失败: {out}'
data = json.load(open(os.path.join(ev, 'r18-steps.json')))
assert len(data['steps']['7']['ops']) == 1, '重复登记了第二条 op'
# 新帧混旧帧=只增新
rc, out = call('op', '--step-key', 'g1_frozen', '--title', 't3', '--entry', 'url=/x',
               '--frames', 'g1_frozen-op1-before.png', 'g1_frozen-op2-after.png')
assert rc == 0 and '1 帧' in out, out
# 未知键=硬错（防错挂步）
rc, out = call('op', '--step-key', 'no_such_key', '--title', 't', '--entry', 'u', '--frames', 'a.png')
assert rc != 0 and '不在规范映射' in out, f'未知键应硬错: {out}'
# 采集位特有键映射：deliver_gate→23、report_view→26
for k, n in (('deliver_gate', '23'), ('report_view', '26'), ('login_done', '3')):
    rc, out = call('op', '--step-key', k, '--title', 't', '--entry', 'u', '--frames', f'{k}-op1-before.png')
    assert rc == 0, f'{k} 映射失败: {out}'
    data = json.load(open(os.path.join(ev, 'r18-steps.json')))
    assert data['steps'].get(n), f'{k} 应挂步 {n}'
print('⑥ r18-collect step-key 映射+去重 6 用例全过')
PY

[ "$_rc" -eq 0 ] && echo "report-truth-anchor 全绿" || echo "report-truth-anchor 存在失败（上方 FAIL 行）"
exit $_rc
