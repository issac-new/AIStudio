#!/usr/bin/env python3
# gen-report-v2.py — 产品实操演示报告生成器 V2（推演审计二轮改版）
# 与 V1 的差异：
#   ① 步骤轴对齐《V3 全流程推演方案》26 步原文（步骤号+把关），不再自造合并序号；
#   ② 每步证据三分类角标：界面实拍（产品 UI 真操作）/ 消息转录（matrix 真事件）/
#      仓内工件（中央仓 git 锚点）——沿用 d50915eb 三分类口径；
#   ③ 图证强一致：仅收审计核对过的截图（report-audit-20260928-2.md 二轮复审），
#      无图证如实标 ⬜，不做"图不够文来凑"；
#   ④ 操作人徽章：该步真实操作者（人/AI/闸门角色）。
import os, base64, html
from pathlib import Path

DIR = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(DIR, 'shots-v2')

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
_narrative_state = {}
for _f in (SIM / 'state.env', SIM / 'evidence' / 'state-snapshot.env'):
    if _f.exists():
        for _line in _f.read_text().splitlines():
            if '=' in _line and not _line.startswith('jwt_'):
                _k, _v = _line.split('=', 1)
                if _v.strip():
                    _narrative_state[_k.strip()] = _v.strip()
try:
    from report_narrative import render_narrative
    _narrative_html = render_narrative(_narrative_state, SIM / 'evidence')
except Exception as _e:
    _narrative_html = f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;color:#92400e">叙事层生成失败（如实标注）：{html.escape(str(_e))}</div>'

# 证据类别（三分类口径）
UI, MSG, DOC = '界面实拍', '消息转录', '仓内工件'

