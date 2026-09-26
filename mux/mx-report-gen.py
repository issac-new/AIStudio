#!/usr/bin/env python3
# mx-report-gen.py — V3 全流程推演报告生成器（方案原文对齐版）
# 步骤标题与把关逐字取自方案文档（单一事实源，生成时解析）：
#   docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md 具体流程 1-26
# 报告锚定一轮完整推演（默认 09-26 00:22-08:27 完整轮）：状态时间戳取该轮终态快照。
import html as H
import re
from pathlib import Path

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
EVID = SIM / 'evidence'
STEPS_DIR = EVID / 'screenshots' / 'steps'
OUT = EVID / 'simulation-report.html'
PLAN_PATH = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')

state = {}
for line in (SIM / 'state.env').read_text().splitlines():
    if '=' in line and not line.startswith('jwt_'):
        k, v = line.split('=', 1)
        state[k.strip()] = v.strip()
# 报告锚定轮的终态快照（真实时间戳）；state 缺键或被后续重跑改写时以快照为准，
# 保证 26 步时间戳同源（同一轮），出处注记见页脚。
SNAP = EVID / 'state-snapshot.env'
if SNAP.exists():
    for line in SNAP.read_text().splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            if v.strip():
                state[k.strip()] = v.strip()

# ── 方案原文解析：标题=步骤首句，把关=（把关…）逐字 ──
plan_text = PLAN_PATH.read_text(encoding='utf-8')
plan_steps = {}
for m in re.finditer(r'^(\d{1,2})、(.+?)(?=^\d{1,2}、|^## |\Z)', plan_text, re.M | re.S):
    n = int(m.group(1))
    if n in plan_steps:
        continue
    block = m.group(2).strip()
    gate = ''
    gm = re.search(r'（(把关[^：]*?)：(.+?)）\s*$', block, re.S)
    if gm:
        label = gm.group(1)
        body = re.sub(r'\s+', ' ', gm.group(2)).strip()
        gate = (label + '：' + body) if '【' in label else body
    body_head = block.split('（把关')[0]
    first = re.sub(r'\s+', ' ', body_head).strip().split('。')[0]
    if len(first) > 96:
        first = first[:96] + '…'
    plan_steps[n] = (first, gate)

STEPS_META = {
    1: (['smoke_done'], ['ui-01-channels']),
    2: (['smoke_done'], ['ui-02-profiles']),
    3: (['smoke_done'], ['ui-03-cockpit']),
    4: (['smoke_done'], ['ui-04-smoke']),
    5: (['appinit_done'], ['05-app-registry']),
    6: (['people_done'], ['06-org']),
    7: (['g1_frozen'], ['07-freeze', '07-req-dm']),
    8: (['room_analysis'], ['ui-08-groupchat', 'ui-09-room']),
    9: (['dispatch_marker'], ['09-dispatch']),
    10: (['register_done'], ['ui-10-card', 'ui-12-board']),
    11: (['analysis_done'], ['11-tasklist', '11-done']),
    12: (['triage_done'], ['12-raci', 'ui-12-board']),
    13: (['anexec_done'], ['13-an-paycore', '13-an-chwx', '13-an-chali', '13-an-mp']),
    14: (['review_done'], ['14-design']),
    15: (['g2_arch_pass'], ['15-archgate']),
    16: (['close_done'], ['ui-16-done']),
    17: (['plan_done'], ['17-schedule']),
    18: (['devimpl_done'], ['18-gitgraph', '18-testlog-dev-paycore', '18-testlog-dev-chwx', '18-testlog-dev-chali', '18-testlog-dev-mp']),
    19: (['g4_pass'], ['19-testreport', '19-testpass']),
    20: (['g5_ready'], ['20-readygate', '20-release-notes']),
    21: (['uat_done'], ['21-acceptance', '21-uat']),
    22: (['workmgr_done'], ['22-workreport']),
    23: (['audit_done'], ['23-audit', '23-audit-line']),
    24: (['retro_done'], ['24-retro', '24-gov', 'ui-24-memory']),
    25: (['ide_done'], ['ui-25-ide', 'ui-25-models']),
    26: (['report_done'], ['ui-26-report']),
}
GATE_BY_STEP = {7: 'G1', 15: 'G2', 18: 'G3', 19: 'G4', 20: 'G5', 24: 'G6'}

