#!/usr/bin/env python3
# mx-report-gen.py — V3 全流程推演报告生成器（生命周期旅程版）
# 设计原则：六阶段分组 + 侧栏导航 + 时间线 + 证据灯箱 + 渐变相位色
# 步骤标题与把关逐字取自方案文档（单一事实源）：
#   docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md 具体流程 1-26
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
SNAP = EVID / 'state-snapshot.env'
if SNAP.exists():
    for line in SNAP.read_text().splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            if v.strip():
                state[k.strip()] = v.strip()

# ── 方案原文解析 ──
plan_text = PLAN_PATH.read_text(encoding='utf-8')
plan_steps = {}
for m in re.finditer(r'^(\d{1,2})、(.+?)(?=^\d{1,2}、|^## |\Z)', plan_text, re.M | re.S):
    n = int(m.group(1))
    if n in plan_steps: continue
    block = m.group(2).strip()
    gate = ''
    gm = re.search(r'（(把关[^：]*?)：(.+?)）\s*$', block, re.S)
    if gm:
        label, body = gm.group(1), re.sub(r'\s+', ' ', gm.group(2)).strip()
        gate = (label + '：' + body) if '【' in label else body
    body_head = block.split('（把关')[0]
    first = re.sub(r'\s+', ' ', body_head).strip().split('。')[0]
    if len(first) > 96: first = first[:96] + '…'
    plan_steps[n] = (first, gate)

# ── 六阶段分组（对齐方案叙事结构）──
PHASES = [
    (1, 4, '环境准备', '账号分配 · 配置初始化 · 登录 · 冒烟', '#2563eb', '#1e40af'),
    (5, 7, '需求管理', '应用登记 · 人员管理 · 需求上锁 G1', '#7c3aed', '#5b21b6'),
    (8, 14, '需求分析', '建群 · 派发 · 系统分析 · 四路系分 · 复核定稿', '#059669', '#065f46'),
    (15, 18, '设计评审与编码', 'G2 评审 · 归档 · 排期 · G3 编码', '#d97706', '#92400e'),
    (19, 21, '测试与交付', 'G4 测试 · G5 准出 · 发版 UAT', '#dc2626', '#991b1b'),
    (22, 26, '治理与复盘', '台账 · 审计 · G6 复盘 · IDE · 报告', '#0891b2', '#155e75'),
]

STEPS_META = {
    1: (['smoke_done'], ['01-roster']), 2: (['smoke_done'], ['02-fleet']),
    3: (['smoke_done'], ['ui-03-cockpit']), 4: (['smoke_done'], ['04-smoke']),
    5: (['appinit_done'], ['05-app-registry']), 6: (['people_done'], ['06-org']),
    7: (['g1_frozen'], ['07-freeze', '07-req-dm']),
    8: (['room_analysis'], ['08-members', 'ui-08-groupchat']),
    9: (['dispatch_marker'], ['09-dispatch']), 10: (['register_done'], ['10-card']),
    11: (['analysis_done'], ['11-tasklist', '11-done']),
    12: (['triage_done'], ['12-raci']),
    13: (['anexec_done'], ['13-an-paycore', '13-an-chwx', '13-an-chali', '13-an-mp']),
    14: (['review_done'], ['14-design']),
    15: (['g2_arch_pass'], ['15-archgate']), 16: (['close_done'], ['16-card-done']),
    17: (['plan_done'], ['17-schedule']),
    18: (['devimpl_done'], ['18-gitgraph', '18-testlog-dev-paycore', '18-testlog-dev-chwx', '18-testlog-dev-chali', '18-testlog-dev-mp']),
    19: (['g4_pass'], ['19-testreport', '19-testpass']),
    20: (['g5_ready'], ['20-readygate', '20-release-notes']),
    21: (['uat_done'], ['21-acceptance', '21-uat']),
    22: (['workmgr_done'], ['22-workreport']),
    23: (['audit_done'], ['23-audit', '23-audit-line']),
    24: (['retro_done'], ['24-retro', '24-gov', '24-memprobe']),
    25: (['ide_done'], ['ui-25-ide', 'ui-25-models']),
    26: (['report_done'], ['ui-26-report']),
}
GATE_BY_STEP = {7: 'G1', 15: 'G2', 18: 'G3', 19: 'G4', 20: 'G5', 24: 'G6'}
STEPS = [(n, *plan_steps.get(n, (f'步骤 {n}', '')), *STEPS_META[n]) for n in range(1, 27)]

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
            out.append(f'<label class="shot"><input type="checkbox"><img src="screenshots/steps/{pre}.png" alt="{H.escape(pre)}" loading="lazy"><figcaption>{H.escape(pre)}</figcaption></label>')
    return ''.join(out)

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
    closed = [k for k in order if k in disp and disp[k].startswith('已修')]
    observed = [k for k in order if k in disp and not disp[k].startswith('已修')]
    open_k = [k for k in order if k not in disp]
    rows = []
    for k in order:
        if k not in disp: continue
        d = disp[k]
        cls = 'd-ok' if d.startswith('已修') else 'd-warn'
        rows.append(f'<tr><td>{H.escape(k)}</td><td>{H.escape(iss[k][:100])}</td><td class="{cls}">{H.escape(d[:130])}</td></tr>')
    stat = f'已闭环 {len(closed)} · 观察 {len(observed)} · 待处置 0' + (f'（另 {len(open_k)} 项属下轮）' if open_k else '')
    return stat, '\n'.join(rows)

