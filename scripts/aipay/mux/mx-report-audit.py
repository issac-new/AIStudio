#!/usr/bin/env python3
"""mx-report-audit.py — V4-run1 报告内容级审计（四查自动化）
用法：MX_RUN_ID=20260928-v4-run1 python3 mx-report-audit.py

四查（V3 实锤教训的程序化）：
1. 标题逐字：26 步标题与方案文档解析结果零差异（HTML 实体归一 + 同源 96 字截断）
2. 把关关键词：每步把关段含「把关」锚词
3. 每步图非零：已完成（✅）步缺图=FAIL；未完成（⬜）步缺图=WARN（闸门阻断轮的
   后续步本就无证据，不该误报）——报告自身状态标级联判定，不出假红
4. 截图自证：PNG 均非空、非同 md5（假重复检测）；报告引用但文件缺失=FAIL
5. 状态真实性：报告 ✅ 步与 state.env 落键一致（不出假绿）；闸门卡与 state 一致

选择器锚定生成器 mx-report-gen.py 的真实 DOM（2026-09-29 修复版）：
  步块=<article class="step"|"step gate-step">，步号=<span class="st-num">，
  标题=<div class="st-title"><h3>（可含 <span class="gmark"> 嵌套），
  状态=<span class="ok">✅</span>|<span class="no">⬜</span>，
  把关=<details class="st-gate">，缺图标记=<p class="no-evidence">。
（初版按设想结构写选择器，与生成器实际输出不匹配——标题抽取 0/26、步块误按
<section> 切成相位块。教训：审计器选择器必须照着生成器产物写，不许凭空假设。）
"""
import hashlib
import html
import os
import re
import sys
from pathlib import Path

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
RUN_ID = os.environ.get('MX_RUN_ID', '')
if '--run' in sys.argv:
    _i = sys.argv.index('--run')
    if _i + 1 >= len(sys.argv):
        sys.exit('[audit] --run 需要跟轮次 id（如 --run 20260929-v4-run2），不能是末参')
    RUN_ID = sys.argv[_i + 1]
if not RUN_ID:
    sys.exit('[audit] 必须 MX_RUN_ID=<id> 指定本轮')
EVID = SIM / 'runs' / RUN_ID / 'evidence'
REPORT = EVID / 'simulation-report.html'
PLAN = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')
STATE = SIM / 'runs' / RUN_ID / 'state.env'

fails, warns = [], []

# ── 方案解析（与生成器同源：首句、96 字截断） ──
plan_text = PLAN.read_text(encoding='utf-8')
plan_steps = {}
for m in re.finditer(r'^(\d{1,2})、(.+?)(?=^\d{1,2}、|^## |\Z)', plan_text, re.M | re.S):
    n = int(m.group(1))
    if n in plan_steps:
        continue
    block = m.group(2).strip()
    body_head = block.split('（把关')[0]
    first = re.sub(r'\s+', ' ', body_head).strip().split('。')[0]
    if len(first) > 96:
        first = first[:96] + '…'
    plan_steps[n] = first

if not REPORT.exists():
    sys.exit(f'[audit] 报告不存在：{REPORT}')
rep = REPORT.read_text(encoding='utf-8')

# ── 步块切分（真实 DOM：<article class="step…>） ──
blocks = re.split(r'<article class="step', rep)[1:]
blocks = [b for b in blocks if re.search(r'id="step\d+"', b[:200])]
if len(blocks) != 26:
    warns.append(f'步块数 {len(blocks)} ≠ 26（结构漂移？）')

def block_field(block, pat):
    m = re.search(pat, block, re.S)
    return m.group(1) if m else ''

# ── 查 1+2+3：标题逐字 + 把关锚词 + 状态级联缺图判定 ──
title_mismatch, gate_missing = [], []
done_no_img, pending_no_img = [], []
for blk in blocks:
    n_s = block_field(blk, r'<span class="st-num">(\d+)</span>')
    if not n_s:
        continue
    n = int(n_s)
    h3 = block_field(blk, r'<div class="st-title"><h3>(.*?)</h3>')
    # h3 内嵌 <span class="gmark">G1</span> 闸标——连内容一起剥除再剥标签+实体归一
    h3 = re.sub(r'<span class="gmark">.*?</span>', '', h3, flags=re.S)
    title = html.unescape(re.sub(r'<[^>]+>', '', h3)).strip()
    if n in plan_steps and title != plan_steps[n]:
        title_mismatch.append(n)
    if 'st-gate' not in blk or '把关' not in blk:
        gate_missing.append(n)
    done = '<span class="ok">✅</span>' in blk
    shots = block_field(blk, r'<div class="st-shots">(.*?)</div>\s*</article>')
    has_img = '<img' in shots
    if not has_img:
        (done_no_img if done else pending_no_img).append(n)