# (方案步骤号, 步骤名, 操作人, 截图文件或 None, 证据类别, 步骤正文, 把关摘要)
# 把关摘要取自《2026-09-25-mux-v3-lifecycle-plan.md》§具体流程 各步括号内条文。
STEPS = [
    ('1', '管理员分配 matrix 账号（30 账号编制）', 'admin',
     's01b-roster.png', UI,
     '治理中心·账号清单工件（15 人编制）：姓名×角色×人类账号×AI 助理账号×专属看板×matrix ID 逐行对账，真仓锚点 0217cf2。',
     '准出：30 账号逐一登录验证通过、roster 入档；合格线：账号与编制表一一对应。'),
    ('2', '用户配置初始化（gateway/看板/团队/记忆库四件套）', 'admin',
     's02-boards-registry.png', UI,
     '看板板清单：每人每应用专属看板真实在列（arch-governance/audit-compliance/fanfan-pm-plan 43/wei-pay-core 15/xiao-cashier-mp 6…认领白名单锁定）。',
     '准出：账号+配置+看板+团队+记忆库装配清单可逐项列出；合格线：四件套齐全且互不可见。'),
    ('3', 'studio 登录（matrix 免密/密码两通道）', 'wei',
     's03-login.png', UI,
     '登录页：matrix 地址/用户名/密码表单+矩阵服务器连接状态（●已连接 matrix.test）。',
     '准出：全部账号登录通过、跨账号不可见抽查；合格线：两种登录方式都通。'),
    ('4', '环境冒烟（推演正式开始）', 'wei',
     's04-smoke-cockpit.png', UI,
     '驾驶舱工作台：14 房间列表（同名群带 #短房ID 消歧后缀）+任务计数（待办5/就绪23/受阻7）+网关连接指示+待审收件箱/治理中心入口。',
     '准出：冒烟清单全绿（账号/服务/登录/看板/团队围栏/记忆库）；合格线：零红灯。'),
    ('5', '应用初始化（四模块资产表登记）', 'fanfan',
     's05b-appregistry.png', UI,
     '治理中心·应用资产登记表工件：csw-pay-core/csw-channel-wechat/csw-channel-alipay/csw-cashier-mp 四模块负责人/看板/技术栈/SLA/测试骨架逐项登记。',
     '准出：app-registry.md 入仓库；合格线：每应用有负责人/专属看板/测试骨架。'),
    ('6', '研发人员管理（组织与权限矩阵）', 'admin',
     's06b-org.png', UI,
     '治理中心·组织与权限矩阵工件：人×角色×汇报线×看板×账号+权限规则+入转离流程，与实际账号/看板/智能体对账。',
     '准出：org.md 入仓库、对账输出留档；合格线：15 人×看板×智能体三方零差异。'),
    ('7', 'BA 需求送达 + G1 需求上锁', 'bella·G1闸',
     's05-g1-freeze.png', UI,
     '治理中心·G1 需求冻结工件全文：冻结四要素齐——AC-1~3 可机械化判定验收标准/范围外清单（退款、对账单导出…）/影响面/涉敏评估，锚点 0217cf2。',
     '准出：docs/requirements/<RFD>.freeze.md 入仓库；合格线：验收标准≥3 条全部可判定，锁后不许改。'),
    ('8', '产品经理建群（全量预邀关联人）', 'fanfan',
     's06-room-created.png', UI,
     '「支付收银台需求分析讨论群」房间页：群名规范+参与者（qi/hu/fanfan-agent/qi-agent…人与 AI 助理并排）+消息流真实在画。',
     '准出：群 ID 落档；合格线：命名规范、助理在群。'),
    ('9', 'PM 群内 @助理 派发指令（带材料与证据要求）', 'fanfan',
     's07-dispatch-msg.png', MSG,
     '群内派发指令原文：需求一行（为收银商户开发兼容微信/支付宝双端的小程序支付收银台）+材料地址（docs/requirements/RFD-001-req.md）+证据要求（完成必须带代码提交号+卡号）——把关三要素齐。',
     '准出：派发消息落档；合格线：指令含需求信息+材料地址+证据要求。'),
    ('10', 'Orchestrator 登记 kanban 主卡（结构化 RACI）', 'fanfan-agent',
     's08-kanban-raci.png', UI,
     'fanfan-pm-plan 看板（43 任务）：卡片右上 R/A/C/I 彩色徽章真实渲染（R 绿/A 蓝/C 橙/I 灰）——P2 可视化首次实拍到位。',
     '准出：主任务卡出现在 PM 账号看板；合格线：卡 ID 为建卡工具返回真实 ID。'),
    ('11', '系统分析（三清单→SMART 拆分→RACI 逐条派发）', 'chen/hu/lin/xiao',
     's11b-tasklist.png', UI,
     '治理中心·SMART 任务清单工件（T-101~108）：任务具体到责任人；配套群内 RACI 逐条派发消息见 s10-raci-dispatch（主责 chen·授权 fanfan·咨询 arch·通知 bella）。',
     '准出：任务清单文件入仓库+RACI 派发消息齐全+关联人全进群；合格线：SMART 清单具体到人。'),
    ('12', '分诊确认（lead 手工确认/员工直领+双兜底）', '团队负责人',
     's11-triage-mine.png', UI,
     '看板「只显示我的任务」过滤器（P2）：勾选后筛出当前登录人 R/A 相关卡——分诊认领的操作面。',
     '准出：四主责账号看板出现任务卡+lead 确认完成；合格线：分诊留痕、去重生效。'),
    ('13', '深度分析（worktree 并行+xxx-dev skill 五步）', '研发智能体',
     's12-ide-worktree.png', UI,
     'IDE 任务简报：任务概览（RACI 徽章）/需求上下文/Git 活动——worktree 路径 /workspaces/fanfan/aipaydev/.worktrees/t_9e5c6c18 与分支 wt/t_9e5c6c18（并行共享 workspace 面）。',
     '准出：四份系分稿入仓库+完成回执双兜底；合格线：概设含接口签名/数据模型/幂等键+工作量人日。'),
    ('14', 'PM 汇总总稿并发起评审卡', 'fanfan',
     's13-review-pending.png', UI,
     '审批收件箱：评审卡「评审 · t_9e5c6c18 · 未提交变更」待裁决——风险档徽章（标准）+批准（实心主按钮）/打回返工（描边次按钮）——人的审核把关面（U2 改版后首拍）。',
     '准出：概设方案入仓库+评审任务卡登记；合格线：金额统一分 int64、字段 snake_case。'),
    ('15', 'G2 架构治理评审（人在 UI 裁决）', 'wei·G2闸',
     's14-archgate-approved.png', UI,
     '人在收件箱点击「批准」→待审清空+审批历史即时记账：2026/9/28 18:49 wei · 评审 · t_9e5c6c18 · 标准 · 批准（胶囊徽章）——人机闭环留痕。',
     '准出：评审结论行+架构评审卡关闭；合格线：五项检查逐条留痕、历史偏差红杠检索附稿。'),
    ('15b', 'G2 评审工件（五项检查留痕）', 'wei/arch',
     's15-g2-archgate.png', UI,
     '治理中心·G2 架构评审工件全文：评审结论 PASS；设计五要素①~⑤逐条+爆炸半径排查+验证计划前移+备选方案 2 个取舍+历史偏差红杠检索（未命中）——五项检查条文在画。',
     '同上（G2 把关留痕的仓内正本）。'),
    ('16', '系分主任务收口（0.3 测试系数口径）', 'fanfan',
     's09-drawer-raci.png', UI,
     '任务抽屉（/app/board?task= 深链直开，跨板 404 已根治）：RFD-001 主卡 done 终态+RACI 四元组（主责 fanfan-agent·授权 admin·咨询 arch-agent·通知 bella-agent）+子任务 12 诊断区。',
     '准出：主任务卡置完成（限时）；合格线：档案汇总可回溯、0.3 系数口径写入。'),
    ('17', '开发测试计划排期（时间窗+依赖）', 'fanfan',
     's16b-schedule.png', UI,
     '治理中心·开发/测试排期工件：时间窗/依赖/测试量=开发×0.3 独立成项；看板侧 T-101/T-102 拆单跟踪卡真实在板（s16-plan-cards）。',
     '准出：排期文档入仓库+父子任务卡齐+逐条派发消息落档；合格线：测试量=开发×0.3 独立成项。'),
    ('18', '研发/测试实施（G3 编码门禁五步）', '研发智能体',
     's17b-testlog.png', UI,
     '治理中心·G3 证据工件：DEV-MP 测试日志原文（vitest 6/6 全过，分支 feat/DEV-MP，2026-09-25 10:34 执行输出）——"测试真跑过"的原始凭证；IDE 分支/提交面见 s17-ide-git。',
     '准出【G3】：四条开发分支入 origin+本地测试输出证据落档；合格线：无设计不编码、单测全绿。'),
    ('19', '缺陷回流与 G4 独立验证（测试的人≠写码的人）', 'fei·qi',
     's18-defect-cards.png', UI,
     'fei-test-mp 板：TEST-FE 缺陷卡与修复/回归跟踪卡真实在板（报→修→验全关跟踪面）。',
     '准出【G4】：测试报告入仓库+commit id 回填关联卡；合格线：证据证明测试真跑过。'),
    ('19b', 'G4 测试报告（范围/用例/缺陷/结论/commit id）', 'fei·qi',
     's19-testreport-doc.png', UI,
     '治理中心·G4 测试报告工件全文：测试范围四模块/总用例 51 通过 51/缺陷清单/结论/通过的 commit id 清单——五要素齐。',
     '准出：测试报告入仓库（含通过 commit id）；合格线：执行输出摘要可反查。'),
    ('20', 'G5 发布准出（七项检查+HumanGate）', 'fanfan·G5闸',
     's20-release-gate.png', UI,
     '治理中心·G5 发布说明工件：面向用户收益的发布说明+回滚方案数字阈值——七项检查的仓内正本。',
     '准出：七项结论入群+准出卡关闭；合格线：缺项打回一轮，两轮不过不得上线。'),
    ('21', 'UAT 验收（开头冻结的标准结尾对账）', 'bella',
     's21-uat-doc.png', UI,
     '治理中心·UAT 业务验收工件全文：AC-1 统一下单✅/AC-2 渠道适配✅/AC-3 支付结果通知✅…逐条对账+commit 锚点——开头定的标准结尾拿它对账。',
     '准出：验收报告入仓库且锁定标准全过；合格线：每条 AC 证据锚点可反向核验。'),
    ('22', '研发工作管理（台账/负载/卡壳清点）', 'fanfan',
     's22-dash-workmgr.png', UI,
     '驾驶舱概览三卡：我的待办（待审收件箱 1+等您操作 1）/评审闸口（待裁决评审卡就地批准/打回+最近裁决留痕 wei·批准）/交付进度（状态分布+完成率条）——工作台账聚合面。',
     '准出：work-report.md 落档（每人状态分布/WIP≤2/卡壳 72h 清点）；合格线：超负载记问题单。'),
    ('23', '合规及审计（独立签名线+抽检幻觉率）', 'audit',
     's23-audit-doc.png', UI,
     '治理中心·合规审计意见书工件：门禁留痕完整性/问题单台账/取证目录核验——审计与开发/测试线独立。',
     '准出：合规意见书入仓库；合格线：发现 100% 记问题单、意见书带签名线。'),
    ('24', '复盘 G6（三段式+治理报告+记忆沉淀）', '全员',
     's24-retro-doc.png', UI,
     '治理中心·G6 复盘报告工件全文：现象（只写事实）/规律（机制归因对事不对人）/下轮验证（行动项四要素：事项·负责人·期限·验收判据）——三段式在画。',
     '准出：复盘文档+治理报告入仓库；合格线：问题单 100% 有处置记账（已修/观察/延后）。'),
    ('25', 'IDE 工作台全程介入（任务跳转+简报生成）', '研发人员',
     's25-ide-briefing.png', UI,
     'IDE 任务简报抽屉六区块全开：任务概览（RACI 徽章）/需求上下文（文档列表）/Git 活动/看板状态（父子依赖 0/12）/协作动态/辅助会话；左侧 IDE 会话带评审三键（通过/打回/有条件）。',
     '准出：IDE 核验记录落档；合格线：可从任务一键跳进工作台并出简报。'),
    ('26', 'HTML 推演报告生成（本页即产物）', '导演侧',
     None, None,
     '本报告全部截图来自内置浏览器对 :8802 的真实操作（中文界面、分角色登录 fanfan/wei、公告横幅点灭后落图）；每步证据类别与操作人显式标注。',
     '准出：simulation-report.html 生成；合格线：26 步状态真实（✅/⬜ 不作假）。'),
    ('+', '域1 补充：AI 命令执行的人审兜底（高风险档）', 'wei',
     's26-cmd-approval.png', UI,
     '审批收件箱·高风险组：unattended 命令审批（rm -rf …）红色强制逐条人审——批准/本会话允许/总是允许/拒绝四键，fail-closed 不答不放行（V4-N1 三档+人审兜底实证）。',
     '对应七问题域·域1：不可逆高危操作红色强制逐条人审。'),
]

