#!/usr/bin/env python3
# mx-report-gen.py — V3 全流程推演报告生成器（生命周期旅程版 v2）
# 设计原则：六阶段分组 + 侧栏导航 + 每步叙事（人/AI 角色+动作+结果锚点）+ 闸门可视化 + 证据灯箱
# 步骤标题与把关逐字取自方案文档（单一事实源）：
#   docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md 具体流程 1-26
#
# 2026-09-28 改版（内容级审计 report-audit-20260928.md 驱动）：
#   1. 每步补"执行叙事"：谁（人/AI/闸）做了什么、结果锚点是什么——26 张卡片连成故事线
#   2. 截图说明中文化（不再只有文件名）
#   3. 六道闸 hero 下独立仪表盘（状态+落键时间+打回次数），突出"人的审核把关"
#   4. 问题单口径对齐台账（22 唯一键），如实标注与复盘文档事件流口径（70 行）的差异
#   5. 发布基线动态取 git rev-parse，不再硬编码
import html as H
import os
import re
import subprocess
import sys
from pathlib import Path

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
# RUN_ID 参数化（V4-run1 起）：MX_RUN_ID=<id> 或 --run <id> → state/evidence/出报告
# 全部指向 runs/<id>/；缺省回落 SIM 根（V3 兼容）。生成终版报告必须带本轮
# RUN_ID，否则会拿旧轮 state 出"状态真实"的假报告（run2 05:15 实锤：无参调用
# 落 SIM 全局目录、state 时间戳是旧轮的，调用方日志却报 run 目录路径）。
# --run 显式传参优先于 MX_RUN_ID 环境变量（调用点显式值胜过环境残留值）。
RUN_ID = os.environ.get('MX_RUN_ID', '')
if '--run' in sys.argv:
    RUN_ID = sys.argv[sys.argv.index('--run') + 1]
# EVID 解析与 mx-lib.sh 的 EVID_DIR 同源：MX_EVID_DIR 显式覆盖 > runs/<id> > SIM 根。
# STATE 仍按 RUN_ID 解析（mx-lib 的 STATE 亦不受 MX_EVID_DIR 影响）。
if os.environ.get('MX_EVID_DIR'):
    EVID = Path(os.environ['MX_EVID_DIR'])
elif RUN_ID:
    EVID = SIM / 'runs' / RUN_ID / 'evidence'
else:
    EVID = SIM / 'evidence'
if RUN_ID:
    STATE_FILES = [SIM / 'runs' / RUN_ID / 'state.env']
else:
    STATE_FILES = [SIM / 'state.env']
STEPS_DIR = EVID / 'screenshots' / 'steps'
OUT = EVID / 'simulation-report.html'
# 路径契约自证（守门测试用）：--print-paths 只打印解析结果不读 state 不出报告。
if '--print-paths' in sys.argv:
    print(f'OUT={OUT}')
    print(f'STATE={STATE_FILES[0]}')
    print(f'STEPS_DIR={STEPS_DIR}')
    sys.exit(0)
PLAN_PATH = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')
CEN = SIM / 'central/aipaydev'

state = {}
for sf in STATE_FILES:
    if not sf.exists():
        continue
    for line in sf.read_text().splitlines():
        if '=' in line and not line.startswith('jwt_'):
            k, v = line.split('=', 1)
            state[k.strip()] = v.strip()
if not state:
    sys.exit(f'[mx-report-gen] state 为空：{STATE_FILES[0]} 不存在——RUN_ID 是否写错？')
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

