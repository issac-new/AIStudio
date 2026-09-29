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
    RUN_ID = sys.argv[sys.argv.index('--run') + 1]
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
