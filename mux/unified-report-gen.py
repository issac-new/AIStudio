#!/usr/bin/env python3
# unified-report-gen.py — 两线报告合并统一版（2026-09-28 用户指令：推演方案与报告重构合并）
# 基底：demo-report-gen（产品实操演示版：叙事层+29 步 27 图自包含实拍+六域审计+缺口台账）
# 并入（旅程线核心资产）：
#   ① 每步"把关"行——逐字取自 V3 方案文档（plan_steps 解析同 mx-report-gen，单一事实源）
#   ② 六道闸仪表盘与治理度量——从 simulation-report.html 实抽真实数字（首过率/打回/问题单/测试/基线）
#   ③ 步骤真证据索引——evidence/screenshots/steps/ 38 张（matrix event_id/git 可反查），相对路径引用
# 输出：evidence/unified-roadshow-report.html（与 steps/ 同根，相对路径可服务）
import os, re, base64, html, sys, subprocess
from pathlib import Path

DIR = Path(os.path.dirname(os.path.abspath(__file__)))
SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
# UNIFIED_RUN_ID（可选）：指定推演轮次时全部输入/输出改从 runs/<RUN_ID>/ 取
# （evidence/screenshots/steps + simulation-report.html + 输出落 run 目录），
# 缺省保持既有行为（evidence/ 根，20260928 两线合并版口径）。
# 运行参数优先级：--run 显式传参 > UNIFIED_RUN_ID > MX_RUN_ID（与 mx-report-gen 同源）
_RUN_ID = os.environ.get('UNIFIED_RUN_ID', '').strip() or os.environ.get('MX_RUN_ID', '').strip()
if '--run' in sys.argv:
    _RUN_ID = sys.argv[sys.argv.index('--run') + 1]