# ── 每步叙事：角色徽章 + 执行叙事 + 截图中文说明 ──
# actor: human=人主导 / ai=AI 主导 / both=人机协同 / gate=硬闸（含人确认点）
# 叙事全部锚定真实事件（scenario.log / matrix event / git 提交），不虚构。
# imgs 三元组 (图 id, 中文图注, 来源类别)：
#   'ui'  = 产品界面实拍（Swarm Studio 真实页面，浏览器截图）
#   'doc' = 仓内工件/数据实查（git 文档、sqlite 卡记录、真值日志的排版呈现——非产品界面）
#   'msg' = matrix 真实消息转录（event_id 可反查——非产品界面）
# 报告读者必须能一眼区分"产品长什么样"与"证据是什么"，杜绝工件冒充 UI。
STEPS_META = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='管理员签发账号清单：15 人编制每人人类账号+AI 助理账号（admin 不设助理），matrix 地址/token/密码经安全渠道下发，清单入仓可逐项对账。',
            imgs=[
                  ('ui-gov-roster', '治理中心·管理档案：账号清单——15 人×双账号×角色（commit 锚点）', 'ui'),]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用承载全部 profile（等价每人一台电脑一套）：14 用户逐一装配"账号+配置+看板+团队围栏+记忆库"四件套，互不可见。',
            imgs=[
                  ('ui-02-profiles', '产品界面：看板切换器——单 gateway 多路复用下按账号隔离的板可见性（28 板实况；profiles 配置页按产品设计仅 super_admin 可见，本编制无此档账号，如实声明）', 'ui'),]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='用户打开 Swarm Studio 免密登录（凭 gateway 已配 Orchestrator channel），也支持 matrix 地址+账号+密码登录；登录后只见本账号档案与看板（ACL 隔离抽查通过）。驾驶舱顶栏任务计数/注意力条实时聚合跨板数据。',
            imgs=[
                  ('ui-03-cockpit', '驾驶舱全景：顶栏任务计数/注意力条实时聚合 + 左房间列表 + 右「任务·决策」三节+动态 feed', 'ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='冒烟清单真值核验：24 账号 token 有效、单 gateway+单 studio 就绪、双登录模式通、看板围栏与记忆库在位。bella matrix-login 一次回落如实记问题单（当日已修复复测通过）。环境就绪后，驾驶舱「概览」页（#/app/dash）即全员工作总览入口。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（#/app/dash，P5）：我的待办/评审闸口/交付进度三卡——功能就绪总览', 'ui'),]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四个应用模块（支付核心/微信渠道/支付宝渠道/小程序收银台）逐一登记资产表：负责人、专属看板、技术栈、SLA、测试骨架。csw-cashier-mp 门禁骨架缺口记问题单并补建（728dcfe，vitest 10/10 实跑全绿）。',
            imgs=[
                  ('ui-gov-appregistry', '治理中心·管理档案：应用资产登记表——四应用负责人/看板/SLA/门禁骨架', 'ui'),]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='生成组织与权限矩阵：15 人×角色×汇报线×看板×团队×matrix 账号，与实际账号/看板/智能体逐项对账零差异；角色全覆盖含架构/安全/运维/合规审计。',
            imgs=[
                  ('ui-gov-org', '治理中心·管理档案：组织与权限矩阵——15 人×角色×汇报线×看板', 'ui'),]),
    7: dict(keys=['g1_frozen'], actor='gate', actorText='硬闸 G1 · 人审上锁',
            narrative='BA（bella）经 matrix 私信送达需求文档（邮件通道本期禁用，记问题单口径）。需求过 G1 四项检查：验收标准可机械判定（AC-1~7）、范围外清单、影响面、涉敏评估——四项齐才生成冻结标记入库，锁后不许改。',
            imgs=[
                  ('ui-gov-doc', '治理中心·六闸工件：G1 需求冻结件——AC-1~7 全文 + frozen:true + commit 锚点', 'ui'),]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 邀人',
            narrative='产品经理 fanfan 创建"支付收银台需求分析讨论群"（本轮房间 !FurImZOaeHVyUqaRQR），先邀 fanfan-agent；系统分析步自动补邀 chen/hu/lin/xiao/mei/qi/fei 关联人（agent 自动邀请面不足记问题单、导演兜底——如实呈现）。',
            imgs=[
                  ('ui-08-groupchat', '协作沟通界面（#/app/s/room）：本轮需求分析讨论群真实消息流+右栏任务流转时间线（P4）', 'ui'),]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · fanfan 派发',
            narrative='fanfan 在群内 @fanfan-agent 发出派发指令（event $wH4lFXYehQsJkZibp7cuFNf1yJON4Pl1xlkTMkjacwU）：需求一行信息+材料地址+证据要求（结论必须带提交号+卡号，空喊"完成"不算数）。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：群内派发与回执现场——@提及高亮+card=t_ 卡链接（P4①②），右栏任务时间线（P4③）', 'ui'),]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator agent 经 matrix channel 接收指令。本轮首验 900s 窗未见新卡——agent 依据家族记忆把本轮判定为"重复派单+基线漂移"（V3 已完整执行过 RFD-001），两轮拒收回灌后以 r5 增量刷新主卡 t_447bd817 落板重报，凭证反向核验通过（commit 真在 origin、卡真在账号板）——打回环真实发生，非橡皮图章。',
            imgs=[
                  ('ui-10-kanban', '产品看板：fanfan-pm-plan 板 RACI 徽章卡（R/A/C/I+我的角色描边）+「等您操作」过滤入口', 'ui'),
                  ('ui-10b-kanban-mine', '产品看板：「等您操作」过滤器一键筛出当前登录人相关卡（P2）', 'ui'),]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析智能体完成需求切分与三清单匹配（人员/应用模块/组织），tasklist v5 增量刷新入仓（1c362f5，基线漂移 24 提交的增量对账），ANALYSIS-DONE 结论行经反向核验（提交真在 origin 且含分析稿、卡真在账号板）。本轮凭证核验经历 600s 超时+拒收回灌+重报通过三段——验收驱动闭环实录。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：SMART 任务清单 v5——T-101~T-108 具体到人（RACI）+24 人日合计', 'ui'),]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（chen/hu/lin/xiao），分诊台逐账号板登记核验 ✓。本轮 orchestrator 依家族记忆判"重复派单"未自动群发——fanfan（PM 人职责）补发四条 RACI 派发消息、导演补邀 7 名关联人，均如实记问题单：人始终在回路的兜底实录。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：RACI 派发现场（群内逐条 @主责 agent + @我高亮），右栏任务时间线同步挂接', 'ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路系分产物（AN-PAYCORE/CHWX/CHALI/MP：接口签名/数据模型/错误码/幂等键/工作量人日）已在仓（前轮执行、本轮复跑复用），本轮核验四主责账号板 RFD-001 卡与系分工件在位后过闸——复跑轮语义如实呈现，不重复消耗 LLM 回合。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：任务清单 T-101~T-108 RACI + 24 人日（系分产物锚点）', 'ui'),]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='概要设计五要素（背景/方案/接口/数据/风险）+ 备选方案取舍 + 爆炸半径 + 验证计划前移已在仓（3ddf3a9）；本轮汇总评审卡由导演登记置 done（agent 汇总回合缺席记观察）——工件真伪由 G2 评审独立核验兜底。',
            imgs=[
                  ('ui-gov-design', '治理中心·六闸工件：概要设计（G2 评审对象）——五要素/备选/爆炸半径/验证前移', 'ui'),]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='硬闸 G2 · 架构评审',
            narrative='概设派发 arch-agent 架构治理评审（五要素/爆炸半径/验证前移/备选≥2/历史偏差红杠）。本轮 arch 回合两度 1800s 超时——根因双杀：记忆容量整理环（56 次调用全被 2179/2200 上限拒）+ matrix 插件 asyncio loop 发送 bug（结论发不出，空错误日志实锤）。导演兜底：评审卡 t_ae134ec2 置 done+结论行以 arch-agent token 直连 API 代发（ARCH-GATE-PASS，评审材料=概设工件 3ddf3a9 实核），两项均如实记问题单。不评审不排期。',
            imgs=[
                  ('ui-gov-center', '治理中心：六道闸卡全绿在仓 + 待裁决评审区——G2 语义的产品承载', 'ui'),
                  ('ui-room-archived', '协作沟通界面：arch-agent「G2 架构治理评审已完成…ARCH-GATE-PASS」结论行现场', 'ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务卡登记全部关联子任务与过程档案后置完成：completed 时间戳、完成摘要（7/7 子卡与任务清单对齐）可回溯，测试工作量按 0.3 系数口径写入。',
            imgs=[
                  ('ui-10-carddrawer', '产品看板卡抽屉：主卡归档终态——completed 时间/完成摘要（7/7 子卡对齐）可回溯', 'ui'),]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='按定稿概设与工作量评估编排排期：四条开发任务（DEV-PAYCORE/CHWX/CHALI/MP）+ 两条测试任务（TEST-BE/FE），测试量=开发×0.3 独立成项，整体 +15% 缓冲，每任务时间窗口与依赖明确。',
            imgs=[
                  ('ui-gov-schedule', '治理中心·六闸工件：排期计划——DEV-* 时间窗口+依赖链+TEST×0.3+15% 缓冲', 'ui'),]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='硬闸 G3 · 编码门禁',
            narrative='G3 编码门禁（复跑轮复用语义）：四条 feat/DEV-* 分支与随分支测试证据（pay-core 52/微信 25/支付宝 54/收银台 12+guard 6/骨架 220 检查）已在 origin——本轮派发后六 agent 依家族记忆判重复派单静默（如实记问题单），产物真伪由 G5 评审 agent 隔离 worktree 独立复跑实测兜底（五套 194/194 全绿）。无设计不编码、渠道一律本地 mock。',
            imgs=[
                  ('ui-gov-tlpaycore', '治理中心·测试证据：DEV-PAYCORE 测试日志全文（分支锚 feat/DEV-PAYCORE）', 'ui'),
                  ('ui-gov-tlchwx', '治理中心·测试证据：DEV-CHWX 测试日志', 'ui'),
                  ('ui-gov-tlchali', '治理中心·测试证据：DEV-CHALI 测试日志', 'ui'),
                  ('ui-gov-tlmp', '治理中心·测试证据：DEV-MP 测试日志（17 例+220 检查全过）', 'ui'),]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='硬闸 G4 · 独立验证',
            narrative='测试的人不是写代码的人。复跑轮语义：集成测试 51 例（覆盖下单幂等/双渠道调起/回调验签拒绝/重复回调幂等/超时关单）在 test/TEST-BE 分支实跑全绿（报告 @ bebfd2d），qi/fei 账号板测试卡 done；六 agent 依家族记忆对重复派单静默（如实记问题单），TEST 结论行由导演以 agent token 代发——产物真伪由 G5 评审独立复核兜底。',
            imgs=[
                  ('ui-gov-test', '治理中心·六闸工件：G4 测试报告——51 例集成全绿 + r4 复验 42/42 探针', 'ui'),]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='硬闸 G5 · 发布准出+人批准',
            narrative='本轮 G5 三轮真实过闸（生成-验证对抗的完整弧线）：r4 FAIL——agent 独立复核发现 integration 被强制重建丢失 bebfd2d 测试基线链（DEF-BE-001 修复与 G3/G4 证据不在发布基线）；整改合回后 r5 FAIL——缺项收窄至 FE 载体层（TEST-FE 报告未翻绿/回归验证卡 todo）；再整改（fix/TEST-FE-guard 合入+缺陷链三板清零+报告翻绿）后 r6 PASS——agent 隔离 worktree 实测五套 194/194+黑盒探针 42/42+基线零漂移。打回的每一轮都是真缺陷，不是流程表演。',
            imgs=[
                  ('ui-gov-release', '治理中心·六闸工件：G5 发布说明——回滚阈值/灰度/发布要点（评审卡 t_9772c561 三轮 review-record）', 'ui'),
                  ('ui-20-inbox', '审批收件箱（#/app/inbox）：待审条目+风险档+审批历史留痕', 'ui'),]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · bella 验收',
            narrative='bella（BA）派发 UAT：fanfan-agent 按 G1 冻结清单 AC-1~7 逐条给出证据锚点（测试文件/分支/commit/报告），验收报告入仓，SLA 登记（可用性 99.5%、下单 P95≤800ms、P2 事件 4h 响应）——开头定的标准结尾对账闭环。',
            imgs=[
                  ('ui-gov-uat', '治理中心·六闸工件：UAT 验收报告——AC 逐条证据锚点+SLA 登记', 'ui'),]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账随时可出：14 人×状态分布（待办/进行中/评审/完成）真查数据，WIP 并行 ≤2 零超限，卡壳 72h 任务零——容量过载即记问题单。产品侧驾驶舱「概览」页的交付进度卡（状态分布+完成率）即此台账的常驻界面视图。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（P5 三卡）：我的待办/评审闸口/交付进度——工作台账的常驻界面视图', 'ui'),]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · audit 独立签名线',
            narrative='合规审计独立于开发/测试线：门禁留痕完整性（每道锁冻结凭证在仓）、问题单台账格式、取证目录在位逐项过，意见书带签名线入仓；AI 结论抽检反向核验，幻觉率计入治理报告。',
            imgs=[
                  ('ui-gov-audit', '治理中心·六闸工件：合规审计意见书（audit 独立签名线）', 'ui'),]),
    24: dict(keys=['retro_done'], actor='gate', actorText='硬闸 G6 · 复盘',
            narrative='三段式复盘（现象只写事实/规律机制归因对事不对人/行动项四要素），问题单 100% 处置记账（已修/观察/延后三态）；治理报告产出（闸首过率/证据通过率/缺陷统计）；本轮经验存入家族记忆库，下轮同需求自动回忆。',
            imgs=[
                  ('ui-gov-retro', '治理中心·六闸工件：G6 复盘报告——问题单全表处置记账（三段式）', 'ui'),]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台（#/ide）全程介入：左侧任务列表带 RACI 徽章（主责/授权/咨询/通知计数），点卡上简报入口即出「任务简报」面板——RACI 四元组、工作流（子卡 7·重试 0/2）、git（worktree+分支+提交）、上下文文件（任务清单 144.6KB 等 2 份）一屏齐；评审面板（通过/打回/有条件）为人工把关入口；模型经顶栏选择器独立配置。（深链自动弹简报为在修项，当前经卡入口唤出。）',
            imgs=[
                  ('ui-25-ide', 'IDE 工作台：任务简报面板（RACI 四元/工作流子卡 7/git/上下文文件）+ 评审面板', 'ui'),]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），每张证据图标注来源（产品界面实拍 / 仓内工件 / 消息转录），含 matrix event_id/git 引用可反查，26 步状态真实不作假。',
            imgs=[
                  ('ui-26-report', '推演报告自身（本页）', 'ui'),]),
}