if title_mismatch:
    fails.append(f'标题与方案不逐字（步骤）：{title_mismatch}')
if gate_missing:
    fails.append(f'把关段缺失/无锚词（步骤）：{gate_missing}')
if done_no_img:
    fails.append(f'已完成步缺图：{done_no_img}')
if pending_no_img:
    warns.append(f'未完成步缺图（预期内，不阻断）：{pending_no_img}')

# ── 查 4：PNG 真实性（非空 + md5 唯一） ──
steps_dir = EVID / 'screenshots' / 'steps'
pngs = list(steps_dir.glob('*.png')) if steps_dir.exists() else []
md5 = {}
for p in pngs:
    h = hashlib.md5(p.read_bytes()).hexdigest()
    md5.setdefault(h, []).append(p.name)
    if p.stat().st_size < 10240:
        fails.append(f'疑似空图（<10KB）：{p.name}')
dups = {h: names for h, names in md5.items() if len(names) > 1}
if dups:
    fails.append(f'md5 假重复：{list(dups.values())}')

# 报告引用但文件缺失的图
missing = [m.group(1) for m in re.finditer(r'src="screenshots/steps/([^"]+)"', rep)
           if not (steps_dir / m.group(1)).exists()]
if missing:
    fails.append(f'报告引用但缺文件：{sorted(set(missing))[:6]}')

# ── 查 5：状态真实（报告 ✅/闸门卡 与 state 落键一致） ──
state_keys = {}
for line in STATE.read_text().splitlines():
    if '=' in line and not line.startswith('jwt_'):
        k, v = line.split('=', 1)
        state_keys[k.strip()] = v.strip()
GATE_KEYS = {'G1': 'g1_frozen', 'G2': 'g2_arch_pass', 'G3': 'devimpl_done',
             'G4': 'g4_pass', 'G5': 'g5_ready', 'G6': 'retro_done'}
for g, k in GATE_KEYS.items():
    in_state = bool(state_keys.get(k))
    # 报告闸门卡状态：passed 显示"✓ 已通过"
    m = re.search(rf'{g}</div>\s*<div class="gate-state">([^<]+)', rep)
    rep_state = m.group(1) if m else ''
    rep_pass = '已通过' in rep_state
    # 声明式判回滚（独立审计判词，如 run2 G5/R-A1）：state 落键保留原值（执行流水
    # 不改写），判定以报告+处置表为准——此类 state≠report 是声明更正，降 WARN 不 FAIL。
    if '判回滚' in rep_state:
        if rep_pass:
            fails.append(f'{g} 判回滚卡不得显示已通过')
        else:
            warns.append(f'{g} 声明判回滚（state 落键保留原值为执行流水，判定以报告/处置表为准）')
        continue
    if in_state != rep_pass:
        fails.append(f'{g} 状态不一致：state={in_state} report={rep_pass}（报告疑为闸前旧生成，须重生成）')

# ── 查 6：V5 §8.3 硬性要求断言（R3-R9；R1 判词语义/R2 落键由 harness H8-H11 与查 5 覆盖） ──
# R3 UAT 逐条判词：报告含"全部 AC 通过"总括且同文出现"有条件"=判词矛盾
if re.search(r'全部\s*AC\s*通过', rep) and '有条件' in rep:
    fails.append('R3 UAT 判词矛盾：同文出现"全部 AC 通过"与"有条件"——须逐条判词，禁总括')

# R4 发布基线守卫：合入只许快进或 merge 增量（检出即 FAIL，守卫属 harness H11 执行侧）
_main_repo = Path('/Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev/.git')
if _main_repo.exists():
    import subprocess
    _heads = subprocess.run(['git', '--git-dir', str(_main_repo), 'for-each-ref',
                             '--format=%(refname:short) %(objectname:short)'], capture_output=True, text=True)
    _m = re.search(r'main\s+([0-9a-f]+)', _heads.stdout)
    if _m and state_keys.get('baseline_sha') and state_keys['baseline_sha'] != _m.group(1):
        _old = state_keys['baseline_sha']
        _ff = subprocess.run(['git', '--git-dir', str(_main_repo), 'merge-base', '--is-ancestor', _old, _m.group(1)],
                             capture_output=True)
        if _ff.returncode != 0:
            fails.append(f'R4 发布基线非快进重建：{_old[:8]}→{_m.group(1)[:8]}（丢线事故，须回补重验）')

# R5 问题单 100% DISP：issues.log 中 ISSUE 唯一键全有 DISP
_ilog = EVID / 'issues.log'
if _ilog.exists():
    _iss, _disp = [], set()
    for _l in _ilog.read_text().splitlines():
        if _l.startswith('ISSUE|'):
            _p = _l.split('|', 3)
            if f'{_p[1]}·{_p[2]}' not in _iss:
                _iss.append(f'{_p[1]}·{_p[2]}')
        elif _l.startswith('DISP|'):
            _p = _l.split('|', 3)
            _disp.add(f'{_p[1]}·{_p[2]}')
    _open = [k for k in _iss if k not in _disp]
    if _open:
        fails.append(f'R5 问题单缺 DISP（{len(_open)}/{len(_iss)} 待处置）：{_open[:6]}——违反第 24 步合格线')

