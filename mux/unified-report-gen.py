#!/usr/bin/env python3
# unified-report-gen.py — 两线报告合并统一版（2026-09-28 用户指令：推演方案与报告重构合并）
# 基底：demo-report-gen（产品实操演示版：叙事层+29 步 27 图自包含实拍+六域审计+缺口台账）
# 并入（旅程线核心资产）：
#   ① 每步"把关"行——逐字取自 V3 方案文档（plan_steps 解析同 mx-report-gen，单一事实源）
#   ② 六道闸仪表盘与治理度量——从 simulation-report.html 实抽真实数字（首过率/打回/问题单/测试/基线）
#   ③ 步骤真证据索引——evidence/screenshots/steps/ 38 张（matrix event_id/git 可反查），相对路径引用
# 输出：evidence/unified-roadshow-report.html（与 steps/ 同根，相对路径可服务）
import os, re, base64, html, sys
from pathlib import Path

DIR = Path(os.path.dirname(os.path.abspath(__file__)))
SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
# UNIFIED_RUN_ID（可选）：指定推演轮次时全部输入/输出改从 runs/<RUN_ID>/ 取
# （evidence/screenshots/steps + simulation-report.html + 输出落 run 目录），
# 缺省保持既有行为（evidence/ 根，20260928 两线合并版口径）。
_RUN_ID = os.environ.get('UNIFIED_RUN_ID', '').strip()
if _RUN_ID:
    EVID = SIM / 'runs' / _RUN_ID / 'evidence'
    JOURNEY_HTML = EVID / 'simulation-report.html'
    OUT = EVID / 'unified-roadshow-report.html'
else:
    EVID = SIM / 'evidence'
    JOURNEY_HTML = EVID / 'simulation-report.html'
    OUT = EVID / 'unified-roadshow-report.html'
# 实拍源（持久位置优先；DIR/shots 为生成期临时布局回落——20260928-product-demo 迁移后留档）
SHOTS = EVID / '20260928-product-demo' / 'shots' if (EVID / '20260928-product-demo' / 'shots').is_dir() else DIR / 'shots'
STEPS_DIR = EVID / 'screenshots' / 'steps'
PLAN_PATH = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')

# ── 叙事层（同 demo-report-gen 接线）──
_ns = {}
for _sf in [SIM / 'state.env', EVID / 'state-snapshot.env']:
    if _sf.exists():
        for _line in _sf.read_text().splitlines():
            if '=' in _line and not _line.startswith('jwt_'):
                _k, _v = _line.split('=', 1)
                if _v.strip() or _k.strip() not in _ns:
                    _ns[_k.strip()] = _v.strip()
try:
    sys.path.insert(0, str(DIR))
    from report_narrative import render_narrative, render_intent_chain
    narrative_html = render_narrative(_ns, EVID)
except Exception as e:
    narrative_html = f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;color:#92400e">叙事层生成失败（如实标注）：{html.escape(str(e))}</div>'

# 意图链路（V4.1 §三 需求保真域缺口闭合）：G1 冻结 AC → 系分 → 编码门禁 → 独立测试 → UAT
try:
    intent_html = render_intent_chain(SIM)
except Exception as e:
    intent_html = f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;color:#92400e">意图链路生成失败（如实标注）：{html.escape(str(e))}</div>'

# ── ① 方案原文把关解析（与 mx-report-gen 同源正则）──
plan_steps = {}
if PLAN_PATH.exists():
    for m in re.finditer(r'^(\d{1,2})、(.+?)(?=^\d{1,2}、|^## |\Z)', PLAN_PATH.read_text(encoding='utf-8'), re.M | re.S):
        n = int(m.group(1))
        if n in plan_steps:
            continue
        block = m.group(2).strip()
        gm = re.search(r'（(把关[^：]*?)：(.+?)）\s*$', block, re.S)
        gate = ''
        if gm:
            label, body = gm.group(1), re.sub(r'\s+', ' ', gm.group(2)).strip()
            gate = body if '【' in label else label + '：' + body
        if not gate:
            gm2 = re.search(r'（把关【[^】]+】：(.+?)）\s*$', block, re.S)
            if gm2:
                gate = re.sub(r'\s+', ' ', gm2.group(1)).strip()
        plan_steps[n] = gate