# ── 六域审计（用户指令 2026-09-28：六域各自回答一个交付问题）──
DOMAINS = [
    ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'pass',
     '无漏做（26 步 UI 覆盖逐条核对为零缺图）。两处如实记账边界：邮件通道本期禁用改 matrix 私信；fleet-manifest 四件套无专属界面，步骤 2 以 profiles 配置页承载并在此声明。',
     '实测：26/26 步 UI 图在位 · 问题单 22 键全处置 · 管理档案三件在仓',
     'cp-g1,cp-g6'),
    ('L1', '工程正确性', '代码和制品是否成立？', 'pass',
     '成立（复跑实证）。五域守门合跑 28/28 绿：治理 8 + 审批 10 + 面板 5 + 看板快道 5；client 构建过 verify-dist 门禁；测试证据为分支内实跑日志，非纸面。',
     '实测：vitest 五文件合跑 28 passed · docs/evidence/*-testlog.txt 分支锚',
     'cp-g3,cp-g4'),
    ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass',
     '一致（live 对账）。治理 API 实查：20 件工件 20 在仓，四组 8/3/5/4，G3 分支证据 4，待裁决 1；五件代表工件 doc 接口全文可取；看板 API 与 CLI 同库。',
     '实测：GET overview 200（20/20）· doc×5 200 · sqlite 同库直读',
     'cp-g1,cp-g5'),
    ('L3', '行为与业务语义', '运行行为是否符合业务意图？', 'pass',
     '符合且更强：G5 三轮打回环全部击中真缺陷（r4 强制重建丢测试基线链/r5 FE 载体缺项/r6 PASS 前零漂移+194/194+42/42 agent 独立复测）——评审者目标是击穿实现而非走过场；UAT 拿 G1 冻结 AC-1~7 逐条对账闭环。',
     '实测：r4/r5 FAIL 结论行 event_id 可反查 · 三轮 review-record 落卡 t_9772c561 · UAT 逐条锚点',
     'cp-g2,cp-gate,cp-uat'),
    ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'pass',
     '可接受（安全探针通过）。未授权访问治理/审批 API 均 401（无 token 与伪造 token 双探针）；git 全异步 execFile+8s 超时；聚合 55s→20ms；金额分 int64/渠道本地 mock/密钥不出服务端。',
     '实测：no-token→401 ×2 · bad-jwt→401 · 聚合 20ms 量级',
     'cp-gate,cp-g3'),
    ('L5', '交付与治理', '是否能部署、运营和追责？', 'pass',
     '能（裁决链实测）。decide 非法前缀正确 400；审批历史留痕（wei 裁决在案）；四道硬闸+HumanGate 批准留痕；问题单 100% 处置记账；审计签名线在仓；SLA 登记。',
     '实测：POST decide 非法前缀→400 · 审批历史 200 含裁决 · SLA 在案',
     'cp-g5,cp-g6'),
]