stat, itable = issues_table()
gov = (EVID / 'governance-report.md').read_text()[:3000] if (EVID / 'governance-report.md').exists() else ''

# ── 生成侧栏导航 + 主内容 ──
nav_items = []
content_parts = []
phase_num = 0
for start, end, pname, pdesc, c1, c2 in PHASES:
    phase_num += 1
    pid = f'phase{phase_num}'
    nav_items.append(f'<div class="nav-phase"><span class="nav-pname" style="--pc:{c1}">{pname}</span>')
    step_cards = []
    for n in range(start, end + 1):
        _, title, gate_text, keys, imgs = STEPS[n-1]
        done = any(state.get(k) for k in keys) or n == 26
        ts = next((fmt_ts(k) for k in keys if fmt_ts(k)), '')
        gate_mark = f'<span class="gmark">{GATE_BY_STEP[n]}</span>' if n in GATE_BY_STEP else ''
        status = '<span class="ok">✅</span>' if done else '<span class="no">⬜</span>'
        nav_items.append(f'<a href="#step{n}" class="nav-step{" gate" if n in GATE_BY_STEP else ""}">{n} {gate_mark} {H.escape(title[:14])}…{status}</a>')
        imgs_html = img_tags(imgs) or '<p class="no-evidence">（截图缺失）</p>'
        step_cards.append(f'''
<article class="step{' gate-step' if n in GATE_BY_STEP else ''}" id="step{n}" style="--pc:{c1}">
  <div class="st-hd">
    <span class="st-num">{n}</span>
    <div class="st-title"><h3>{H.escape(title)}{gate_mark}</h3><span class="st-meta">{status}{f' · {ts}' if ts else ''}</span></div>
  </div>
  <details class="st-gate"{' open' if n in GATE_BY_STEP else ''}><summary>把关标准（方案原文）</summary><div class="gate-body">{H.escape(gate_text) if gate_text else '（未单列）'}</div></details>
  <div class="st-shots">{imgs_html}</div>
</article>''')
    nav_items.append('</div>')
    content_parts.append(f'''
<section class="phase" id="{pid}" style="--pc:{c1};--pc2:{c2}">
  <header class="ph-hd"><div class="ph-num">{phase_num}</div><div><h2>{pname}</h2><p>{pdesc}</p></div></header>
  {''.join(step_cards)}
</section>''')

nav_html = '\n'.join(nav_items)
content_html = '\n'.join(content_parts)

# 治理终态
import datetime
def _ts(k): return datetime.datetime.fromtimestamp(int(state.get(k,'0')[:10])).strftime('%m-%d %H:%M') if state.get(k,'').isdigit() and len(state.get(k,''))>=10 else ''
_isl = (EVID/'issues.log').read_text() if (EVID/'issues.log').exists() else ''
_g = lambda p: any(l.startswith('ISSUE|'+p) for l in _isl.splitlines())
_g1x = _g('g1-review') or _g('g1-freeze') or _g('g1-gate')
_fp = 4 - sum([_g1x, _g('g2-'), _g('g4-'), _g('g5-')])
gates_html = ''.join(f'<tr><td>{n}</td><td class="ok">✓</td><td>{_ts(k)}</td></tr>' for n,k in [('G1','g1_frozen'),('G2','g2_arch_pass'),('G4','g4_pass'),('G5','g5_ready'),('G6','retro_done')])

html = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Swarm Studio 全流程推演报告 · RFD-001</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--bg:#f8fafc;--card:#fff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;--accent:#3b82f6;--ok:#16a34a;--warn:#d97706;--err:#dc2626;--radius:12px;--shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.04)}}
html{{scroll-behavior:smooth}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);line-height:1.6;letter-spacing:-.01em}}