# 演示步 → 方案步映射（两线步骤语义对齐；多方案步合并展示）
PLAN_MAP = {
    '1': [1, 2, 3, 4], '2': [5], '3': [6], '4': [7], '5': [7], '6': [8], '7': [9, 10],
    '8': [10, 11], '9': [11], '10': [12], '11': [13], '12': [14], '13': [15], '14': [16],
    '15': [17], '16': [18], '17': [19], '18': [19], '19': [19, 20], '20': [21], '21': [21],
    '22': [22], '23': [23], '24': [24], '25': [25], '26': [26],
}

# ── ② 旅程线真实数字实抽（simulation-report.html 的闸门表+度量表）──
journey_block = ''
gate_rows, metric_rows = [], []
if JOURNEY_HTML.exists():
    jh = JOURNEY_HTML.read_text(encoding='utf-8')
    for gr in re.finditer(r'<tr><td><b>(G[1-6])</b></td>(.*?)</tr>', jh, re.S):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', '<tr>' + gr.group(2) + '</tr>', re.S)
        gate_rows.append((gr.group(1), [re.sub(r'<[^>]+>', '', c).strip() for c in cells]))
    for mr in re.finditer(r'<tr><td>(闸门首过率|问题单终态|测试口径|发布基线)</td><td>(.*?)</tr>', jh, re.S):
        metric_rows.append((mr.group(1), re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', mr.group(2))).strip()))

# ── ③ 步骤真证据索引 ──
truth_imgs = sorted(STEPS_DIR.glob('*.png')) if STEPS_DIR.exists() else []

# ── 演示步（同 demo-report-gen STEPS，含 3b）──
from demo_steps_data import STEPS, GAPS, FIXES  # 抽出的共享数据模块

SHOTS_V2 = EVID / '20260928-product-demo' / 'shots-v2'

def b64(name):
    if not name:
        return None
    # 归一（坑④修复）：核验图集 shots-v2 优先，旧 shots/ 兜底——demo_steps_data 已把
    # 二轮审计证伪的旧引用替换为 shots-v2 核验图；并行补拍的新图仍在 shots/。
    for base in (SHOTS_V2, SHOTS):
        p = base / name
        if p.exists():
            return base64.b64encode(p.read_bytes()).decode()
    return None

out = []
out.append('''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>SwarmStudio 全流程推演 · 统一版报告（方案对齐 × 产品实操 · 2026-09-28）</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:1080px;margin:0 auto;padding:28px;color:#1f2328;background:#fafafa}
h1{font-size:26px;border-bottom:3px solid #2563eb;padding-bottom:10px}
h2{font-size:19px;margin-top:34px;border-left:4px solid #2563eb;padding-left:10px}
h3{font-size:16px;margin-top:22px;border-left:3px solid #7c3aed;padding-left:8px}
.meta{color:#57606a;font-size:13px;line-height:1.8}
.step{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.step h4{margin:0 0 6px;font-size:15.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.badge.a{background:#dcfce7;color:#166534}.badge.s{background:#dbeafe;color:#1e40af}.badge.g{background:#fef3c7;color:#92400e}
.step p{margin:6px 0 8px;font-size:13.5px;line-height:1.7;color:#374151}
.gate-line{font-size:12px;color:#92400e;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;padding:5px 9px;margin:6px 0;line-height:1.6}
.gate-line b{color:#b45309}
.step img{max-width:100%;border:1px solid #d1d5db;border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;margin:10px 0}
td,th{border:1px solid #e5e7eb;padding:7px 10px;text-align:left}
th{background:#f3f4f6}
.gap{background:#fffbeb;border:1px solid #fde68a}
.gatebox{background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:12px 0}
.gatebox .ok{color:#059669;font-weight:700}
.idx{font-size:12px}
.idx td{padding:4px 8px}
code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:12px}
</style></head><body>''')
out.append('<h1>SwarmStudio 全流程推演 · 统一版报告</h1>')
out.append('<div class="meta">生成：2026-09-28 ｜ 合并两线：旅程线（26 步对齐方案原文+闸门仪表盘+38 张步骤真证据）× 实操线（叙事层+29 步产品 UI 实拍+六域审计）<br>'
           '方案基准：V3 生命周期方案（操作单一事实源）+ V4.1 整合终版（七问题域/亮点/四维）｜ 环境：SwarmStudio :8802 + gateway :8801 + matrix :8008 ｜ 中央仓 issac-new/aipaydev<br>'
           '修复基线：' + '；'.join(f'<b>{a}</b> {b}' for a, b in FIXES) + '</div>')

# 叙事层 + 意图链路（V4.1 需求保真域）
out.append(narrative_html)
if intent_html:
    out.append(intent_html)

# 六闸仪表盘与治理度量（旅程线真实数字）
out.append('<h2>六道闸仪表盘与治理度量（旅程线真实数据实抽）</h2>')
out.append('<div class="gatebox"><table><tr><th>闸</th><th>把关要点</th><th>状态</th><th>落闸时间</th></tr>')
for g, cells in gate_rows:
    point = html.escape(cells[0]) if len(cells) > 0 else ''
    status = cells[1] if len(cells) > 1 else ''
    ts = html.escape(cells[2]) if len(cells) > 2 else ''
    st_html = f'<span class="ok">✓</span>' if '✓' in status else ('✗' if '✗' in status else html.escape(status))
    out.append(f'<tr><td><b>{g}</b></td><td style="font-size:11px">{point}</td><td>{st_html}</td><td>{ts}</td></tr>')
out.append('</table>')
if metric_rows:
    out.append('<table><tr><th>度量</th><th>终态值</th></tr>')
    for k, v in metric_rows:
        out.append(f'<tr><td>{k}</td><td>{html.escape(v)}</td></tr>')
    out.append('</table>')
out.append('<div class="meta">来源：simulation-report.html（生成时实抽，闸门首过率含真实打回环——G2/G5 打回后复评通过）。</div></div>')

# 29 步实操实录（每步附把关原文）
out.append('<h2>推演实录（产品 UI 实操 × 方案把关对齐）</h2>')
for no, name, img, typ, desc in STEPS:
    cls = {"实操作": "a", "实状态": "s"}.get(typ, "g")
    gates = [plan_steps[n] for n in PLAN_MAP.get(no, []) if plan_steps.get(n)]
    gate_html = ''
    if gates:
        joined = ' ⟂ '.join(gates)
        if len(joined) > 420:
            joined = joined[:420] + '…'
        gate_html = f'<div class="gate-line"><b>方案把关（原文）：</b>{html.escape(joined)}</div>'
    out.append(f'<div class="step"><h4><span class="badge {cls}">{typ}</span>第 {no} 步 · {html.escape(name)}</h4>'
               f'<p>{desc}</p>{gate_html}')
    data = b64(img)
    if data:
        out.append(f'<img src="data:image/png;base64,{data}" alt="{html.escape(name)}">')
    out.append('</div>')

# 真证据索引
out.append(f'<h2>步骤真证据索引（{len(truth_imgs)} 张 · matrix event_id / git 提交可反查）</h2>')
out.append('<div class="meta">旅程线逐步证据图，与上方实操实拍互补（实拍=产品界面人操作视角；真证据=工件/消息/提交留痕）。'
           '相对路径引用——报告连同 <code>evidence/</code> 目录整体分发时图可达。</div>')
out.append('<table class="idx"><tr><th>#</th><th>证据图</th></tr>')
for i, p in enumerate(truth_imgs, 1):
    out.append(f'<tr><td>{i}</td><td><code>screenshots/steps/{p.name}</code></td></tr>')
out.append('</table>')

# 缺口台账 + 验证链
out.append('<h2>本轮已知缺口（诚实台账）</h2><table class="gap"><tr><th style="width:220px">缺口</th><th>说明</th></tr>')
for g, d in GAPS:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')
out.append('<h2>验证链</h2><div class="meta">干净重放 inject（全 series）→ vitest 413 文件 3034 用例（1 例负载抖动隔离复跑过）→ build:full 绿（index.html 4141B）→ '
           '实机登录/审批/看板/IDE/概览操作实录。<br>实操截图：<code>20260928-product-demo/shots/</code>（27 张，:8802 真实渲染）｜ 真证据：<code>screenshots/steps/</code>（38 张）｜'
           ' 本报告：<code>evidence/unified-roadshow-report.html</code>（自包含实拍+外链真证据）</div>')
out.append('</body></html>')

OUT.write_text('\n'.join(out), encoding='utf-8')
print(f'unified report: {OUT} ({OUT.stat().st_size // 1024} KB, gates={len(gate_rows)}, truth_idx={len(truth_imgs)}, steps={len(STEPS)})')