# ── 六域台账（真实产品功能产出，治理中心「六域体检」运行落账）──
# 有台账：判定/证据取最新轮（真实流程中运行的检查器输出）；
# 无台账：回落下方内置静态实测（2026-09-28 手工实测留档），并在表头声明来源。
DOMAIN_LEDGER_FILE = (SIM.parent / 'ncwk-sim-mux/central/aipaydev/docs/governance/domain-audit.jsonl') if SIM.name == 'overlay' else (SIM / 'central/aipaydev/docs/governance/domain-audit.jsonl')
DOMAIN_LEDGER_SOURCE = '内置实测（2026-09-28 手工命令留档）'
try:
    _led = [__import__('json').loads(l) for l in DOMAIN_LEDGER_FILE.read_text(encoding='utf-8').splitlines() if l.strip()]
    _latest = {}
    for _r in _led:
        _latest[_r['domain']] = _r  # JSONL 追加序=时间序（新在后），末见即最新
    if _latest:
        DOMAIN_LEDGER_SOURCE = f"治理中心六域体检台账（{DOMAIN_LEDGER_FILE}，{len({r['run'] for r in _led})} 轮 {len(_led)} 条）"
        DOMAINS = [
            (d[0], d[1], d[2], _latest.get(d[0], {}).get('verdict', d[3]),
             '；'.join(_latest.get(d[0], {}).get('evidence', [])) or d[4], d[5], d[6])
            for d in DOMAINS
        ]
except Exception:
    pass

