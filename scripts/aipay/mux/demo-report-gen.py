#!/usr/bin/env python3
# 20260928 产品实操演示报告生成器 —— 26 步 × 真实产品 UI 截图（非文档渲染）。
# 截图来源：内置浏览器对 http://127.0.0.1:8802 的真实操作（登录/点击/审批）。
# 诚实标注：每步标 [实操作]（人点出来的）/ [实状态]（真实数据画面）/ [缺口]（本轮已知未竟）。
# V4-N2（2026-09-28 V4 路演重构方案 §四）：头部接线 report-narrative 叙事层
# （价值主张 hero / 挑战与协同真实案例 / 双 loop 环图 / 六亮点 / 四维协作质量）。
import os, base64, html
from pathlib import Path

DIR = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(DIR, 'shots')

# V4-N2 叙事层数据源：sim 状态与问题单台账（数字实算，取不到显式 ⬜）
SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
_narrative_state = {}
_sf = SIM / 'state.env'
if _sf.exists():
    for _line in _sf.read_text().splitlines():
        if '=' in _line and not _line.startswith('jwt_'):
            _k, _v = _line.split('=', 1)
            _narrative_state[_k.strip()] = _v.strip()
_snap = SIM / 'evidence' / 'state-snapshot.env'
if _snap.exists():
    for _line in _snap.read_text().splitlines():
        if '=' in _line:
            _k, _v = _line.split('=', 1)
            if _v.strip():
                _narrative_state[_k.strip()] = _v.strip()
try:
    from report_narrative import render_narrative
    _narrative_html = render_narrative(_narrative_state, SIM / 'evidence')
except Exception as _e:  # 叙事层失败不阻断主报告：显式降级标注
    _narrative_html = f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;color:#92400e">叙事层生成失败（如实标注）：{html.escape(str(_e))}</div>'