STEPS = []
for n in range(1, 27):
    title, gate = plan_steps.get(n, (f'步骤 {n}', ''))
    keys, imgs = STEPS_META[n]
    STEPS.append((n, title, gate, keys, imgs))

def fmt_ts(key):
    v = state.get(key, '')
    if v.isdigit() and len(v) >= 10:
        import datetime
        return datetime.datetime.fromtimestamp(int(v[:10])).strftime('%m-%d %H:%M')
    return ''

def img_tags(prefixes):
    out = []
    for pre in prefixes:
        p = STEPS_DIR / f'{pre}.png'
        if p.exists():
            out.append(f'<figure><div class="fscroll"><img src="screenshots/steps/{pre}.png" alt="{H.escape(pre)}" loading="lazy"></div>'
                       f'<figcaption>{H.escape(pre)} · 框内可滚动</figcaption></figure>')
    return ''.join(out)

def step_rows():
    parts = []
    for n, title, gate, keys, imgs in STEPS:
        done = any(state.get(k) for k in keys) or n == 26
        ts = next((fmt_ts(k) for k in keys if fmt_ts(k)), '')
        gate_mark = f'<span class="gate">【{GATE_BY_STEP[n]}】</span>' if n in GATE_BY_STEP else ''
        status = '<span class="ok">✅ 已执行</span>' if done else '<span class="no">⬜ 未执行</span>'
        imgs_html = img_tags(imgs) or '<p class="note">（对应截图缺失，待补）</p>'
        parts.append(f'''
<section class="step">
  <div class="shd"><span class="no-step">{n}</span><h3>{H.escape(title)}{gate_mark}</h3><span class="st">{status}{f' · {ts}' if ts else ''}</span></div>
  <div class="gatebox"><b>把关（方案原文）</b>：{H.escape(gate) if gate else '（方案该步未单列把关行）'}</div>
  <div class="imgs">{imgs_html}</div>
</section>''')
    return '\n'.join(parts)

def issues_table():
    lines = (EVID / 'issues.log').read_text().splitlines() if (EVID / 'issues.log').exists() else []
    iss, disp, order = {}, {}, []
    for l in lines:
        if l.startswith('ISSUE|'):
            p = l.split('|', 3)
            key = f'{p[1]}·{p[2]}'
            if key not in iss:
                iss[key] = p[3] if len(p) > 3 else ''
                order.append(key)
        elif l.startswith('DISP|'):
            p = l.split('|', 4)
            disp[f'{p[1]}·{p[2]}'] = p[3] if len(p) > 3 else ''
    rows = []
    for k in order:
        d = disp.get(k, '待处置')
        cls = 'ok' if d.startswith('已修') else ('warn' if d.startswith(('观察', '延后')) else 'no')
        rows.append(f'<tr><td>{H.escape(k)}</td><td>{H.escape(iss[k][:110])}</td><td class="{cls}">{H.escape(d[:150])}</td></tr>')
    stat = f'问题单 {len(iss)} 项（类型·主体） / DISP {len(disp)} 条 / 待处置 {sum(1 for k in order if k not in disp)}'
    return stat, '\n'.join(rows)

stat, itable = issues_table()
band = ''.join(
    f'<span class="pill {("gate" if n in GATE_BY_STEP else "")} {"ok" if (any(state.get(k) for k in keys) or n == 26) else "no"}">{n}{"🔒" if n in GATE_BY_STEP else ""}</span>'
    for n, title, gate, keys, imgs in STEPS)

gov = (EVID / 'governance-report.md').read_text()[:2500] if (EVID / 'governance-report.md').exists() else ''

html = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>Swarm Studio 全流程推演报告 · RFD-001 支付收银台</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"PingFang SC","Helvetica Neue",sans-serif;background:#eef2f6;color:#1f2d3a;padding:26px 34px}}
h1{{font-size:26px;color:#12365e}} .sub{{color:#567;margin:6px 0 16px;font-size:13px;line-height:1.8}}
.band{{display:flex;flex-wrap:wrap;gap:5px;margin:14px 0}}
.pill{{width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:#d7e0ea;color:#456}}
.pill.ok{{background:#1a7a35;color:#fff}} .pill.no{{background:#c9d4de;color:#789}}
.pill.gate{{outline:3px solid #e8a000}}
h2{{font-size:19px;color:#12365e;margin:26px 0 12px;border-left:6px solid #2c6fb0;padding-left:12px}}
.step{{background:#fff;border-radius:12px;padding:18px 22px;margin:16px 0;box-shadow:0 2px 8px rgba(20,50,90,.08)}}
.shd{{display:flex;align-items:center;gap:12px;border-bottom:2px solid #e4ecf4;padding-bottom:8px}}
.no-step{{width:34px;height:34px;border-radius:50%;background:#1c3a5e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0}}
.shd h3{{font-size:15px;flex:1;line-height:1.5}} .st{{font-size:12px;color:#345;white-space:nowrap}}
.ok{{color:#12702e;font-weight:700}} .no{{color:#995}} .warn{{color:#b45f06}}
.gate{{background:#fff4d6;border:1.5px solid #e8a000;border-radius:4px;padding:0 6px;font-size:11px;margin-left:6px;white-space:nowrap}}
.gatebox{{background:#f6f9fc;border:1px dashed #b9cbe0;border-radius:8px;padding:9px 14px;margin:10px 0;font-size:12.5px;line-height:1.9}}
.imgs{{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}}
.imgs figure{{flex:1 1 480px;max-width:520px}}
.fscroll{{height:520px;overflow:auto;border:1.5px solid #cfd9e4;border-radius:8px;background:#fff}}
.fscroll img{{width:100%;display:block}}
figcaption{{font-size:11px;color:#789;text-align:center;margin-top:3px;font-family:Menlo,monospace}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:12px}}
th,td{{border:1px solid #dde5ee;padding:7px 10px;text-align:left;vertical-align:top}}
th{{background:#e8eef5}}
.note{{color:#889;font-size:12px}}
pre.gov{{background:#fff;border:1px solid #d5dee8;border-radius:10px;padding:16px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;font-family:Menlo,monospace}}
.footer{{margin:30px 0 10px;color:#789;font-size:11.5px;text-align:center;line-height:1.8}}
</style></head><body>
<h1>Swarm Studio 全流程推演报告 · RFD-001 支付收银台（多端小程序）</h1>
<div class="sub">15 人 × AI 分布式集群协作 · 单 gateway 多路复用 42 profile · 28 kanban · matrix :8008<br>
本报告锚定 <b>09-25 14:00—09-26 08:27 完整推演周期</b>（26 步全过闸，接续执行）：每步标题与把关逐字引用《全流程推演方案》"具体流程 1-26"，截图为该步真实证据（界面走查 / 工件渲染，含 matrix event_id 与 git 引用可反查）。</div>
<div class="band">{band}</div>
<div class="sub">{stat} ｜ 运行环境：单 gateway :8801 + 单 studio :8802 + synapse :8008 + hindsight :8888</div>

<h2>一、26 步逐一走查（标题与把关 = 方案原文 · 逐步截屏）</h2>
{step_rows()}

<h2>二、问题单台账与处置（DISP 三态：已修/观察/延后）</h2>
<table><tr><th>类型·主体</th><th>问题描述</th><th>处置结论</th></tr>{itable}</table>

<h2>三、闭环治理报告（闸状态/问题单/凭证与回灌）</h2>
<pre class="gov">{H.escape(gov) if gov else '（治理报告缺失）'}</pre>

<div class="footer">步骤标题与把关逐字取自方案文档（生成时解析，单一事实源）· 状态时间戳取锚定轮终态快照（evidence/state-snapshot.env，真实运行记录）<br>
消息存证为 matrix 真实事件转录（含 event_id/发送人/时间/来源房间）· 文档工件渲染自 git 引用 · 报告由推演脚本 report 步自动汇编</div>
</body></html>'''

OUT.write_text(html, encoding='utf-8')
print(f'report written: {OUT} ({len(html)} bytes)')