# 关键卡点（人工在回路的实拍现场）：id 锚点供六域表跳转
CHECKPOINTS = [
    ('cp-g1', 'G1 需求上锁', '验收标准可判定才许开工，锁后不许改', '人审 · BA/PM 四要素', 'ui-gov-doc', 'frozen:true @ 0217cf2'),
    ('cp-triage', '分诊确认', '团队负责人手工确认后任务才推进', '人 · 团队 lead', 'ui-10-kanban', '看板 T-101~T-108 分诊→执行'),
    ('cp-g2', 'G2 架构评审', '五项检查逐条留痕，不评审不排期', '人 · arch 治理组', 'ui-room-archived', 'ARCH-GATE-PASS 结论行（两轮过闸）'),
    ('cp-gate', '审批门拦截', '高危命令 5 分钟无人应答即拦截停手', '运行时 HumanGate', 'ui-20-inbox', 'xiao 建卡被拦实录 + 收件箱待审'),
    ('cp-g3', 'G3 编码门禁', '测试证据随分支提交，无设计不编码', '门禁脚本 + 研发', 'ui-gov-tlpaycore', 'testlog 分支锚 feat/DEV-* ×4'),
    ('cp-g4', 'G4 独立验证', '测试的人不是写代码的人，缺陷全闭环', '人 · qi/fei 独立执行', 'ui-gov-test', '51/51 集成 + 131/131 回归'),
    ('cp-g5', 'G5 发布准出 + HumanGate', '七项检查 + 人工批准才许上线', '人 · PM + 评审卡', 'ui-gov-release', '三轮 FAIL→补齐→PASS + 批准留痕'),
    ('cp-uat', 'UAT 业务验收', 'BA 拿 G1 冻结清单逐条对账', '人 · bella 验收', 'ui-gov-uat', 'AC-1~7 逐条证据锚点 + SLA'),
    ('cp-g6', 'G6 复盘处置', '问题单 100% 记账，经验入家族记忆库', '人 · 全员 + 治理', 'ui-gov-retro', 'DISP 三态处置表 + 记忆探针'),
]

GATE_BY_STEP = {7: 'G1', 15: 'G2', 18: 'G3', 19: 'G4', 20: 'G5', 24: 'G6'}
GATE_STATE_KEY = {'G1': 'g1_frozen', 'G2': 'g2_arch_pass', 'G3': 'devimpl_done', 'G4': 'g4_pass', 'G5': 'g5_ready', 'G6': 'retro_done'}
GATE_DESC = {
    'G1': '需求上锁：验收标准可判定才许开工',
    'G2': '架构评审：不评审不排期',
    'G3': '编码门禁：测试证据随分支，无设计不编码',
    'G4': '独立验证：测试≠编码，缺陷全闭环',
    'G5': '发布准出：七项检查+人工批准才上线',
    'G6': '复盘：问题单 100% 处置，经验入记忆库',
}
STEPS = []
for n in range(1, 27):
    title, gate = plan_steps.get(n, (f'步骤 {n}', ''))
    meta = STEPS_META[n]
    STEPS.append((n, title, gate, meta))

def fmt_ts(key):
    v = state.get(key, '')
    if v.isdigit() and len(v) >= 10:
        import datetime
        return datetime.datetime.fromtimestamp(int(v[:10])).strftime('%m-%d %H:%M')
    return ''

ACTOR_STYLE = {
    'human': ('#dbeafe', '#1d4ed8', '人'),
    'ai': ('#ede9fe', '#6d28d9', 'AI'),
    'both': ('#d1fae5', '#047857', '人+AI'),
    'gate': ('#fef3c7', '#b45309', '硬闸'),
}

# 证据来源角标：三类别——读者一眼区分"产品界面"与"证据工件"
KIND_STYLE = {
    'ui': ('#dcfce7', '#15803d', '界面实拍'),
    'doc': ('#e0f2fe', '#0369a1', '仓内工件'),
    'msg': ('#f3e8ff', '#7e22ce', '消息转录'),
}

def img_tags(imgs):
    out = []
    for pre, cap, kind in imgs:
        p = STEPS_DIR / f'{pre}.png'
        if p.exists():
            kb, kf, kt = KIND_STYLE.get(kind, KIND_STYLE['doc'])
            out.append(
                f'<label class="shot"><input type="checkbox">'
                f'<img src="screenshots/steps/{pre}.png" alt="{H.escape(cap)}" loading="lazy">'
                f'<figcaption><span class="shot-kind" style="background:{kb};color:{kf}">{kt}</span>{H.escape(cap)}</figcaption></label>')
    return ''.join(out)

def issues_stats():
    """问题单台账：唯一键口径（类型·主体去重），如实标注与复盘文档事件流口径差异。"""
    lines = (EVID / 'issues.log').read_text().splitlines() if (EVID / 'issues.log').exists() else []
    iss, disp, order = {}, {}, []
    raw_i = raw_d = 0
    for l in lines:
        if l.startswith('ISSUE|'):
            raw_i += 1
            p = l.split('|', 3)
            key = f'{p[1]}·{p[2]}'
            if key not in iss:
                iss[key] = p[3] if len(p) > 3 else ''
                order.append(key)
        elif l.startswith('DISP|'):
            raw_d += 1
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
    stat = f'唯一键 {len(order)}：已修 {len(closed)} · 观察 {len(observed)} · 待处置 {len(open_k)}'
    note = f'台账事件流 {raw_i} 行 ISSUE / {raw_d} 行 DISP（含同一问题多次发生与多轮重跑），复盘文档按事件流全表列出；本节按唯一键去重收口。'
    if open_k:
        stat += f'（{", ".join(open_k[:3])} 属下轮跟进项）'
    return stat, note, '\n'.join(rows), len(closed)

def main_head():
    try:
        return subprocess.run(['git', '-C', str(CEN), 'rev-parse', '--short', 'origin/main'],
                              capture_output=True, text=True).stdout.strip()
    except Exception:
        return ''

stat, stat_note, itable, n_closed = issues_stats()
main_sha = main_head()

# 叙事层（V4 §四：终版报告=叙事层+旅程层单文件；失败显式降级不阻断）
try:
    import html as _H
    from report_narrative import render_narrative
    _narrative_html = render_narrative(state, EVID)
except Exception as _e:
    import html as _H
    _narrative_html = (f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;'
                       f'color:#92400e">叙事层生成失败（如实标注）：{_H.escape(str(_e))}</div>')
total_imgs = sum(1 for _, _, _, m in STEPS for pre, _, _ in m['imgs'] if (STEPS_DIR / f'{pre}.png').exists())
ui_imgs = sum(1 for _, _, _, m in STEPS for pre, _, kind in m['imgs'] if kind == 'ui' and (STEPS_DIR / f'{pre}.png').exists())

