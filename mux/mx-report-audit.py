#!/usr/bin/env python3
"""mx-report-audit.py — V4-run1 报告内容级审计（四查自动化）
用法：MX_RUN_ID=20260928-v4-run1 python3 mx-report-audit.py

四查（V3 实锤教训的程序化）：
1. 标题逐字：26 步标题与方案文档解析结果零差异（HTML 实体归一 + 同源 96 字截断）
2. 把关关键词：每步把关段含「把关」锚词
3. 每步图非零：已完成（✅）步缺图=FAIL；未完成（⬜）步缺图=WARN（闸门阻断轮的
   后续步本就无证据，不该误报）——报告自身状态标级联判定，不出假红
4. 截图自证：PNG 均非空、非同 md5（假重复检测）；报告引用但文件缺失=FAIL
5. 状态真实性：报告 ✅ 步与 state.env 落盘一致（不出假绿）；闸门卡与 state 一致

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
import json
import os
import tempfile
import re
import sys
from pathlib import Path

from r18_matrix import DIALOG_STEPS, DELIVERY_STEPS, EFFECT_STEPS, OP_STEPS, SKILL_STEPS, step_ok, product_outcome_status  # 必采证据表单一事实源（与生成器 hero 统计同表）

SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))
RUN_ID = os.environ.get('MX_RUN_ID', '')
if '--run' in sys.argv:
    _i = sys.argv.index('--run')
    if _i + 1 >= len(sys.argv):
        sys.exit('[audit] --run 需要跟轮次 id（如 --run 20260929-v4-run2），不能是末参')
    RUN_ID = sys.argv[_i + 1]
if not RUN_ID:
    sys.exit('[audit] 必须 MX_RUN_ID=<id> 指定本轮')
# 隔离树回归支持（与 mx-report-gen.py 同源口径——AIPAY_SIM_ROOT 可覆盖；写死路径
# 使夹具树/归档态无法离线审计，run7 实锤同款教训）。
SIM = Path(os.environ.get('AIPAY_SIM_ROOT', str(SIM)))
EVID = SIM / 'runs' / RUN_ID / 'evidence'
REPORT = EVID / 'simulation-report.html'
R18F = EVID / 'r18-steps.json'
# 验收线（正本 §5.5 反凑数·方案解析源单一）：方案解析源与生成器同链（MX_PLAN_PATH 覆盖 → 主工作树 V8 → NVMe 镜像兜底），
# 勿再硬编码旧版路径——正本与审计源分叉即验收缺陷（V3 分叉实录见结构排查 §二.1）。
_plan_candidates = [
    os.environ.get('MX_PLAN_PATH', ''),
    '/Users/cuishi/lab/ncwk/overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md',
    os.environ.get('MX_OVERLAY_ROOT', '/Volumes/nvme2230/lab/ncwk/overlay')+'/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md',
]
PLAN = next((Path(p) for p in _plan_candidates if p and Path(p).exists()),
            Path(_plan_candidates[1]))
STATE = SIM / 'runs' / RUN_ID / 'state.env'

fails, warns = [], []

# ── 方案解析（与生成器同源；双格式：V8 `N、`｜V8.2 `**步 N｜标题**`） ──
plan_text = PLAN.read_text(encoding='utf-8')
PLAN_V82 = '**步 1｜' in plan_text
plan_steps = {}
if PLAN_V82:
    for m in re.finditer(r'^\*\*步 (\d{1,2})｜(.+?)\*\*\s*$', plan_text, re.M):
        n = int(m.group(1))
        if n not in plan_steps:
            plan_steps[n] = m.group(2).strip()
else:
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

if len(plan_steps) != 26:
    fails.append(f'方案解析步数 {len(plan_steps)} ≠ 26（PLAN={PLAN.name}，格式 {"V8.2" if PLAN_V82 else "V8"}）——解析锚断裂')

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
done_noimg_ticketed = []
declared_absent = []
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
    if PLAN_V82:
        # V8.3：①②与步条同构；③④自台账/档案实测（正本两段式，2026-10-08 终态剥离）
        for sec in ('这步做什么', '交付物及质量判据', '已知问题', '处置与改进'):
            if sec not in blk:
                gate_missing.append(f'{n}:{sec}')
    elif 'st-gate' not in blk or '把关' not in blk:
        gate_missing.append(n)
    done = '<span class="ok">✅</span>' in blk
    has_img = '<img' in blk  # V8.2 四段布局：截图区不再是末元素，整块找（帧与实拍同权）
    if not has_img:
        # 无帧三态（V8.4④ 2026-10-10 修订）：①声明态（功能不存在/夹具未执行）不计缺图；
        # ②✅步「登记在案」占位须问题单键配对（frame-capture-failed|step-<键> 或
        # r18-collection-missing）——预解析后统一判；③其余 ✅ 缺图仍 FAIL，⬜ 预期内。
        if '本步无对应产品界面' in blk or '回归轮（本步不在本轮执行范围）' in blk:
            declared_absent.append(n)
        elif done and ('登记在案，无帧明示' in blk or '登记在案，无帧明示不补拍' in blk):
            done_noimg_ticketed.append(blk)
        else:
            (done_no_img if done else pending_no_img).append(n)

# issues.log 预解析（查3 降级配对用；与 A3/A5d 段同源解析）
_ilog = EVID / 'issues.log'
_fc_pre = set(); _r18_pre = False
if _ilog.exists():
    for _l in _ilog.read_text(encoding='utf-8', errors='replace').splitlines():
        _p = _l.split('|', 3)
        if len(_p) >= 4 and _p[0] == 'ISSUE':
            if _p[1] == 'frame-capture-failed':
                _fc_pre.add(_p[2])
            elif _p[1] == 'r18-collection-missing':
                _r18_pre = True
done_noimg_unpaired = []
for _blk in done_noimg_ticketed:
    _km = re.search(r'（截图缺失·([A-Za-z0-9_]+)', _blk)
    _key = _km.group(1) if _km else ''
    if _r18_pre or (f'step-{_key}' in _fc_pre):
        warns.append(f'V8.4④ ✅步无帧已登记降级：{_key}（采集失败登记在案；补拍须按拍摄位规划准确补拍+图注明示时点）')
    else:
        done_noimg_unpaired.append(_key or '?')
if declared_absent:
    warns.append(f'V8.4④ 声明态无帧 {len(declared_absent)} 步（功能不存在/夹具未执行，拍摄位规划判定）')

if title_mismatch:
    fails.append(f'标题与方案不逐字（步骤）：{title_mismatch}')
if gate_missing:
    _lbl = '四段锚缺失（步骤:段）' if PLAN_V82 else '把关段缺失/无锚词（步骤）'
    fails.append(f'{_lbl}：{gate_missing}')
if done_no_img:
    fails.append(f'已完成步缺图：{done_no_img}')
if done_noimg_unpaired:
    fails.append(f'已完成步无帧且占位未配对问题单：{done_noimg_unpaired}——须记 frame-capture-failed|step-<键> 后方可降级（V8.4④）')
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
# [run15 根治] 同步前/后帧相同=页面未变化的真实观测（合法）；跨步同帧=同一画面冒充
# 不同步的证据（假重复，仍 FAIL）。步键=文件名 -op1-before/after 前缀。
# 已按 frame-capture-failed|step-<键> 登记的步（壳页/无效帧在案声明）不参与判罚——
# 对已声明无效的帧二次判罚=双重记账；未登记步的跨步同帧照罚。
def _step_key_of(name):
    return name.split('-op1-')[0]
_fc_md5_skip = set()
if _ilog.exists():
    for _lmd5 in _ilog.read_text(encoding='utf-8', errors='replace').splitlines():
        _pmd5 = _lmd5.split('|', 3)
        if len(_pmd5) >= 4 and _pmd5[0] == 'ISSUE' and _pmd5[1] == 'frame-capture-failed':
            _fc_md5_skip.add(_pmd5[2].removeprefix('step-'))
dups = {}
for h, names in md5.items():
    _cand = [n for n in names if _step_key_of(n) not in _fc_md5_skip]
    if len(_cand) > 1 and len({_step_key_of(n) for n in _cand}) > 1:
        dups[h] = _cand
if dups:
    fails.append(f'md5 假重复：{list(dups.values())}')

# 报告引用但文件缺失的图
missing = [m.group(1) for m in re.finditer(r'src="screenshots/steps/([^"]+)"', rep)
           if not (steps_dir / m.group(1)).exists()]
if missing:
    fails.append(f'报告引用但缺文件：{sorted(set(missing))[:6]}')

# ── 查 5：状态真实（报告 ✅/闸门卡 与 state 落盘一致） ──
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
    # 声明式判回滚（独立审计判词，如 run2 G5/R-A1）：state 落盘保留原值（执行流水
    # 不改写），判定以报告+处置表为准——此类 state≠report 是声明更正，降 WARN 不 FAIL。
    if '判回滚' in rep_state:
        if rep_pass:
            fails.append(f'{g} 判回滚卡不得显示已通过')
        else:
            warns.append(f'{g} 声明判回滚（state 落盘保留原值为执行流水，判定以报告/处置表为准）')
        continue
    if in_state != rep_pass:
        fails.append(f'{g} 状态不一致：state={in_state} report={rep_pass}（报告疑为闸前旧生成，须重生成）')

# ── 查 6：V5 §8.3 硬性要求断言（R3-R9；R1 判词语义/R2 落盘由 harness H8-H11 与查 5 覆盖） ──
# R3 UAT 逐条判词：判定范围=验收书判词载体（UAT 步块+交付物渲染区），禁全文共查——
# 沿革表 run2 史实行（"UAT 有条件验收"）与验收书 7/7 原文（"全部 AC 通过"）合法同页共存，
# 全文共查会误伤（run7 实录：验收书原文实际内容渲染触发假 FAIL）。本意=验收书自身禁总括矛盾。
_uat_blocks = [b for b in blocks if '<span class="st-num">21</span>' in b]
_r3_txt = ''.join(_uat_blocks)
if re.search(r'全部\s*AC\s*通过', _r3_txt) and '有条件' in _r3_txt:
    fails.append('R3 UAT 判词矛盾（UAT 载体内）：同文出现"全部 AC 通过"与"有条件"——须逐条判词，禁总括')

# R4 发布基线守卫：合入只许快进或 merge 增量（检出即 FAIL，守卫属 harness H11 执行侧）
# 中央仓路径跟随 SIM（AIPAY_SIM_ROOT 可覆盖——同源口径见文件头）：写死生产路径会让
# 夹具/归档树审计拿夹具 baseline_sha 对生产仓 main 误判 FAIL，或生产路径缺席时静默跳过
_main_repo = SIM / 'central' / 'aipaydev' / '.git'
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
# 连接键=类型段（2026-10-07 与生成器 issues_stats 同源修复：ISSUE/DISP 主体措辞差
# 曾致 join 全断——"harness/网关"vs"harness/审计会话"；处置按类型记账，类型段为准）。
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
            _disp.add(_p[1])
    _open = [k for k in _iss if k.split('·')[0] not in _disp]
    if _open:
        fails.append(f'R5 问题单缺 DISP（{len(_open)}/{len(_iss)} 待处置）：{_open[:6]}——违反第 24 步合格线')
    # 悬挂 DISP（DISP 类型无对应 ISSUE）=台账卫生 WARN（补账须先有 ISSUE 在案）
    _iss_types = {k.split('·')[0] for k in _iss}
    _hanging = sorted(t for t in _disp if t not in _iss_types)
    if _hanging:
        warns.append(f'R5b 悬挂 DISP（有处置无登记，台账卫生）：{_hanging}——补记 ISSUE 或标注别名归属')

# R6 证据锚点密度：每个已完成步块至少 1 个可反查锚点（event_id $xxx / 短 hash / t_ 卡号 /
# matrix 房间 ID——synapse state 可直查；run15 前置复盘完善扩展）。结构性无三源锚的步
# （后台装配/登录验证/路由走查类）走声明态：步块明示「本步无三源锚（声明态）」+实物锚
# 路径即降过计入声明计数——禁硬凑锚冒充（声明≠锚，只是如实标注锚不适用）。
_anchor_pat = re.compile(r'\$[A-Za-z0-9_-]{25,}|\bt_[0-9a-f]{8}\b|\b[0-9a-f]{7,10}\b|![A-Za-z0-9_-]{10,}:[A-Za-z0-9.-]+')
_no_anchor_decl = re.compile(r'本步无三源锚（声明态）')
_done_blocks = [b for b in blocks if '✅' in b]
_no_anchor = []
_decl_cnt = 0
for i, b in enumerate(blocks, 1):
    if '✅' in b and not _anchor_pat.search(b):
        if _no_anchor_decl.search(b):
            _decl_cnt += 1
            continue
        _m2 = re.search(r'<span class="st-num">(\d+)</span>', b)
        _no_anchor.append(_m2.group(1) if _m2 else str(i))
if _no_anchor:
    warns.append(f'R6 完成步缺可反查锚点（event_id/commit/t_ 卡号/房间 ID）：步 {_no_anchor}'
                 + (f'；另有 {_decl_cnt} 步声明态（无三源锚如实标注）' if _decl_cnt else ''))

# R7 截图红线：完成步图须真实产品 UI——ui 类图占比抽查（doc/msg 类为工件允许）
# （图面真实性以人工视觉审计为准，本断言只查"完成步全为 doc/msg 无一张界面实拍"的极端退化）
_ui_cnt = sum(1 for b in _done_blocks if '界面实拍' in b)
if _done_blocks and _ui_cnt == 0:
    warns.append('R7 完成步无一帧"界面实拍"角标——疑文档/CLI 凑数，须人工视觉复核')

# R8 数字实测：报告内计数类字样与 issues.log 一致（问题单唯一键数）
if _ilog.exists() and '问题单终态' in rep:
    _uniq = len(set(_iss))
    _m3 = re.search(rf'唯一键\s*(\d+)', rep)
    if _m3 and int(_m3.group(1)) != _uniq:
        fails.append(f'R8 问题单计数不实：报告唯一键 {_m3.group(1)} ≠ issues.log 实测 {_uniq}')

# R9 报告步自证：第 26 步须 ✅（生成器对本步恒真）且带生成产物锚点
_b26 = next((b for b in blocks if '<span class="st-num">26</span>' in b), '')
if _b26:
    if '<span class="no">⬜</span>' in _b26:
        fails.append('R9 报告步自证悖论：第 26 步状态标 ⬜——产物存在即应 ✅（叙事文本中的 ⬜ 字样不算状态）')
    if 'simulation-report.html' not in _b26:
        warns.append('R9 第 26 步未挂 simulation-report.html 产物锚点')
else:
    warns.append('R9 未定位第 26 步块（结构漂移？）')

# ── 查 6.5：run10 报告链勘误配套断言（2026-10-07 落版；生成器同源修复的门禁）──
# A3 三源计数：复盘文档成文数 × issues.log 事件流 × 报告唯一键（P18/R29 承诺兑现——
# 方案声称"复盘三源计数一致性入审计断言已落地"但无代码，本断言即补位）。
if _ilog.exists():
    _iss_lines = [l for l in _ilog.read_text().splitlines() if l.startswith('ISSUE|')]
    _m_rep = re.search(r'唯一键\s*(\d+)', rep)
    if _m_rep and int(_m_rep.group(1)) != len({l.split('|')[1] + '·' + l.split('|')[2] for l in _iss_lines}):
        fails.append(f'A3a 报告问题单唯一键计数（{_m_rep.group(1)}）≠ issues.log 实测（{len({l.split("|")[1] + "·" + l.split("|")[2] for l in _iss_lines})}）——计数三源不一致')
    _retro = EVID.parent.parent / 'central' / 'aipaydev' / 'docs' / 'retro'
    import datetime as _dt
    _date8 = RUN_ID[:8]
    _cands = list(_retro.glob(f'{_date8}-*-RFD-001-retrospective.md')) if _retro.exists() else []
    if _cands:
        _rt = _cands[0].read_text(encoding='utf-8', errors='replace')
        _mr = re.search(r'问题单台账（(\d+)\s*条', _rt)
        if _mr and int(_mr.group(1)) != len(_iss_lines):
            warns.append(f'A3b 复盘文档成文计数（{_mr.group(1)} 条）≠ issues.log 终态（{len(_iss_lines)} 行）——成文时滞族 P18（治理报告/复盘时点后移机制挂 run11）；收尾补记在后属预期，在前即计数失真')

# A4 闸门"一次通过"徽章实测：报告渲染数 = 6 − 闸门类登记键数 − state 打回轮次键
if _ilog.exists():
    _gate_hit = set()
    for _l in _ilog.read_text().splitlines():
        _p = _l.split('|', 3)
        if len(_p) >= 4 and _p[0] == 'ISSUE':
            _gm = re.match(r'^(g[1-6])[-_]', _p[1])
            if _gm:
                _gate_hit.add(_gm.group(1).upper())
            elif _p[1].startswith('review-card'):
                _gate_hit.add('G2')
            elif _p[1] == 'retro-open-items':
                _gate_hit.add('G6')
    for _g, _fk in (('G5', 'g5_fail_rounds'),):
        if state_keys.get(_fk, '').isdigit() and int(state_keys[_fk]) > 0:
            _gate_hit.add(_g)
    _first_pass_rendered = len(re.findall(r'gate-rej ok1">一次通过', rep))
    _expected = 6 - len(_gate_hit)
    if _first_pass_rendered != _expected:
        fails.append(f'A4 闸门"一次通过"徽章渲染 {_first_pass_rendered} 个 ≠ 实测 {_expected} 个（台账闸门登记键：{sorted(_gate_hit)}）——静态注册表默认报喜族门禁')

# A5 图数对账：盘上 PNG × 报告 <img> 引用（生成器同逻辑门禁；纪律 40⑥ 头部计数=实际嵌入数）
_steps_dir_a = EVID / 'screenshots' / 'steps'
if _steps_dir_a.exists():
    _disk = {p.stem for p in _steps_dir_a.glob('*.png')}
    _refs = set(re.findall(r'screenshots/steps/([A-Za-z0-9_-]+)\.png', rep))
    _unref = sorted(_disk - _refs)
    _miss = sorted(r for r in _refs if r not in _disk)
    if _unref:
        warns.append(f'A5a 盘上未引用帧 {len(_unref)} 张（漏配）：{_unref[:6]}——拍而未嵌须挂接或归档')
    if _miss:
        fails.append(f'A5b 报告引用但文件缺失 {len(_miss)} 张（冒配）：{_miss[:6]}')
    # A5c 旧口径（run13 前专属）：run13 起生成器按 V8.4 ④渲染"登记+无帧明示"（文案仍含
    # 该前缀字样），由下方 A5d/e/f 按"占位↔问题单配对"新口径判，不再按字样一刀切。
    if RUN_ID < '20261010-v8-run13' and ('（截图缺失）' in rep or '注册帧缺文件' in rep):
        fails.append('A5c 报告含缺图占位（"截图缺失"/"注册帧缺文件"）——§5.5 空态禁渲染/冒配红标未消化')

# ── A5d/e/f：V8.4 §5.5 截图红线 ②③④（2026-10-10 接线轮，run13 起——RUN_ID 门控防旧轮回溯破坏）──
if RUN_ID >= '20261010-v8-run13':
    import time as _time
    # ② 同源帧单一用途：同一图文件在报告内只许嵌入一次（按 src 计数；盘上同 md5 已由查 4 覆盖）
    _src_all = re.findall(r'<img src="(screenshots/steps/[^"]+)"', rep)
    _src_cnt: dict = {}
    for _s in _src_all:
        _src_cnt[_s] = _src_cnt.get(_s, 0) + 1
    _dup_src = sorted(s for s, c in _src_cnt.items() if c > 1)
    if _dup_src:
        fails.append(f'V8.4② 同源帧多用途：{_dup_src}——同一图像文件只许一处嵌入配一个图注（run12 步20/23 双挂 deliver_gate 即此类）')
    # ④ 缺帧占位必须配问题单：注册帧缺文件/帧缺失/采集位空 → 按纪律 40⑩ 登记，
    #    帧名前缀键 ↔ issues.log 的 frame-capture-failed|step-<键>（或 r18-collection-missing 族）
    #    精确配对；✅ 步含"（截图缺失）"裸占位=FAIL（⬜ 未执行/夹具带的无帧明示不阻断、汇总一条 WARN）
    _fc_step_keys = set()
    _has_r18_degrade = False
    if _ilog.exists():
        for _l in _ilog.read_text().splitlines():
            _p = _l.split('|', 3)
            if len(_p) >= 4 and _p[0] == 'ISSUE':
                if _p[1] == 'frame-capture-failed':
                    _fc_step_keys.add(_p[2])            # 形如 step-devimpl_done
                elif _p[1] == 'r18-collection-missing':
                    _has_r18_degrade = True
    _ph_unpaired, _idle_noframe, _idle_noframe_done = [], 0, 0
    for _blk in blocks:
        _n_m = re.search(r'<span class="st-num">(\d+)</span>', _blk)
        _n = int(_n_m.group(1)) if _n_m else -1
        _done_blk = '<span class="ok">✅</span>' in _blk
        if '（截图缺失·' in _blk or '（截图缺失）' in _blk:
            # 新版占位自带步键并声明登记——配对判定由查3 预解析统一承担；此处只分类计数
            if _done_blk:
                _idle_noframe_done += 1
            else:
                _idle_noframe += 1                      # ⬜ 夹具带/未执行带：无帧明示，合规
        for _m in re.finditer(r'(?:注册帧缺文件|帧缺失|本位无帧|本步无帧)：([A-Za-z0-9_]+)', _blk):
            _key = re.split(r'-op\d+$', _m.group(1))[0]
            if (f'step-{_key}' not in _fc_step_keys) and not _has_r18_degrade:
                _ph_unpaired.append(f'步{_n}:{_m.group(1)}')
    if _idle_noframe_done:
        warns.append(f'V8.4④ ✅步无帧（占位带登记声明）{_idle_noframe_done} 步——查3 已按配对判定，此处计数复核')
    if _ph_unpaired:
        fails.append(f'V8.4④ 缺帧占位无配对问题单：{_ph_unpaired[:6]}——按纪律 40⑩ 登记 frame-capture-failed|step-<键> 后降级呈现')
    if _idle_noframe:
        warns.append(f'V8.4④ 无帧明示 {_idle_noframe} 步（⬜ 不在本轮执行范围/沿用带，回归轮口径合规呈现）')
    # ③ 帧时刻一致性（first-cut）：帧 mtime 须在 [run_started_at, 报告生成时刻]；帧名前缀键
    #    在 state 有 epoch 落盘者，帧须 ≤ 键值+120s。用户指令修订：补拍解禁但
    #    必须准确——图注明示「补拍」的窗外/晚拍帧=合规降级 WARN（页面准确性由拍摄位规划+
    #    视觉抽检承担）；无补拍标注的窗外帧=冒充实时 FAIL。flag 键与 scenario.log 全段界
    #    对账为二阶强化，暂不设 FAIL 防误杀。
    _run_start = state_keys.get('run_started_at', '')
    _steps_dir_v3 = EVID / 'screenshots' / 'steps'
    _refs_v3 = set(re.findall(r'screenshots/steps/([A-Za-z0-9_-]+)\.png', rep))
    if _run_start.isdigit() and _steps_dir_v3.exists():
        # 帧→图注映射（label 块内 img 先于 figcaption）
        _cap_map = {}
        for _lm in re.finditer(r'<img src="screenshots/steps/([^"]+)"[^>]*>.*?<figcaption>(.*?)</figcaption>', rep, re.S):
            _cap_map[_lm.group(1)] = html.unescape(re.sub(r'<[^>]+>', '', _lm.group(2)))
        _cap_of = lambda r: _cap_map.get(r if r.endswith('.png') else r + '.png', _cap_map.get(f'{r}.png', ''))
        _t0, _t1 = int(_run_start), int((_steps_dir_v3.parent.parent / 'simulation-report.html').stat().st_mtime
                    if (_steps_dir_v3.parent.parent / 'simulation-report.html').exists() else _time.time())
        _out_win, _late, _retro_ok = [], [], []
        for _r in _refs_v3:
            _fp = _steps_dir_v3 / f'{_r}.png'
            if not _fp.exists():
                continue
            _mt = int(_fp.stat().st_mtime)
            _retro = '补拍' in _cap_of(_r)
            if _mt < _t0 or _mt > _t1 + 60:
                (_retro_ok if _retro else _out_win).append(_r)
                continue
            # 帧名→步键：<step-key>-op<k>-{before,action,after}——split('-op') 剥操作段
            #（旧正则 -op\d+$ 匹配不到 -op1-before 尾缀，晚拍检测休眠未生效，本测试逮出）
            _k = _r.split('-op')[0]
            _kv = state_keys.get(_k, '')
            if _kv.isdigit() and int(_kv) > 1e9 and _mt > int(_kv) + 120:
                (_retro_ok if _retro else _late).append(f'{_r}(>{_k} +{_mt - int(_kv)}s)')
        if _out_win:
            fails.append(f'V8.4③ 帧时刻窗外且无补拍标注（run 区间外）：{_out_win[:6]}——补拍帧必须图注明示补拍，否则视为冒充实时')
        if _late:
            fails.append(f'V8.4③ 帧晚于所属步落盘且无补拍标注：{_late[:4]}——步后补拍须图注明示（准确补拍=按拍摄位规划页面+标注时点）')
        if _retro_ok:
            warns.append(f'V8.4③ 带补拍标注的窗外/晚拍帧 {len(_retro_ok)} 张（合规降级：准确补拍允许，图注已明示）')

# ── A5g：V8.4 ① 图注=画面描述（§5.5 截图红线①，run13 起）──
# figcaption（剥 shot-kind 角标后）禁两类：纯位序模板（"① 操作前"是位序不是画面）；
# 步结果式（含 在仓/落盘/过闸 等结果词且无任何画面词——"freeze 在仓"是步结论不是画面）。
# 画面词=可指认的画面落点（面/页/视图/板/窗/列表/面板/看板/房间/灯/画布/台账/报告/IDE/环境/入口/矩阵/收件箱）。
if RUN_ID >= '20261010-v8-run13':
    # ④b 补拍纪律（用户指令修订 V8.4）：准确补拍解禁——补拍帧必须 ①图注明示
    #     「补拍」时点（③ 据此降级 WARN）②页面按拍摄位规划（capture-plan.env，视觉抽检
    #     复核）。仍禁：隔离区帧被嵌入正本——检测收窄到 img src/figcaption 上下文（叙事
    #     与问题单正文里的目录名提及是合法 provenance，不误杀）。无标注补拍由 ③ 兜杀。
    if re.search(r'src="[^"]*frames-degraded|<figcaption>(?:(?!</figcaption>).)*frames-degraded', rep, re.S):
        fails.append('V8.4④ 隔离区帧嵌入正本：img/图注含「frames-degraded」——错页/不合格帧归档区禁入报告，准确补拍请按拍摄位规划重拍')
    _PIC_W = ('面', '页', '视图', '板', '窗', '列表', '面板', '看板', '房间', '灯', '画布', '台账', '报告', 'IDE', '环境', '入口', '矩阵', '收件箱')
    _OUT_W = ('在仓', '入仓', '落盘', '过闸', '全绿', '核验过', '分齐', '登记完成')
    _bad_caps = []
    for _cm in re.finditer(r'<figcaption>(.*?)</figcaption>', rep, re.S):
        _c = re.sub(r'<span class="shot-kind".*?</span>', '', _cm.group(1), flags=re.S)
        _c = html.unescape(re.sub(r'<[^>]+>', '', _c)).strip()
        if re.fullmatch(r'[①②③]?\s*(操作前|操作动作|系统响应)', _c or 'x'):
            _bad_caps.append(f'「{_c}」纯位序模板')
        elif _c and any(w in _c for w in _OUT_W) and not any(w in _c for w in _PIC_W):
            _bad_caps.append(f'「{_c}」步结果式')
    if _bad_caps:
        fails.append(f'V8.4① 图注非画面描述：{_bad_caps[:5]}——图注写画面可见内容（哪个页面/哪个区域/状态条读数），'
                     '步结果不作图注；图注↔画面一致性视觉抽检位（每轮 ≥3 帧）另由报告链收尾承担')

# A6 叙事时间锚抽检：st-story 所引 HH:MM 时刻须在 scenario.log 有命中（"02:27/04:27"族门禁）
_scen = EVID / 'scenario.log'
if _scen.exists():
    _scen_txt = _scen.read_text(encoding='utf-8', errors='replace')
    _bad_ts = []
    for _i, _blk in enumerate(blocks, 1):
        _story = re.search(r'<p class="st-story">(.*?)</p>', _blk, re.S)
        if not _story:
            continue
        _plain = re.sub(r'<[^>]+>', '', _story.group(1))
        for _tm in re.findall(r'(?<![\d:])(\d{2}:\d{2})(?::\d{2})?(?![\d:])', _plain):
            if _tm not in _scen_txt:
                _n = re.search(r'<span class="st-num">(\d+)</span>', _blk)
                _bad_ts.append(f'步{_n.group(1) if _n else _i}·{_tm}')
    if _bad_ts:
        warns.append(f'A6 叙事所引时刻在 scenario.log 零命中（手编时间锚族）：{_bad_ts[:6]}——叙事锚点须可反查')

# ── 查 7：V5 补遗⑥ R15/R16 断言（R16 旅程版逐步操作入口；R15 统一版第 0 章协作总述）──
_entry_hit = sum(1 for b in blocks if 'class="st-entry"' in b)
if PLAN_V82:
    # V8.2（正本 §5.5 操作记录真值化）：操作路径表降附录《产品操作手册》并标注
    # "非本轮实录"，步块正文以「① 这步做什么」承载本轮实录——断言附录在场+标注语句。
    if '产品操作手册' not in rep or '非本轮实录' not in rep:
        fails.append('V8.2 附录《产品操作手册》缺失或缺"非本轮实录"标注（steps_entry 降附录=§5.5 验收线）')
elif blocks and _entry_hit == len(blocks):
    pass
elif _entry_hit > 0:
    fails.append(f'R16 操作入口缺失：{_entry_hit}/{len(blocks)} 步块含入口行——26 步须全量可复现路径')
else:
    fails.append('操作入口零呈现：报告无任何 st-entry 步块（验收线：操作记录真值化）')

# R15 载体按双正本制（补遗⑩/8.1）：unified-roadshow-report.html 自 run6 起退役，
# 第 0 章宿主=final-report.html（PART 1 合并正本）；run5 及以前历史轮兼容旧载体。
_r15 = EVID / 'final-report.html'
if not _r15.exists():
    _r15 = EVID / 'unified-roadshow-report.html'
if _r15.exists():
    _u = _r15.read_text(encoding='utf-8')
    if 'id="ch0-collab"' not in _u:
        fails.append(f'R15 正本缺第 0 章「推演逻辑与协作顺序总述」（id=ch0-collab 未检出，载体={_r15.name}）')
    elif 'scenario.log 实抽' not in _u:
        warns.append('R15 第 0 章在位但协作时序线标记缺失（scenario.log 实抽注记）')
    if '研发全流程治理有效性' not in _u:
        warns.append('正本缺「研发全流程治理有效性」实测节')
else:
    warns.append('R15 载体未生成（final-report.html 待合并产出）——R15 断言待其生成后复跑审计')

# ── 查 8：R18 全量呈现（正本 §5.5 验收线：对话全文/操作前后帧/环节效果实证）──
# 按步型必采证据表（步集自 r18_matrix 单一事实源——生成器 hero 统计同表，门禁测试 ⑫）：
#   对话必采=派发/回执/审批/缺陷/验收对账步；操作必采=建群/看板/IDE 等真 UI 操作步
#   （每组 ops 须 ≥2 帧=前后帧下限）；效果必采=工件产出闸步；其余 ✅ 步任一位在位即可。
_R18_DIALOG_STEPS = DIALOG_STEPS
_R18_OP_STEPS = OP_STEPS
_R18_EFFECT_STEPS = EFFECT_STEPS
_R18_SKILL_STEPS = SKILL_STEPS
_R18_DELIVERY_STEPS = DELIVERY_STEPS
_r18_missing_file = not R18F.exists()
_r18_payloads = {}
_ilines_r18 = (EVID / 'issues.log').read_text().splitlines() if (EVID / 'issues.log').exists() else []
_r18_degraded = any('r18-collection-missing' in l for l in _ilines_r18)
# 降级窄口径：载荷文件在位时，r18-collection-missing 登记行只降级
# 其登记的步（ISSUE 第三段 step-N），不再全局豁免——run14 实锤 4 张登记把 20+ 步的
# 载荷缺失全部漂白为 WARN。文件级缺失（整链缺位）才保留全局降级语义。
_r18_degraded_steps = set()
for _l18 in _ilines_r18:
    if 'r18-collection-missing' in _l18:
        _m18s = re.search(r'\|step-(\d+)\|', _l18)
        if _m18s:
            _r18_degraded_steps.add(int(_m18s.group(1)))
if _r18_missing_file:
    if _r18_degraded:
        warns.append('R18 载荷文件缺失（evidence/r18-steps.json 不存在）——已登记 r18-collection-missing 按纪律 40⑩ 降级；帧类缺口不可补采（§4.3 第 21 条），run11 采集链已挂驱动')
    else:
        fails.append('R18 载荷文件缺失：evidence/r18-steps.json 不存在——V7.2 起为验收线（r18-collect.py 采集）；缺口须登记 r18-collection-missing 方可降级')
else:
    try:
        _r18_payloads = json.loads(R18F.read_text(encoding='utf-8')).get('steps', {}) or {}
    except json.JSONDecodeError as e:
        fails.append(f'R18 载荷文件解析失败（r18-steps.json 坏 JSON）：{e}')
for blk in blocks:
    n_s = block_field(blk, r'<span class="st-num">(\d+)</span>')
    if not n_s:
        continue
    n = int(n_s)
    if '<span class="no">⬜</span>' in blk[:400]:
        continue  # 未执行步不要求 R18（无现场可采）
    m18 = re.search(r'data-r18="d:(\d+);o:(\d+);e:(\d+)(?:;s:(\d+))?(?:;v:(\d+))?"', blk)
    d_cnt, o_cnt, e_cnt = (int(m18.group(i)) for i in (1, 2, 3)) if m18 else (0, 0, 0)
    s_cnt = int(m18.group(4)) if m18 and m18.group(4) else 0
    v_cnt = int(m18.group(5)) if m18 and m18.group(5) else 0
    # 帧数核验：ops 组内引用的帧文件须真实存在（生成器对缺帧渲染"帧缺失"占位——报告侧可检出）
    frames_missing = len(re.findall(r'帧缺失：', blk))
    if frames_missing:
        fails.append(f'R18 步 {n} 操作序列存在缺帧（{frames_missing} 处）——前后帧须实拍补齐')
    _step_deg = _r18_degraded if _r18_missing_file else (n in _r18_degraded_steps)
    _r18_rep = warns.append if _step_deg else fails.append
    _r18_suffix = '（已登记 r18-collection-missing 降级）' if _step_deg else ''
    if n in _R18_DIALOG_STEPS and d_cnt == 0:
        _r18_rep(f'R18 步 {n} 缺「对话全文」（派发/回执/对账类步必采——r18-collect.py dialog）{_r18_suffix}')
    if n in _R18_OP_STEPS:
        if o_cnt == 0:
            _r18_rep(f'R18 步 {n} 缺「操作前后帧」（真 UI 操作步必采——r18-frames.mjs 拍摄+collect op）{_r18_suffix}')
        else:
            _fr = len(re.findall(r'class="shot r18-shot"', blk))
            if _fr < 2 * o_cnt:
                fails.append(f'R18 步 {n} 操作序列帧数不足（每组 ops 须 ≥2 帧=操作前+系统响应，当前渲染 {_fr} 帧/{o_cnt} 组）')
    if n in _R18_EFFECT_STEPS and e_cnt == 0:
        _r18_rep(f'R18 步 {n} 缺「环节效果」实证（工件产出闸步必采——collect effect）{_r18_suffix}')
    if n in _R18_SKILL_STEPS:
        # §5.6 必采证据表：步级承载范围承诺入必采证据表——skill 过程帧 gen≥3+invoke≥2，
        # 载荷侧实测（r18-steps.json × 帧文件在位），与 hero 统计同矩阵同口径
        if not step_ok(n, _r18_payloads.get(str(n)) or _r18_payloads.get(n),
                       frame_exists=lambda name: (steps_dir / name).exists()):
            _r18_rep(f'R18 步 {n} skill 过程帧未达标（§5.6 必采证据表：xxx-dev 生成 ≥3 帧+开发调用 ≥2 帧——r18-collect.py skill 登记+帧实拍）{_r18_suffix}')
    if n in _R18_DELIVERY_STEPS:
        # R29（P15）：delivery 门禁灯帧 ≥1（MX_DELIVERY=1 全程开启+面板实拍+r18-collect
        # deliver 登记）；产品面未就绪按§5.6 采集纪律⑩ 登记降级（P15/delivery-protocol 键命中即降
        # WARN），禁静默关旗标跑全程
        _dlv_ok = step_ok(n, _r18_payloads.get(str(n)) or _r18_payloads.get(n),
                          frame_exists=lambda name: (steps_dir / name).exists())
        _ilines = (EVID / 'issues.log').read_text().splitlines() if (EVID / 'issues.log').exists() else []
        _degraded = any(('P15' in l) or ('delivery-protocol' in l) or ('r18-collection-missing' in l) for l in _ilines)
        if not _dlv_ok:
            if _degraded:
                warns.append(f'R18 步 {n} delivery 门禁灯帧缺（P15 已登记，按§5.6 采集纪律⑩ 降级——产品面/旗标修复后补帧）')
            else:
                fails.append(f'R18 步 {n} delivery 门禁灯帧缺（R29：MX_DELIVERY=1 全程开启+面板实拍+r18-collect.py deliver 登记；静默关旗标即 P15 打回——或按§5.6 采集纪律⑩ 登记降级）')
    if n not in _R18_DIALOG_STEPS and n not in _R18_OP_STEPS and n not in _R18_EFFECT_STEPS \
            and n not in _R18_SKILL_STEPS and n not in _R18_DELIVERY_STEPS \
            and d_cnt == 0 and o_cnt == 0 and e_cnt == 0 and s_cnt == 0 and v_cnt == 0 and not _r18_missing_file:
        _r18_rep(f'R18 步 {n} 载荷全缺（对话/操作/效果/skill/门禁灯任一在位即可）{_r18_suffix}')

# ── 查 8b：产品成效两项（§5.4 产品成效呈现+§5.6 必采证据表 run13 起入分母；run14 起接线）──
# exec 项（幂等/下单执行输出件）缺席=FAIL——执行输出无 UI 亦可产出，无降级通道；
# frames 项（下单流程帧 ≥2）缺席：台账在位 product-outcome-missing 族登记=§5.6 采集
# 纪律⑩ 降级 WARN（逻辑层 SDK 无 UI 面属「功能不存在」声明态），未登记=FAIL。
# 轮次闸（2026-10-10 三要素合并轮补）：本查 run13 起入分母（§5.5「run12 不回溯」
# 一次性历史条款）——run12 及更早轮无 product-outcome 采集义务，误咬=历史轮全部 FAIL
_po = {'exec_met': True, 'frames_met': True, 'degraded': False}
if RUN_ID >= '20261010-v8-run13':
    _po = product_outcome_status(EVID, issue_log_text='\n'.join(_ilines_r18))
if not _po['exec_met']:
    fails.append('产品成效 exec 项缺席（evidence/product-outcome/ 无幂等/下单执行输出件）——'
                 '§5.4 ①件必采：product-outcome-summary.py 落盘或 testlog 实跑摘录，禁手抄')
if not _po['frames_met']:
    if _po['degraded']:
        warns.append('产品成效 frames 项缺席（下单流程前后帧 <2）——已登记 product-outcome-missing '
                     '按§5.6 采集纪律⑩ 降级（逻辑层 SDK 无 UI 面声明态）；产品提供可走查 UI 后实拍')
    else:
        fails.append('产品成效 frames 项缺席（下单流程前后帧 <2）且无 product-outcome-missing 登记——'
                     '§5.6 采集纪律⑩：登记+明示或实拍，二选一必选')

# ── 查 9：承载范围符合性（正本 §2.5 产品承载范围清单 × §5.6 采集纪律⑩ 降级口径；差距审计 P8→R27）──
# §2.5 列出的步，报告 ✅ 步块须有 ≥1 张 UI 实拍帧（class="shot"），或 issues.log 有
# product-surface-degraded 登记声明合规降级（登记+最接近真实功能页补拍+图注三件套）；
# 二者皆缺 → WARN 起步（连续两轮未处置转 FAIL，转硬评估挂 run11 前置）。
_m25 = re.search(r'### 2\.5 [^\n]*\n(.*?)(?=\n### |\n## )', plan_text, re.S)
_surface_steps = set()
if _m25:
    _surface_steps = {int(x) for x in re.findall(r'^\|\s*(\d+)\s*\|', _m25.group(1), re.M)}
if not _surface_steps:
    warns.append('方案 §2.5 承载范围清单未解析到步号——查 9 空转（解析锚失效即验收缺陷，须修复解析或正本）')
_issues_txt9 = _ilog.read_text(encoding='utf-8') if _ilog.exists() else ''
_degraded9 = 'product-surface-degraded' in _issues_txt9
for blk in blocks:
    n_s = block_field(blk, r'<span class="st-num">(\d+)</span>')
    if not n_s:
        continue
    n = int(n_s)
    if n not in _surface_steps or '<span class="no">⬜</span>' in blk[:400]:
        continue
    if len(re.findall(r'class="shot', blk)) == 0 and not _degraded9:
        warns.append(f'承载范围符合性：步 {n} 在 §2.5 有产品承载范围承诺但报告零 UI 实拍帧，'
                     f'且 issues.log 无 product-surface-degraded 降级登记——补拍或按§5.6 采集纪律⑩ 合规降级登记')

# ── 查 10：六闸工件视图（§5.4 必备六件：G1 冻结/G2 评审/G3 testlog/G4 测试报告/G5 发布计划/G6 复盘）──
# 步 7/15/18/19/20/24 步块须含交付物视图（st-artifact）或"无文件域交付物"声明（§5.4 第二段）。
_gv_steps = {7: 'G1 冻结件', 15: 'G2 评审卡', 18: 'G3 testlog', 19: 'G4 测试报告', 20: 'G5 发布计划', 24: 'G6 复盘'}
_gv_missing = []
for blk in blocks:
    n_s = block_field(blk, r'<span class="st-num">(\d+)</span>')
    if not n_s:
        continue
    n = int(n_s)
    if n in _gv_steps and 'st-artifact' not in blk and '无文件域交付物' not in blk:
        _gv_missing.append(f'步{n}({_gv_steps[n]})')
if _gv_missing:
    fails.append(f'六闸工件视图缺位（§5.4 必备六件缺一打回）：{"、".join(_gv_missing)}')
_n_views = len(re.findall(r'class="art-item"', rep))
if _n_views < 15:
    warns.append(f'交付物视图 {_n_views} 类 < §5.4 数量底线 15 类——逐条登记入下轮前置（不阻断，缺件须在视图或登记中如实可见）')

# ── 查 11：产品面承载率行（§5.5：ch1 须含"产品面承载率 n/5"+五面逐面判定；验收线 ≥4/5 不阻断但逐面登记）──
_fr = re.search(r'产品面承载率 <b>(\d)/5</b>', rep)
if not _fr:
    fails.append('承载率行缺位（§5.5：第 1 章须含"产品面承载率 n/5"+五面逐面一句判定）')
elif int(_fr.group(1)) < 4:
    warns.append(f'产品面承载率 {_fr.group(1)}/5 < 验收线 4/5——不阻断收尾，逐面登记入下轮前置（§5.5）')

# ── 查 12：QGate 证据纪律（§5.5 v1.31.1 条款：引用须带来源分布；桶非零/未验证/advisory 未清禁"全绿/已核验"）──
for _qm in re.finditer(r'<details class="st-artifact st-qgate".*?</details>', rep, re.S):
    # 摘要是生成器自产固定文案（含"来源分布/全绿/未验证"字样）——不剔除会自我满足
    # 存在性检查、又自我误伤脏桶判定（产品侧 report/acceptance.ts 移植测试逮出，双侧同修）
    _qb = re.sub(r'<summary.*?</summary>', '', _qm.group(0), flags=re.S)
    if '来源分布' not in _qb and 'source' not in _qb.lower():
        fails.append('QGate 证据块缺来源分布行（§5.5 门禁证据引用）——透传 release-report 原文即可满足')
    _qb_out = re.sub(r'<pre.*?</pre>', '', _qb, flags=re.S)  # 判定只看报告侧声明，原文桶数据不计
    _dirty = any(k in _qb for k in ('未验证', 'advisory', 'gate-not-run', 'no-gate'))
    if _dirty and ('全绿' in _qb_out or '已核验' in _qb_out):
        fails.append('QGate 证据含未验证声明/advisory 未清，报告侧却表述"全绿/已核验"（§5.5 v1.31.1 吸收轮起）')
    break  # 块唯一（步 20），只判一次

# ── 查 13：并行度实测行（§5.5，run12 起生效）：步 18 卡须含实测行；
#    缺行 FAIL（数字实测禁手填，渲染层生成器产）；"段界未见"诚实声明=devimpl 段
#    未完成的轮次特征，收尾轮必在 → 只认缺行 FAIL，不另设阈值闸（不达标记复盘）。
#    13b 分支落地时间线行（干预点四件 D，2026-10-09）：并行度行在则时间线行必在
#    （同批渲染，禁只报利用率不报推进刻度）。──
if RUN_ID >= '20261009-v8-run12' and 'id="step18"' in rep:
    if '并行度实测（§5.5）' not in rep:
        fails.append('步 18 缺并行度实测行（§5.5：devimpl 段"活跃 agent·分钟/墙钟分钟"须实测呈现）')
    elif '分支落地时间线' not in rep:
        fails.append('步 18 缺分支落地时间线行（干预点 D：并行度行在则推进刻度行必在，同批渲染）')

# ── A9 宿主环境脱敏（方案 §5.4.3，2026-10-11）：报告禁露个人电脑环境标识 ──
import re as _re9
_leak9 = _re9.findall(r'/Users/[A-Za-z0-9_.\-]+|/Volumes/[A-Za-z0-9_.\-]+', rep)
if _leak9:
    fails.append(f'A9 宿主环境标识泄漏 {len(_leak9)} 处（如 {_leak9[0]}）——生成器 _mask_env 未覆盖或绕过（§5.4.3 脱敏纪律）')

# ── A10 报告语言门（2026-10-11 用户裁定：所有日志折叠+每句说人话）──
# 可见文本=剔除 <details> 折叠区/pre 代码块后的正文；过 plan-html 词表（同 jargon-source-gate
# 的词源），HARD>0 即 FAIL——日志原文与机器锚在折叠区豁免（折叠≠裁剪，反查走附录）。
import re as _re10
# 由内向外逐层剥折叠区（嵌套 details 下非贪婪正则会漏剥，run14 实测误报四起）
_vis = rep
_INNER10 = _re10.compile(r'<details[^>]*>(?:(?!<details|</details>)[\s\S])*</details>', _re10.I)
while True:
    _n10 = _INNER10.subn(' ', _vis)
    _vis = _n10[0]
    if _n10[1] == 0:
        break
_vis = _re10.sub(r'<(script|style|pre)[\s\S]*?</\1>', ' ', _vis)
_vis = _re10.sub(r'<[^>]+>', '\n', _vis)
import html as _html10
_vis = _html10.unescape(_vis)
_JC10 = os.environ.get('MX_JARGON_CHECK') or next(
    (p9 for p9 in ['/Users/cuishi/lab/ncwk/overlay/scripts/plan-html/jargon-check.py',
                   '/Volumes/nvme2230/lab/ncwk/overlay/scripts/plan-html/jargon-check.py'] if os.path.exists(p9)), '')
if _JC10:
    import subprocess as _sp10
    _tf10 = os.path.join(tempfile.gettempdir(), f'audit-visible-{RUN_ID}.txt')
    open(_tf10, 'w', encoding='utf-8').write(_vis)
    _r10 = _sp10.run(['python3', _JC10, _tf10], capture_output=True, text=True, timeout=60)
    if 'HARD' in _r10.stdout and 'HARD=0' not in _r10.stdout and '无 HARD' not in _r10.stdout:
        _hits10 = [l for l in _r10.stdout.splitlines() if 'HARD' in l][:4]
        fails.append('A10 报告正文黑话：' + '；'.join(_hits10) + '——正文句句人话（§5.4.3 三规矩），机器锚只进折叠区')

# ── A11 图片与功能描述相符（2026-10-11 用户红线：图片必须和功能及描述对得上）──
# 三断言：①每个 <img> 有非空 alt；②产品成效帧图注含功能语义（中文标注，禁只留文件名）；
# ③成效帧目录里的每张 png 都被报告引用（禁拍而未嵌/嵌而不存在）。
_imgs11 = re.findall(r'<img [^>]*>', rep)
_noalt = [x[:60] for x in _imgs11 if 'alt=""' in x or ' alt' not in x]
if _noalt:
    fails.append(f'A11 图片缺功能描述（alt 空）：{len(_noalt)} 处，如 {_noalt[0]}')
_po_fig = re.findall(r'<figcaption><span class="shot-kind">功能实证</span>([^<]*)</figcaption>', rep)
_unlabeled = [x for x in _po_fig if '（未标注）' in x or re.fullmatch(r'[A-Za-z0-9._-]+', x.strip())]
if _unlabeled:
    fails.append(f'A11 成效帧图注无功能语义（只留文件名/未标注）：{_unlabeled[:3]}——图注必须写功能（如「支付成功」），用户红线：图与描述对得上')
_po_dir = EVID / 'product-outcome'
if _po_dir.exists():
    _pngs = sorted(f.name for f in _po_dir.glob('*.png'))
    _missing_ref = [f for f in _pngs if f'product-outcome/{f}' not in rep]
    if _missing_ref:
        fails.append(f'A11 拍而未嵌：product-outcome 存在但报告未引用 {len(_missing_ref)} 张：{_missing_ref[:3]}')
    _dangling = [m for m in re.findall(r'product-outcome/([A-Za-z0-9._-]+\.png)', rep) if not (_po_dir / m).exists()]
    if _dangling:
        fails.append(f'A11 嵌而不存在：报告引用但盘上无文件 {_dangling[:3]}')

# ── 汇总 ──
# 工具版本锚：审计结论绑定工具版本——镜像树落后一代曾在同一份
# 报告上产出全错结果（标题逐字 0/26 假 FAIL）。输出自带 git 锚，结论不可复现时先对版本。
import subprocess as _sp
try:
    _tool_ver = _sp.run(['git', '-C', str(Path(__file__).resolve().parent.parent), 'log', '-1', '--format=%h %s'],
                        capture_output=True, text=True, timeout=5).stdout.strip()
except Exception:
    _tool_ver = '(git 不可用)'
print(f'报告：{REPORT}')
print(f'审计工具版本锚：{_tool_ver}（结论绑定工具版本，复现先对版本——镜像树漂移会产出全错结果）')
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