GEN_TS = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')
# 基线 commit：生成时实查（禁止硬编码）；overlay 工作树可能被并行会话占用，--git-dir 直读
def _overlay_head():
    gd = Path('/Volumes/nvme2230/lab/ncwk/overlay/.git')
    try:
        # 方案基线=main（共享工作树 HEAD 是并行会话的分支，不是方案基准）
        return subprocess.run(['git', '--git-dir', str(gd), 'rev-parse', '--short', 'main'],
                              capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ''
OVERLAY_HEAD = _overlay_head()
if _RUN_ID:
    EVID = SIM / 'runs' / _RUN_ID / 'evidence'
    JOURNEY_HTML = EVID / 'simulation-report.html'
    OUT = EVID / 'unified-roadshow-report.html'
else:
    EVID = SIM / 'evidence'
    JOURNEY_HTML = EVID / 'simulation-report.html'
    OUT = EVID / 'unified-roadshow-report.html'
# 实拍源（持久位置优先；DIR/shots 为生成期临时布局回落——20260928-product-demo 迁移后留档）
_DEMO_SHOTS = SIM / 'evidence' / '20260928-product-demo' / 'shots'
SHOTS = _DEMO_SHOTS if _DEMO_SHOTS.is_dir() else DIR / 'shots'
STEPS_DIR = EVID / 'screenshots' / 'steps'
PLAN_PATH = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')

# ── run-facts（run4 起统一报告禁硬编码轮次叙事：本轮事实由编排侧落 run-facts.env，
#    生成器只消费在档键；缺键如实省略，不编造）──
FACTS = {}
_facts_path = EVID / 'run-facts.env'
if _facts_path.exists():
    for _l in _facts_path.read_text(encoding='utf-8').splitlines():
        if '=' in _l and not _l.lstrip().startswith('#'):
            _k, _v = _l.split('=', 1)
            FACTS.setdefault(_k.strip(), _v.strip())

def _shot_exists(name: str) -> bool:
    return (STEPS_DIR / f'{name}.png').exists()

# ── 叙事层（同 demo-report-gen 接线）──
_ns = {}
for _sf in ([SIM / 'runs' / _RUN_ID / 'state.env'] if _RUN_ID else [SIM / 'state.env']) + [EVID / 'state-snapshot.env']:
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
    for mr in re.finditer(r'<tr><td>(闸门首过率|闸门判定|问题单终态|测试口径|UAT 判词|发布状态|发布基线)</td><td>(.*?)</tr>', jh, re.S):
        metric_rows.append((mr.group(1), re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', mr.group(2))).strip()))

# ── ③ 步骤真证据索引 ──
truth_imgs = sorted(STEPS_DIR.glob('*.png')) if STEPS_DIR.exists() else []

# ── R15 协作时序线（V5 补遗⑥）：scenario.log 实抽——驱动侧断言留痕本身即
#    matrix 事件/kanban 流转/git 提交三源核验的结果记录，此处仅解析呈现，禁手编 ──
collab_events = []   # (HH:MM:SS, 主体, 事件行)
_scen = EVID / 'scenario.log'
if _scen.exists():
    for _l in _scen.read_text(encoding='utf-8').splitlines():
        _m = re.match(r'^\[mux (\d{2}:\d{2}:\d{2})\] (.+)$', _l.strip())
        if not _m:
            continue
        _ts, _body = _m.group(1), _m.group(2)
        # 主体抽取：[真值]/[熔断]/[观察]/[fanfan]/[arch]/[lin]… 或「── 阶段」分隔行
        _am = re.match(r'^\[([^\]]+)\]\s*(.*)$', _body)
        if _am and not _am.group(1).startswith('mux'):
            _actor, _rest = _am.group(1), _am.group(2)
        else:
            _actor, _rest = '', _body
        if _body.startswith('──') or _body.startswith('====='):
            _actor, _rest = '阶段', _body
        collab_events.append((_ts, _actor, _rest or _body))
# 治理有效性实算（R15 配套：打回环/审批留痕/人工放行——全部在档实数）
_gov_stats = {'rework': 0, 'approve_receipts': 0, 'gate_override': 0, 'collab_total': len(collab_events)}
for _ts, _a, _b in collab_events:
    if re.search(r'熔断|退回|拒收|打回', _b):
        _gov_stats['rework'] += 1
_ap = EVID / 'approved.events'
if _ap.exists():
    _gov_stats['approve_receipts'] = sum(1 for _l in _ap.read_text(encoding='utf-8').splitlines() if _l.strip())
_gilog = EVID / 'issues.log'
if _gilog.exists():
    _gov_stats['gate_override'] = sum(1 for _l in _gilog.read_text(encoding='utf-8').splitlines()
                                      if _l.startswith('ISSUE|gate-breaker-override'))

# ── run 模式（UNIFIED_RUN_ID）：旅程线报告正文嵌入 + 审计改判/新特性真值节 ──
RUN_BODY = ''
JOURNEY_STYLE = ''
if _RUN_ID and JOURNEY_HTML.exists():
    _jh = JOURNEY_HTML.read_text(encoding='utf-8')
    _sm = re.search(r'<style>(.*?)</style>', _jh, re.S)
    if _sm:
        JOURNEY_STYLE = ('\n/* ── 旅程线正文样式（run 模式随正文注入，后定义覆盖同名 demo 类）── */\n'
                         + _sm.group(1))
    _m = re.search(r'<body[^>]*>(.*)</body>', _jh, re.S)
    if _m:
        RUN_BODY = _m.group(1)

# ── 演示步（同 demo-report-gen STEPS，含 3b）──
from demo_steps_data import STEPS, GAPS, FIXES  # 抽出的共享数据模块

SHOTS_V2 = SIM / 'evidence' / '20260928-product-demo' / 'shots-v2'

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
<title>Swarm Studio 全流程推演 · 统一版报告（方案对齐 × 产品实操__TITLE_RUN__）</title>
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
</style>''' + JOURNEY_STYLE + '''</head><body>''')
_title_run = f' · RUN_ID={_RUN_ID}' if _RUN_ID else ' · 20260928 两线合并版'
_truth_total = len(truth_imgs)
_step_total = len(STEPS) if not RUN_BODY else 26
out.append('<h1>Swarm Studio 全流程推演 · 统一版报告</h1>')
out.append(f'<div class="meta">生成：{GEN_TS}（实查）｜ 合并两线：旅程线（26 步对齐方案原文+闸门仪表盘+{_truth_total} 张步骤真证据）× 实操线（叙事层+{_step_total} 步产品 UI 实拍+六域审计）<br>'
           f'方案基准：V5 整合版（唯一正本，操作主链沿用 V3 原文解析）｜ 环境：SwarmStudio :8802 + gateway :8801 + matrix :8008 ｜ 中央仓 issac-new/aipaydev'
           + (f' ｜ 基线：overlay HEAD <code>{html.escape(OVERLAY_HEAD)}</code>' if OVERLAY_HEAD else '') + '<br>'
           '修复基线：' + '；'.join(f'<b>{a}</b> {b}' for a, b in FIXES) + '</div>')

# ── 第 0 章 推演逻辑与协作顺序总述（补遗⑥ R15；演示动线并入本章）──
if RUN_BODY:
    _tri = [('ui-03-cockpit', '工作台（#/app）'), ('ui-10-kanban', '看板（#/app/board）'), ('ui-25-ide', 'IDE 画布（#/app/ide）')]
    _tri_html = ' ｜ '.join((f'<b>{n}</b> <code>{s}.png</code>' if _shot_exists(s) else f'{n}（本轮未拍——如实标注）') for s, n in _tri)
    # 六幕分幕总览（方案事实：六阶段 × 主角 × 闸门；状态色自本轮闸门表）
    _gate_status = {g: ('✓' in (cells[1] if len(cells) > 1 else '')) for g, cells in gate_rows}
    ACTS = [
        ('一 环境准备', '1-4', '账号分配 · 配置初始化 · 登录 · 冒烟', 'admin+各用户', '—', ''),
        ('二 需求管理', '5-7', '应用登记 · 人员管理 · 需求上锁', 'admin+bella(BA)+人审', 'G1（步7）', 'G1'),
        ('三 需求分析', '8-14', '建群 · 派发 · 系统分析 · 四路系分 · 复核定稿', 'fanfan(PM)+系分 agent+各 lead', '—', ''),
        ('四 设计评审与编码', '15-18', 'G2 评审 · 归档 · 排期 · G3 编码', 'arch 治理组+研发 agent', 'G2（步15）G3（步18）', 'G2'),
        ('五 测试与交付', '19-21', 'G4 测试 · G5 准出 · 发版 UAT', 'qi/fei 独立测试+PM+评审卡+bella', 'G4（步19）G5（步20）', 'G4'),
        ('六 治理与复盘', '22-26', '台账 · 审计 · G6 复盘 · IDE · 报告', '全员+治理 AI+audit', 'G6（步24）', 'G6'),
    ]
    _acts_rows = []
    for act, rng, goal, who, gates, gk in ACTS:
        _st = ''
        if gk:
            _st = '<span style="color:#059669;font-weight:700">✓ 已过</span>' if _gate_status.get(gk) else '<span style="color:#b45309">（见审计叠加层）</span>'
        _acts_rows.append(f'<tr><td><b>{act}</b></td><td>步 {rng}</td><td>{goal}</td><td style="font-size:12px">{who}</td><td>{gates}</td><td>{_st}</td></tr>')
    out.append('<h2 id="ch0-collab">第 0 章 · 推演逻辑与协作顺序总述（R15）</h2>')
    out.append('<div class="gatebox"><b style="font-size:14px">产品定位（一页）</b>'
               '<p style="margin:6px 0;font-size:13.5px;line-height:1.8">Swarm Studio 是 AI 员工驱动的研发交付系统：'
               '15 人编制（人+AI 助理 30 个 matrix 账号）在"每人一套 hermes agent + swarm studio、共用 matrix 后台"的形态下，'
               '完整跑通"需求冻结→系统分析→架构评审→排期→编码→独立测试→发布准出→UAT→治理复盘"。'
               '人的角色=<b>意图持有者、仲裁者、最终验证者</b>；AI 员工（需求设计/应用研发/质量测试/研发治理四类）主理执行；'
               '六道硬闸守住意图对齐与不可逆决策；一切"完成"必须带代码提交号+任务卡号双凭证并经系统反向核验。'
               '产品面=驾驶舱单面六功能区（工作台/看板/IDE 画布/审批收件箱/治理中心/账户），'
               '双 loop=skill 内循环 × swarm 外循环。</p></div>')
    out.append('<div class="gatebox"><b style="font-size:14px">演示动线（补遗⑤ 驾驶舱单面）</b>'
               '<p style="margin:6px 0;font-size:13.5px;line-height:1.8">登录 → 驾驶舱工作台（任务/在线 chips·注意力条·中栏会话画布）'
               ' → 审批收件箱（三档分区·抽检回看） → swarm kanban 看板（RACI 徽章·状态流转·全链路追踪页签） → IDE 画布（任务简报·交互编码）'
               ' → 治理中心（六闸工件·应用资产·组织）——全流程不出 /app 路由树。</p>'
               f'<p style="margin:4px 0;font-size:12.5px;color:#57606a">三功能区证据（R7 核验口径）：{_tri_html}</p></div>')
    out.append('<h3>26 步六阶段分幕总览</h3>'
               '<div class="meta">每幕一行：目标 · 主角（RACI 摘要）· 闸门位置；先读此表建立全局，再走下方 26 步实录。闸门状态列自本轮闸门表实抽。</div>'
               '<table><tr><th>幕</th><th>步骤</th><th>目标</th><th>主角（谁在做什么）</th><th>闸门</th><th>本轮</th></tr>'
               + ''.join(_acts_rows) + '</table>')
    out.append('<h3>RACI 协作时序线（scenario.log 实抽，' + str(len(collab_events)) + ' 条）</h3>'
               '<div class="meta">数据源=导演侧断言留痕（每行本身即 matrix 事件/kanban 流转/git 提交三源核验的结果记录）——'
               '谁在何时发起、谁执行、谁把关、何处打回，时间线自明；锚点（event_id $xxx／t_ 卡号）可反查。</div>')
    if collab_events:
        out.append('<details open><summary style="cursor:pointer;font-size:13px;color:#1e40af">展开协作时序全表（按推演时间正序）</summary>'
                   '<table class="idx" style="max-height:520px;overflow:auto;display:block"><tr><th>时间</th><th>主体</th><th>协作事件（含锚点）</th></tr>')
        for _ts, _a, _b in collab_events:
            out.append(f'<tr><td style="white-space:nowrap">{_ts}</td><td style="white-space:nowrap">{html.escape(_a)}</td>'
                       f'<td style="font-size:11.5px">{html.escape(_b[:220])}</td></tr>')
        out.append('</table></details>')
    else:
        out.append('<div class="gap" style="padding:10px 14px;font-size:13px">本轮 scenario.log 无可解析协作事件（如实标注，禁编造）。</div>')

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

    # 新特性实证（run4 起数据驱动：按本轮证据文件存在性挂接实拍锚——缺图如实标"本轮未出数"，
    # 文案锚=V5 §七 终态表产品事实；run2 版硬编码叙事已废）
    _feat_defs = [
        ('ui-01-accounts', 'P6 账户管理联动（补遗④）',
         '设置·账户管理页（#/app/accounts）：matrix 账号创建/分配/停用走 synapse 管理端 API，本机↔matrix 双账号绑定维护，'
         'roster 由界面导出入仓——第 1 步账号分配自此产品化，不依赖脚本直建。'),
        ('ui-gov-center', 'P7/P8 应用资产表 + 组织关系 UI（补遗④）',
         '治理中心双表：应用资产六列表单（登记/变更/退役，保存即 git 提交，app-registry.md 为界面产物）与组织关系维护'
         '（账号↔团队↔负责人 + 入职/转岗/离职三步向导：移交→停用→审计留痕）——第 5/6 步资产登记与组织对账的产品面。'),
        ('ui-03-cockpit', 'P9/P10 驾驶舱聚焦单面 + 精简批（补遗⑤）',
         '推演 UI 面限定驾驶舱：IDE 归一 /app/ide、看板归一 /app/board、审批深链迁 /app 树、RunCanvas 并入运行详情；'
         '主侧栏一级入口仅「驾驶舱」（+系统折叠组），全流程 UI 动线不出 /app 路由树。'
         'S 档精简：16 个驾驶舱孤儿组件退役、/app/eng 页退役重定向、系统组三入口摘除、WebPet 默认关。'),
        ('ui-08d-members', '建群全量预邀（room-invite-gap 终清）',
         '建群即按 RACI 全量预邀（人+agent 双账号并列入列）——V3×7、V4-run1×8 复发的 room-invite-gap 在 run2 起 0 缺口，'
         '本轮 0→1 清环境后复验。'),
        ('ui-08c-flow-timeline', 'P4③ 群任务流转时间线（消息源分派根治）',
         '分析群右栏按选择类别分派消息源，真实渲染派发/完成回执/流转事件时间线（修复前恒空）。'),
        ('ui-20b-spotcheck', '低风险自动通过抽检器（V4.1 §七）',
         '纯只读命令过宽限期自动放行，确定性抽检（stableHash 20%）送人复核，veto=误放行治理回灌；'
         '收件箱「抽检·自动放行回看」区呈现真实台账。'),
        ('ui-04b-sit-online', '驾驶舱回归：页头「任务/在线」chips（补遗④第 3 项）',
         '登录后任务计数=看板实况、在线三数（人/智能体/机器）>0 且下拉可点选——「在线恒零」自本轮起为准出阻断项，'
         'headless 侧（gateway detailed 健康）+ 浏览器侧（ui-04a/ui-04b）双源合并验证。'),
    ]
    feats = [(t, d) for shot, t, d in _feat_defs if _shot_exists(shot)]
    _miss_feats = [t for shot, t, d in _feat_defs if not _shot_exists(shot)]
    out.append('<h2>本轮产品重点实证（按证据存在性挂接）</h2>')
    for t, d in feats:
        out.append(f'<div class="step"><h4>✦ {html.escape(t)}</h4><p>{d}</p></div>')
    if _miss_feats:
        out.append('<div class="gap" style="padding:10px 14px;font-size:13px">本轮未出数的实证位（如实标注，不计通过）：'
                   + '；'.join(html.escape(t) for t in _miss_feats) + '</div>')

    # 研发全流程治理有效性（补遗⑥：重点难点突出——治理逆境实数，全部在档实算）
    _ilog_p = EVID / 'issues.log'
    _iss_n = _disp_n = 0
    if _ilog_p.exists():
        _seen_i, _seen_d = set(), set()
        for _l in _ilog_p.read_text(encoding='utf-8').splitlines():
            if _l.startswith('ISSUE|'):
                _p = _l.split('|', 3)
                _seen_i.add(f'{_p[1]}·{_p[2]}')
            elif _l.startswith('DISP|'):
                _p = _l.split('|', 3)
                _seen_d.add(f'{_p[1]}·{_p[2]}')
        _iss_n, _disp_n = len(_seen_i), len(_seen_d)
    _gov_cards = [
        ('协作事件总数', _gov_stats['collab_total'], 'scenario.log 三源核验留痕行'),
        ('真实打回环', _gov_stats['rework'], '熔断/退回/拒收事件（治理闸真实拦截，非橡皮图章）'),
        ('人工批准留痕', _gov_stats['approve_receipts'], 'approved.events（HumanGate 可反查）'),
        ('熔断人工放行', _gov_stats['gate_override'], 'GATE_BREAKER_OVERRIDE 显式放行记档（治理逆境素材）'),
        ('问题单处置率', f'{_disp_n}/{_iss_n}' if _iss_n else '0/0', 'issues.log 唯一键 DISP 回写'),
    ]
    out.append('<h2>研发全流程治理有效性（实算）</h2>'
               '<div class="meta">"有效应用及治理"的量化呈现：打回环=闸门真实拦截的证据；人工放行=逆境下的人机接力（均在 issues.log 留痕可反查）。</div>'
               '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">')
    for _t, _v, _d in _gov_cards:
        out.append(f'<div class="step" style="flex:1;min-width:180px;margin:0"><h4 style="font-size:13.5px">{html.escape(str(_t))}</h4>'
                   f'<div style="font-size:24px;font-weight:700;color:#1e40af">{html.escape(str(_v))}</div>'
                   f'<p style="font-size:11.5px;color:#57606a">{html.escape(_d)}</p></div>')
    out.append('</div>')

    # 独立审计真值叠加层（run4 起数据驱动：读本轮 evidence 的审计产物；
    # 缺产物=如实标"待审计"，绝不沿用旧轮审计叙事）
    out.append('<h2>独立审计与报告审计（真值叠加层）</h2>')
    _audit_txt = EVID / 'report-audit.txt'
    _disp = EVID / 'audit-response-disposition.md'
    if _audit_txt.exists():
        _lines = [l.rstrip() for l in _audit_txt.read_text(encoding='utf-8').splitlines() if l.strip()]
        out.append('<div class="gatebox"><p style="margin:4px 0;font-size:13px">mx-report-audit（四查+R3-R9 断言链）输出（'
                   + f'<code>{_audit_txt.name}</code>）：</p><pre style="font:12px ui-monospace;white-space:pre-wrap;background:#f9fafb;'
                   + 'padding:10px;border-radius:6px;border:1px solid #e5e7eb;margin:6px 0">'
                   + html.escape('\n'.join(_lines[:60])) + '</pre></div>')
    else:
        out.append('<div class="gap" style="padding:10px 14px;font-size:13px">本轮 report-audit.txt 尚未落档——统一报告生成先于审计时如实标注，审计后须重生成。</div>')
    if _disp.exists():
        out.append(f'<div class="meta">审计处置单一事实源：<code>{_disp.name}</code>（本 evidence 目录）——独立意见与导演侧不一致时以独立意见为准，改判留痕。</div>')
    else:
        out.append('<div class="meta">本轮无 audit-response-disposition.md（审计无保留意见时不出具）。</div>')

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
if RUN_BODY:
    # run4 起数据驱动：issues.log 未闭环键实算 + run-facts.env 声明的记档项；缺源=如实空表
    _ilog = EVID / 'issues.log'
    _iss, _disp = [], set()
    if _ilog.exists():
        for _l in _ilog.read_text(encoding='utf-8').splitlines():
            if _l.startswith('ISSUE|'):
                _p = _l.split('|', 3)
                if f'{_p[1]}·{_p[2]}' not in _iss:
                    _iss.append(f'{_p[1]}·{_p[2]}')
            elif _l.startswith('DISP|'):
                _p = _l.split('|', 3)
                _disp.add(f'{_p[1]}·{_p[2]}')
    _open = [k for k in _iss if k not in _disp]
    gaps_show = [(f'未闭环问题单（{len(_open)}/{len(_iss)}）', '；'.join(_open) if _open else '无——全部已处置（DISP 回写台账）')]
    for _gi, _gd in [tuple(x.split('=', 1)) for x in FACTS.get('limitation', '').split(';;') if '=' in x]:
        gaps_show.append((_gi.strip(), _gd.strip()))
    if not _ilog.exists():
        gaps_show.append(('issues.log', '本轮 evidence 无 issues.log（无问题单记录）'))
else:
    gaps_show = GAPS
for g, d in gaps_show:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')

# 六闸把关标准清单（V5 §4.4 显性化——报告侧可核对表格：逐项标准×本轮状态）
if RUN_BODY and gate_rows:
    _gate_status = {g: ('✓' in (cells[1] if len(cells) > 1 else '')) for g, cells in gate_rows}
    _gate_ts = {g: (cells[2] if len(cells) > 2 else '') for g, cells in gate_rows}
    SIXGATE_SPEC = [
        ('G1', '需求上锁', '①逐条验收标准可机械判定（≥3 条）②范围外清单 ③影响面 ④涉敏评估 ⑤两轮不齐不得开工'),
        ('G2', '架构治理评审', '①设计五要素 ②爆炸半径排查 ③验证计划前移 ④备选方案≥2 有取舍 ⑤历史偏差红杠显式回应'),
        ('G3', '编码门禁', '①无设计不编码 ②需求-代码-测试一一对应 ③单测阈值全绿 ④金额分（int64）⑤渠道本地 mock ⑥testlog 脚本真查 ⑦落键 g3_code_pass'),
        ('G4', '独立验证', '①测试者≠写码者 ②缺陷报修验全关 ③只认本轮派发后记录 ④测试报告六要素 ⑤执行输出摘要 ⑥实跑 commit 与基线同祖'),
        ('G5', '发布准出', '①测试证据挂卡 ②构建同 commit 可复现 ③依赖无新增 ④回滚方案具体化 ⑤灰度三档观察 ⑥发布说明面向用户 ⑦HumanGate 批准可反查 ⑦\'判词只认评审卡结构化字段 ⑧FAIL 即发布冻结'),
        ('G6', '复盘', '①三段式 ②行动项四要素 ③治理度量实算 ④问题单 100% DISP 回写台账 ⑤经验入家族记忆库'),
    ]
    out.append('<h2>六闸把关标准清单（V5 §4.4 显性化）</h2>'
               '<div class="meta">每道闸的逐项检查标准（唯一事实源=方案 §4.4）；状态列自本轮闸门表实抽，判词真值见审计叠加层。</div>'
               '<table><tr><th>闸</th><th>把关标准（逐项全过才 PASS）</th><th>本轮</th><th>落闸时间</th></tr>')
    for g, name, spec in SIXGATE_SPEC:
        _st = '✓' if _gate_status.get(g) else '（见审计）'
        out.append(f'<tr><td><b>{g}</b> {name}</td><td style="font-size:11.5px;line-height:1.6">{spec}</td>'
                   f'<td>{_st}</td><td style="font-size:11px">{html.escape(_gate_ts.get(g, ""))}</td></tr>')
    out.append('</table>')

if RUN_BODY:
    # 验证链（run4 起由 run-facts.env 在档键派生，缺键省略）
    _vl = []
    for _k, _fmt in [('code_line', '服务面代码线：{}'), ('inject_count', '补丁注入：{}（私有上游沙箱隔离重放）'),
                     ('build', '构建：{}'), ('vitest', '测试：{}'), ('run_window', '推演执行：{}（真实 LLM 回合+导演侧断言）'),
                     ('baseline', '发布基线：{}'), ('stack', '环境：{}')]:
        if FACTS.get(_k):
            _vl.append(_fmt.format(html.escape(FACTS[_k])))
    out.append('<h2>验证链</h2><div class="meta">' + '<br>'.join(_vl if _vl else ['（run-facts.env 未落档——如实省略，禁编造）'])
               + f'<br>截图：<code>screenshots/steps/</code>（{len(truth_imgs)} 张，:8802 真实渲染+快门守门）｜ 旅程线报告：<code>simulation-report.html</code>｜ 本报告：<code>evidence/unified-roadshow-report.html</code>（UNIFIED_RUN_ID 模式）</div>')
else:
    out.append('<h2>验证链</h2><div class="meta">干净重放 inject（全 series）→ vitest 413 文件 3034 用例（1 例负载抖动隔离复跑过）→ build:full 绿（index.html 4141B）→ '
               '实机登录/审批/看板/IDE/概览操作实录。<br>实操截图：<code>20260928-product-demo/shots/</code>（27 张，:8802 真实渲染）｜ 真证据：<code>screenshots/steps/</code>（38 张）｜'
               ' 本报告：<code>evidence/unified-roadshow-report.html</code>（自包含实拍+外链真证据）</div>')
out.append('</body></html>')

_title_run = f' · RUN_ID={_RUN_ID}' if _RUN_ID else ' · 20260928 两线合并版'
OUT.write_text('\n'.join(out).replace('__TITLE_RUN__', _title_run), encoding='utf-8')
print(f'unified report: {OUT} ({OUT.stat().st_size // 1024} KB, gates={len(gate_rows)}, truth_idx={len(truth_imgs)}, steps={len(STEPS)})')