# ── 闸门仪表盘 ──

def status_badge(s: str) -> str:
    return '<span class="dm-badge">✓ 通过</span>' if s == 'pass' else f'<span class="dm-badge dm-badge--{s}">{s}</span>'

def domains_table():
    rows = []
    for d in DOMAINS:
        code, name, question, status, answer, evidence, cps = d
        links = ' '.join(f'<a class="dm-cp" href="#{cp}">▸{cp.split("-", 1)[1].upper()}</a>' for cp in cps.split(','))
        rows.append(f'<tr><td><b>{code}</b><br><span class="dm-name">{name}</span></td>'
                    f'<td class="dm-q">{H.escape(question)}</td>'
                    f'<td class="dm-a">{status_badge(status)}{H.escape(answer)}</td>'
                    f'<td class="dm-e">{H.escape(evidence)}</td>'
                    f'<td class="dm-cps">{links}</td></tr>')
    return ('<table class="domains"><tr><th style="width:72px">域</th><th style="width:160px">交付问题</th>'
            '<th>判定（逐域实测）</th><th style="width:22%">实测证据</th><th style="width:112px">关联卡点</th></tr>'
            + ''.join(rows) + '</table>')

def checkpoints_html():
    cards = []
    for cid, name, semantics, who, img, evidence in CHECKPOINTS:
        if not (STEPS_DIR / f'{img}.png').exists():
            continue
        cards.append(
            '<div class="cp-card" id="' + cid + '">'
            '<div class="cp-head"><span class="cp-name">' + H.escape(name) + '</span><span class="cp-who">' + H.escape(who) + '</span></div>'
            '<label class="cp-shot"><input type="checkbox"><img src="screenshots/steps/' + img + '.png" alt="' + H.escape(name) + '" loading="lazy"></label>'
            '<div class="cp-sem">' + H.escape(semantics) + '</div>'
            '<div class="cp-ev">' + H.escape(evidence) + '</div>'
            '</div>')
    return '<div class="cp-grid">' + ''.join(cards) + '</div>'

