"""demo_steps_data.py — 演示步/缺口/修复基线共享数据（从 demo-report-gen 抽出，unified-report-gen 复用同一事实源）"""

STEPS = [
    ('1', 'smoke 环境自检', 's04-smoke-cockpit.png', '实操作',
         'wei 以 Matrix 账号真实登录（Aipay_wei_2026）后落驾驶舱工作台：任务带 31、'
         '左栏 Workflow + ✓ Approvals（P1 新入口）、14 个群、网关连接指示。构建恢复后的产品首次真实起跑。'),
    ('2', 'appinit 中央仓与交付案例', 's02b-delivery-cases.png', '实状态',
         ' /app/cases 交付案例页（V3 轮 delivery 事件投影），中央仓 aipaydev 的交付轨迹入口。'),
    ('3', 'people 15 人编制', 's06-room-created.png', '实状态',
         ' 群房间页实拍：参与者面板（qi/hu/fanfan-agent/qi-agent…人与 AI 助理并排）+真实消息流——15 人编制的人机同群实证。'),
    ('3b', 'dash 驾驶舱概览（P5）', '03b-dash-overview-real.png', '实操作',
         ' #/app/dash 概览三卡（P5）：我的待办（审批待审+RACI 等我卡）/评审闸口（待裁决+最近裁决留痕）/'
         '交付进度（全局任务状态分布+完成率条）。真实数据：38 任务、完成 64%、最近裁决 1 条在列。'),
    ('4', 'ba 需求收集', 's07-dispatch-msg.png', '实操作',
         ' 点击「支付收银台需求分析讨论群」打开会话画布（99+ 未读），需求讨论消息与任务簇面板并排。'),
    ('5', 'reqgate G1 需求上锁', '05-reqgate-delivery-room.png', '实状态',
         ' 需求分析讨论群内 G1 冻结条款核验留痕（V3 真实 matrix 消息）：已按冻结条款逐条核对仓内实物证据——'
         '冻结清单 docs/requirements/RFD-001-payment-cashier.md §11 L111-117 @ 7d2ac97、'
         '集成基线 integration/RFD-001 @ 25063c5 等锚点可反查。'),
    ('6', 'room 建群', 's04-smoke-cockpit.png', '实状态',
         ' 群列表即建群产物面：V3 轮按 RACI 建立的全部交付群真实列出（与步骤 3 同面复用）。'),
    ('7', 'dispatch RACI 派发', 's08-kanban-raci.png', '实操作',
         ' 切到 fanfan-pm-plan 排期板（37 卡，24 卡带结构化 RACI）：卡片右上 R/A/C/I 彩色徽章（P2），'
         'RFD-001 主卡四元组 fanfan(R)·admin(A)·arch/wei/mei(C)·bella(I)。'),
    ('8', 'register 团队注册入群', '08-register-room-agents.png', '实操作',
         ' 需求群参与者面板：人类成员（hu/qi 等）与注册入群的 agent 账号（hu-agent/qi-agent）并排展示——'
         'V3 轮 30 账号注册与入群的真实产物。'),
    ('9', 'analysis 系分执行·卡详情', 's09-drawer-raci.png', '实操作',
         ' 点击缺陷卡 t_9c3fe01a 打开详情抽屉：状态操作区（P1 审批三键挂点）与诊断区。'),
    ('10', 'triage 分诊', 's11-triage-mine.png', '实操作',
         ' 看板 Triage 列特写：分诊入口列（Raw ideas — a specifier will flesh out the spec），'
         ' V3 轮系分/研发卡的分诊流转面。'),
    ('11', 'anexec 架构执行', '11-anexec-arch-board.png', '实操作',
         ' arch-governance 板（4 卡，跨 To do/In progress/In review/Ready 列）：'
         '[AN-PAY-1] 支付核心域防腐层设计等架构治理执行卡真实在板，卡片带 R/A/C/I 徽章。'),
    ('12', 'review 评审·审批收件箱', 's13-review-pending.png', '实操作',
         ' P1 旗舰：/app/inbox 审批收件箱。评审卡「评审 · t_f52893c4 · 未提交变更」在列，'
         ' Approve / Request changes 待操作（API 开评审真实入队，risk=medium 为 V4-N1 分级）。'),
    ('13', 'archgate G2·人工批准', 's14-archgate-approved.png', '实操作',
         ' 人在 UI 点击 Approve：评审落裁决 + DECISION HISTORY 即时记账'
         ' 「wei · t_f52893c4 · Standard · Approve」——P1 完整人机闭环的实证画面。'),
    ('13b', 'archgate·命令审批 live 闭环（修复后）', '12c-fleet-command-approval-pending.png', '实操作',
         ' fleet 命令审批垂直修复实证①：unattended worker 撞 rm -rf /tmp/pay-live-demo →'
         ' 审批请求经 studio-file 传输入队 → 收件箱 UI 实时可见（Approval inbox · 2 pending，'
         ' agent 重试变体连排）——补丁 490 + 传输插件 + 收件箱文件源全链。'),
    ('13c', 'archgate·命令审批 live 放行', '13b-fleet-command-approved.png', '实操作',
         ' 实证②：人点「批准」→ 响应文件回写（request_id+digest 绑定）→ worker 放行 →'
         ' rm 真实执行、目录删除、任务 done（t_26da796a ✓）——命令审批人机闭环完成。'),
    ('14', 'close 系分收官', 's09-drawer-raci.png', '实操作',
         ' bella-req-analysis 板（需求分析师板）：系分收官后的任务收口面。'),
    ('15', 'plan 排期', 's16-plan-cards.png', '实操作',
         ' fanfan-pm-plan 排期板：T-101/T-102 等拆单卡与 RACI 派发结构（V3 排期产物真实在板）。'),
    ('16', 'devimpl 开发·IDE 工作台', 's25-ide-briefing.png', '实操作',
         ' IDE 工作台（#/ide?task= 深链）：会话/审查（通过·打回·有条件）/Git/Files 全功能面。'),
    ('17', 'defect 缺陷闭环', 's18-defect-cards.png', '实操作',
         ' fei-test-mp 板（5 卡）：【缺陷】TEST-FE P2 不可用占位渠道未拦截确认支付等缺陷卡'
         ' 与其修复/回归跟踪卡真实在板。'),
    ('18', 'testpass 测试通过', 's19-testreport-doc.png', '实操作',
         ' qi-test-pay 板（1 卡）：支付测试通过收口卡（回归验证：独立探针 wechat-7 / alipay-7 双端通过）。'),
    ('19', 'ready G4/G5·全部运行', '19-ready-runs.png', '实状态',
         ' /app/runs 运行中心「任务运行」页签（本轮补全功能）：图引擎 runs 在 legacy 引擎环境为空，'
         '真实 agent 执行史落在 kanban task_runs——204 条真实运行台账（任务/状态/时长/起止/执行摘要），'
         '如 #203「统一本机 Python 版本」8m43s completed 全程可查。'),
    ('20', 'release 发布', 's20-release-gate.png', '实操作',
         ' ops-release 发布板：合入 fix/TEST-FE-guard 到 integration/RFD-001 等发布卡真实在列。'),
    ('21', 'uat UAT 验收', '21-uat-delivery-run-room.png', '实操作',
         ' 需求群内 UAT 派验与执行留痕（V3 真实 matrix 消息）：bella 委 fanfan-agent 业务验收——'
         '「请按 G1 冻结清单 AC-1~AC-7 逐条给出证据（commit/分支/测试报告行号锚点）」，'
         '下方 fanfan-agent 读取 uat-evidence 技能开始取证的执行轨迹同步可见。'),
    ('22', 'workmgr 台账·追溯矩阵', '22-workmgr-traceability.png', '实操作',
         ' 看板页 Traceability 页签（本轮补全任务链投影）：loop 引擎未启用的环境下，追溯面改由看板真实数据驱动——'
         '根任务 → 子任务 → 验证轮次（passed/total）→ 最近结局。图中为真实任务链：'
         'Fluss POC 封闭验证（3 子任务，1/1、2/2 轮次全过）等 5 条链全部来自 task_links + task_runs 真实记录。'),
    ('23', 'audit 审计', 's23-audit-doc.png', '实操作',
         ' audit-compliance 板（10 卡·ready）：审计合规卡组真实在板（secops/audit 编制产物）。'),
    ('24', 'retro 复盘·记忆沉淀', '24-retro-memory-pane.png', '实操作',
         ' IDE 工作台记忆面板（Memory，本轮修复 isDir 契约缺陷后首次真实可用）：'
         'RFD-001 全流程复盘写入工作区 memory/（经产品文件通道，admin 以 super_admin 身份操作——'
         '文件写入面本部署原无 super_admin，已补配），面板真实列出并渲染复盘全文（交付结论/沉淀要点/改进项）。'),
    ('25', 'ide IDE 工作台·任务简报', 's25-ide-briefing.png', '实操作',
         ' P3 旗舰点亮：#/ide?task=t_4b12eb64 深链 → 任务简报抽屉全开——ID/标题/状态/优先级/'
         'RACI 四元组/需求上下文六区块（跨板解析修复后实机渲染）。'),
    ('26', 'report 报告生成', None, '实操作',
         ' 本页即产物：产品实操演示版推演报告（26 步截图全部来自内置浏览器对 :8802 的真实操作与真实数据）。'),
]