GAPS = [
    ('fleet 命令审批 live 演示', 'kanban spawn worker 的 unattended 命令审批传输已根治（overlay 13df24fa：'
     'studio-file 审批队列 + 收件箱 UI 批准/拒绝，E2E 实证 rm -rf 被拦并人工放行）；'
     '本报告 12c/13b 证据图为修复前采集，V2 以 s26 展示裁决面。'),
    ('推演进行中实拍限制', '本轮推演已收官，采集为"收官后状态"（无满载运行画面）；'
     '步骤 4 驾驶舱以登录态+数据面板为主，与运行中画面有差异——如实标注。'),
    ('文档类步骤的 UI 化', 'roster/app-registry/org/work-report 等仓内工件以治理中心/看板面板承载展示，'
     '正本仍在中央仓 git——报告以仓内工件角标区分，不冒充界面原生数据。'),
]

FIXES = [
    ('U1 公告非阻塞（patch 491）', 'StudioAnnouncementPrompt 模态→底部横幅：升级公告不再遮罩全界面（20+ 张截图被挡根因）'),
    ('U2 审批收件箱改版', '风险档徽章/批准主按钮/决策徽章化/时间随语言/双标题收敛（feat(approval) 1cf17838）'),
    ('U3 跨板 404 根治（patch 492）', '任务深链/抽屉错板 404 兜底：sqlite 快查定位所在板重试（三连拍 404 抽屉根因）'),
    ('U5 同名房间消歧', '同名群行尾缀短房 ID（多轮推演 6 个同名群不可分辨根因）'),
    ('RACI 徽章渲染链修复', '截图季卡片 API 响应 raci 透传确认 + 徽章渲染测试加固（raci-visibility 7/7）'),
    ('证据链审计二轮', '31 张旧图逐张复核：13 张完全不符/4 张假重复（md5 相同）/20+ 张被公告弹窗遮挡——全部成因已修'),
]