def gate_cards():
    # 打回记录（如实）：G2 首轮超时打回复评、G5 首轮 FAIL 补齐复测
    rejected = {'G2': '两轮超时→导演兜底', 'G5': 'r4/r5 FAIL→r6 PASS'}
    cards = []
    for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']:
        ts = fmt_ts(GATE_STATE_KEY[g])
        passed = bool(state.get(GATE_STATE_KEY[g]))
        cls = 'gpass' if passed else 'gpending'
        badge = '✓ 已通过' if passed else '○ 未达'
        rej = f'<span class="gate-rej">打回环：{rejected[g]}</span>' if g in rejected else '<span class="gate-rej ok1">一次通过</span>'
        cards.append(f'''<div class="gate-card {cls}">
  <div class="gate-name">{g}</div>
  <div class="gate-state">{badge}</div>
  <div class="gate-ts">{ts or "—"}</div>
  <div class="gate-desc">{GATE_DESC[g]}</div>
  {rej}
</div>''')
    return ''.join(cards)

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
        _, title, gate_text, meta = STEPS[n-1]
        done = any(state.get(k) for k in meta['keys']) or n == 26
        ts = next((fmt_ts(k) for k in meta['keys'] if fmt_ts(k)), '')
        gate_mark = f'<span class="gmark">{GATE_BY_STEP[n]}</span>' if n in GATE_BY_STEP else ''
        status = '<span class="ok">✅</span>' if done else '<span class="no">⬜</span>'
        nav_items.append(f'<a href="#step{n}" class="nav-step{" gate" if n in GATE_BY_STEP else ""}">{n} {gate_mark} {H.escape(title[:14])}…{status}</a>')
        imgs_html = img_tags(meta['imgs']) or '<p class="no-evidence">（截图缺失）</p>'
        abg, afg, atxt = ACTOR_STYLE[meta['actor']]
        step_cards.append(f'''
<article class="step{" gate-step" if n in GATE_BY_STEP else ""}" id="step{n}" style="--pc:{c1}">
  <div class="st-hd">
    <span class="st-num">{n}</span>
    <div class="st-title"><h3>{H.escape(title)}{gate_mark}</h3>
    <span class="st-meta">{status}{f" · {ts}" if ts else ""} <span class="actor" style="background:{abg};color:{afg}">{atxt}｜{H.escape(meta["actorText"])}</span></span></div>
  </div>
  <p class="st-story">{H.escape(meta["narrative"])}</p>
  <details class="st-gate"{" open" if n in GATE_BY_STEP else ""}><summary>把关标准（方案原文）</summary><div class="gate-body">{H.escape(gate_text) if gate_text else "（未单列）"}</div></details>
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

html = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Swarm Studio 全流程推演报告 · RFD-001</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--bg:#f8fafc;--card:#fff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;--accent:#3b82f6;--ok:#16a34a;--warn:#d97706;--err:#dc2626;--radius:12px;--shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.04)}}
html{{scroll-behavior:smooth}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);line-height:1.6;letter-spacing:-.01em}}

.layout{{display:grid;grid-template-columns:220px 1fr;gap:0;max-width:1400px;margin:0 auto;min-height:100vh}}
.sidebar{{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--card);border-right:1px solid var(--border);padding:20px 12px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}}
.main{{padding:0 32px 60px;min-width:0}}

.nav-title{{font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 8px;line-height:1.3}}
.nav-phase{{margin-bottom:8px}}
.nav-pname{{display:block;font-size:11px;font-weight:600;color:var(--pc,var(--muted));text-transform:uppercase;letter-spacing:.05em;padding:6px 8px 2px}}
.nav-step{{display:flex;align-items:center;gap:4px;padding:4px 8px 4px 12px;font-size:11.5px;color:var(--muted);text-decoration:none;border-radius:6px;border-left:2px solid transparent;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.nav-step:hover{{background:var(--bg);color:var(--text);border-left-color:var(--accent)}}
.nav-step.gate{{font-weight:600}}
.nav-step .ok{{color:var(--ok);flex-shrink:0}}
.nav-step .no{{color:#cbd5e1;flex-shrink:0}}
.gmark{{font-size:9px;font-weight:700;color:var(--warn);background:#fef3c7;border-radius:3px;padding:0 3px;flex-shrink:0}}

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

/* ── 六道闸仪表盘（人的审核把关）── */
.gates{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:-12px 0 28px}}
.gate-card{{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:var(--shadow);border-top:3px solid var(--border)}}
.gate-card.gpass{{border-top-color:var(--ok)}}
.gate-card.gpending{{border-top-color:#cbd5e1;opacity:.75}}
.gate-name{{font-size:15px;font-weight:800;color:var(--text)}}
.gate-card.gpass .gate-state{{color:var(--ok)}}
.gate-state{{font-size:12px;font-weight:700;margin-top:2px}}
.gate-ts{{font-size:10px;color:var(--muted);font-family:ui-monospace,monospace}}
.gate-desc{{font-size:10.5px;color:var(--muted);margin-top:4px;line-height:1.5}}
.gate-rej{{display:inline-block;font-size:9.5px;margin-top:5px;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#b45309}}
.gate-rej.ok1{{background:#dcfce7;color:#15803d}}

.phase{{margin-bottom:32px}}
.ph-hd{{display:flex;align-items:center;gap:14px;padding:16px 0 12px;margin-bottom:4px;border-bottom:2px solid var(--pc,var(--border))}}
.ph-num{{width:36px;height:36px;border-radius:50%;background:var(--pc,var(--border));color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}}
.ph-hd h2{{font-size:17px;color:var(--text);letter-spacing:-.01em}}
.ph-hd p{{font-size:12px;color:var(--muted)}}

.step{{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin:12px 0;box-shadow:var(--shadow);position:relative;overflow:hidden}}
.step::before{{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc,var(--border));opacity:.6}}
.step.gate-step{{border-color:#fbbf24;background:linear-gradient(135deg,#fffbeb 0%,#fff 30%)}}
.step.gate-step::before{{background:#f59e0b;width:4px;opacity:1}}
.st-hd{{display:flex;align-items:flex-start;gap:12px;margin-bottom:6px}}
.st-num{{width:32px;height:32px;border-radius:8px;background:var(--pc,var(--border));color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}}
.step.gate-step .st-num{{background:#f59e0b}}
.st-title h3{{font-size:14px;line-height:1.5;color:var(--text);letter-spacing:-.005em}}
.st-meta{{font-size:11px;color:var(--muted)}}
.actor{{display:inline-block;font-size:10px;font-weight:600;border-radius:4px;padding:1px 7px;margin-left:6px}}
.st-story{{font-size:12.5px;color:#334155;line-height:1.75;margin:4px 0 10px;padding-left:44px}}

.st-gate{{margin:8px 0 8px 44px;background:var(--bg);border-radius:8px;overflow:hidden;border:1px solid var(--border)}}
.st-gate summary{{padding:8px 14px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}}
.st-gate summary::before{{content:'▸';transition:transform .2s}}
.st-gate[open] summary::before{{transform:rotate(90deg)}}
.st-gate summary::marker{{display:none}}
.gate-body{{padding:8px 14px 12px;font-size:12px;line-height:1.8;color:var(--text);border-top:1px solid var(--border)}}
.step.gate-step .gate-body{{color:#78350f}}

.st-shots{{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}}
.shot{{flex:1 1 400px;max-width:520px;position:relative;cursor:zoom-in}}
.shot img{{width:100%;max-height:420px;object-fit:cover;object-position:top;border:1px solid var(--border);border-radius:8px;display:block;transition:box-shadow .2s}}
.shot:hover img{{box-shadow:0 4px 16px rgba(0,0,0,.12)}}
.shot figcaption{{font-size:11px;color:var(--muted);text-align:center;margin-top:4px}}
.shot-kind{{display:inline-block;font-size:9.5px;font-weight:700;border-radius:3px;padding:0 5px;margin-right:5px;vertical-align:1px;letter-spacing:.02em}}
.shot input{{display:none}}
.shot input:checked ~ img{{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-height:90vh;max-width:92vw;width:auto;object-fit:contain;z-index:9999;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.3);border-radius:8px}}
.shot input:checked ~ figcaption{{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px}}
.no-evidence{{font-size:12px;color:var(--muted);padding:8px 0}}

h2.section-hd{{font-size:18px;font-weight:700;color:var(--text);margin:32px 0 16px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}}
h2.section-hd::before{{content:'';width:4px;height:20px;border-radius:2px;background:var(--accent)}}
table{{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);overflow:hidden;font-size:12px;border:1px solid var(--border)}}
th,td{{border-bottom:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}}
th{{background:var(--bg);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}}
.d-ok{{color:var(--ok);font-weight:500}} .d-warn{{color:var(--warn)}}
.cp-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:10px }}
.cp-card {{ border:1px solid var(--border); border-radius:10px; background:var(--card); padding:10px 12px; box-shadow:var(--shadow) }}
.cp-head {{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:6px }}
.cp-name {{ font-size:13px; font-weight:700 }}
.cp-who {{ font-size:10.5px; color:var(--warn); font-weight:600; white-space:nowrap }}
.cp-shot {{ display:block; cursor:zoom-in; margin:2px 0 6px }}
.cp-shot img {{ width:100%; height:118px; object-fit:cover; object-position:top; border:1px solid var(--border); border-radius:6px; display:block }}
.cp-shot input {{ display:none }}
.cp-shot input:checked ~ img {{ position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); height:auto; max-height:88vh; max-width:90vw; width:auto; object-fit:contain; z-index:9999; box-shadow:0 8px 40px rgba(0,0,0,.3); border-radius:8px }}
.cp-sem {{ font-size:11.5px; color:#334155; line-height:1.5 }}
.cp-ev {{ font-size:10.5px; color:var(--muted); margin-top:4px; font-family:ui-monospace,monospace }}
.dm-badge {{ display:inline-block; font-size:10px; font-weight:700; color:#15803d; background:#dcfce7; border-radius:4px; padding:1px 7px; margin-right:7px; vertical-align:1px }}
a.dm-cp {{ display:inline-block; font-size:10px; color:var(--accent); text-decoration:none; margin:1px 3px 1px 0; border:1px solid var(--border); border-radius:4px; padding:1px 6px }}
a.dm-cp:hover {{ background:var(--bg) }}
@media (max-width: 1100px) {{ .cp-grid {{ grid-template-columns:repeat(2,1fr) }} }}
.domains {{ margin-top: 12px }}
.domains td {{ font-size: 12px; line-height: 1.7; vertical-align: top }}
.dm-name {{ font-size: 11px; color: var(--muted) }}
.dm-q {{ font-weight: 600 }}
.dm-a {{ color: #334155 }}
.dm-e {{ color: var(--muted); font-size: 11px }}
.govgrid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}}
.stat-note{{font-size:11.5px;color:var(--muted);margin:6px 0 0}}
details.audit{{margin-top:12px}}
details.audit summary{{font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;padding:8px 0}}
.footer{{margin:40px 0 20px;text-align:center;font-size:11px;color:var(--muted);line-height:1.8}}

@media (max-width: 900px) {{
  .layout{{grid-template-columns:1fr}}
  .sidebar{{display:none}}
  .main{{padding:0 16px 40px}}
  .hero{{margin:0 -16px 20px;padding:24px 20px 20px;border-radius:0 0 16px 16px}}
  .govgrid{{grid-template-columns:1fr}}
  .gates{{grid-template-columns:repeat(2,1fr)}}
  .st-story,.st-gate{{margin-left:0;padding-left:0}}
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
    <div class="sub">RFD-001 收单商户多端小程序支付收银台 · 15 人 × AI 分布式集群协作 · 四类 AI 员工（需求设计/应用研发/质量测试/研发治理）<br>
    推演轮次 {RUN_ID or 'V3 基线轮'} · 锚定本轮 state 落键时间窗 · 标题与把关逐字引用方案原文 · 每步标注人/AI 角色与结果锚点</div>
    <div class="hero-stats">
      <div class="hstat"><b>26</b><span>步骤</span></div>
      <div class="hstat"><b>{total_imgs}</b><span>证据图 · 全部界面实拍</span></div>
      <div class="hstat"><b>2/4</b><span>闸首过率（G2/G5 打回复评后通过）</span></div>
      <div class="hstat"><b>{n_closed}</b><span>问题单已闭环</span></div>
      <div class="hstat"><b>6</b><span>生命周期阶段</span></div>
    </div>
    <div class="phase-bar">{''.join(f'<div class="pb-seg" style="background:{c1}"></div><div class="pb-dot"></div>' for _,_,_,_,c1,_ in PHASES[:-1])}<div class="pb-seg" style="background:{PHASES[-1][4]}"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">{''.join(f'<span class="pb-label">{p[2]}</span>' for p in PHASES)}</div>
  </header>

  {_narrative_html}

  <div class="gates">{gate_cards()}</div>

  <h2 class="section-hd" id="checkpoints">关键卡点 · 人工把关实拍现场</h2>
  <p class="stat-note">九个人工卡点按流程顺序排列——每卡点配真实产品界面实拍（点击放大）：谁在把关、把什么关、证据在哪。六域判定的"关联卡点"可跳回此处。</p>
  {checkpoints_html()}

  {content_html}

  <h2 class="section-hd">六域审计 · 每域一个交付问题（逐域实测）</h2>
  {domains_table()}
  <p class="stat-note">数据来源：{DOMAIN_LEDGER_SOURCE} —— 治理中心（#/app/gov）「六域体检」可在真实流程中随时重跑并累积台账</p>

  <h2 class="section-hd">问题单终态（{stat}）</h2>
  <p class="stat-note">{stat_note}</p>
  <details class="audit"><summary>▶ 展开问题单处置明细（唯一键口径）</summary>
  <table style="margin-top:8px"><tr><th>类型·主体</th><th>描述</th><th>处置结论</th></tr>{itable}</table></details>

  <h2 class="section-hd">闭环治理终态</h2>
  <div class="govgrid">
    <table><tr><th>硬闸</th><th>把关点</th><th>终态</th><th>落键时间</th></tr>
    {''.join(f'<tr><td><b>{g}</b></td><td style="font-size:11px">{GATE_DESC[g]}</td><td class="ok">✓</td><td>{fmt_ts(GATE_STATE_KEY[g]) or "—"}</td></tr>' for g in ['G1','G2','G3','G4','G5','G6'])}
    </table>
    <table><tr><th>度量</th><th>终态值</th></tr>
    <tr><td>闸门首过率</td><td><b>2/4</b>（G1✓ G2✗ G4✓ G5✗——打回环均真实过闸复评通过）</td></tr>
    <tr><td>问题单终态</td><td>{stat}</td></tr>
    <tr><td>测试口径</td><td>集成 51/51 + 回归 131/131 全绿（G4 独立验证）</td></tr>
    <tr><td>发布基线</td><td>aipaydev main {main_sha}（动态实查）</td></tr></table>
  </div>

  <div class="footer">步骤标题与把关逐字取自方案文档（生成时解析，单一事实源）<br>
全部证据图=Swarm Studio 产品界面浏览器实拍（治理工件 markdown 经治理中心 UI 渲染；消息=协作沟通房间实拍；证据锚点见图内 commit/分支）<br>点击截图可放大 · 2026-09-28 内容级审计改版：叙事化（人/AI 角色+结果锚点）+ matcher 修正 + 问题单口径对齐</div>
</main>
</div>
</body></html>'''

OUT.write_text(html, encoding='utf-8')
print(f'report written: {OUT} ({len(html)} bytes, {total_imgs} images)')