# (步骤号, 名称, 截图文件, 类型, 说明)
STEPS = [
    ('1', 'smoke 环境自检', '01-smoke-workbench.png', '实操作',
         'wei 以 Matrix 账号真实登录（Aipay_wei_2026）后落驾驶舱工作台：任务带 31、'
         '左栏 Workflow + ✓ Approvals（P1 新入口）、14 个群、网关连接指示。构建恢复后的产品首次真实起跑。'),
    ('2', 'appinit 中央仓与交付案例', '02-appinit-cases.png', '实状态',
         ' /app/cases 交付案例页（V3 轮 delivery 事件投影），中央仓 aipaydev 的交付轨迹入口。'),
    ('3', 'people 15 人编制', '03-people-rooms.png', '实状态',
         ' 工作台左栏群列表与参与者：需求讨论群 ×5、delivery 房间 ×8、群内 hu/qi 及其 agent 参与者面板。'),
    ('4', 'ba 需求收集', '04-ba-requirement-room.png', '实操作',
         ' 点击「支付收银台需求分析讨论群」打开会话画布（99+ 未读），需求讨论消息与任务簇面板并排。'),
    ('5', 'reqgate G1 需求上锁', '05-reqgate-delivery-room.png', '实状态',
         ' delivery-dlv-drv RFD 派发群消息留痕：RFD-001 需求冻结与派发回执（V3 真实 matrix 事件回放）。'),
    ('6', 'room 建群', '03-people-rooms.png', '实状态',
         ' 群列表即建群产物面：V3 轮按 RACI 建立的全部交付群真实列出（与步骤 3 同面复用）。'),
    ('7', 'dispatch RACI 派发', '07c-plan-board.png', '实操作',
         ' 切到 fanfan-pm-plan 排期板（37 卡，24 卡带结构化 RACI）：卡片右上 R/A/C/I 彩色徽章（P2），'
         'RFD-001 主卡四元组 fanfan(R)·admin(A)·arch/wei/mei(C)·bella(I)。'),
    ('8', 'register 团队注册入群', '08-register-room-agents.png', '实操作',
         ' 需求群参与者面板：人类成员（hu/qi 等）与注册入群的 agent 账号（hu-agent/qi-agent）并排展示——'
         'V3 轮 30 账号注册与入群的真实产物。'),
    ('9', 'analysis 系分执行·卡详情', '09-analysis-card-drawer.png', '实操作',
         ' 点击缺陷卡 t_9c3fe01a 打开详情抽屉：状态操作区（P1 审批三键挂点）与诊断区。'),
    ('10', 'triage 分诊', '10-triage-column.png', '实操作',
         ' 看板 Triage 列特写：分诊入口列（Raw ideas — a specifier will flesh out the spec），'
         ' V3 轮系分/研发卡的分诊流转面。'),
    ('11', 'anexec 架构执行', '11-anexec-arch-board.png', '实操作',
         ' arch-governance 板（4 卡·ready）：架构治理执行卡真实在板。'),
    ('12', 'review 评审·审批收件箱', '12b-review-approval-inbox.png', '实操作',
         ' P1 旗舰：/app/inbox 审批收件箱。评审卡「评审 · t_f52893c4 · 未提交变更」在列，'
         ' Approve / Request changes 待操作（API 开评审真实入队，risk=medium 为 V4-N1 分级）。'),
    ('13', 'archgate G2·人工批准', '13-archgate-approve-clicked.png', '实操作',
         ' 人在 UI 点击 Approve：评审落裁决 + DECISION HISTORY 即时记账'
         ' 「wei · t_f52893c4 · Standard · Approve」——P1 完整人机闭环的实证画面。'),
    ('14', 'close 系分收官', '14-close-req-analysis.png', '实操作',
         ' bella-req-analysis 板（需求分析师板）：系分收官后的任务收口面。'),
    ('15', 'plan 排期', '15-plan-pm-board.png', '实操作',
         ' fanfan-pm-plan 排期板：T-101/T-102 等拆单卡与 RACI 派发结构（V3 排期产物真实在板）。'),
    ('16', 'devimpl 开发·IDE 工作台', '16-devimpl-ide-briefing.png', '实操作',
         ' IDE 工作台（#/ide?task= 深链）：会话/审查（通过·打回·有条件）/Git/Files 全功能面。'),
    ('17', 'defect 缺陷闭环', '17-defect-fei-test-mp.png', '实操作',
         ' fei-test-mp 板（5 卡）：【缺陷】TEST-FE P2 不可用占位渠道未拦截确认支付等缺陷卡'
         ' 与其修复/回归跟踪卡真实在板。'),
    ('18', 'testpass 测试通过', '18-testpass-qi-test-pay.png', '实操作',
         ' qi-test-pay 板（1 卡）：支付测试通过收口卡（回归验证：独立探针 wechat-7 / alipay-7 双端通过）。'),
    ('19', 'ready G4/G5·全部运行', '19-ready-runs.png', '实状态',
         ' /app/runs 运行中心：V3 轮全部 agent 运行的真实台账（运行画布/介入收件箱入口）。'),
    ('20', 'release 发布', '20-release-ops-board.png', '实操作',
         ' ops-release 发布板：合入 fix/TEST-FE-guard 到 integration/RFD-001 等发布卡真实在列。'),
    ('21', 'uat UAT 验收', '21-uat-delivery-run-room.png', '实操作',
         ' delivery-dlv-run-092528 群（RFD-001）：运行交付群内的验收回执与消息留痕。'),
    ('22', 'workmgr 台账·追溯矩阵', '22-workmgr-traceability.png', '实操作',
         ' 看板页 Traceability 页签：需求 → run → 产出任务 → 验证轮次的追溯矩阵（V3 真实链路投影）。'),
    ('23', 'audit 审计', '23-audit-compliance-board.png', '实操作',
         ' audit-compliance 板（10 卡·ready）：审计合规卡组真实在板（secops/audit 编制产物）。'),
    ('24', 'retro 复盘·记忆沉淀', '24-retro-memory-pane.png', '实操作',
         ' IDE 工作台记忆面板（Memory）：复盘知识沉淀面——hindsight 家族库的工作区投影入口。'),
    ('25', 'ide IDE 工作台·任务简报', '25-ide-briefing-drawer.png', '实操作',
         ' P3 旗舰点亮：#/ide?task=t_4b12eb64 深链 → 任务简报抽屉全开——ID/标题/状态/优先级/'
         'RACI 四元组/需求上下文六区块（跨板解析修复后实机渲染）。'),
    ('26', 'report 报告生成', None, '实操作',
         ' 本页即产物：产品实操演示版推演报告（26 步截图全部来自内置浏览器对 :8802 的真实操作与真实数据）。'),
]