# R6 证据锚点密度：每个已完成步块至少 1 个可反查锚点（event_id $xxx / 短 hash / t_ 卡号）
_anchor_pat = re.compile(r'\$[A-Za-z0-9_-]{25,}|\bt_[0-9a-f]{8}\b|\b[0-9a-f]{7,10}\b')
_done_blocks = [b for b in blocks if '✅' in b]
_no_anchor = []
for i, b in enumerate(blocks, 1):
    if '✅' in b and not _anchor_pat.search(b):
        _m2 = re.search(r'<span class="st-num">(\d+)</span>', b)
        _no_anchor.append(_m2.group(1) if _m2 else str(i))
if _no_anchor:
    warns.append(f'R6 完成步缺可反查锚点（event_id/commit/t_ 卡号）：步 {_no_anchor}')

# R7 截图红线：完成步图须真实产品 UI——ui 类图占比抽查（doc/msg 类为工件允许）
# （图面真实性以人工视觉审计为准，本断言只查"完成步全为 doc/msg 无一张界面实拍"的极端退化）
_ui_cnt = sum(1 for b in _done_blocks if '界面实拍' in b)
if _done_blocks and _ui_cnt == 0:
    warns.append('R7 完成步无一帧"界面实拍"角标——疑文档/CLI 凑数，须人工视觉复核')

# R8 数字实算：报告内计数类字样与 issues.log 一致（问题单唯一键数）
if _ilog.exists() and '问题单终态' in rep:
    _uniq = len(set(_iss))
    _m3 = re.search(rf'唯一键\s*(\d+)', rep)
    if _m3 and int(_m3.group(1)) != _uniq:
        fails.append(f'R8 问题单计数不实：报告唯一键 {_m3.group(1)} ≠ issues.log 实算 {_uniq}')

# R9 报告步自证：第 26 步须 ✅（生成器对本步恒真）且带生成产物锚点
_b26 = next((b for b in blocks if '<span class="st-num">26</span>' in b), '')
if _b26:
    if '<span class="no">⬜</span>' in _b26:
        fails.append('R9 报告步自证悖论：第 26 步状态标 ⬜——产物存在即应 ✅（叙事文本中的 ⬜ 字样不算状态）')
    if 'simulation-report.html' not in _b26:
        warns.append('R9 第 26 步未挂 simulation-report.html 产物锚点')
else:
    warns.append('R9 未定位第 26 步块（结构漂移？）')

# ── 查 7：V5 补遗⑥ R15/R16 断言（R16 旅程版逐步操作入口；R15 统一版第 0 章协作总述）──
_entry_hit = sum(1 for b in blocks if 'class="st-entry"' in b)
if blocks and _entry_hit == len(blocks):
    pass
elif _entry_hit > 0:
    fails.append(f'R16 操作入口缺失：{_entry_hit}/{len(blocks)} 步块含入口行——26 步须全量可复现路径')
else:
    fails.append('R16 操作入口零呈现：报告无任何 st-entry 步块（补遗⑥ R16 验收线）')

_uni = EVID / 'unified-roadshow-report.html'
if _uni.exists():
    _u = _uni.read_text(encoding='utf-8')
    if 'id="ch0-collab"' not in _u:
        fails.append('R15 统一版缺第 0 章「推演逻辑与协作顺序总述」（id=ch0-collab 未检出）')
    elif 'scenario.log 实抽' not in _u:
        warns.append('R15 第 0 章在位但协作时序线标记缺失（scenario.log 实抽注记）')
    if '研发全流程治理有效性' not in _u:
        warns.append('统一版缺「研发全流程治理有效性」实算节（补遗⑥）')
else:
    warns.append('统一版 unified-roadshow-report.html 未生成——R15 断言待其生成后复跑审计')

# ── 汇总 ──
print(f'报告：{REPORT}')
print(f'步块：{len(blocks)}；图：{len(pngs)} 张 PNG，唯一 md5 {len(md5)} 组')
print(f'标题逐字：{26 - len(title_mismatch)}/{len(plan_steps)}；缺图：✅步 {done_no_img or "无"}，⬜步 {pending_no_img or "无"}')
for w in warns:
    print('WARN', w)
if fails:
    print('\n== FAIL ==')
    for f in fails:
        print('-', f)
    sys.exit(1)
print('\n四查全过：标题逐字·把关齐·完成步图齐·无假重复·引用无缺·闸门状态与 state 一致')