def b64(name):
    if not name:
        return None
    p = os.path.join(SHOTS, name)
    if not os.path.exists(p):
        return None
    return base64.b64encode(open(p, 'rb').read()).decode()


CAT_STYLE = {
    UI: 'background:#dbeafe;color:#1e40af',
    MSG: 'background:#fef3c7;color:#92400e',
    DOC: 'background:#dcfce7;color:#166534',
}

out = []
out.append('''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>产品实操演示 · 26 步全流程推演报告（V2 审计改版 2026-09-28）</title>
<style>
body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:1080px;margin:0 auto;padding:28px;color:#1f2328;background:#fafafa}
h1{font-size:26px;border-bottom:3px solid #2563eb;padding-bottom:10px}
h2{font-size:19px;margin-top:34px;border-left:4px solid #2563eb;padding-left:10px}
.meta{color:#57606a;font-size:13px;line-height:1.8}
.step{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.step h3{margin:0 0 6px;font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.badge.cat-ui{background:#dbeafe;color:#1e40af}
.badge.cat-msg{background:#fef3c7;color:#92400e}
.badge.cat-doc{background:#dcfce7;color:#166534}
.badge.actor{background:#f3f4f6;color:#374151}
.step p{margin:6px 0 4px;font-size:13.5px;line-height:1.7;color:#374151}
.gate{margin:2px 0 10px;font-size:12px;color:#7c2d12;background:#fff7ed;border-left:3px solid #ea580c;padding:5px 10px;border-radius:0 6px 6px 0}
.step img{max-width:100%;border:1px solid #d1d5db;border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
td,th{border:1px solid #e5e7eb;padding:7px 10px;text-align:left}
th{background:#f3f4f6}
.gap{background:#fffbeb;border:1px solid #fde68a}
.noshot{border:1px dashed #d1d5db;border-radius:6px;padding:14px;color:#92400e;font-size:12.5px;background:#fffbeb}
code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:12px}
</style></head><body>''')
out.append('<h1>产品实操演示 · 26 步全流程推演报告（V2）</h1>')
out.append('<div class="meta">生成：2026-09-28（审计二轮改版）｜ 环境：SwarmStudio :8802（含 U1-U5 修复构建）+ gateway :8801 + matrix :8008 ｜ '
           '操作者：分角色真实登录（fanfan/wei/admin/bella 等 state.env 会话）｜ 截图：内置浏览器真实操作（中文界面、公告横幅点灭后落图）<br>'
           '步骤轴：《V3 全流程推演方案》26 步原文对齐，每步附把关条文；证据三分类角标（'
           '<span class="badge cat-ui">界面实拍</span><span class="badge cat-msg">消息转录</span><span class="badge cat-doc">仓内工件</span>）</div>')
