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

# ── run 模式（UNIFIED_RUN_ID）：旅程线报告正文嵌入 + 审计改判/新特性真值节 ──
RUN_BODY = ''
if _RUN_ID and JOURNEY_HTML.exists():
    _jh = JOURNEY_HTML.read_text(encoding='utf-8')
    _m = re.search(r'<body[^>]*>(.*)</body>', _jh, re.S)
    if _m:
        RUN_BODY = _m.group(1)

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

# 叙事层 + 意图链路（V4.1 需求保真域；run 模式下叙事层由旅程线正文自带，去重）
if not RUN_BODY:
    out.append(narrative_html)
if intent_html:
    out.append(intent_html)

# ── run 模式：本轮真值节（审计改判/新特性实证/探针标注）→ 旅程线正文整体嵌入 ──
if RUN_BODY:
    out.append(f'<h2>本轮口径（RUN_ID={html.escape(_RUN_ID)}）</h2>')
    out.append('<div class="meta">本报告=叙事层+意图链路+本轮真值+旅程线 26 步全文（下方"推演实录"段）。'
               '旅程线四查（标题逐字 26/26·把关齐·完成步图齐·无假重复·引用无缺·闸门与 state 一致）已过；'
               '真实性叠加层见下方"独立审计改判"节——闸门状态与 state 一致 ≠ 实质通过，判词以审计复核为准。</div>')

    # 新特性实证（20260929 重构轮四件套中本轮可感知的三件）
    feats = [
        ('建群全量预邀（room-invite-gap 根治）',
         '方案 §8 原文要求 fanfan 建群时"自动邀请全部关联人进群后再开始分析"。此前实现只邀 fanfan-agent，'
         '接收方入群全押 agent 自动邀请——V3 轮 ×7、V4-run1 ×8 复发 room-invite-gap。本轮修复后建群即 18 人全员在列'
         '（fanfan+agent+8 关联人×人/agent 双账号），步骤 10 成员核验 0 缺口、issues 零 room-invite-gap（run1 同点位 ×8）。'
         '实拍：<code>screenshots/steps/ui-08d-members.png</code>'),
        ('P4③ 群任务流转时间线（消息源分派根治）',
         '修复前右栏时间线只读 matrix-room store，而群聊消息在 hermes group-chat store（GroupChatView 自装载）——'
         '分析群右栏恒空（"分析群面板未出数"）。修复后按选择类别分派消息源，本轮分析群右栏真实渲染派发/完成回执时间线。'
         '实拍：<code>screenshots/steps/ui-08c-flow-timeline.png</code>'),
        ('低风险自动通过抽检器（V4.1 §七）',
         '纯只读命令（risk-tier low）过宽限期自动放行（choice=once，actor=system），确定性抽检（stableHash，默认 20%）'
         '入队送人复核；veto=误放行治理回灌。本轮真实链路四行台账：system auto_pass(low)×2 → fanfan spotcheck_confirm——'
         '放行、抽样、复核、落账全链可反查（~/.hermes-web-ui/approvals/history.json）。'
         '实拍：<code>screenshots/steps/ui-20b-spotcheck.png</code>。如实标注：抽样命中轮由导演侧通道探针驱动'
         '（本轮 agent 请求全部为写操作=medium/high，无自然 low 样本），探针命令为真实只读清单、经真实传输/分类/放行/抽检管线。'),
    ]
    out.append('<h2>本轮新特性实证（20260929 重构轮）</h2>')
    for t, d in feats:
        out.append(f'<div class="step"><h4>✦ {html.escape(t)}</h4><p>{d}</p></div>')

    # 独立审计改判（真值叠加层——单一事实源=audit-response-disposition.md）
    out.append('<h2>独立审计改判（真值叠加层）</h2>')
    out.append('<div class="gap" style="padding:12px 14px;border-radius:8px"><p style="margin:4px 0">'
               '独立合规审计对本轮出具 <b>AUDIT-OPINION-CONCERNS</b>（10 项清单），与导演侧机械化意见"通过（无发现）"不一致。'
               '逐条处置单一事实源：<code>audit-response-disposition.md</code>（本 evidence 目录）。报告呈现口径按审计复核：'
               '</p><ul style="font-size:13px;line-height:1.8;margin:6px 0">'
               '<li><b>G5 判词改判</b>：04:49:04 的 READY-GATE ✓ 实为 stub 消息词面误配（"False alarm — READY-GATE-PASS 或 FAIL"被匹配），'
               '真实评审 04:51:27 完成、评审卡 body=READY-GATE-FAIL——<b>步 20 按 R-A1 判回滚</b>，G5 实质未通过（修复 H8 已根治判词语义）。</li>'
               '<li><b>发布基线丢线</b>：69ba333→0ab43de 非快进重建丢 23 提交（双缺陷回归风险）——修复 H11 集成续建改 merge 增量+丢线守卫，回补重验列行动项。</li>'
               '<li><b>UAT 有条件</b>：AC-4/AC-7 有条件通过（历史缺陷修复未合入 integration 基线），验收书"全部 AC 通过"为判词矛盾——修复 H9 逐条判词，放行权归 bella。</li>'
               '<li><b>G3 落键缺失/HumanGate 自评自批/评审卡导演自批</b>——H10/H8 系列根治；审批人独立性=单操作者无人值守环境局限，观察记档。</li>'
               '<li><b>双开污染窗口（02:26–02:37）</b>：run1-ready 续跑因锁判活 bug 误接管 run2 驱动锁，双驱动同栈 11 分钟——'
               '锁判活修复 H1 已根治（fix/harness-gate-integrity 分支，守门 28/28 绿），本报告对应时段证据须带此保留。</li>'
               '</ul></div>')

    # 旅程线正文（26 步全文）
    out.append('<h2>推演实录（旅程线 26 步全文）</h2>')
    out.append(RUN_BODY)