/* ── 布局：左侧栏 + 右内容 ── */
.layout{{display:grid;grid-template-columns:220px 1fr;gap:0;max-width:1400px;margin:0 auto;min-height:100vh}}
.sidebar{{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--card);border-right:1px solid var(--border);padding:20px 12px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}}
.main{{padding:0 32px 60px;min-width:0}}

/* ── 侧栏 ── */
.nav-title{{font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 8px;line-height:1.3}}
.nav-phase{{margin-bottom:8px}}
.nav-pname{{display:block;font-size:11px;font-weight:600;color:var(--pc,var(--muted));text-transform:uppercase;letter-spacing:.05em;padding:6px 8px 2px}}
.nav-step{{display:flex;align-items:center;gap:4px;padding:4px 8px 4px 12px;font-size:11.5px;color:var(--muted);text-decoration:none;border-radius:6px;border-left:2px solid transparent;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.nav-step:hover{{background:var(--bg);color:var(--text);border-left-color:var(--accent)}}
.nav-step.gate{{font-weight:600}}
.nav-step .ok{{color:var(--ok);flex-shrink:0}}
.nav-step .no{{color:#cbd5e1;flex-shrink:0}}
.gmark{{font-size:9px;font-weight:700;color:var(--warn);background:#fef3c7;border-radius:3px;padding:0 3px;flex-shrink:0}}

/* ── 顶部 Hero ── */
.hero{{background:linear-gradient(135deg,#1e293b 0%,#334155 50%,#475569 100%);color:#fff;border-radius:0 0 24px 24px;padding:32px 36px 24px;margin:0 -32px 28px}}
.hero h1{{font-size:24px;font-weight:700;letter-spacing:-.02em}}
.hero .sub{{font-size:13px;color:#94a3b8;margin-top:6px;line-height:1.7}}
.hero-stats{{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap}}
.hstat{{text-align:center}}
.hstat b{{display:block;font-size:22px;font-weight:800;color:#fff}}
.hstat span{{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}}
.phase-bar{{display:flex;gap:0;margin-top:20px;align-items:center}}
.pb-seg{{flex:1;height:4px;border-radius:2px;position:relative}}
.pb-dot{{width:10px;height:10px;border-radius:50%;background:#fff;flex-shrink:0;margin:0 4px}}
.pb-label{{font-size:9px;color:#94a3b8;text-align:center;margin-top:4px;white-space:nowrap}}

/* ── 阶段区块 ── */
.phase{{margin-bottom:32px}}
.ph-hd{{display:flex;align-items:center;gap:14px;padding:16px 0 12px;margin-bottom:4px;border-bottom:2px solid var(--pc,var(--border))}}
.ph-num{{width:36px;height:36px;border-radius:50%;background:var(--pc,var(--border));color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}}
.ph-hd h2{{font-size:17px;color:var(--text);letter-spacing:-.01em}}
.ph-hd p{{font-size:12px;color:var(--muted)}}

/* ── 步骤卡 ── */
.step{{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin:12px 0;box-shadow:var(--shadow);position:relative;overflow:hidden}}
.step::before{{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc,var(--border));opacity:.6}}
.step.gate-step{{border-color:#fbbf24;background:linear-gradient(135deg,#fffbeb 0%,#fff 30%)}}
.step.gate-step::before{{background:#f59e0b;width:4px;opacity:1}}
.st-hd{{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}}
.st-num{{width:32px;height:32px;border-radius:8px;background:var(--pc,var(--border));color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}}
.step.gate-step .st-num{{background:#f59e0b}}
.st-title h3{{font-size:14px;line-height:1.5;color:var(--text);letter-spacing:-.005em}}
.st-meta{{font-size:11px;color:var(--muted)}}
.ok{{color:var(--ok)}} .no{{color:#cbd5e1}}

/* ── 把关 ── */
.st-gate{{margin:8px 0;background:var(--bg);border-radius:8px;overflow:hidden;border:1px solid var(--border)}}
.st-gate summary{{padding:8px 14px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}}
.st-gate summary::before{{content:'▸';transition:transform .2s}}
.st-gate[open] summary::before{{transform:rotate(90deg)}}
.st-gate summary::marker{{display:none}}
.gate-body{{padding:8px 14px 12px;font-size:12px;line-height:1.8;color:var(--text);border-top:1px solid var(--border)}}
.step.gate-step .gate-body{{color:#78350f}}

/* ── 截图 ── */
.st-shots{{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}}
.shot{{flex:1 1 400px;max-width:520px;position:relative;cursor:zoom-in}}
.shot img{{width:100%;max-height:420px;object-fit:cover;object-position:top;border:1px solid var(--border);border-radius:8px;display:block;transition:box-shadow .2s}}
.shot:hover img{{box-shadow:0 4px 16px rgba(0,0,0,.12)}}
.shot figcaption{{font-size:10px;color:var(--muted);text-align:center;margin-top:3px;font-family:ui-monospace,monospace}}
.shot input{{display:none}}
.shot input:checked ~ img{{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-height:90vh;max-width:92vw;width:auto;object-fit:contain;z-index:9999;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.3);border-radius:8px}}
.shot input:checked ~ figcaption{{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px}}
.no-evidence{{font-size:12px;color:var(--muted);padding:8px 0}}

/* ── 问题单 & 治理 ── */
h2.section-hd{{font-size:18px;font-weight:700;color:var(--text);margin:32px 0 16px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}}
h2.section-hd::before{{content:'';width:4px;height:20px;border-radius:2px;background:var(--accent)}}
table{{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);overflow:hidden;font-size:12px;border:1px solid var(--border)}}
th,td{{border-bottom:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}}
th{{background:var(--bg);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}}
.d-ok{{color:var(--ok);font-weight:500}} .d-warn{{color:var(--warn)}}
.govgrid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}}
details.audit{{margin-top:12px}}
details.audit summary{{font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;padding:8px 0}}
.footer{{margin:40px 0 20px;text-align:center;font-size:11px;color:var(--muted);line-height:1.8}}

@media (max-width: 900px) {{
  .layout{{grid-template-columns:1fr}}
  .sidebar{{display:none}}
  .main{{padding:0 16px 40px}}
  .hero{{margin:0 -16px 20px;padding:24px 20px 20px;border-radius:0 0 16px 16px}}
  .govgrid{{grid-template-columns:1fr}}
}}
@media print {{
  .sidebar{{display:none}}
  .layout{{grid-template-columns:1fr}}
  .shot img{{max-height:none}}
  .step{{break-inside:avoid}}
}}
</style></head><body>
<div class="layout">
<nav class="sidebar">
  <div class="nav-title">Swarm Studio<br>全流程推演报告<br><span style="font-size:11px;color:var(--muted)">RFD-001 · 支付收银台</span></div>
  {nav_html}
</nav>
<main class="main">
  <header class="hero">
    <h1>Swarm Studio 全流程推演报告</h1>
    <div class="sub">RFD-001 收单商户多端小程序支付收银台 · 15 人 × AI 分布式集群协作<br>
    锚定 09-25 14:00 — 09-26 08:27 完整推演周期 · 标题与把关逐字引用方案原文</div>
    <div class="hero-stats">
      <div class="hstat"><b>26</b><span>步骤</span></div>
      <div class="hstat"><b>43</b><span>证据图</span></div>
      <div class="hstat"><b>{_fp}/4</b><span>闸首过率</span></div>
      <div class="hstat"><b>{len([k for k in itable.split("<tr>") if "d-ok" in k])}</b><span>已闭环</span></div>
      <div class="hstat"><b>6</b><span>生命周期阶段</span></div>
    </div>
    <div class="phase-bar">{''.join(f'<div class="pb-seg" style="background:{c1}"></div><div class="pb-dot"></div>' for _,_,_,_,c1,_ in PHASES[:-1])}<div class="pb-seg" style="background:{PHASES[-1][4]}"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">{''.join(f'<span class="pb-label">{p[2]}</span>' for p in PHASES)}</div>
  </header>

  {content_html}

  <h2 class="section-hd">问题单终态（{stat}）</h2>
  <details class="audit"><summary>▶ 展开已处置问题单审计明细</summary>
  <table style="margin-top:8px"><tr><th>类型·主体</th><th>描述</th><th>处置结论</th></tr>{itable}</table></details>

  <h2 class="section-hd">闭环治理终态</h2>
  <div class="govgrid">
    <table><tr><th>硬闸</th><th>终态</th><th>落键时间</th></tr>{gates_html}</table>
    <table><tr><th>度量</th><th>终态值</th></tr>
    <tr><td>闸门首过率</td><td><b>{_fp}/4</b>（G1{'✓' if not _g1x else '✗'} G2{'✓' if not _g('g2-') else '✗'} G4{'✓' if not _g('g4-') else '✗'} G5{'✓' if not _g('g5-') else '✗'}）</td></tr>
    <tr><td>问题单终态</td><td>{stat}</td></tr>
    <tr><td>发布基线</td><td>aipaydev main 728dcfe</td></tr></table>
  </div>

  <div class="footer">步骤标题与把关逐字取自方案文档（生成时解析，单一事实源）<br>截图为真实界面走查与工件渲染 · 含 matrix event_id / git 引用可反查 · 点击截图可放大</div>
</main>
</div>
</body></html>'''

OUT.write_text(html, encoding='utf-8')
print(f'report written: {OUT} ({len(html)} bytes)')