out.append(_narrative_html)
out.append('<h2>推演实录（26 步 · 步骤轴对齐方案）</h2>')
missing = 0
for no, name, actor, img, cat, desc, gate in STEPS:
    cat_cls = {'界面实拍': 'cat-ui', '消息转录': 'cat-msg', '仓内工件': 'cat-doc'}.get(cat, 'cat-doc')
    badges = ''
    if cat:
        badges += f'<span class="badge {cat_cls}">{cat}</span>'
    badges += f'<span class="badge actor">操作：{html.escape(actor)}</span>'
    out.append(f'<div class="step"><h3><span class="badge" style="background:#e0e7ff;color:#3730a3">第 {no} 步</span>'
               f'{html.escape(name)}{badges}</h3>'
               f'<p>{desc}</p><div class="gate">把关：{gate}</div>')
    data = b64(img)
    if data:
        out.append(f'<img src="data:image/png;base64,{data}" alt="{html.escape(name)}">')
    elif img:
        out.append(f'<div class="noshot">⬜ 证据图缺失（{html.escape(img)} 未采集成功）——如实标注，不以他图凑数。</div>')
        missing += 1
    out.append('</div>')
out.append('<h2>本轮修复与审计台账（诚实对账）</h2><table><tr><th style="width:220px">项</th><th>说明</th></tr>')
for g, d in FIXES:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')
out.append('<h2>已知缺口（如实台账）</h2><table class="gap"><tr><th style="width:220px">缺口</th><th>说明</th></tr>')
for g, d in GAPS:
    out.append(f'<tr><td>{html.escape(g)}</td><td>{d}</td></tr>')
out.append('</table>')
n_shots = sum(1 for _, _, _, img, _, _, _ in STEPS if img and b64(img))
out.append(f'<h2>证据链自检</h2><div class="meta">'
           f'V2 证据图 {n_shots} 张全部经"一次一图"目视审计核对（含内容与步骤声称一致性）；'
           f'缺失 {missing} 张如实标 ⬜。<br>'
           f'截图存证：<code>evidence/20260928-product-demo/shots-v2/</code>；审计底稿：<code>evidence/report-audit-20260928-2.md</code>。<br>'
           f'验证链：干净重放 inject（231 patch 含 491/492）→ build:full → vitest（本批关联 60/60 绿；全量并行下的负载假阳性已单跑复核）'
           f'→ 实机登录/审批/看板/IDE 重截实录。</div>')
out.append('</body></html>')

path = os.path.join(DIR, 'product-demo-report-v2.html')
open(path, 'w').write('\n'.join(out))
print('report:', path, f'({os.path.getsize(path)//1024} KB)', 'shots:', n_shots, 'missing:', missing)