# 六闸仪表盘与治理度量（旅程线真实数字；run 模式跳过——旅程线正文自带本轮六闸）
if not RUN_BODY:
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

# 29 步实操实录（每步附把关原文；run 模式跳过——旅程线 26 步全文为本轮实录）
if not RUN_BODY:
  out.append('<h2>推演实录（产品 UI 实操 × 方案把关对齐）</h2>')
for no, name, img, typ, desc in (STEPS if not RUN_BODY else []):
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
gaps_show = GAPS if not RUN_BODY else [
    ('G5 实质未过（审计改判）', 'READY-GATE ✓ 为 stub 词面误配，评审卡 body=READY-GATE-FAIL——按 R-A1 判回滚；判词语义根治 H8 落 fix/harness-gate-integrity（守门 28/28 绿）。'),
    ('发布基线丢线待回补', '69ba333→0ab43de 非快进重建丢 23 提交；H11 merge 增量+丢线守卫已根治机制，回补重验列行动项。'),
    ('UAT 有条件通过', 'AC-4/AC-7 有条件（历史缺陷修复未合入 integration）；H9 逐条判词根治，放行权归 bella。'),
    ('双开污染窗口 02:26-02:37', 'run1-ready 续跑因锁判活 bug 误接管 run2 驱动锁双驱动 11 分钟；该时段证据带保留。H1 已根治。'),
    ('抽检样本来源标注', 'agent 请求全为写操作（medium/high）无自然 low 样本——抽检链由导演侧只读探针驱动走真实管线，已在实证节标注。'),
    ('审批人独立性', '单操作者无人值守推演环境局限：G5 HumanGate=导演自批；产品级独立审批线（收件箱四键面已具）留 backlog。'),
]
for g, d in gaps_show:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')
if RUN_BODY:
    out.append('<h2>验证链</h2><div class="meta">本轮（20260929-v4-run2）：overlay main 系 244 补丁 inject → build:full 绿 → studio 重启 → '
               '全流程 26 步推演（02:13-05:15，真实 LLM 回合+导演侧断言）→ 旅程线报告 mx-report-gen（四查全过）→ 独立合规审计（10 项）→ '
               '逐条处置（audit-response-disposition.md）→ 本统一报告。<br>'
               'overlay 门禁：目标域测试 55 用例+harness 守门 28 用例绿；全量 vitest 3056/3056（20260929 01:33 实跑）。<br>'
               '截图：<code>screenshots/steps/</code>（33 张，:8802 真实渲染）｜ 旅程线报告：<code>simulation-report.html</code>｜ 本报告：<code>evidence/unified-roadshow-report.html</code>（UNIFIED_RUN_ID 模式）</div>')
else:
    out.append('<h2>验证链</h2><div class="meta">干净重放 inject（全 series）→ vitest 413 文件 3034 用例（1 例负载抖动隔离复跑过）→ build:full 绿（index.html 4141B）→ '
               '实机登录/审批/看板/IDE/概览操作实录。<br>实操截图：<code>20260928-product-demo/shots/</code>（27 张，:8802 真实渲染）｜ 真证据：<code>screenshots/steps/</code>（38 张）｜'
               ' 本报告：<code>evidence/unified-roadshow-report.html</code>（自包含实拍+外链真证据）</div>')
out.append('</body></html>')

OUT.write_text('\n'.join(out), encoding='utf-8')
print(f'unified report: {OUT} ({OUT.stat().st_size // 1024} KB, gates={len(gate_rows)}, truth_idx={len(truth_imgs)}, steps={len(STEPS)})')