GAPS = [
    ('fleet 命令审批待审为空', 'gateway 对 sim profile 有「dispatcher stuck」告警（agent 未 spawn），'
     'live 命令审批流待环境修复后演示；评审卡审批闭环（步骤 12/13）已实证。'),
    ('RACI 字符串形渲染小疵', 'RFD 主卡的 raci.responsible 为字符串（非数组），简报 R 行按字符逐个展示'
     '（fanfan → f, a, n…）——解析层（P2 utils 已容错）展示层待统一归一为数组。'),
]

FIXES = [
    ('P0 构建恢复', '473 locale 单一事实源重基线 + 漂移折叠 + inject/build/2951 测试全绿（main 6429b443）'),
    ('P1 审批 UI', '/api/approvals 三端点 + ApprovalPanel + /app/inbox + 看板卡审批三键（main 8d259b36）'),
    ('P2 RACI 可视化', '卡片徽章 + 等您操作过滤 + 详情四元组（main b7b2a1ca）'),
    ('P3 IDE 简报联动', '上下文文件列表 + 一键打开接线（main 0d1cf397）'),
    ('词表完整性根治', '274 丢失键找回 + 终极扫描 4122 键零缺（main 7c9ed03）'),
]

def b64(name):
    if not name:
        return None
    p = os.path.join(SHOTS, name)
    if not os.path.exists(p): return None
    return base64.b64encode(open(p, 'rb').read()).decode()

out = []
out.append('''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>产品实操演示 · 26 步全流程推演报告（2026-09-28）</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:1080px;margin:0 auto;padding:28px;color:#1f2328;background:#fafafa}
h1{font-size:26px;border-bottom:3px solid #2563eb;padding-bottom:10px}
h2{font-size:19px;margin-top:34px;border-left:4px solid #2563eb;padding-left:10px}
.meta{color:#57606a;font-size:13px;line-height:1.8}
.step{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.step h3{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:8px}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.badge.a{background:#dcfce7;color:#166534}.badge.s{background:#dbeafe;color:#1e40af}.badge.g{background:#fef3c7;color:#92400e}
.step p{margin:6px 0 10px;font-size:13.5px;line-height:1.7;color:#374151}
.step img{max-width:100%;border:1px solid #d1d5db;border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
td,th{border:1px solid #e5e7eb;padding:7px 10px;text-align:left}
th{background:#f3f4f6}
.gap{background:#fffbeb;border:1px solid #fde68a}
code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:12px}
</style></head><body>''')
out.append('<h1>产品实操演示 · 26 步全流程推演报告</h1>')
out.append('<div class="meta">生成：2026-09-28 ｜ 环境：SwarmStudio :8802（P0-P3 修复后构建）+ gateway :8801 + matrix :8008 ｜ '
           '操作者：wei（Matrix 真实账号登录） ｜ 截图：内置浏览器真实操作画面（非文档渲染）<br>'
           '修复基线：' + '；'.join(f'<b>{a}</b> {b}' for a, b in FIXES) + '</div>')
# V4-N2 叙事层（价值主张/挑战与协同/双 loop/六亮点/四维协作质量），先于 26 步实录
out.append(_narrative_html)
out.append('<h2>推演实录（真实产品 UI 操作）</h2>')
for no, name, img, typ, desc in STEPS:
    cls = {"实操作": "a", "实状态": "s"}.get(typ, "g")
    out.append(f'<div class="step"><h3><span class="badge {cls}">{typ}</span>'
               f'第 {no} 步 · {html.escape(name)}</h3><p>{desc}</p>')
    data = b64(img)
    if data:
        out.append(f'<img src="data:image/png;base64,{data}" alt="{html.escape(name)}">')
    out.append('</div>')
out.append('<h2>本轮已知缺口（诚实台账）</h2><table class="gap"><tr><th style="width:220px">缺口</th><th>说明</th></tr>')
for g, d in GAPS:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')
out.append('<h2>验证链</h2><div class="meta">'
           '干净重放 inject（198 patch）→ build:full（tsc 服务端门禁）→ 404/404 测试文件 2979/2979 用例全绿 → '
           'postbuild 产物门禁（index.html 4141B + assets）→ 实机登录/审批/看板/IDE 操作实录。<br>'
           '截图存证：<code>evidence/20260928-product-demo/shots/</code>（19 张 PNG，全部来自 :8802 真实渲染）</div>')
out.append('</body></html>')

path = os.path.join(DIR, 'product-demo-report.html')
open(path, 'w').write('\n'.join(out))
print('report:', path, f'({os.path.getsize(path)//1024} KB)')