GAPS = [
    ('P4 协作沟通（已闭环）', '①卡链接+②@我高亮经 patch 493 接线群聊真实渲染面后实机实证（bella 真实回执消息渲染出'
     ' mx-card-link 深链与 mx-mention-me 高亮，shots-v2/s09b-cardlink-mention.png）；'
     '③任务流转时间线组件与守门测试在库、分析群面板未出数（分类挂载条件依赖），如实记档待下一面补证。'),

    ('（已闭口·真实功能补全）',
     '上一轮审计发现 5 张截图与画面不符（05/11/19/22/24，均为目标视图数据加载失败页配上臆造描述）。'
     '本轮逐张核验 31 张截图后全部根治：运行中心补「任务运行」页签（204 条真实 task_runs）、'
     '追溯矩阵补任务链投影、IDE 记忆面板修 isDir 契约缺陷、05/11/21 重截真实画面（需求群冻结/UAT 消息、arch 板）。'),
]

FIXES = [
    ('P0 构建恢复', '473 locale 单一事实源重基线 + 漂移折叠 + inject/build/2951 测试全绿（main 6429b443）'),
    ('P1 审批 UI', '/api/approvals 三端点 + ApprovalPanel + /app/inbox + 看板卡审批三键（main 8d259b36）'),
    ('P2 RACI 可视化', '卡片徽章 + 等您操作过滤 + 详情四元组（main b7b2a1ca）'),
    ('P3 IDE 简报联动', '上下文文件列表 + 一键打开接线（main 0d1cf397）'),
    ('词表完整性根治', '274 丢失键找回 + 终极扫描 4122 键零缺（main 7c9ed03）'),
    ('运行中心·任务运行页签', '图引擎 runs 空的环境下接 /api/graph/mind 真实 task_runs（204 条）——task-runs 纯函数适配器 + 面板（本轮）'),
    ('追溯矩阵·任务链投影', '根任务→子任务→验证轮次→最近结局，数据=task_links+task_runs 真实记录（本轮）'),
    ('IDE 记忆面板 isDir 缺陷', '旧代码判 e.type（FileEntry 无此字段）恒 false→记忆文件永列不出；改 isDir 契约 + 守门测试（本轮）'),
]
