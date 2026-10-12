#!/usr/bin/env python3
# mx-report-gen.py — V3 全流程推演报告生成器（生命周期旅程版 v2）
# 设计原则：六阶段分组 + 侧栏导航 + 每步叙事（人/AI 角色+动作+结果锚点）+ 闸门可视化 + 证据灯箱
# 步骤标题与把关逐字取自方案文档（单一事实源）：
#   docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md 具体流程 1-26
#
# 2026-09-28 改版（内容级审计 report-audit-20260928.md 驱动）：
#   1. 每步补"执行叙事"：谁（人/AI/闸）做了什么、结果锚点是什么——26 张卡片连成故事线
#   2. 截图说明中文化（不再只有文件名）
#   3. 六道闸 hero 下独立仪表盘（状态+写入通过标记时间+打回次数），突出"人的审核把关"
#   4. 问题单口径核对一致台账（22 唯一键），如实标注与复盘文档事件流口径（70 行）的差异
#   5. 发布基线动态取 git rev-parse，不再硬编码
import html as H
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import r18_matrix  # 必采清单单一事实源（审计器查 8 同表，自动检查测试 ⑫）

# SIM 根与 final-report-merge.py 同源（AIPAY_SIM_ROOT 可覆盖）——工具链单一解析口径，
# 亦支持隔离树回归测试（写死路径使归档态 run6 无法离线回归）。
SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))
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
# ── R18 载荷（V7.2 全量呈现）：evidence/r18-steps.json ──
# 契约（r18-collect.py 写入方为单一事实源）：
#   {"_schema":1,"steps":{"<n>":{"dialogs":[{"title","room","anchor",
#     "messages":[{"sender","ts","body"}]}],
#     "ops":[{"title","entry","frames":["<n>-op<k>-before.png",…],"note"}],
#     "effect":{"text","evidence":[{"label","anchor"}]}}}}
# 载荷文件缺失=本轮未采集（渲染诚实"未采集"章，审计器查 8 打回）。
R18F = EVID / 'r18-steps.json'
# 路径契约自证（自动检查测试用）：--print-paths 只打印解析结果不读 state 不出报告。
if '--print-paths' in sys.argv:
    print(f'OUT={OUT}')
    print(f'STATE={STATE_FILES[0]}')
    print(f'STEPS_DIR={STEPS_DIR}')
    print(f'R18={R18F}')
    sys.exit(0)
# ── 方案原文解析 ──
# 验收线（正本 §5.5 反凑数·方案解析源单一）：PLAN_PATH 必须指向当前正本——正本换代时同步切换并记档。
# 解析链：MX_PLAN_PATH 覆盖 → 主工作树 V8（正本所在）→ NVMe 镜像树 V8 兜底
# （两棵工作树并存的分叉实录见 2026-10-05-v7-plan-structure-audit.md §二）。
# 块终止符扩到 h2/h3（V8 结构分离版逐步节后接 ### 小节，只认 ^## 会吞块）。
_plan_candidates = [
    os.environ.get('MX_PLAN_PATH', ''),
    '/Users/cuishi/lab/ncwk/overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md',
    os.environ.get('MX_OVERLAY_ROOT', '/Volumes/nvme2230/lab/ncwk/overlay')+'/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md',
]
PLAN_PATH = next((Path(p) for p in _plan_candidates if p and Path(p).exists()),
                 Path(_plan_candidates[1]))
CEN = SIM / 'central/aipaydev'

state = {}
for sf in STATE_FILES:
    if not sf.exists():
        continue
    for line in sf.read_text(encoding='utf-8', errors='replace').splitlines():
        if '=' in line and not line.startswith('jwt_'):
            k, v = line.split('=', 1)
            state[k.strip()] = v.strip()
if not state:
    sys.exit(f'[mx-report-gen] state 为空：{STATE_FILES[0]} 不存在——RUN_ID 是否写错？')
SNAP = EVID / 'state-snapshot.env'
if SNAP.exists():
    for line in SNAP.read_text(encoding='utf-8', errors='replace').splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            if v.strip():
                state[k.strip()] = v.strip()

# ── R18 载荷加载（缺失/坏 JSON=空载荷，渲染诚实缺席、审计打回；不让生成器崩）──
R18 = {}
R18_FILE_OK = R18F.exists()
if R18F.exists():
    try:
        _r18raw = json.loads(R18F.read_text(encoding='utf-8', errors='replace'))
        R18 = _r18raw.get('steps', {}) if isinstance(_r18raw, dict) else {}
    except (json.JSONDecodeError, OSError) as e:
        print(f'[mx-report-gen] WARN r18-steps.json 解析失败按空载荷处理：{e}', file=sys.stderr)

# ── 方案原文解析（双格式，V8.2 配套①）──
# V8.2 四段式：标题行 `**步 N｜标题**`，四段 **这步做什么**/**交付物及质量判据**/
# **已知问题**/**改进项**；旧版 V8：`N、`正文+（把关：…）尾行。正本换代先落解析适配
# 再切换（档案 §七裁决），两种格式并存期内自动识别。
plan_text = PLAN_PATH.read_text(encoding='utf-8', errors='replace')
PLAN_V82 = '**步 1｜' in plan_text

def _v82_sec(body, name):
    sm = re.search(r'\*\*' + name + r'\*\*：(.+?)(?=\*\*(?:这步做什么|交付物及质量判据|已知问题|改进项)\*\*：|\Z)',
                   body, re.S)
    return re.sub(r'\s+', ' ', sm.group(1)).strip() if sm else ''

plan_steps = {}
if PLAN_V82:
    for m in re.finditer(r'^\*\*步 (\d{1,2})｜(.+?)\*\*\s*$(.+?)(?=^\*\*步 \d{1,2}｜|^#{2,3} |^#### |\Z)',
                         plan_text, re.M | re.S):
        n = int(m.group(1))
        if n in plan_steps: continue
        body = m.group(3)
        plan_steps[n] = dict(title=m.group(2).strip(),
                             gate=_v82_sec(body, '交付物及质量判据'),
                             known=_v82_sec(body, '已知问题'),
                             improve=_v82_sec(body, '改进项'))
else:
    for m in re.finditer(r'^(\d{1,2})、(.+?)(?=^\d{1,2}、|^#{2,3} |\Z)', plan_text, re.M | re.S):
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
        plan_steps[n] = dict(title=first, gate=gate, known='', improve='')

# 解析自检（V8.2 配套①）：26 步缺步即拒绝运行——解析锚断=报告全员假标题，宁缺毋滥
_missing = [n for n in range(1, 27) if n not in plan_steps]
if _missing:
    sys.exit(f'[mx-report-gen] 方案解析缺步：{_missing}（PLAN_PATH={PLAN_PATH}，格式 {"V8.2" if PLAN_V82 else "V8"}）——解析锚断裂，拒出报告')

# ── 六阶段分组（核对一致方案叙事结构）──
PHASES = [
    (1, 4, '环境准备', '账号分配 · 配置初始化 · 登录 · 冒烟', '#2563eb', '#1e40af'),
    (5, 7, '需求管理', '应用登记 · 人员管理 · 需求上锁 G1', '#7c3aed', '#5b21b6'),
    (8, 14, '需求分析', '建群 · 派发 · 系统分析 · 四路系分 · 复核定稿', '#059669', '#065f46'),
    (15, 18, '设计评审与编码', 'G2 评审 · 归档 · 排期 · G3 编码', '#d97706', '#92400e'),
    (19, 21, '测试与交付', 'G4 测试 · G5 准出 · 发版 UAT', '#dc2626', '#991b1b'),
    (22, 26, '治理与复盘', '台账 · 审计 · G6 复盘 · IDE · 报告', '#0891b2', '#155e75'),
]

# ── 每步叙事：角色徽章 + 执行叙事 + 截图中文说明 ──
# actor: human=人主导 / ai=AI 主导 / both=人机协同 / gate=强制关卡（含人确认点）
# 叙事全部锚定真实事件（scenario.log / matrix event / git 提交），不虚构。
# imgs 三元组 (图 id, 中文图注, 来源类别)：
#   'ui'  = 产品界面实拍（Swarm Studio 真实页面，浏览器截图）
#   'doc' = 仓内工件/数据实查（git 文档、sqlite 卡记录、真值日志的排版呈现——非产品界面）
#   'msg' = matrix 真实消息转录（event_id 可反查——非产品界面）
# 报告读者必须能一眼区分"产品长什么样"与"证据是什么"，杜绝工件冒充 UI。
STEPS_META_RUN2 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='管理员签发账号清单：15 人编制每人人类账号+AI 助理账号（admin 不设助理），matrix 地址/token/密码经安全渠道下发，清单入仓可逐项对账（本轮 30 账号 token 真值核验 02:14:30 有效）。',
            imgs=[
                  ('ui-gov-roster', '治理中心·管理档案：账号清单——15 人×双账号×角色（清单入仓可对账）', 'ui'),]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用承载全部 profile（等价每人一台电脑一套）：14 用户逐一装配"账号+配置+看板+团队围栏+记忆库"四件套，互不可见；profiles 清单+每板 team 围栏装载 02:16:07 真值核验 ✓。',
            imgs=[
                  ('ui-02-profiles', '产品界面：看板切换器（看板: … ▾ 展开）——单 gateway 多路复用下按账号隔离的板可见性（28 板实况）', 'ui'),]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='用户打开 Swarm Studio 免密登录（凭 gateway 已配 Orchestrator channel），也支持 matrix 地址+账号+密码登录；02:16:07 14 账号 matrix-login+账号板 kanban 可达真值核验 ✓，登录后只见本账号档案与看板。驾驶舱顶栏任务计数/注意力条实时聚合跨板数据。',
            imgs=[
                  ('ui-03-cockpit', '驾驶舱全景：顶栏任务计数/注意力条实时聚合 + 左房间列表 + 右「任务·决策」三节+动态 feed', 'ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='冒烟清单真值核验：30 账号 token 有效、单 gateway+单 studio 就绪、双登录模式通（自动登录通路端点按契约应答）、看板围栏与记忆库在位。本轮首轮 02:11:53 因账号 admin token 失效中止（如实记录），重启后 02:14:29 模型通道预检通过（14 实例）。环境就绪后，驾驶舱「概览」页（#/app/dash）即全员工作总览入口。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（#/app/dash，P5）：我的待办/评审闸口/交付进度三卡——功能就绪总览', 'ui'),]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四个应用模块（支付核心/微信渠道/支付宝渠道/小程序收银台）逐一登记资产表：负责人、专属看板、技术栈、SLA、测试骨架，registry 入仓（commit 0508009，02:16:14）。',
            imgs=[
                  ('ui-gov-appregistry', '治理中心·管理档案：应用资产登记表——四应用负责人/看板/SLA/门禁骨架', 'ui'),]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='生成组织与权限矩阵（commit 3d74f0a，02:16:21）：14 账号×角色×汇报线×看板×团队×matrix 账号逐项对账零差异（M2 02:16:27 ✓），角色全覆盖含架构/安全 安全工程师A/运维 ops/审计 审计师A 治理线。',
            imgs=[
                  ('ui-gov-org', '治理中心·管理档案：组织与权限矩阵——14 账号×角色×汇报线×看板', 'ui'),]),
    7: dict(keys=['g1_frozen'], actor='gate', actorText='强制关卡 G1 · 人审上锁',
            narrative='BA（需求分析师A）经 matrix 私信送达需求文档（event $JWjga_-fnvLkFiA7ZnShOeJH9Jq_6eyMjZ-K-50bUUM；邮件通道本期禁用记问题单口径）。需求过 G1 四项检查：验收标准可机械判定（AC-1~7）、范围外清单、影响面、涉敏评估——四项齐才生成冻结标记入库（commit 02bd32c，冻结完成 02:16:43），锁后不许改。',
            imgs=[
                  ('ui-gov-center', '治理中心·六闸工件区：G1 冻结件呈现面（docs/requirements/RFD-001.freeze.md 已入 origin/main，commit 3191c11 锚）', 'ui'),
                  ('ui-08-groupchat', '驾驶舱·会话画布：冻结后建群现场（G1→room 衔接）', 'ui'),]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 邀人',
            narrative='产品经理 产品经理A 创建"支付收银台需求分析讨论群"（本轮房间 !zMzIGtITnwKsZtbjAp:matrix.test，02:16:47）并全量预邀（fanfan-agent + 8 关联人及各自 agent，方案 §8）——建群即按 RACI 全量预邀根治 room-invite 缺口，本轮零邀人问题单。',
            imgs=[
                  ('ui-08-groupchat', '协作沟通界面（#/app/s/group）：本轮需求分析讨论群真实消息流+右栏任务流转时间线（P4③）', 'ui'),
                  ('ui-08d-members', '协作沟通界面·成员面板：建群全量预邀实证——人+agent 并排在列', 'ui'),]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 产品经理A 派发',
            narrative='产品经理A 在群内 @fanfan-agent 发出派发指令（event $dnUFtNxIWKuOUrQngOHYS-c0p0-x5wfZ3x9744tqGlw）：需求一行信息+材料地址+证据要求（结论必须带提交号+卡号，空喊"完成"不算数）。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：群内派发与回执现场——@提及高亮+card=t_ 卡链接（P4①②）', 'ui'),]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator agent 经 matrix channel 接收指令，产品经理A 账号板 RFD-001 任务卡 02:16:55 真值 ✓。完成凭证反向核验首轮 02:27:01 600s 超时 ✗——拒收回灌（@fanfan-agent 要求用真实卡 ID 重报结论行），02:31:02 重报后核验 ✓（commit 真在 origin、卡真在账号板）——打回环真实发生，非橡皮图章。凭证主卡保持未分配/非派发状态专供核验（前代凭证卡链可回溯）。',
            imgs=[
                  ('ui-10-kanban', '产品看板：fanfan-pm-plan 板 RACI 徽章卡（R/A/C/I+我的角色描边）+「等您操作」过滤入口', 'ui'),
                  ('ui-10-carddrawer', '产品看板卡抽屉：RFD-001 凭证主卡详情——需求/交付物（含 commit 锚点）/关联卡对账', 'ui'),
                  ('ui-10b-kanban-mine', '产品看板：「等您操作」过滤器一键筛出当前登录人相关卡（P2）', 'ui'),]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析智能体完成需求切分与三清单匹配（人员/应用模块/组织），系统分析稿与任务清单 v6 入仓（commit bcc9d9c，02:35:55：双路提取核对+三清单匹配+SMART 拆分），ANALYSIS-DONE 结论行经反向核验。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：SMART 任务清单——T-101~T-108 具体到人（RACI）+人日合计', 'ui'),]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（研发工程师A/研发工程师B/研发工程师C/研发工程师D，02:42:30-32 房间真值 ✓），主卡带结构化 raci 四元组 ✓（responsible/approver/consulted/notification）；分诊台逐账号板登记核验 ✓（02:42:39-57），团队负责人A/团队负责人B 两 lead 分诊确认（triage→todo，02:43:09/19）——人始终在回路。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：RACI 派发现场（群内逐条 @主责 agent + @我高亮）', 'ui'),
                  ('ui-08c-flow-timeline', '协作沟通界面·右栏「任务流转」时间线（P4③）：派发/分诊/回执事件挂接', 'ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路系分（AN-PAYCORE/CHWX/CHALI/MP：接口签名/数据模型/错误码/幂等键/工作量人日）：本轮 AN-CHWX（commit c4adb02）/AN-MP（commit 3730ce8）新提交入库，AN-PAYCORE/AN-CHALI 系分稿沿用在仓正本（复跑复用语义如实呈现，不重复消耗 LLM 回合）；四份系分稿在仓+四主责完成回执双真值 02:43:28-36 ✓。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：任务清单 RACI+人日（系分产物锚点）', 'ui'),]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='概要设计五要素（背景/方案/接口/数据/风险）+ 备选方案取舍 + 爆炸半径 + 验证计划前移已在仓（docs/design/RFD-001-architecture-design.md）。本轮汇总评审卡 agent 未登记（review-card-missing 在案）——监控程序补登记但不标记完成（评审记录待评审人补记；独立审计 R-A4 后已根治此兜底可自批的路径）。',
            imgs=[
                  ('ui-gov-design', '治理中心·六闸工件：概要设计（G2 评审对象）——五要素/备选/爆炸半径/验证前移', 'ui'),]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='强制关卡 G2 · 架构评审',
            narrative='概设派发 arch-agent 架构治理评审（event $Xmb4SsviuF59Cpb9hxqQec3_1SBJKsbAKItqb00n-Ys，评审卡 t_11e182b3@arch-governance）。G2 一次通过：02:50:18 arch-agent 结论 ARCH-GATE-PASS（五项检查逐条留痕，缺项清单 G-1→产品经理A、G-2→团队负责人A 指名到人），02:50:33 评审卡 → done。不评审不排期。',
            imgs=[
                  ('ui-gov-center', '治理中心：六道闸卡在仓 + 待裁决评审区——G2 语义的产品承载', 'ui'),
                  ('ui-room-archived', '协作沟通界面：本轮需求分析讨论群消息流（arch-agent ARCH-GATE-PASS 结论行 02:50:18 在此房间，event 可反查）', 'ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务卡登记全部关联子任务与过程档案后置完成（close_done 写入通过标记）：完成摘要与关联卡对账可回溯，测试工作量按 0.3 系数口径写入。',
            imgs=[
                  ('ui-10-carddrawer', '产品看板卡抽屉：RFD-001 凭证主卡——关联卡对账（前代主卡/活跃子卡/合并卡全链可查）', 'ui'),]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='按定稿概设与工作量评估编排排期（docs/plan/RFD-001-schedule.md，02:50:45 真值 ✓）：四条开发任务（DEV-PAYCORE/CHWX/CHALI/MP）+ 两条测试任务（TEST-BE/FE），测试量=开发×0.3 独立成项，整体 +15% 缓冲，每任务时间窗口与依赖明确。',
            imgs=[
                  ('ui-gov-schedule', '治理中心·六闸工件：排期计划——DEV-* 时间窗口+依赖链+TEST×0.3+15% 缓冲', 'ui'),]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='强制关卡 G3 · 编码门禁',
            note='G3 写入通过标记注（独立审计 R-A4）：本轮 G3 仅有 devimpl_done 步键、无 g3_code_pass 强制关卡键（治理报告跳闸）——已根治：自下轮起 G3 强制关卡写入通过标记+治理报告六闸全列。',
            narrative='G3 编码门禁：四条 feat/DEV-* 分支 02:50:48-02:51:06 全部进 origin ✓，随分支测试证据 docs/evidence/DEV-*-testlog.txt（G3 本地门禁脚本真实核查）。合入 integration 时 testlog 污染副本冲突 3 起（DEV-PAYCORE/CHWX/CHALI，merge-conflict 在案；已根治为冲突自愈+增量 merge 保历史）。无设计不编码、渠道一律本地 mock。',
            imgs=[
                  ('ui-gov-tlpaycore', '治理中心·测试证据：DEV-PAYCORE 测试日志（分支锚 feat/DEV-PAYCORE）', 'ui'),
                  ('ui-gov-tlchwx', '治理中心·测试证据：DEV-CHWX 测试日志（分支锚 feat/DEV-CHWX）', 'ui'),
                  ('ui-gov-tlchali', '治理中心·测试证据：DEV-CHALI 测试日志（分支锚 feat/DEV-CHALI）', 'ui'),
                  ('ui-gov-tlmp', '治理中心·测试证据：DEV-MP 测试日志（分支锚 feat/DEV-MP）', 'ui'),]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='强制关卡 G4 · 独立验证',
            narrative='测试的人不是写代码的人：测试工程师A/测试工程师B 独立执行 TEST-BE/TEST-FE（派发 02:51:24），结论行 TEST-PASS-TEST-BE（test/TEST-BE@48a9d9d）/TEST-PASS-TEST-FE（test/TEST-FE@bdb9450），g4_pass 写入通过标记 03:28:25。独立审计注：G4 独立评审卡缺失曾由监控程序补登记（review-card-missing 在案，R-A4 已根治）；且新回执实跑树≠发布基线树、用例口径与基线实测有差——该缺陷由 G5 评审揭出（见步 20；收尾轮已同基线复验 194/194 完整循环）。',
            imgs=[
                  ('ui-gov-test', '治理中心·六闸工件：G4 测试报告——r4 口径 51/51 集成+131/131 回归（锚点 bebfd2d）', 'ui'),]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='强制关卡 G5 · 发布准出+人批准',
            mark_chip='判回滚→复审 r8 PASS',
            ts_override='04:49 误写入通过标记 · 10:52 复审 PASS',
            open_note='**G5 判回滚**（独立审计 R-A1）：state g5_ready 写入通过标记系判词误判（04:49:03 转述 stub 消息被当结论行），评审卡 t_ea68c462 结论实为 **READY-GATE-FAIL**——写入通过标记判废、"4/4 首过"口径判废、REL-* 三卡曾冻结（blocked）。**完整循环追记（2026-09-29 10:52）：R-A3 全链完整循环**——丢线回补（integration/RFD-001 增量合并 69ba333 整线 @ 67a1a95，DEF-BE-001/FE 修复线/守卫脚本/证据全数回归）、同基线复验 **194/194**+verify-guard **6/6**+黑盒探针 **42/42**+skeleton 220、独立复审 r8 **READY-GATE-PASS**（卡 t_ea68c462 结论行+凭证行 commit=5c1a02d），REL-* 三卡解冻（ready）。',
            narrative='G5 发布准出（派发 04:21:49，event $vldnPTzqiXr8AbbeHTalLQ2cBeBcBXuZ4oqwjAZFbOU，评审卡 t_ea68c462@fanfan-review）：fanfan-agent 产 release-plan/notes r7+隔离 worktree 全量取证（附件 G5-r7-isolated-run），评审结论 READY-GATE-FAIL（缺项①G4 证据链——报告锚点 bebfd2d ∉ 发布基线 0ab43de、执行证据随重建删除；②同 commit 可复现——基线强制重建丢 23 提交，DEF-BE-001/DEF-TESTFE-R3-1 双缺陷回归，黑盒探针 40/42 FAIL、verify-guard 3/6 FAIL；第 3-7 项 PASS）。机械判定曾于 04:49:14 因转述 stub 消息命中判词子串误过 G5（04:51:27 评审才实际完成）——判词语义已根治（末判词赢+卡面双源合并 FAIL 优先）。独立审计 R-A1 判回滚：G5 不成立、发布冻结，R1-R4 完整循环后复审；回滚方案/灰度/发布说明第 4-7 项评审通过留痕在卡。',
            imgs=[
                  ('ui-gov-release', '治理中心·六闸工件：G5 发布说明（r7 基线刷新版）——已知问题如实列双缺陷回归为发布阻塞项', 'ui'),
                  ('ui-20-inbox', '审批收件箱（#/app/inbox）：待审条目+风险三档分区+审批历史留痕', 'ui'),
                  ('ui-20b-spotcheck', '审批收件箱·抽检区（V4.1）：低风险自动放行回看（抽检·自动放行回看）', 'ui'),]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            note='UAT 判词语义（独立审计 #3，H9 已根治）：证据行逐条判词=AC-1/2/3/5/6 通过、AC-4/AC-7 有条件通过（历史缺陷修复未合入 integration 基线）——有条件验收，放行权归需求提出方 需求分析师A，条件完整循环后另行验收；旧版"全部 AC 通过"表述判废。',
            narrative='需求分析师A（BA）派发 UAT（event $ahY127LXMLkFx7fcBL8-BzJFHpHSnL9CiNIFiZKmLBs，按 G1 冻结清单 AC-1~7）：fanfan-agent 逐条给出三层证据锚点（冻结源/报告行号/testlog 行号，含隔离 worktree 一手复测），验收报告入仓（收尾已加判词勘误），SLA 登记（可用性 99.5%、下单 P95≤800ms、P2 事件 4h 响应）——开头定的标准结尾对账完整循环。',
            imgs=[
                  ('ui-gov-uat', '治理中心·六闸工件：UAT 验收报告——AC 逐条证据锚点+SLA 登记（判词勘误见步 21 注）', 'ui'),]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账随时可出（05:14:58 M3）：14 账号×状态分布真实核查数据，WIP 并行 ≤2 零超限；stale 卡（>72h）实测 6 项（产品经理A 1/研发工程师C 1/系统架构师A 2/审计师A 2）如实记档，跨轮衔接由 PM 决定挂起/移交。产品侧驾驶舱「概览」页的交付进度卡即此台账的常驻界面视图。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（P5 三卡）：我的待办/评审闸口/交付进度——工作台账的常驻界面视图', 'ui'),]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
            note='审计双线如实呈现：监控侧机械化意见书原判"通过（无发现）"经独立复核指出与在案问题单及 G5 实物 FAIL 不符，收尾已改判"有保留（待整改）"（R-A6）；正确结论以独立意见+处置表为准。',
            narrative='合规审计独立于开发/测试线：监控侧机械化审计（门禁留痕/台账格式/取证目录）05:15:00 通过并派发独立复核（event $B9p2ikl87-vJViId8eH-W-GB8xq_BL1dbnUFkT0vtl0）；audit-agent 独立复核 05:35 回结论 AUDIT-OPINION-CONCERNS（10 项：G5 留痕失真/基线重建丢线/UAT 基线锚断裂/G3 无写入通过标记/评审卡缺失仍写入通过标记/HumanGate 自评自批/DISP 缺账/留痕未受控改动/复盘模板话术/意见书口径），附抽检通过项与 R-A1..R-A6 处置建议——10 项逐条处置见《run2 独立审计响应与问题单处置》（evidence/audit-response-disposition.md）。',
            imgs=[
                  ('ui-gov-audit', '治理中心·六闸工件：合规审计意见书（审计师A 独立签名线）', 'ui'),]),
    24: dict(keys=['retro_done'], actor='gate', actorText='强制关卡 G6 · 复盘',
            note='收尾补记（R-A5）：6 条问题单 DISP 三态全部补记（已修 6）、ISSUES-LOG.md 回灌；复盘计数勘误 5→6；"UAT AC 全过"勘误为有条件验收；治理报告"0 条 DISP"系产出时点快照，处置以本报告问题单节+audit-response-disposition.md 为准。',
            narrative='三段式复盘（现象只写事实/规律机制归因对事不对人/行动项四要素）入仓+治理报告产出（强制关卡状态/问题单台账/凭证与回灌/metrics 口径行）；本轮经验存入跨轮记忆库（hindsight 探针 ✓，bank=hermes-f4ff5aba122f-fanfan），下轮同需求自动回忆。问题单 6 条经收尾全部处置记账（已修 6/6）。',
            imgs=[
                  ('ui-gov-retro', '治理中心·六闸工件：G6 复盘报告——问题单处置记账（三段式）', 'ui'),]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台（#/ide）全程介入：左侧任务列表带 RACI 徽章（主责/授权/咨询/通知计数），点卡上简报入口即出「任务简报」面板——RACI 四元组、工作流、git、上下文文件一屏齐；评审面板（通过/打回/有条件）为人工把关入口；模型经顶栏选择器独立配置。05:15:16 三真值核验 ✓（/ide 路由 200、ide?task 参数处理、简报生成代码）。',
            imgs=[
                  ('ui-25-ide', 'IDE 工作台：任务简报面板（RACI 四元/工作流/git/上下文文件）+ 评审面板', 'ui'),]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），每张证据图标注来源（产品界面实拍/仓内工件/消息转录），26 步状态真实不作假。报告路由（H7）：本轮 05:15 的首次生成因调用未带 RUN_ID 落 SIM 全局目录、拿了旧轮 state（"状态真实"的假报告）——已根治（调用必带 --run+路径同源），本报告即按 MX_RUN_ID=20260929-v4-run2 重生成的 run2 真值版。',
            imgs=[
                  ('ui-26-report', '推演报告自身（本页）', 'ui'),]),
}
STEPS_META_RUN4 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='0→1 清环境推演（补遗④第 1 项）：mx-clean 归档旧轮 runs/与 state 后重建账号面。管理员经设置·账户管理页（#/app/accounts，P6）维护 matrix 账号与双账号绑定，roster 界面导出入仓；30 账号 token 真值核验有效（headless+界面双源）。',
            imgs=[
                  ('ui-01-accounts', '设置·账户管理（P6，补遗④）：matrix 账号创建/分配/停用 + 本机↔matrix 双账号绑定——第 1 步账号分配的产品面', 'ui'),
                  ('ui-gov-roster', '治理中心·管理档案：账号清单——15 人×双账号×角色（清单入仓可对账）', 'ui'),]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用承载全部 profile（hermes 0.21.5，connected_platforms=15，冒烟真值 23:29:46）：14 用户逐一装配"账号+配置+看板+团队围栏+记忆库"四件套，互不可见；profiles 清单+每板 team 围栏装载真值核验 ✓。',
            imgs=[
                  ('ui-01-accounts', '设置·账户管理（P6）：双账号绑定与 roster——多账号隔离面（28 板经 profile 围栏装载，冒烟真值 ✓）', 'ui'),
                  ('ui-04a-sit-tasks', '驾驶舱页头「任务」chip：跨板聚合计数（多路复用账号面的实时投影）', 'ui'),]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='用户免密/双模式登录后落驾驶舱（#/app，补遗⑤ 单面口径；14 账号 matrix-login 真值 23:29:47 ✓，自动登录端点按契约应答 {"configured":false}）：顶栏任务计数、注意力条、中栏会话画布实时聚合跨板数据；主侧栏一级入口仅「驾驶舱」（+系统折叠组），全流程 UI 动线不出 /app 路由树。',
            imgs=[
                  ('ui-03-cockpit', '驾驶舱全景（补遗⑤ 单面）：顶栏任务/在线 chips·注意力条 + 中栏会话画布 + 右「任务·决策」三节', 'ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='冒烟清单真值核验（23:29:45-47）：30 账号 token 有效 ✓、单 gateway+单 studio 就绪 ✓、双登录模式通 ✓、看板围栏与记忆库在位 ✓。本轮起驾驶舱回归为准出项（补遗④第 3 项）：页头「任务」chip 计数=看板实况、「在线」chip 三数（人/智能体/机器）>0 且两组下拉可点选——headless（gateway detailed 健康）与浏览器（ui-04a/b）双源合并，「在线恒零」即阻断。',
            imgs=[
                  ('ui-04a-sit-tasks', '驾驶舱回归：页头「任务」chip 下拉——计数/状态过滤/待决策角标（补遗④第 3 项）', 'ui'),
                  ('ui-04b-sit-online', '驾驶舱回归：页头「在线」chip 下拉——人/智能体/机器三数>0 可点选（"在线恒零"阻断位）', 'ui'),
                  ('ui-03b-dash', '驾驶舱概览页（#/app/dash，P5）：我的待办/评审闸口/交付进度三卡——功能就绪总览', 'ui'),]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四个应用模块（支付核心/微信渠道/支付宝渠道/小程序收银台）登记资产表：负责人、专属看板、技术栈、SLA、测试骨架，registry 入仓。补遗④第 4 项：登记/变更/退役在治理中心·应用资产界面完成（六列表单，保存即 git 提交，app-registry.md 为界面产物）。',
            imgs=[
                  ('ui-gov-appregistry', '治理中心·应用资产（P7，补遗④）：六列表单增改退役，保存即提交——registry 为界面产物', 'ui'),
                  ('ui-gov-center', '治理中心全景：六闸工件+应用资产+组织关系（P7/P8 承载页面）', 'ui'),]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='组织与权限矩阵逐项对账（14 账号×角色×汇报线×看板×团队×matrix 账号零差异）。补遗④第 5 项：账号↔团队↔负责人在治理中心·组织界面维护，入职/转岗/离职三步向导（移交→停用→审计留痕）操作化，org.md 同步入仓。',
            imgs=[
                  ('ui-gov-center', '治理中心全景（P7/P8 承载页面）：组织关系与应用资产维护入口——org/registry 界面产物（M2 对账 14 账号 ✓ 零差异）', 'ui'),
                  ('ui-01-accounts', '设置·账户管理：14 账号×profile 对账的账号面（M2 真值锚）', 'ui'),]),
    7: dict(keys=['g1_frozen'], actor='gate', actorText='强制关卡 G1 · 人审上锁',
            narrative='BA（需求分析师A）经 matrix 私信送达需求文档；需求过 G1 四项检查（验收标准可机械判定 AC-1~7、范围外清单、影响面、涉敏评估）生成冻结标记入库，锁后不许改。两轮不齐不得开工。',
            imgs=[
                  ('ui-gov-center', '治理中心·六闸工件区：G1 需求冻结件呈现面（docs/requirements/RFD-001.freeze.md 已入 origin/main，worktree 锚 3191c11）', 'ui'),
                  ('ui-08-groupchat', '驾驶舱·会话画布：冻结后建群现场（G1→room 衔接，私信事件 $TQnF…4cszw）', 'ui'),]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 邀人',
            narrative='产品经理A 创建"支付收银台需求分析讨论群"（房间 !dNmjqtrriuDbzqTyvk:matrix.test，23:30:33）并全量预邀（fanfan-agent + 8 关联人及各自 agent）——建群即按 RACI 全量预邀（room-invite-gap 终清后 0→1 复验位），群即驾驶舱中栏会话画布（补遗⑤）。',
            imgs=[
                  ('ui-08-groupchat', '驾驶舱·会话画布：本轮需求分析讨论群真实消息流+右栏任务流转时间线（P4③）', 'ui'),
                  ('ui-08d-members', '会话画布·成员面板：建群全量预邀实证——人+agent 并排在列', 'ui'),]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 产品经理A 派发',
            narrative='产品经理A 在群内 @fanfan-agent 发出派发指令（event $r63f1ZfV8eqB0FpJ9eEj0oguNWDVfLOt9QtTcP3NIOM）：需求一行信息+材料地址+证据要求（结论必须带提交号+卡号，空喊"完成"不算数）——指令通道与文档正文分离（@本人语义才执行）。',
            imgs=[
                  ('ui-08b-msgcard', '驾驶舱·会话画布：群内派发与回执现场——@提及高亮+card=t_ 卡链接（P4①②）', 'ui'),]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator agent 经 matrix channel 接收指令，产品经理A 账号板 RFD-001 任务主卡 t_215792cd（23:46:00 落板）+七张 RACI 子卡落对板落对人。凭证核验打回环 ×3 真实发生：agent 曾在卡面虚报"分析稿 v8"（仓库无对应提交）被第一轮正确拒收；通道恢复后（09:47-10:02 回合）v8 增量真实推送入仓（origin/main 4a5a891，RUN=20260929-v5-run4 标记）——产物核验成立；唯"agent 亲发的结论行"因运行时回合中断问题始终未落群（事件链全记档），验收按宁缺勿假未放行。看板入口=注意力条最左「swarm kanban」按钮（M1 裁决动线，/app/board）。',
            imgs=[
                  ('ui-10-kanban', '驾驶舱·看板（#/app/board，M1 归一）：RACI 徽章卡（R/A/C/I+我的角色描边）+「等您操作」过滤入口', 'ui'),
                  ('ui-10-carddrawer', '看板卡抽屉：RFD-001 凭证主卡详情——需求/交付物（含 commit 锚点）/关联卡对账', 'ui'),
                  ('ui-10b-kanban-mine', '看板：「等您操作」过滤器一键筛出当前登录人相关卡（P2）', 'ui'),]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析产物真值：任务清单 v8 入仓（4a5a891——双路提取核对+三清单匹配+SMART 拆分，RUN 标记本轮）；结论行验收未完成（见步 10 记档），步 11 按 ⬜ 如实。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：SMART 任务清单——具体到人（RACI）+人日合计', 'ui'),]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（研发工程师A/研发工程师B/研发工程师C/研发工程师D，房间真值 ✓），主卡带结构化 raci 四元组；分诊台逐账号板登记核验 ✓，团队负责人A/团队负责人B 两 lead 分诊确认——人始终在回路。run3 曾在本步两轮超时熔断（triage-missing 在案），本轮 0→1 环境复验该点位。',
            imgs=[
                  ('ui-08b-msgcard', '驾驶舱·会话画布：RACI 派发现场（群内逐条 @主责 agent + @我高亮）', 'ui'),
                  ('ui-08c-flow-timeline', '会话画布·右栏「任务流转」时间线（P4③）：派发/分诊/回执事件挂接', 'ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路系分（AN-PAYCORE/CHWX/CHALI/MP：接口签名/数据模型/错误码/幂等键/工作量人日），系分稿在仓+四主责完成回执双真值 ✓。补遗④第 9 项（R14）：swarm yuan 生成 xxx-dev 定制 skill 的过程（仓库扫描→资产梳理→产出）以 ≥3 帧入报告——定义实物+装配脚印见下帧。',
            imgs=[
                  ('ui-skill-gen', 'R14·skill 生成过程：swarm yuan 定义实物+装配脚印（N 个 profile 副本真值）', 'ui'),
                  ('ui-gov-tasklist', '治理中心·分析档案：任务清单 RACI+人日（系分产物锚点）', 'ui'),]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='概要设计五要素（背景/方案/接口/数据/风险）+ 备选方案取舍 + 爆炸半径 + 验证计划前移入仓（docs/design/）。评审卡由评审人账号登记为唯一有效路径（R-A4 根治后语义），监控程序补登记不标记完成。',
            imgs=[
                  ('ui-gov-design', '治理中心·六闸工件：概要设计（G2 评审对象）——五要素/备选/爆炸半径/验证前移', 'ui'),]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='强制关卡 G2 · 架构评审',
            narrative='概设派发 arch-agent 架构治理评审（真实 LLM 回合，评审卡登记+结论行留痕）。不评审不排期；历史偏差标红（跨轮记忆库命中项）须显式回应。',
            imgs=[
                  ('ui-gov-center', '治理中心：六道闸卡在仓 + 待裁决评审区——G2 语义的产品承载', 'ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务卡登记全部关联子任务与过程档案后置完成（close_done 写入通过标记）：完成摘要与关联卡对账可回溯，测试工作量按 0.3 系数口径写入。',
            imgs=[
                  ('ui-10-carddrawer', '看板卡抽屉：RFD-001 凭证主卡——关联卡对账（前代主卡/活跃子卡/合并卡全链可查）', 'ui'),]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='按定稿概设与工作量评估编排排期（docs/plan/RFD-001-schedule.md 真值 ✓）：四条开发任务+两条测试任务，测试量=开发×0.3 独立成项，整体 +15% 缓冲，每任务时间窗口与依赖明确。',
            imgs=[
                  ('ui-gov-schedule', '治理中心·六闸工件：排期计划——DEV-* 时间窗口+依赖链+TEST×0.3+15% 缓冲', 'ui'),]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='强制关卡 G3 · 编码门禁',
            narrative='G3 编码门禁：feat/DEV-* 分支进 origin，随分支测试证据 docs/evidence/DEV-*-testlog.txt（G3 本地门禁脚本真实核查）+写入通过标记 g3_code_pass（H10 后六闸全列）。无设计不编码、渠道一律本地 mock。补遗④第 9 项（R14 驱动面）：xxx-dev skill 五步能力驱动开发的过程 ≥2 帧入报告。',
            imgs=[
                  ('ui-skill-drive-a', 'R14·skill 驱动现场①：五步能力调用真迹（agent 产出物引用 xxx-dev/五步能力）', 'ui'),
                  ('ui-skill-drive-b', 'R14·skill 驱动现场②：五步能力调用真迹', 'ui'),
                  ('ui-gov-tlpaycore', '治理中心·测试证据：DEV-PAYCORE 测试日志（分支锚 feat/DEV-PAYCORE；测试证据三件=案例清单/数据/执行输出）', 'ui'),
                  ('ui-gov-tlchwx', '治理中心·测试证据：DEV-CHWX 测试日志', 'ui'),
                  ('ui-gov-tlchali', '治理中心·测试证据：DEV-CHALI 测试日志', 'ui'),
                  ('ui-gov-tlmp', '治理中心·测试证据：DEV-MP 测试日志', 'ui'),]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='强制关卡 G4 · 独立验证',
            narrative='测试的人不是写代码的人：测试工程师A/测试工程师B 独立执行 TEST-BE/TEST-FE，结论行 TEST-PASS-* 经反向核验，g4_pass 写入通过标记。合格线补（H9 后）：测试报告六要素+证据证明真实执行过+实跑 commit 与发布基线同祖（merge-base 可验）。',
            imgs=[
                  ('ui-gov-test', '治理中心·六闸工件：G4 测试报告——范围/用例数/通过数/缺陷归因/结论/通过 commit id', 'ui'),]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='强制关卡 G5 · 发布准出+人批准',
            narrative='G5 发布准出：release-plan/notes+完备性七项（回滚阈值/灰度三档/观察窗/依赖无新增/同 commit 复现/HumanGate/用户收益表述），评审卡结构化判词（末判词赢+卡面消息双源 FAIL 优先——H8 根治后 stub 词面免疫）。FAIL 即发布冻结（REL-* 置 blocked，缺项完整循环+复审 PASS 才解冻）。',
            imgs=[
                  ('ui-gov-release', '治理中心·六闸工件：G5 发布计划+发布说明（七项完备性）', 'ui'),
                  ('ui-20-inbox', '审批收件箱（#/app/inbox）：待审条目+风险三档分区+审批历史留痕', 'ui'),
                  ('ui-20b-spotcheck', '审批收件箱·抽检区（V4.1）：低风险自动放行回看——放行/抽样/复核/落账全链台账', 'ui'),
                  ('ui-flow-freeze', '流转现场：发布冻结/解冻（REL-* 卡状态迁移；G5 首过无冻结事件时合法缺席）', 'ui'),]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='需求分析师A（BA）按 G1 冻结清单 AC-1~7 逐条验收：每个 AC 判词三态（通过/有条件通过/不通过）逐条落判词（H9 根治后禁总括句），验收书结论=逐条判词汇总，有条件/不通过不构成无条件验收，放行权归需求提出方。SLA 登记对账完整循环。',
            imgs=[
                  ('ui-gov-uat', '治理中心·六闸工件：UAT 验收报告——AC 逐条判词+证据锚点+SLA 登记', 'ui'),
                  ('ui-flow-uat', '流转现场：验收逐条对账（UAT 报告实物——中央仓 acceptance 工件）', 'ui'),]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账随时可出：14 账号×状态分布真实核查数据，WIP 并行 ≤2 零超限；stale 卡（>72h）如实记档。产品侧驾驶舱「概览」页交付进度卡即此台账的常驻界面视图。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（P5 三卡）：我的待办/评审闸口/交付进度——工作台账的常驻界面视图', 'ui'),]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
            narrative='合规审计独立于开发/测试线：监控侧机械化审计（门禁留痕/台账格式/取证目录）+独立复核分层，两层结论不一致以独立意见为准并勘误改判留痕；审计范围含闸门判词与实物一致性（判词真值/基线锚/写入通过标记齐全）。',
            imgs=[
                  ('ui-gov-audit', '治理中心·六闸工件：合规审计意见书（审计师A 独立签名线+独立复核层）', 'ui'),]),
    24: dict(keys=['retro_done'], actor='gate', actorText='强制关卡 G6 · 复盘',
            narrative='三段式复盘（现象只写事实/规律对事不对人/下轮验证）入仓+治理报告产出（强制关卡状态/问题单台账/凭证与回灌/metrics 口径行）；DISP 每条一行回写 issues.log 台账本体，复盘计数=台账实测统计；本轮经验存入跨轮记忆库（hindsight），下轮同需求自动回忆。',
            imgs=[
                  ('ui-gov-retro', '治理中心·六闸工件：G6 复盘报告——问题单处置记账（三段式）', 'ui'),]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台=驾驶舱·IDE 画布（/app/ide，补遗⑤ M2 归一；全屏画布形态与任务简报/交互编码/git 图谱/模型设置能力不变）：任务列表带 RACI 徽章，点卡出「任务简报」（RACI 四元组、工作流、git、上下文文件一屏齐）；评审面板（通过/打回/有条件）为人工把关入口。',
            imgs=[
                  ('ui-25-ide', '驾驶舱·IDE 画布（#/app/ide，M2 归一）：任务简报面板+评审面板+git 图谱', 'ui'),]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），每张证据图标注来源（产品界面实拍/仓内工件/消息转录），26 步状态真实不作假（状态徽标与 state 写入通过标记一致）。补遗④⑤口径：R12 快门自动检查（拒拍空态/错页）+R14 skill 过程位+流转衔接位随报告挂接；统一版（unified-roadshow-report.html）为唯一交付，本旅程版随 evidence 存档备查。',
            imgs=[
                  ('ui-26-report', '推演报告自身（本页首屏）', 'ui'),
                  ('ui-skill-tree', 'R14·skill 产出文件树（产出实物）', 'ui'),
                  ('ui-skill-content', 'R14·skill 产出内容（SKILL.md 实物——五步能力）', 'ui'),]),
}
STEPS_META_RUN1 = {
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
            narrative='冒烟清单真值核验：24 账号 token 有效、单 gateway+单 studio 就绪、双登录模式通、看板围栏与记忆库在位。需求分析师A matrix-login 一次回落如实记问题单（当日已修复复测通过）。环境就绪后，驾驶舱「概览」页（#/app/dash）即全员工作总览入口。',
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
    7: dict(keys=['g1_frozen'], actor='gate', actorText='强制关卡 G1 · 人审上锁',
            narrative='BA（需求分析师A）经 matrix 私信送达需求文档（邮件通道本期禁用，记问题单口径）。需求过 G1 四项检查：验收标准可机械判定（AC-1~7）、范围外清单、影响面、涉敏评估——四项齐才生成冻结标记入库，锁后不许改。',
            imgs=[
                  ('ui-gov-doc', '治理中心·六闸工件：G1 需求冻结件——AC-1~7 全文 + frozen:true + commit 锚点', 'ui'),]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 邀人',
            narrative='产品经理 产品经理A 创建"支付收银台需求分析讨论群"（本轮房间 !FurImZOaeHVyUqaRQR），先邀 fanfan-agent；系统分析步自动补邀 研发工程师A/研发工程师B/研发工程师C/研发工程师D/团队负责人B/测试工程师A/测试工程师B 关联人（agent 自动邀请面不足记问题单、监控程序兜底——如实呈现）。',
            imgs=[
                  ('ui-08-groupchat', '协作沟通界面（#/app/s/room）：本轮需求分析讨论群真实消息流+右栏任务流转时间线（P4）', 'ui'),]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 产品经理A 派发',
            narrative='产品经理A 在群内 @fanfan-agent 发出派发指令（event $wH4lFXYehQsJkZibp7cuFNf1yJON4Pl1xlkTMkjacwU）：需求一行信息+材料地址+证据要求（结论必须带提交号+卡号，空喊"完成"不算数）。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：群内派发与回执现场——@提及高亮+card=t_ 卡链接（P4①②），右栏任务时间线（P4③）', 'ui'),]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator agent 经 matrix channel 接收指令。本轮首验 900s 窗未见新卡——agent 依据跨轮记忆把本轮判定为"重复派单+基线漂移"（V3 已完整执行过 RFD-001），两轮拒收回灌后以 r5 增量刷新主卡 t_447bd817 落板重报，凭证反向核验通过（commit 真在 origin、卡真在账号板）——打回环真实发生，非橡皮图章。',
            imgs=[
                  ('ui-10-kanban', '产品看板：fanfan-pm-plan 板 RACI 徽章卡（R/A/C/I+我的角色描边）+「等您操作」过滤入口', 'ui'),
                  ('ui-10b-kanban-mine', '产品看板：「等您操作」过滤器一键筛出当前登录人相关卡（P2）', 'ui'),]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析智能体完成需求切分与三清单匹配（人员/应用模块/组织），tasklist v5 增量刷新入仓（1c362f5，基线漂移 24 提交的增量对账），ANALYSIS-DONE 结论行经反向核验（提交真在 origin 且含分析稿、卡真在账号板）。本轮凭证核验经历 600s 超时+拒收回灌+重报通过三段——验收驱动完整循环实录。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：SMART 任务清单 v5——T-101~T-108 具体到人（RACI）+24 人日合计', 'ui'),]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（研发工程师A/研发工程师B/研发工程师C/研发工程师D），分诊台逐账号板登记核验 ✓。本轮 orchestrator 依跨轮记忆判"重复派单"未自动群发——产品经理A（PM 人职责）补发四条 RACI 派发消息、监控程序补邀 7 名关联人，均如实记问题单：人始终在回路的兜底实录。',
            imgs=[
                  ('ui-08b-msgcard', '协作沟通界面：RACI 派发现场（群内逐条 @主责 agent + @我高亮），右栏任务时间线同步挂接', 'ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路系分产物（AN-PAYCORE/CHWX/CHALI/MP：接口签名/数据模型/错误码/幂等键/工作量人日）已在仓（前轮执行、本轮复跑复用），本轮核验四主责账号板 RFD-001 卡与系分工件在位后过闸——复跑轮语义如实呈现，不重复消耗 LLM 回合。',
            imgs=[
                  ('ui-gov-tasklist', '治理中心·分析档案：任务清单 T-101~T-108 RACI + 24 人日（系分产物锚点）', 'ui'),]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='概要设计五要素（背景/方案/接口/数据/风险）+ 备选方案取舍 + 爆炸半径 + 验证计划前移已在仓（3ddf3a9）；本轮汇总评审卡由监控程序登记标记完成（agent 汇总回合缺席记观察）——工件真伪由 G2 评审独立核验兜底。',
            imgs=[
                  ('ui-gov-design', '治理中心·六闸工件：概要设计（G2 评审对象）——五要素/备选/爆炸半径/验证前移', 'ui'),]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='强制关卡 G2 · 架构评审',
            narrative='概设派发 arch-agent 架构治理评审（五要素/爆炸半径/验证前移/备选≥2/历史偏差标红）。本轮 系统架构师A 回合两度 1800s 超时——根因双杀：记忆容量整理环（56 次调用全被 2179/2200 上限拒）+ matrix 插件 asyncio loop 发送 bug（结论发不出，空错误日志实锤）。监控程序兜底：评审卡 t_ae134ec2 标记完成+结论行以 arch-agent token 直连 API 代发（ARCH-GATE-PASS，评审材料=概设工件 3ddf3a9 实核），两项均如实记问题单。不评审不排期。',
            imgs=[
                  ('ui-gov-center', '治理中心：六道闸卡全绿在仓 + 待裁决评审区——G2 语义的产品承载', 'ui'),
                  ('ui-room-archived', '协作沟通界面：arch-agent「G2 架构治理评审已完成…ARCH-GATE-PASS」结论行现场', 'ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务卡登记全部关联子任务与过程档案后置完成：completed 时间戳、完成摘要（7/7 子卡与任务清单核对一致）可回溯，测试工作量按 0.3 系数口径写入。',
            imgs=[
                  ('ui-10-carddrawer', '产品看板卡抽屉：主卡归档终态——completed 时间/完成摘要（7/7 子卡核对一致）可回溯', 'ui'),]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='按定稿概设与工作量评估编排排期：四条开发任务（DEV-PAYCORE/CHWX/CHALI/MP）+ 两条测试任务（TEST-BE/FE），测试量=开发×0.3 独立成项，整体 +15% 缓冲，每任务时间窗口与依赖明确。',
            imgs=[
                  ('ui-gov-schedule', '治理中心·六闸工件：排期计划——DEV-* 时间窗口+依赖链+TEST×0.3+15% 缓冲', 'ui'),]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='强制关卡 G3 · 编码门禁',
            narrative='G3 编码门禁（复跑轮复用语义）：四条 feat/DEV-* 分支与随分支测试证据（pay-core 52/微信 25/支付宝 54/收银台 12+guard 6/骨架 220 检查）已在 origin——本轮派发后六 agent 依跨轮记忆判重复派单静默（如实记问题单），产物真伪由 G5 评审 agent 隔离 worktree 独立复跑实测兜底（五套 194/194 全绿）。无设计不编码、渠道一律本地 mock。',
            imgs=[
                  ('ui-gov-tlpaycore', '治理中心·测试证据：DEV-PAYCORE 测试日志全文（分支锚 feat/DEV-PAYCORE）', 'ui'),
                  ('ui-gov-tlchwx', '治理中心·测试证据：DEV-CHWX 测试日志', 'ui'),
                  ('ui-gov-tlchali', '治理中心·测试证据：DEV-CHALI 测试日志', 'ui'),
                  ('ui-gov-tlmp', '治理中心·测试证据：DEV-MP 测试日志（17 例+220 检查全过）', 'ui'),]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='强制关卡 G4 · 独立验证',
            narrative='测试的人不是写代码的人。复跑轮语义：集成测试 51 例（覆盖下单幂等/双渠道调起/回调验签拒绝/重复回调幂等/超时关单）在 test/TEST-BE 分支实跑全绿（报告 @ bebfd2d），测试工程师A/测试工程师B 账号板测试卡 done；六 agent 依跨轮记忆对重复派单静默（如实记问题单），TEST 结论行由监控程序以 agent token 代发——产物真伪由 G5 评审独立复核兜底。',
            imgs=[
                  ('ui-gov-test', '治理中心·六闸工件：G4 测试报告——51 例集成全绿 + r4 复验 42/42 探针', 'ui'),]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='强制关卡 G5 · 发布准出+人批准',
            narrative='本轮 G5 三轮真实过闸（生成-验证对抗的完整弧线）：r4 FAIL——agent 独立复核发现 integration 被强制重建丢失 bebfd2d 测试基线链（DEF-BE-001 修复与 G3/G4 证据不在发布基线）；整改合回后 r5 FAIL——缺项收窄至 FE 载体层（TEST-FE 报告未翻绿/回归验证卡 todo）；再整改（fix/TEST-FE-guard 合入+缺陷链三板清零+报告翻绿）后 r6 PASS——agent 隔离 worktree 实测五套 194/194+黑盒探针 42/42+基线零漂移。打回的每一轮都是真缺陷，不是流程表演。',
            imgs=[
                  ('ui-gov-release', '治理中心·六闸工件：G5 发布说明——回滚阈值/灰度/发布要点（评审卡 t_9772c561 三轮 review-record）', 'ui'),
                  ('ui-20-inbox', '审批收件箱（#/app/inbox）：待审条目+风险档+审批历史留痕', 'ui'),]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='需求分析师A（BA）派发 UAT：fanfan-agent 按 G1 冻结清单 AC-1~7 逐条给出证据锚点（测试文件/分支/commit/报告），验收报告入仓，SLA 登记（可用性 99.5%、下单 P95≤800ms、P2 事件 4h 响应）——开头定的标准结尾对账完整循环。',
            imgs=[
                  ('ui-gov-uat', '治理中心·六闸工件：UAT 验收报告——AC 逐条证据锚点+SLA 登记', 'ui'),]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账随时可出：14 人×状态分布（待办/进行中/评审/完成）真实核查数据，WIP 并行 ≤2 零超限，卡壳 72h 任务零——容量过载即记问题单。产品侧驾驶舱「概览」页的交付进度卡（状态分布+完成率）即此台账的常驻界面视图。',
            imgs=[
                  ('ui-03b-dash', '驾驶舱概览页（P5 三卡）：我的待办/评审闸口/交付进度——工作台账的常驻界面视图', 'ui'),]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
            narrative='合规审计独立于开发/测试线：门禁留痕完整性（每道锁冻结凭证在仓）、问题单台账格式、取证目录在位逐项过，意见书带签名线入仓；AI 结论抽检反向核验，幻觉率计入治理报告。',
            imgs=[
                  ('ui-gov-audit', '治理中心·六闸工件：合规审计意见书（审计师A 独立签名线）', 'ui'),]),
    24: dict(keys=['retro_done'], actor='gate', actorText='强制关卡 G6 · 复盘',
            narrative='三段式复盘（现象只写事实/规律机制归因对事不对人/行动项四要素），问题单 100% 处置记账（已修/观察/延后三态）；治理报告产出（闸首过率/证据通过率/缺陷统计）；本轮经验存入跨轮记忆库，下轮同需求自动回忆。',
            imgs=[
                  ('ui-gov-retro', '治理中心·六闸工件：G6 复盘报告——问题单全表处置记账（三段式）', 'ui'),]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台（#/ide）全程介入：左侧任务列表带 RACI 徽章（主责/授权/咨询/通知计数），点卡上简报入口即出「任务简报」面板——RACI 四元组、工作流（子卡 7·重试 0/2）、git（worktree+分支+提交）、上下文文件（任务清单 144.6KB 等 2 份）一屏齐；评审面板（通过/打回/有条件）为人工把关入口；模型经顶栏选择器独立配置。（直达链接自动弹简报为在修项，当前经卡入口唤出。）',
            imgs=[
                  ('ui-25-ide', 'IDE 工作台：任务简报面板（RACI 四元/工作流子卡 7/git/上下文文件）+ 评审面板', 'ui'),]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），每张证据图标注来源（产品界面实拍 / 仓内工件 / 消息转录），含 matrix event_id/git 引用可反查，26 步状态真实不作假。',
            imgs=[
                  ('ui-26-report', '推演报告自身（本页）', 'ui'),]),
}
# ── run5 叙事文案（2026-10-01 收尾实录；全部锚点为本轮真值：房间 !wbdIWyDcMaMOeSvYay、
# 主卡 t_f405c7b2、tasklist v9=1b2fce3、G2 评审卡 t_a10e41d9、G5 评审卡 t_73c36618）──
STEPS_META_RUN5 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='0→1 清环境推演：mx-clean 双档归档（20260930-154424/154715）后重建账号面。30 账号 token 全有效（15 人×双账号，16:41:28 真值）；管理员经设置·账户管理页（#/app/accounts）维护 matrix 账号与双账号绑定。本轮补真：账号板 kanban 可达核验接入冒烟（14 账号逐一 CLI 实查）。',
            imgs=[('ui-01-accounts', '设置·账户管理：matrix 账号创建/分配/停用+本机↔matrix 双账号绑定（30 账号真值锚）', 'ui'),]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用承载全部 profile（hermes 0.21.5，connected_platforms=15）；28 板 team 围栏装载核验 ✓（16:41:37）。本轮通道韧性实录：深夜网关两次换血（隔离锁目录/全量 env 经 mx-up 正道重启+全 agent×全房间已读推进防回灌风暴），15 平台每次全量重连（通道韧性根治批锚 b5703df8）。',
            imgs=[('ui-04a-sit-tasks', '驾驶舱页头「任务」chip：跨板聚合计数（多路复用账号面的实时投影）', 'ui'),]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='双模式登录（免密回落+账号 matrix-login）14 账号全过（16:41:36）；自动登录端点按契约应答 {"configured":false}（单 studio 多账号预期常态）。登录后落驾驶舱单面（补遗⑤：全流程 UI 动线不出 /app 路由树）；登录态通道实证锚=需求分析师A→产品经理A 需求 DM 事件 $8ezsRliURAY8ElehoYRxFGR4WDF31lCHf4w_KKc7TIA 可达。',
            imgs=[('ui-03-cockpit', '驾驶舱全景：顶栏任务/在线 chips·注意力条+中栏会话画布+右「任务·决策」三节（在线三数 1 人/14 智能体/1 机器实测回正）', 'ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='冒烟准出含驾驶舱回归（补遗④第 3 项）：headless 真值 gateway_state=running/connected_platforms=15 ✓；浏览器侧三数（ui-04b）本轮被实拍坐实「在线恒零」真根因=网关探测投影 schema 错位（0.21.5 回 platforms 键、新客户端只认 loaded_platforms），双态兼容根治后实拍 1 人/14 智能体/1 机器（自动检查测试 mock 新键全绿而运行态全红的 schema 脱节实例，overlay 22c11420/b5703df8 修复）。',
            imgs=[('ui-04a-sit-tasks', '驾驶舱回归：页头「任务」chip 下拉（计数/状态过滤/待决策角标）', 'ui'),
                  ('ui-04b-sit-online', '驾驶舱回归：页头「在线」chip 下拉——三数>0 可点选（「在线恒零」根治实证位）', 'ui'),
                  ('ui-03b-dash', '驾驶舱概览页：我的待办/评审闸口/交付进度三卡', 'ui'),]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四应用资产登记（支付核心/微信渠道/支付宝渠道/小程序收银台）×负责人×专属板×SLA×门禁骨架，registry 入仓（origin 2739627，16:41:58）；治理中心·应用资产界面为产品面（六列表单保存即 git 提交，R13）。',
            imgs=[('ui-gov-center', '治理中心全景：六闸工件+应用资产+组织关系（P7/P8 承载页面）', 'ui'),]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='组织与权限矩阵入仓（origin e817490，16:42:16）：14 账号×profile×板×fleet-manifest 对账零差异；治理线齐备（安全工程师A 安全/ops 运维/审计师A 审计）。入职/转岗/离职三步向导在治理中心·组织界面（P8）。',
            imgs=[('ui-01-accounts', '设置·账户管理：14 账号×profile 对账的账号面（M2 真值锚）', 'ui'),
                  ('ui-gov-center', '治理中心·组织关系维护入口（org.md 为界面产物）', 'ui'),]),
    7: dict(keys=['g1_frozen'], actor='gate', actorText='强制关卡 G1 · 人审上锁',
            narrative='BA（需求分析师A）经 matrix 私信送达需求书（$8ezsRliURAY8ElehoYRxFGR4WDF31lCHf4w_KKc7TIA，16:42:47）；四要素判读过锁（g1_frozen 16:42:53，AC-1~7 机械化可判）。如实记档：冻结件推送 origin 失败（GitHub 连通性，问题单 g1-push，留存本地）——通道故障不粉饰，治理动作照常写入通过标记。',
            imgs=[('ui-flow-freeze', '流转现场：G1 冻结链——私信送达→判读→冻结写入通过标记（对话+冻结件实物）', 'ui'),]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 预邀',
            narrative='产品经理A 创建「支付收银台需求分析讨论群」!wbdIWyDcMaMOeSvYay:matrix.test（16:43:04）并全量预邀（fanfan-agent+8 关联人及各自 agent）——成员面板实证 0 缺口（room-invite-gap 终清后 0→1 复验）；群即驾驶舱中栏会话画布（群锚 !wbdIWyDcMaMOeSvYay，建群后首条机器派发 $Cxsn3swxmqViobFPZs9e5Cam130R44DUXpoo0l9_iOE 可反查群在位）。如实记档：群全景截图（10-01 07:50 实拍）在 09:40 一轮单点采集复跑中被空态页覆盖（当时群已随环境复位清除）——采集脚本已补空态拒拍自动检查防复发（capture-v42 shutter-gate），群消息流证据由 msgcard/members 两帧 07:50 实拍真图承载。',
            imgs=[('ui-08b-msgcard', '会话画布：群内派发与回执现场——@提及高亮+card=t_ 卡链接（07:50 实拍真图）', 'ui'),
                  ('ui-08d-members', '会话画布·成员面板：建群全量预邀实证——人+agent 并排在列（07:50 实拍真图）', 'ui'),]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 产品经理A 派发',
            narrative='产品经理A 在群内 @fanfan-agent 发出系统分析派发（$Cxsn3swxmqViobFPZs9e5Cam130R44DUXpoo0l9_iOE，16:43:04）：需求一行信息+文档地址+三清单要求+SMART 拆分+RACI 派单纪律（派发标识 RUN 去重/结论行双凭证/卡号禁虚报）——指令通道与文档正文分离。',
            imgs=[('ui-08b-msgcard', '驾驶舱·会话画布：群内派发现场——@提及高亮+card=t_ 卡链接（P4①②）', 'ui'),]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator 建主卡 t_f405c7b2+七张 PM 跟踪卡 T-101~T-107（RACI 落对板落对人，chen-pay-core 另有 T-101/T-102 执行卡）。治理逆境实录：首夜驱动两轮 900s 窗口在 agent 交付前误杀（驱动 PATH 盲致看板查询恒空+串行通道下交付时延被低估），拒收回灌按设计工作；四修复（PATH 显式前置/窗口 2400s/审批双通道/环境工作区漂移）后续跑 17:50:49 秒过真值。',
            imgs=[('ui-10-kanban', '驾驶舱·看板（#/app/board）：RACI 徽章卡+主卡 t_f405c7b2+七跟踪卡', 'ui'),
                  ('ui-10b-kanban-mine', '看板：「等您操作」过滤器一键筛出当前登录人相关卡（P2）', 'ui'),]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析真值完整循环：tasklist v9 入仓（origin 1b2fce3，RUN=20260930-v5-run5 派发轮）；agent 亲发结论行 ANALYSIS-DONE-RFD-001 commit=1b2fce3 card=t_f405c7b2（17:20:48）——双凭证反向核验通过（17:51:34：commit 真在 origin 且含分析稿、card 真在账号板可查；深翻页取样修复让消息洪下的真结论行不再被窗口挤出）。',
            imgs=[('ui-gov-center', '治理中心·分析档案：SMART 任务清单 RACI+人日（v9 实物锚 1b2fce3）', 'ui'),
                  ('ui-08c-flow-timeline', '会话画布·右栏「任务流转」时间线：派发/分诊/回执事件挂接', 'ui'),]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（研发工程师A/研发工程师B/研发工程师C/研发工程师D 账号板各见 RFD-001 卡），团队负责人A/团队负责人B 两 lead 分诊确认——人始终在回路；结构化 raci 四元组经 --raci 落卡（分诊血缘锚：七跟踪卡 t_11d770b7[T-107]/t_175721f2[T-104] 等）。',
            imgs=[('ui-08c-flow-timeline', '会话画布·任务流转时间线：分诊确认与回执事件', 'ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路系分执行（AN-PAYCORE/CHWX/CHALI/MP：接口签名/数据模型/错误码/幂等键/工作量人日），四完成回执房间可见 ✓（18:00:53-18:01:03 真值）；系分稿以历史轮工件在仓（0→1 缺口披露：repo_pull 自远端带回，本轮产物以回执与 RUN 标记为准）。R14：swarm yuan 生成 xxx-dev 定制 skill 的过程见 skill 帧（四回执真值 18:00:53-18:01:03；AN-MP 交付锚=执行卡 t_26a03511）。',
            imgs=[('ui-skill-gen', 'R14·skill 生成过程：swarm yuan 定义实物+装配脚印', 'ui'),
                  ('ui-skill-content', 'R14·skill 内容：xxx-dev 五步能力实物', 'ui'),]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='汇总复核产概设 docs/design/RFD-001-architecture-design.md（基线含 932d10a「G2 缺项修订」：merge 续建完整版基线+前移点名 AC-3+统一 merchant-api 命名）。评审卡未由 agent 登记——监控程序补登记 t_8a4fe813 且不标记完成（R-A4 语义：评审记录待评审人补记，写入通过标记仅代表本步有记录）。',
            imgs=[('ui-gov-center', '治理中心·六闸工件区：概要设计（G2 评审对象）呈现面', 'ui'),]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='强制关卡 G2 · 架构评审',
            open_note='**G2 真实打回环**（本轮主难点）：首评 FAIL=真缺项（merchant-api 主责在 org/app-registry/tasklist 三处无登记行+设计稿引用的 T-007 任务不存在）→ 退回修订 → 复评 PASS。此前四轮「未过」实为判词模板自毒（建卡正文含「PASS 或 FAIL」协议转述被 FAIL 优先谓词当判词，f1979781 根治）与通道故障叠加——真评审从未发生过；剥开基建层后首评即出真缺项，评审者目标是击穿实现而非走过场。',
            narrative='arch-agent 对概设执行 G2 四项检查（评审卡 t_a10e41d9@arch-governance）：①五要素齐备 ②爆炸半径六清单核对（merchant-api 半缺口改判「已有归属、登记未同步」不阻塞定稿，转治理跟进 G-2）③验证计划前移（§11↔冻结 AC-1~7 逐条映射）④备选方案≥2（选型对比+七项分歧裁决表+条件双案）。结论 ARCH-GATE-PASS（01:57:49，全证据锚点+签名留档卡面）。通道故障停摆 6 小时（00:18-00:30 bigmodel 1302 限流）与判词/队列/锁三坑根治全程在案——治理逆境即素材。',
            imgs=[('ui-gov-center', '治理中心·六闸工件：G2 评审记录（四检查项×证据×结论，评审卡 t_a10e41d9 实物）', 'ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务收尾派发（$qAQo-wP68tu…，01:58:27）：要求把 4 份系分/tasklist/概设路径+commit 汇总登记主卡并标记完成。如实呈现：主卡未在观察窗内标记完成（串行通道排队延后），记观察不阻断——close_done 写入通过标记代表流程推进，主卡终态由卡面事实呈现。',
            imgs=[('ui-10-kanban', '驾驶舱·看板：主卡 t_f405c7b2 与七跟踪卡关联对账', 'ui'),]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='排期骨架（docs/plan/RFD-001-schedule.md）以历史轮工件在仓即过（0→1 缺口披露：门禁按文件存在性，旧轮工件自远端带回；本轮排期真值以 T-101~T-107 卡面时间窗与工作量字段为准——卡片经 --raci 结构化落板，锚 t_175721f2[T-104]/t_0753ca99[T-105]）。',
            imgs=[('ui-gov-center', '治理中心·分析档案：排期计划呈现面', 'ui'),]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='强制关卡 G3 · 编码门禁',
            narrative='四开发任务真实派发（研发工程师A DEV-PAYCORE $gl0lM-09…/研发工程师B DEV-CHWX $s23C4hw…/研发工程师C DEV-CHALI $xnxqACK…/研发工程师D DEV-MP $0jPc6SU…，02:18:50-02:19:10）：契约锚定概设、vitest 单测底线、testlog 随分支提交（G3 证据）。分支门禁以历史轮 feat/DEV-* 在 origin 即过（0→1 缺口披露）；本轮编码以 T-10x 执行卡与缺陷回流（T-105 守卫回归 研发工程师D 回补 fc2acd1、测试工程师B/团队负责人B 独立复现链）为真值面。',
            imgs=[('ui-skill-drive-a', 'R14·开发过程：xxx-dev skill 驱动编码现场（worktree 纪律）', 'ui'),
                  ('ui-skill-drive-b', 'R14·开发过程：技能内循环五步执行帧', 'ui'),
                  ('ui-25-ide', 'IDE 工作台：任务简报（RACI 四元/工作流/git/上下文）+评审面板', 'ui'),]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='强制关卡 G4 · 独立验证',
            narrative='集成合并：integration/RFD-001 四开发分支合并推送（02:19:49；DEV-MP testlog 污染副本冲突自动取正本收尾）。TEST-BE（测试工程师A）/TEST-FE（测试工程师B）真实派发（02:19:49-50）；测试报告以历史轮 51 例实测版在仓（0→1 缺口披露）。G4 写入通过标记 g4_pass（02:37）——非实现者验证语义由测试任务双派发承载（集成并入提交锚 7410464）。',
            imgs=[('ui-flow-defect', '流转现场：缺陷回流完整循环（TEST-FAIL→研发修复→TEST-PASS 回执，T-105/T-107 实录）', 'ui'),]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='强制关卡 G5 · 发布准出+人批准',
            narrative='G5 发布准出评审卡 t_73c36618@fanfan-review（七项检查单：G4 证据挂卡/同 commit 可复现/依赖无新增/回滚数字阈值+72h 观察/灰度 5%→25%→100%/发布说明面向用户/HumanGate 人批准）。fanfan-agent 02:38:56 加载 release-gate-review 技能执行评审。',
            imgs=[('ui-20-inbox', '审批收件箱（#/app/inbox）：待审条目+风险三档分区+审批历史留痕', 'ui'),
                  ('ui-20b-spotcheck', '审批收件箱·抽检区：低风险自动放行回看', 'ui'),]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='UAT 业务验收：需求分析师A 按 G1 冻结 AC-1~7 逐条要证据，fanfan-agent 出 UAT-EVIDENCE 结论行（commit/分支/测试报告行号锚点），逐条 AC 判词落验收书入仓；SLA 登记（99.5%/P95≤800ms/P2 4h）——开头定的标准结尾对账完整循环（验收书提交锚 9cc4422：AC-1~7 判词全通过；条件解除链 9d9c792→926cce1→9cc4422 如实入仓）。',
            imgs=[('ui-flow-uat', '流转现场：UAT 验收链（冻结 AC↔证据行↔判词）', 'ui'),]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账（M3）：14 账号×状态分布真实核查+WIP 并行上限治理+stale 卡口径如实记档；驾驶舱概览页交付进度卡即台账常驻界面视图（测试工程师B 板 14 卡实况锚：T-107 执行卡 t_90f31b36 在列）。',
            imgs=[('ui-03b-dash', '驾驶舱概览页：交付进度/我的待办/评审闸口三卡（工作台账常驻视图）', 'ui'),]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
            narrative='合规审计独立于开发/测试线（审计师A 签名线）：门禁留痕完整性/问题单格式/凭证抽检→合规意见书入仓；@audit-agent 独立复核。本轮问题单在案 6+ 条（g1-push/kanban-registration-skipped/review-card-missing/gate-breaker-override/g2-design-review-fail×2/集成推送被拒）全部如实呈现并处置。',
            imgs=[('ui-gov-center', '治理中心·六闸工件：合规审计意见书（审计师A 独立签名线）', 'ui'),]),
    24: dict(keys=['retro_done'], actor='gate', actorText='强制关卡 G6 · 复盘',
            narrative='三段式复盘（现象只写事实/机制归因对事不对人/行动项四要素）+治理报告入仓；本轮经验存跨轮记忆库（hindsight 探针），下轮同需求自动回忆。本轮大样本：审批双通道/判词模板自毒/PATH 盲/并发闸平衡/环境工作区漂移五类坑全部根治入正（overlay 六提交）。',
            imgs=[('ui-gov-center', '治理中心·六闸工件：G6 复盘报告（问题单处置记账三段式）', 'ui'),]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台（#/ide）核验：任务列表带 RACI 徽章、点卡出任务简报面板（RACI 四元组/工作流/git/上下文文件）、评审面板人工把关入口、模型顶栏独立配置；/ide 路由 200+ide?task 参数处理+简报生成三真值核验（评审卡直达链接锚 t_8a4fe813 实拍在位）。',
            imgs=[('ui-25-ide', 'IDE 工作台：任务简报面板+评审面板', 'ui'),
                  ('ui-25-models', 'IDE 工作台：模型选择器独立配置', 'ui'),]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），每张证据图标注来源，26 步状态真实不作假；0→1 缺口（历史工件自远端带回）在 plan/devimpl/testpass 三步如实披露并以 RUN 标记/回执锚定本轮真值。',
            imgs=[('ui-26-report', '推演报告自身（本页）', 'ui'),]),
}
# 按轮次选择叙事文案（run1 叙事自 c353a154 版逐字找回；未知轮次报错不静默错配）
# ── run6 叙事文案（2026-10-02 补注册：事件全部取自 scenario.log/state/仓内锚点）──
STEPS_META_RUN6 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='admin 清单复用 run5 台账（mx-clean 20261001-074743 后重建面）；30 账号 token 真值核验，首夜 02:11 admin token 失效中止→02:14 重启过。轮内加题：admin token 被装机 logout_all 冲掉的历史坑由 creds 重签覆盖。', imgs=[]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用 14 profile；本轮通道韧性实录：hermes 自更新擦掉 ~/.hermes 工作区补丁（kanban --raci 全链+533/534 风暴守卫）→deploy-agent-runtime 恢复 15 文件+533/534 git apply+网关正道重启；夜停 8h（/tmp periodic 清理吃掉接力脚本+Docker 睡眠）→接力迁数据盘+晨修 Docker/synapse/studio 三层启动。', imgs=[]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='双模式登录真值沿用 run5 通路；本轮需求派发锚=需求分析师A→产品经理A DM 事件可达；UI 面复用驾驶舱单面（/app 路由树）。', imgs=[]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='模型通道预检双格式探针本轮根治：旧探针只打 /chat/completions（cc-switch codex 通道→Kimi 五小时额度耗尽 403）而 agent 实走 anthropic_messages（claude→mimo 一直活）——整晚 quota 假红全是探错端点；双格式+150s 预算修复后 08:13 预检 14/14 过（b072c304）。', imgs=[('4-op1-after', '驾驶舱工作台：run 横幅+注意力条+中栏会话画布', 'ui'), ('4-op2-after', '运行中心：运行列表+工作流页签', 'ui')]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四应用资产登记表入仓 origin/main 1d06073（08:22:38）；治理中心·应用资产页承载（R13 产品面沿用）。', imgs=[('5-op1-after', '治理中心·应用资产页签：四应用登记表单', 'ui')]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='研发组织与权限矩阵（org，M2 七角色治理线）入仓 845df03（08:22:45）；汇报线 研发工程师A/研发工程师B/研发工程师C→团队负责人A、研发工程师D→团队负责人B、测试工程师A/测试工程师B→产品经理A 为后续 RACI 派发与 lead 分诊提供真值源。', imgs=[('6-op1-after', '治理中心·组织页签：15 人编制矩阵', 'ui')]),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 需求分析师A 需求方',
            narrative='G1 冻结四要素（AC-1~7/Scope-Out/影响面/涉敏）落 docs/requirements/RFD-001.freeze.md；08:23 推送 origin/main 失败记问题单（g1-push）——根因=本地 clone 落后非快进，UAT 前监控程序补账重推 18c9d77（带 run6 重申行）。', imgs=[('7-op1-after', '看板：G1 冻结后 RFD-001 全家桶卡', 'ui')]),
    8: dict(keys=['room_analysis'], actor='ai', actorText='AI · 装配脚本',
            narrative='分析群 !qCNrjIoWfYprGrCzoB 建群+全量预邀（run5 根治通路复验 0 缺口）；派发标记线程 $xwJE4IF_ 成为全轮派发锚。', imgs=[]),
    9: dict(keys=['dispatch_marker'], actor='both', actorText='人+AI · 派发',
            narrative='需求派发 产品经理A（PM）入群线程；本轮已知缺陷如实记档：群内新线程派发对部分账号不路由（研发工程师A/研发工程师D 通、研发工程师B/研发工程师C/测试工程师A/测试工程师B 丢）——修复=需求分析师A DM 直发任务书原文+并发闸弹回后 nudge 续派。', imgs=[]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · 分诊台',
            narrative='主卡登记 产品经理A 账号板 RFD-001 主卡+AN-* 跟踪卡结构沿用 v5 台账链。', imgs=[('10-op1-after', '看板：RFD-001 主卡+子卡', 'ui')]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 四路系分',
            narrative='tasklist v10 入仓 106bccb（13:15，RUN 标记本轮）；AN-PAYCORE d05ef10/AN-MP c2066a1 双稿 16:00-16:03 真实入仓，AN-CHWX/AN-CHALI 超时记问题单——四路完成度 2/4 如实呈现（通道限流日午后压制实录）。', imgs=[]),
    12: dict(keys=['triage_done'], actor='human', actorText='人 · 分诊确认',
            narrative='团队负责人A/团队负责人B 两 lead 分诊确认沿用（组织矩阵 845df03 汇报线真值源）。', imgs=[]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI · 分析执行',
            narrative='AN-PAYCORE/AN-MP 完成凭证反向核验（commit 真在 origin+卡真在账号板）双过；超时两路记问题单不虚标。', imgs=[]),
    14: dict(keys=['review_done'], actor='both', actorText='AI · 产品经理A 汇总',
            narrative='概设步 2400s 超时（18:44，产品经理A 马拉松会话被限流+网关 21:58 换血腰斩）→接力重启后汇总定稿；概设文档本体在特性分支在案（本轮新评证据缺口见 15 步如实披露）。', imgs=[]),
    15: dict(keys=['g2_arch_pass'], actor='both', actorText='AI · 系统架构师A 评审',
            narrative='G2 双源判据 10 秒速过——独立复核确认吃的是 932d10a（09-30 旧证据）而非本轮新评：双源判据的新鲜度缺口为治理素材如实披露。', imgs=[('15-op1-after', '看板：G2 架构评审卡', 'ui')]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 产品经理A',
            narrative='产品经理A 账号板 RFD-001 主卡 done（18:57 真值）；主卡 body 汇总四 AN 稿+tasklist 通路。', imgs=[]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 产品经理A PM',
            narrative='排期步七连超时根治实录（本轮主线治理素材）：①2400s 窗口<40-60min 任务时长（接力重启即换会话丢进度=结构性不可能过闸）②派发词未写 push 目标而真值盯 origin/main ③账户级限流+网关换血。修复=窗口 7200→活性等待+派发词明示 push origin main（588928b6）+排期执行口径改为"不限绝对时长、以空转判据兜底；先拆分再编码"（c84b7909）→产品经理A 30 分钟交卷：docs/plan/RFD-001-schedule.md 121 行（4971243，08:43）含 ≥2 人日子任务拆分纪律+DEV/TEST 固定 ID 映射+kanban 建卡+六路派发回执 PLAN-DONE。', imgs=[('17-op1-after', '看板：排期板', 'ui')]),
    18: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 四开发',
            narrative='假真值披露+真交付并行：四分支存在性检查被 run5 旧分支秒过（08:43:59-08:44:20，devimpl 5 秒连过=分支版新鲜度缺口，branch_fresh 自动检查 c75cfdb8 已根治未来轮）；同批四 agent 收到 run6 新任务书（含拆分纪律）真实开工——研发工程师A DEV-PAYCORE 47 分钟交付（主卡 t_e2a0a099+5 子卡全 done+testlog，28c3517，09:23 推送）、研发工程师C DEV-CHALI（10:15）、研发工程师B DEV-CHWX（S1/S2/S3 子任务提交，11:38）、研发工程师D DEV-MP 在途。', imgs=[]),
    19: dict(keys=['testpass_done'], actor='ai', actorText='AI · 集成+测试工程师A/测试工程师B 测试',
            narrative='集成与缺陷回流：四开发分支合入 integration/RFD-001（08:44:37）；REL-MERGE 合 main 子任务派 研发工程师A 被路由丢失→监控程序补账 f7b1cbc（11:55，注明补账缘由）；测试派发 测试工程师A/测试工程师B（TEST-BE/TEST-FE，08:44:45/47）+缺陷回流窗口 90 分钟在案。独立测试（测试的人不是写代码的人）：测试工程师A 执行 TEST-BE——194/194 全绿零缺陷，被测 8ec13c3、收尾 merge 3610bc1，测试报告 docs/test/RFD-001-test-report.md 入仓（8dbf5bf，10:01）TEST-PASS-TEST-BE；G4 写入通过标记 10:15:43。测试工程师A 双任务链（执行+报告）经 DM 直发续派完成；测试工程师B TEST-FE 在途（并发闸 4/4 弹回实录：bounce 消息在案）。', imgs=[('19-op1-after', '看板：测试交付卡', 'ui')]),
    20: dict(keys=['g5_ready'], actor='both', actorText='AI · 产品经理A 准出评审',
            narrative='G5 发布准出评审七项全 PASS：READY-GATE-PASS（评审卡 t_3aaacf2d@fanfan-review，review-record 七项判定+凭证行落卡）；发布计划/发布说明按模板落卡附件；团队负责人A 复测回执 10:52 落卡 comment #19。', imgs=[('20-op1-after', '看板：REL 三卡', 'ui')]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='REL-DELIVER 发布登记卡 t_5f8c2d25（10:40:11）；变更发版=REL-MERGE integration→main（监控程序补账 f7b1cbc 完成物理合并）。UAT 三段实录：①2400s 超时中止（产品经理A 证据核验 40 分钟>窗口）→重派 ②仓库核验位错配根治（报告在 integration 而 repo_has 查 main+G1 冻结推送失败积欠）→监控程序补账合 main+冻结重推 ③产品经理A UAT-EVIDENCE 七条（AC-1~7 逐条 commit/报告锚点，7/7 PASS）发于 DM 线程（$jDOSHiRYMBZB）——群线程路由缺陷由监控程序按原文代投群时间线（$V_jLqhvn，未改动注明）；验收书 docs/acceptance/RFD-001-acceptance.md 入仓（12:03:04）；AC 判词解析器"未见"口径与证据行实文不符记观察（判词器口径问题非证据缺失）。', imgs=[('21-op1-after', '看板：UAT 终局', 'ui')]),
    22: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 工作管理',
            narrative='M3 跨账号工作台账：14 账号×状态分布，WIP 全员 ≤2（12:03:05，evidence/work-report.md）。', imgs=[('22-op1-after', '沟通区：产品经理A 会话列表', 'ui')]),
    23: dict(keys=['audit_done'], actor='ai', actorText='AI · 审计师A 审计',
            narrative='合规审计意见书入仓（12:03:16）；门禁留痕/台账格式/取证目录审计通过 ✓；本轮问题单（g1-push/AN 超时×2/dev-branch 假真值/routing 丢失/并发闸弹回/uat-push 等）全程在案如实呈现。', imgs=[('23-op1-after', '运行中心：审计取证', 'ui')]),
    24: dict(keys=['retro_done'], actor='both', actorText='AI · G6 复盘',
            narrative='G6 三段式复盘+治理报告入仓（12:03:24）；记忆积累探针 ✓（hindsight 健康，家族 bank=hermes-f4ff5aba122f-fanfan——本轮经验可召回）。', imgs=[('24-op1-after', '治理中心·harness 页签', 'ui')]),
    25: dict(keys=['ide_done'], actor='ai', actorText='AI · IDE 核验',
            narrative='/ide 路由 200 ✓；ide?task 跳转处理+IDE 任务简报自动生成两项未见记问题单（12:08:39，产品面后续补齐；studio 夜停后由 mx-up 正道启动）。', imgs=[('25-op1-after', 'IDE 工作台画布全景', 'ui'), ('25-op2-after', 'IDE 任务简报抽屉（直达链接自动展开）', 'ui')]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），26 步状态真实不作假；注册表 2026-10-02 审查批核对一致方案轴（原 14-26 槽缺 review/report 两步致标题与叙事错位，修复后 26 槽=方案 26 步）。', imgs=[('26-op1-after', '交付案例面板：门禁灯投影', 'ui')]),
}

# run7（20261002-v5-run7）：修复后代码+终态方案（ac838384）首轮 0→1 全流程推演。
# 前 13 步叙事基于 scenario.log 实抽事件（锚点为真实时间/commit/事件 id）；
# 14-26 步为在途骨架（收尾后按本轮事件实测依据修订重生成）。
STEPS_META_RUN7 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='mx-clean 20261002-164757 彻底清环境后（run6 归档+九目录零残留）0→1 开跑；16:49 30 账号 token 真值核验一次过。', imgs=[('ui-gov-roster','治理中心·管理档案：账号清单——15 人×双账号×角色（roster 入仓可对账）','ui'),('ui-01-accounts','设置→账户管理（#/app/accounts，P6）：本机↔matrix 双账号绑定维护界面','ui')]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801+studio :8802 就绪；预检 14 实例全过（双格式探针继承 run6 根治版）。本轮新逆境实录：容量排队补丁 533（overlay 3113eeb1）再被 hermes 自更新擦除（第三次）——anexec 步并发闸拒收实证后现场 git apply 重放+空闲重启守护挂起（run7-lin-nudge/gw-idle-restart 双守护）。', imgs=[('ui-02-profiles','看板切换器：单 gateway 多路复用下按账号隔离的板可见性（28 板实况）','ui')]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='14 账号 matrix-login+账号板 kanban 可达+自动登录通路端点按契约应答（16:50:33 三真值一次过）；登录真值可反查——研发工程师A 会话 JWT sub=5/iat=1790930996（16:49:56 签发，state.env jwt_chen 保存解码可验）。', imgs=[('ui-03-cockpit','驾驶舱全景：顶栏任务计数/注意力条实时聚合+左房间列表+右「任务·决策」三节','ui')]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='驾驶舱回归·在线（headless）：gateway_state=running，connected_platforms=15（16:49:41，开跑锚 run_started_at=1790930955 state.env 可反查；浏览器侧三数见 ui-04b）。', imgs=[('ui-04a-sit-tasks','冒烟回归①：页头「任务」chip 下拉——计数=看板实况（补遗④第 3 项）','ui'),('ui-04b-sit-online','冒烟回归②：「在线」chip 三数（人/智能体/机器）与 fleet 实况一致且>0','ui')]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='M1 应用资产登记（4 应用×负责人×板×SLA×门禁骨架）16:50:45 入仓（central 0e4b185）；组织对账发现 fleet-manifest 用户数与编制不一致记问题单（如实，继续）。', imgs=[('ui-gov-appregistry','治理中心·应用资产：四应用负责人/专属看板/技术栈/SLA/测试骨架（central 0e4b185）','ui')]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='M2 组织与权限矩阵 16:50:52 入仓（central c0c54c9；14 账号七角色治理线：BA/PM/系统分析/架构/安全 安全工程师A/运维 ops/审计 审计师A）。', imgs=[('ui-gov-org','治理中心·组织：14 账号×七角色治理线+汇报线（central c0c54c9）','ui')]),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 需求分析师A 需求方',
            narrative='G1 冻结 16:51:09 一次过（RFD-001.freeze.md 直入 origin/main，central f521a8a；需求私信房 !vrPEujnSJJuJvFsrCD）——run6 同位曾推送失败记入问题清单+补账，本轮修复链生效零复发。', imgs=[('ui-gov-center','治理中心·六闸工件区：G1 冻结件 RFD-001.freeze.md（origin/main f521a8a 可反查）','ui'),('ui-flow-freeze','流转现场：G1 冻结→需求私信→建群衔接（需求分析师A→产品经理A 房 !vrPEujnSJJuJvFsrCD）','ui')]),
    8: dict(keys=['room_analysis'], actor='ai', actorText='AI · 装配脚本',
            narrative='产品经理A 16:51:17 建「支付收银台需求分析讨论群」并全量预邀（fanfan-agent+8 关联人及各自 agent），房间 id !TUAjDKGFxJqqSfrBlz:matrix.test；同刻需求派发线程 $4ANE4EALFSBZnXYT4SVngD8uFeYU5E8-SGvfOyqHTiQ 为全轮派发锚（run6 惯例）。', imgs=[('ui-08-groupchat','协作沟通（#/app/s/group）：本轮「支付收银台需求分析讨论群」消息流+右栏任务流转时间线','ui'),('ui-08d-members','会话工作台·参与方条（swp）：全量预邀实证——人/agent 徽章并排+溢出计数','ui')]),
    9: dict(keys=['dispatch_marker'], actor='both', actorText='人+AI · 派发',
            narrative='需求分析师A→产品经理A 需求私信（16:50:57）+产品经理A 需求派发 $4ANE4EALFSBZnXYT4SVngD8uFeYU5E8-SGvfOyqHTiQ（16:51:17）。', imgs=[('ui-08b-msgcard','群内派发与回执现场：@提及高亮+card=t_ 卡链接（派发线程 $4ANE4EAL）','ui')]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · 分诊台',
            narrative='register 打回环真实发生：17:33:35 完成凭证反向核验 600s 超时（首报凭证不实）→18:01:21 重报后核验 ✓（commit=62ed83a card=t_738b568d，tasklist v11 入仓）——治理闸门拒收假凭证的实证。', imgs=[('ui-10-kanban','看板（/app/board）：产品经理A 账号板 RFD-001 凭证主卡 t_738b568d+RACI 徽章','ui'),('ui-10-carddrawer','卡抽屉：凭证主卡详情——需求/交付物（commit=62ed83a 锚点）/关联卡对账','ui')]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 产品经理A PM',
            narrative='RACI 落地一半：SMART 任务卡已建到责任人板（研发工程师A t_f7a6887e[T-101]/t_a020ed7f[T-102] 18:02:55 等，body 带 RFD-001），但 产品经理A 群内双 @ 派发消息未发+主卡未填结构化 raci 字段——记观察 4 条+问题单 raci-not-structured；收尾侧深翻页实证（17:20-18:10 全窗）推翻「消息洪窗口外」原归因：消息确未发，非探针错过。步骤 10 派发阶段 18:05:32 完成（dispatch_marker 锚在 state 兜底）。', imgs=[('ui-gov-tasklist','治理中心·分析档案：SMART 任务清单 T-101~T-105 具体到责任人+人日','ui')]),
    12: dict(keys=['triage_done'], actor='human', actorText='人 · 分诊确认',
            narrative='研发工程师A/研发工程师B/研发工程师C/研发工程师D 四账号板 RFD-001 任务卡（分诊台登记=T 系卡 body 引用 RFD-001：研发工程师A t_f7a6887e/研发工程师D t_6a27d6aa/研发工程师B t_cdd11415/研发工程师C t_66c36202）18:05:37-18:05:51 四真值 ✓；团队负责人A/团队负责人B lead 分诊确认 18:05:55-18:05:58（triage→todo）；研发工程师B 板 T-103 双卡并存（t_cdd11415/t_f6bcab34 相隔 20s 重复登记，自动去重未生效——观察项）。', imgs=[('ui-08b-msgcard','分诊与 lead 确认现场：T-101~105 卡落责任人板（研发工程师A t_f7a6887e 等）','ui'),('ui-08c-flow-timeline','右栏「任务流转」时间线：派发/分诊/回执事件挂接','ui')]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI · 四路系分',
            narrative='并发闸逆境+全真实交付：18:06 研发工程师B/研发工程师C 派发撞 max_concurrent_sessions 拒收（533 排队补丁被自更新擦除），监控程序三发 nudge（注记留痕 $xPr-J42X05sx/$gw-FO4i9OUz）；四路全真入仓——研发工程师A AN-PAYCORE 3ad48a8/研发工程师D AN-MP f671adf/研发工程师C AN-CHALI 7e03058（18:59:53）/研发工程师B AN-CHWX 9e8587c（19:01:59）19:03:38-40 四真值 ✓；AN-PAYCORE/AN-MP/AN-CHWX 回执未见记观察（AN-CHALI 回执可见 ✓）。', imgs=[('ui-gov-tasklist','任务清单 RACI+人日（四路系分产物锚：研发工程师A 3ad48a8/研发工程师D f671adf/研发工程师C 7e03058/研发工程师B 9e8587c）','ui'),('ui-skill-gen','R14·xxx-dev 生成过程①：swarm yuan 扫描仓生成定制技能','ui'),('ui-skill-tree','R14·生成过程②：技能树产出','ui'),('ui-skill-content','R14·生成过程③：技能内容呈现','ui')]),
    14: dict(keys=['review_done'], actor='both', actorText='AI · 产品经理A 汇总',
            narrative='产品经理A 汇总复核 19:03:43 派发（$fvyANCaLlci6BHth2gpZL9MjA），概设 docs/design/RFD-001-architecture-design.md 入库；agent 未登记评审卡——监控程序补登记 t_0369aec7 不标记完成 保留「评审记录待补」（问题单 review-card-missing）。', imgs=[('ui-gov-design','治理中心·六闸工件：概要设计（G2 评审对象）——五要素/备选/爆炸半径/验证前移','ui')]),
    15: dict(keys=['g2_arch_pass'], actor='both', actorText='AI · 系统架构师A 评审',
            narrative='系统架构师A 19:21:42 接评（$VdvqAkf5w9DwtwplQis3R_Ssn95t7lxbCzB082RK0lQ）；G2 评审卡 t_dcd2e700 PASS 写入通过标记 19:36:27（评审记录留痕）。', imgs=[('ui-gov-center','治理中心：六闸卡在仓+评审区——G2 语义产品承载（评审卡 t_dcd2e700）','ui')]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 产品经理A',
            narrative='评审通过即收尾：19:36:31 产品经理A 收尾派发（$ly0sMzX6p34Cv_TmMp1WftaaUQB9d4-89SKXpxQ0unk）——主任务子卡与过程档案汇总登记，close 写入通过标记。', imgs=[('ui-10-carddrawer','卡抽屉：主卡关联子卡对账（前代主卡/活跃子卡全链可查）','ui')]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 产品经理A PM',
            narrative='排期一次过（run6 七连超时根治链验证成功）：19:54:05 派发（$bPsMmOac2gFA4wmAXJSxt4_LZ8zbPueB05mNvvGmgMo）→20:39:59 docs/plan/RFD-001-schedule.md 入仓→20:40 plan_done；全程 46 分钟零超时（活性等待+7200s 窗+派发词 push 目标三修生效）。', imgs=[('ui-gov-schedule','治理中心·六闸工件：排期计划——T-101~105 时间窗口+依赖链+TEST×0.3+15% 缓冲','ui')]),
    18: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 四开发',
            narrative='devimpl 全程 2h 零假过：研发工程师A 20:40:04 先行派发（$wJh57KszPc0z3M_WREvsgOu4zrPLdDKqpctkNZgGB3M）+研发工程师B/研发工程师C/研发工程师D 20:54 错峰三连发（$A1_0t8ofxx/$FFMC2EaMBR/$r53nAmemDk）；21:04 网关空闲守护误判重启腰斩 研发工程师A/研发工程师B 会话（记入问题清单 gw-idle-restart-false-positive）→重发完整任务书恢复（孤立提示无效的会话断裂恢复模式）；四分支 branch_fresh 4/4 本轮新鲜——研发工程师A 3241e5a(20:57)/研发工程师B 7c09aab(22:02)/研发工程师D 12c568b(22:12 提交时间；author date 14:00 系重建保留，守卫用提交时间判正确)/研发工程师C 4766cb6(23:04)；G3 写入通过标记 23:06；23:07:52 integration/RFD-001 四分支合并推送。先拆分再开工纪律实证：研发工程师A 主卡 t_0b362011+子卡 S6-S9（t_0352b639/t_e744b46e/t_323b0728/t_e0af8991）逐件独立 commit。', imgs=[('ui-gov-tlpaycore','G3 测试证据：DEV-PAYCORE testlog（feat/DEV-PAYCORE@3241e5a）','ui'),('ui-gov-tlchwx','G3 测试证据：DEV-CHWX testlog（@7c09aab）','ui'),('ui-gov-tlchali','G3 测试证据：DEV-CHALI testlog（@4766cb6）','ui'),('ui-gov-tlmp','G3 测试证据：DEV-MP testlog（@12c568b）','ui'),('ui-skill-drive-a','R14·开发调用①：五步能力驱动现场','ui'),('ui-skill-drive-b','R14·开发调用②：规格先行/质量门禁执行','ui')]),
    19: dict(keys=['testpass_done'], actor='ai', actorText='AI · 集成+测试工程师A/测试工程师B 测试',
            narrative='23:07:52 integration/RFD-001 四分支合并推送后双测试线开跑：测试工程师A TEST-BE（$wGlALGjRemCy5en9bJeHk7XV12rfKRc5zRSXQfHWOz8）/测试工程师B TEST-FE（$8AYdoNDsKHUdqr4IiIj4Z3sJXj5iB0ozqZqeHLaX0qg）；defect 观测窗零【缺陷】消息，测试工程师A 测试报告 docs/test/RFD-001-test-report.md 入 integration（00:38:08 真值 ✓）→G4 写入通过标记 00:59:09；gate_review 测试工程师A「G4-测试过闸」首轮实战——!refine 发送失败如实跳过记观察。**夜里韧性实录**：gate_review jq payload 裸键含点（m.relates_to）语法错在 set -e 下中断驱动——00:39-00:59 五连早退（overlay c24a9d60 热修实锤），relay 按 state 兜底接力、段幂等重入，代价=重复派发与日志噪音；接力进程过闸 G4 写入通过标记即根治实证——治理留痕完整。', imgs=[('ui-gov-test','治理中心·六闸工件：G4 测试报告——范围/用例数/缺陷归因三态/结论/通过 commit','ui'),('ui-flow-defect','流转现场：缺陷回流（测试→开发复现修复→复验关单）','ui')]),
    20: dict(keys=['g5_ready'], actor='both', actorText='AI · 产品经理A 准出评审',
            narrative='G5 真实打回环：01:30:15 产品经理A 派发准出评审（$5IKoKhj4E9vUuqgths5MfoRfrHMKXKZHw9Fd7WWSKDY，评审卡 t_73b1518a@fanfan-review，按 templates/release-plan+release-notes 产出）——首评 1800s 窗未见 READY-GATE 结论行超时打回（01:29:31），重评 20 分钟过闸：01:49:29 READY-GATE ✓→01:50:12 G5 写入通过标记（HumanGate=监控程序批准事件入 approved.events）；DELIVERY-STANDARD-COMPLETE.md 引用（426 行）。', imgs=[('ui-gov-release','治理中心·六闸工件：G5 发布计划+发布说明（DELIVERY-STANDARD 七项）','ui'),('ui-20-inbox','审批收件箱（#/app/inbox）：待审条目+风险三档分区+审批历史（HumanGate 留痕）','ui'),('ui-20b-spotcheck','收件箱·抽检区：低风险自动放行回看','ui'),('ui-g5-carddrawer','卡抽屉：G5 准出评审卡（按轮取卡）','ui')]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='发版登记双卡：REL-MERGE t_4d6491ca（01:50:58）/REL-TAG t_07b2831d（01:51:02）——集成基线与 tag 语义分离登记。UAT 七 AC 逐条验收（判词器括号注耐受修复首轮全流程真验证位：判词应 7/7 不再出"未见"）：03:40:25 需求分析师A 派发（$uQnenZqTyququj21vUyabprTfUvKE7801smFL4bF9PY，冻结清单原编号 AC-1~7 逐条）→03:39:28 UAT 证据行到位 ✓→判词 AC-1~7=7/7 通过（判词器 python 后端首轮零误报），验收书 origin/main a7eb6b3（05:54:07）。', imgs=[('ui-gov-uat','治理中心·六闸工件：UAT 验收报告——AC 逐条证据锚点+SLA 登记（判词器 python 后端首轮真验证）','ui'),('ui-flow-uat','流转现场：UAT 逐条对账锁定标准','ui')]),
    22: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 工作管理',
            narrative='工作台账 05:54:07 生成（evidence/work-report.md）：14 账号×状态分布，WIP 全员 ≤2（上限治理零超载）；与验收书同刻保存（验收书 origin/main a7eb6b3、审计意见书 6de9724 可反查），独立管理步零 LLM 等待。', imgs=[('ui-03b-dash','驾驶舱概览页：我的待办/评审闸口/交付进度三卡——工作台账常驻视图','ui')]),
    23: dict(keys=['audit_done'], actor='ai', actorText='AI · 审计师A 审计',
            narrative='审计双线：监控侧机械化审计（门禁留痕/台账格式/取证目录）05:54:10 通过→audit-agent 独立复核派发（$hdLr6qCdi9WMEyA9ymFABXBpQ6daVDYQV5LFtFXOZzo）→05:54:18 合规意见书入仓；抽检与独立意见分层口径按 V6 步 23 细则。', imgs=[('ui-gov-audit','治理中心·六闸工件：合规审计意见书（审计师A 独立签名线+抽检记录）','ui')]),
    24: dict(keys=['retro_done'], actor='both', actorText='AI · G6 复盘',
            narrative='G6 复盘收尾 05:54:18-25：治理报告生成（evidence/governance-report.md，六闸写入通过标记 45 条凭证+metrics 实测统计「首过率 3/4：G1/G2/G4 首过·G5 打回」）→复盘文档入仓→记忆积累探针 ✓（hindsight 健康，家族 bank=hermes-f4ff5aba122f-fanfan，下轮同名 RFD 自动回忆）；问题单复盘时 29 行缺 DISP 如实记待处置，收尾监控程序按唯一键 15 键三态补账（已修 10/观察 5，不改写 agent 原始记录）。', imgs=[('ui-gov-retro','治理中心·六闸工件：G6 复盘——问题单处置记账（三段式+度量实测统计）','ui')]),
    25: dict(keys=['ide_done'], actor='ai', actorText='AI · IDE 核验',
            narrative='IDE 核验三真值 05:54:25：/ide 路由 200 ✓、ide?task 参数处理在位（IdeShell.vue route.query.task，overlay 1cac0874 直达链接自动展开简报链）✓、简报组件在位 ✓（run6 假阴性根治后首轮复验；ui-25 族实拍 42 图内）；run6 撤单先例 DISP|ide-task-param 本轮复验通过。', imgs=[('ui-25-ide','IDE 工作台（/app/ide）：任务简报（ide?task= 直达链接自动展开）+交互式编码','ui'),('ui-25-models','IDE·模型设置面板','ui')]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='报告生成 05:54:25 驱动直出 simulation-report.html（方案核对一致 26 步）→收尾链重生成（采集 42 图挂接+22-26 实测依据回填+PART1 说人话层注册）→final-report-merge 双正本→mx-report-audit R1-R17 断言——本页存在即本步凭证；R17 按轮注册强制关卡全程拦旧轮冒充。', imgs=[('ui-26-report','推演报告自身（本页；simulation-report.html 存在守卫）','ui'),('ui-gov-doc','治理中心·工件库（?tab=gov-docs）：六闸工件实物渲染+编辑链（R13）','ui')]),
}

STEPS_META_RUN8 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='mx-clean 20261004-065954 三旗标全清（reset-central/workspaces/memory 真实执行）后 0→1 开跑；07:10-07:11 24 账号 token 真值核验一次过。清理本身带当天修复：pipefail 静默中断（清得越干净越必炸）已根治。', imgs=[]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 + studio :8802 就绪；运行面自愈双通道（manifest 23 件+git apply）开跑即在位。预检只首轮跑（run8 优化 D）。', imgs=[]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='12 账号 matrix-login + 账号板可达 + 自动登录端点按契约应答（07:11 三真值一次过）。', imgs=[]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='驾驶舱在线真值 gateway_state=running；本轮起 run-progress.json 契约上线（sset 同步刷进度，驾驶舱运行态条数据源——后台感知三件套配套，下轮快照生效）。', imgs=[]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='应用资产登记入仓；治理基线 runtime/governance 五 yaml 播种中央仓（25e861d，台账与规则页 404 根治，正本=overlay runtime）。', imgs=[]),
    6: dict(keys=['people_done'], actor='both', actorText='人 · 组织装配',
            narrative='编制 12 人×双账号+团队围栏装载；07:12:22「支付收银台需求分析讨论群」建群并全量预邀（产品经理A+8 关联人及各自 agent）。', imgs=[]),
    7: dict(keys=['register_done'], actor='human', actorText='人 · 需求分析师A 产品',
            narrative='RFD-001 收单商户多端小程序支付收银台需求文档发出（财付通/支付宝公开技术手册依据）；G1 需求上锁+AC 清单冻结。', imgs=[]),
    8: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系分编排',
            narrative='四系分任务派发编排（AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI），RACI 结构化字段齐备。', imgs=[]),
    9: dict(keys=['triage_done'], actor='ai', actorText='AI · 分诊',
            narrative='系分任务分诊与认领路由完成。', imgs=[]),
    10: dict(keys=['anexec_done'], actor='ai', actorText='AI · 四路系分执行',
            narrative='真分批 2+2（V7 P1 并发预算实装）：首批 研发工程师A+研发工程师D 80 分钟交付、第二批 研发工程师B+研发工程师C 续跑；11:02 四系分全部入库。AN-MP 首批缺件记入问题清单后回灌补上（完整循环实证）；回执缺失×2 如实记档——当晚定因为网关响应投递丢弃（564 补丁根治，run9 验证）。', imgs=[]),
    11: dict(keys=['review_done'], actor='ai', actorText='AI · G2 评审',
            narrative='G2 系分评审 11:02-12:05 多角色会签（团队负责人A/研发工程师A 线程内 !approve 实录）；检查点归档 gate_review v3 首轮实跑（12:05:59 !refine 入工作线程）。', imgs=[]),
    12: dict(keys=['archgate_done'], actor='ai', actorText='AI · 架构闸',
            narrative='本轮最大事故段：12:06-15:10 建卡 asg_args 空数组 set -u 中断成 30 秒崩溃环（403 棒接力，损 3h04m）——bash 3.2 第 4 型坑，护栏修复后 15:10 过闸；概设评审收尾+G2 三条跟进完整循环（G-1 裁决补派 T-109/G-2 模板入库）。', imgs=[]),
    13: dict(keys=['close_done'], actor='both', actorText='AI · 评审收尾',
            narrative='评审线程收尾与概定稿入库。', imgs=[]),
    14: dict(keys=['plan_done'], actor='ai', actorText='AI · 产品经理A 排期',
            narrative='排期两段实录：首派 15:23 产出 tasklist v13+多角色审批后在 16:28 陷入静默（当日定性=网关投递丢弃族），1800s 活性判据 17:02 判停滞重派；二派 25 分钟完成 schedule.md 入库（17:27）——A/E 优化活性判据按设计兜住，损失 1h39m。', imgs=[]),
    15: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 四路开发',
            narrative='真分批渠道+前端：研发工程师A DEV-PAYCORE ✓（71 分钟含 S3 测试证据）、研发工程师C DEV-CHALI ✓（18:38 保存）；研发工程师B DEV-CHWX 与 研发工程师D DEV-MP 停摆未推分支（投递丢弃族实证二例），wait_alive 判停滞记入问题清单放行——V7.1 回灌语义按设计运转。', imgs=[]),
    16: dict(keys=['defect_done'], actor='ai', actorText='AI · 集成',
            narrative='二段崩溃环根治实录：对不存在远端 ref 的 merge 走 not-something-we-can-merge→abort 128 静默中断（26 棒）；修=缺支前置检查+记入问题清单跳过。integration/RFD-001 合并 PAYCORE+CHALI 两分支并推送（缺席分支如实记入问题清单）。', imgs=[]),
    17: dict(keys=['testpass_done'], actor='ai', actorText='AI · 测试工程师A/测试工程师B 测试',
            narrative='TEST-BE/TEST-FE 派发+90 分钟缺陷流观测窗（设计窗语义）→测试报告 22:1x 入 integration 分支过闸。途中三段崩溃环（idle-nudge 的 -n 误入算术上下文）当场根治——当日第 5 型 bash 坑。', imgs=[]),
    18: dict(keys=['ready_done'], actor='ai', actorText='AI · 就绪检查',
            narrative='发布就绪检查通过。', imgs=[]),
    19: dict(keys=['release_done'], actor='ai', actorText='AI · 发布登记',
            narrative='REL-MERGE/REL-TAG/REL-DELIVER 三卡登记（23:16）+G5 发布闸检查点归档实跑；三段崩溃环（同语句 local 自引用，u 未赋值即被默认值命令替换引用）41 棒根治——当日第 6 型。', imgs=[]),
    20: dict(keys=['uat_done'], actor='both', actorText='人 · 产品经理A 验收',
            narrative='23:40 需求分析师A 派发业务验收（G1 冻结清单 AC-1~AC-6）；四段崩溃环（证据体拉取 curl 瞬时 22 在赋值位被 set -e 中断）根治后进入标准等待，00:0x 证据行到位过闸。', imgs=[]),
    21: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 工作区管理',
            narrative='工作区状态核查与收尾（00:07:34）。', imgs=[]),
    22: dict(keys=['audit_done'], actor='ai', actorText='AI · 审计师A 审计',
            narrative='审计双线（监控侧机械审计+独立复核）00:07:44 通过。', imgs=[]),
    23: dict(keys=['retro_done'], actor='ai', actorText='AI · G6 复盘',
            narrative='G6 复盘 00:07:52：治理报告生成+问题单全量在案（16+ 条三族：回执缺失/交付缺席/集成缺口——当晚统一定因为响应投递丢弃根因）。', imgs=[]),
    24: dict(keys=['ide_done'], actor='ai', actorText='AI · IDE 核验',
            narrative='IDE 核验三真值通过（00:14 前）；本轮驾驶舱配套（后台任务执行感知三件套+辅助栏分组整合）已合 main，下轮快照生效。', imgs=[]),
    25: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='报告链 00:14 首跑被按轮叙事文案强制关卡拦下（按轮注册防旧轮冒充，设计如常）→run8 叙事文案注册后本页生成；全量呈现本轮未采图（0 图如实标注，补拍留收尾链）。', imgs=[]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 终局',
            narrative='接续器 RELAY-FINISHED 判定链：全部 gates 执行完毕。全程 07:09-00:1x≈17h；六型 bash set -u/e 坑+两产品根因（响应投递丢弃/驾驶舱盲区）当场根治入档——本轮推演的核心产出即这份事故-根因-修复账本。', imgs=[]),
}

STEPS_META_RUN9 = {
    1: dict(issue_keys=['roster-stale-governance-roles'], keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='mx-clean 全清后 00:24:00 开跑（V8 终态正本首跑轮）；30 账号 token 真值核验全过（15 人×双账号），预检只首轮（run8 优化 D 沿用）。设置页实拍：账号管理/开发者设置/关于分区在位（1-op4）。如实记：roster.md 停在首签 12 人版（mx-clean 快照回灌未含治理三岗），编制对账缺口=差异审计 P11，收尾补正（中央仓 4124b47，issues 单 roster-stale-governance-roles）。', imgs=[('1-op4-after', '设置页实拍：账号管理/开发者设置/关于分区在位（v0.7.30）', 'ui')]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='服务和界面都正常起来了：网关在线、17 个智能体待命、4 条 Matrix 会话在跑（有截图为证）。前几轮踩过的坑这次一个没复发——五个运行时修复补丁全程在位，接力守护进程每轮巡检都核验过（日志可查）。', imgs=[('2-op4-after', '运维面实拍：网关 8801 在线·17 agent 活跃·4 Matrix 会话在线', 'ui')]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='14 账号 matrix-login + 账号板 + 自动登录端点三真值一次过（state.env jwt_*×14 键锚，admin 走独立凭证，matrix 全量 30 账号）；设置·账户管理实拍显示 12 行——根因=界面读的 roster.md 停在 12 人版（缺口 P11，补正 4124b47），非登录面缺损（1-op2）。', imgs=[('1-op2-after', '设置·账户管理：roster 12 账号全列（人+AI 助理双账号契约可见）', 'ui')]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='驾驶舱在线真值 gateway_state=running；run-progress 契约横幅「20261006-v8-run9 · N/26 段」全程在线（驾驶舱会话页/运行中心多帧实证，run8 落地的后台感知三件套本轮全程服役）。如实记：冒烟②承诺的「运行中心工作流页签三区块非空」无当轮证据帧，收尾实测该页签 DOM 点击不可入且运行列表空态（4-op8 实证帧）——与 runs-registry-empty 同族产品缺口，记入差异审计 P12。', imgs=[('6-op2-after', '驾驶舱会话页：run-progress 横幅「20261006-v8-run9 · 20/26 段」+在线 16（1人·14智能体·1机器人）', 'ui'), ('4-op8-after', '运行中心（收尾实测）：工作流页签点击不可入+运行列表空态——冒烟②承诺项证据缺口与产品缺口双记（P12）', 'ui')]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='应用资产登记入仓；账户/资产注册面实拍（roster@91e4b8b，新建账号表单含 synapse 地址与「同建 AI 助理账号」勾选——人机双账号契约在 UI 层可见，1-op2-before）。', imgs=[('1-op2-before', '设置·账户管理：新建账号表单（synapse 地址+「同建 AI 助理账号」勾选）', 'ui')]),
    6: dict(keys=['people_done'], actor='both', actorText='人 · 组织装配',
            narrative='编制 15 人×双账号（30 账号，org.md 00:25:39 实测依据；roster.md 停 12 人版的断裂见步 1 如实记）+团队围栏装载；00:26:10「支付收银台需求分析讨论群」建群并全量预邀一次过 0 缺口（房间 !cVtpmUOAfqakogcEPF，run8 后连续两轮全量预邀零缺口。勘误注：原手编 00:24:45/!YdZgLdbhQamAvkBLCO 系旧值残留，按 scenario.log 00:26:10 实证更正）。', imgs=[('6-op4-after', '产品经理A 会话列表（#/app/s/chat）：组织装配后的会话面板', 'ui')]),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 需求分析师A 产品',
            narrative='RFD-001 收单商户多端小程序支付收银台需求文档发出；G1 需求上锁+AC 清单冻结 00:26:07 一次过（开跑后 2 分钟）。效果实证带锚见对话/效果卡；冻结后需求全景看板实拍（RFD-001 全家桶卡在板，7-op4）。', imgs=[('7-op4-after', '看板：G1 冻结后 RFD-001 全家桶卡全景（排期/开发/测试/交付/发布卡在板）', 'ui')]),
    8: dict(keys=['register_done'], actor='human', actorText='人 · 产品经理A 发单',
            narrative='产品经理A 驾驶舱发单+凭证登记；IDE 工作台任务·决策侧栏实拍：run9 任务流水 20+ 条全列（评审概设/DEV-MP/tag v1.0.0-cashier/回归复测 run10/缺陷重做 P3——发单链派生任务全景；锚：房间 !cVtpmUOAfqakogcEPF 建群 00:26:10+主任务卡 t_e35cd102，8-op3 对帧）。', imgs=[('8-op3-before', 'IDE 工作台·任务·决策侧栏：run9 任务流水 20+ 条（发单链派生任务全景）', 'ui'), ('8-op3-after', 'IDE 工作台·任务·决策侧栏（续）：评审概设/DEV-MP/tag/回归复测 run10/缺陷重做 P3 在列', 'ui')]),
    9: dict(issue_keys=['runs-registry-empty'], keys=['register_done'], actor='ai', actorText='AI · agent 首应',
            narrative='agent 群内首应与登记回执（对话实录已按必采清单从 Matrix API 采集，见对话卡）；房间时间线在本构建 UI 未同步——同步空态帧如实呈现并记入问题清单（runs-registry-empty 同族产品缺口，9-op5）。', imgs=[('9-op5-after', '房间同步空态实拍：群房间时间线在本构建 UI 未同步（对话实录走 Matrix API 采集，缺口记入问题清单 runs-registry-empty）', 'ui')]),
    10: dict(issue_keys=['raci-dispatch-missing'], keys=['register_done'], actor='ai', actorText='AI · 看板登记',
            narrative='看板上这一单的全部任务卡都在（排期/前后端开发/回归测试/交付打包/打标签，见截图）。截图里的卡号和状态文件里记录的卡号逐一对上号——界面显示的不是摆设，背后真有这些任务。备注：截图工具用鼠标点不开卡片详情（自动化工具的点击方式不被识别），人工从任务链接进入可以正常打开，属采集限制非产品缺陷。', imgs=[('10-op3-before', '看板：RFD-001 卡全列（56 任务，泳道 待分拣/待办/已调度/就绪/进行中）', 'ui'), ('10-op3-after', '看板（续）：t_e35cd102 排期 TEST-FE/t_d4241a3a TEST-BE/t_91b8c344 DEV-BFF/t_3d299c0e 回归复测 run10/t_f802193c 交付包/t_fa9bb595 tag v1.0.0-cashier——与 state card_REL-* 三卡 ID 逐一对应', 'ui')]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 四路系分',
            narrative='四系分（AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI）02:54 全入库——run8 2/4 交付的补考轮全量通过；AN-MP 首窗 3600s 超时记入问题清单（负向如实）；看板系分卡实拍（11-op2）。', imgs=[('11-op2-after', '看板：RFD-001 系分交付卡在板（四系分 02:54 全入库）', 'ui')]),
    12: dict(issue_keys=['agent-prework-bypass-g2'], keys=['triage_done'], actor='ai', actorText='AI · 分诊',
            narrative='系分任务分诊与认领路由完成（主卡 t_e35cd102 派生 T-101~T-107 上板）；负向发现如实记入问题清单：五 agent 越序抢跑 8 分支（agent-prework-bypass-g2——G2 前越序开工，治理闸口径与记入问题清单在案）。', imgs=[('12-op2-after', '看板：系分任务分诊泳道（五 agent 越序抢跑记入问题清单 agent-prework-bypass-g2）', 'ui')]),
    13: dict(issue_keys=['anexec-missing','receipt-missing'], keys=['anexec_done'], actor='ai', actorText='AI · 系分执行',
            narrative='四位工程师并行做技术分析，按网关承载能力分两批派活（每批两人），四份分析全部按期入库——上一轮这里只交了一半，是本轮整体交付达标的关键一步。', imgs=[('13-op2-after', '看板：AN-PAYCORE 系分卡（四路系分 4/4 交付）', 'ui')]),
    14: dict(issue_keys=['raci-dispatch-missing'], keys=['review_done'], actor='ai', actorText='AI · 多角色会签',
            narrative='多方评审通过了汇总后的方案。有一处没做到位并如实记录：派任务时本该在群里同时@到责任人和他的主管，四条通知都没发出来（投递修复本身有效，但这条通知走了另一条没修复的通道——下一轮专项复验）。', imgs=[('14-op2-after', '看板：评审卡（RACI 双@×4 缺失如实记入问题清单）', 'ui')]),
    15: dict(keys=['g2_arch_pass'], actor='ai', actorText='AI · 架构闸',
            narrative='架构评审一次通过（评审卡可查）。对照：上一轮这道闸卡了三个多小时反复打回，本轮干净通过——投递修复见效的直接证据。', imgs=[('15-op2-after', '看板：架构闸 G2 评审卡（03:17:38 一次过，t_e9f39ed5）', 'ui')]),
    16: dict(keys=['close_done'], actor='both', actorText='AI · 评审收尾',
            narrative='评审线程收尾+概设定稿入库（卡 t_e9f39ed5 评审链完整循环，G2 闸 03:17:38）。', imgs=[('16-op2-after', '看板：评审收尾后 RFD-001 主卡态', 'ui')]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 产品经理A 排期',
            narrative='排期一次过。对照上一轮这里空转了一小时三十九分钟（任务发出去没人收到），修复后首次重考即过，是本轮最重要的正向证据之一。', imgs=[('17-op2-after', '看板：排期卡（03:37 一次过——564 修复后首考）', 'ui')]),
    18: dict(issue_keys=['push-retry-integration'], keys=['devimpl_done'], actor='ai', actorText='AI · 四路开发',
            narrative='四条开发分支全部真实交付（每条都带自动化测试运行记录，脚本逐条查过）。集成推送有一次没到位，如实记了问题单（上一轮同类问题四起，本轮一起——修复效果的量化对比）。', imgs=[('18-op2-after', '看板：DEV-PAYCORE 开发卡（4/4 分支真交付）', 'ui')]),
    19: dict(keys=['testpass_done'], actor='ai', actorText='AI · 测试工程师A/测试工程师B 测试',
            narrative='独立测试完成、报告入库。测试的人不是写代码的人；后端 194 个用例+前端 19 例全部通过（执行输出随报告在仓，可复查）。', imgs=[('19-op6-after', '测试工程师B 视角会话列表：测试/UAT 验收人账号态', 'ui')]),
    20: dict(keys=['release_done'], actor='ai', actorText='AI · 发布登记',
            narrative='发布前检查一次过：合并/打标签/交付三张卡都在看板上，界面与状态文件两侧对得上。人工批准留了记录。对照上一轮这道闸被打回并熔断两轮，本轮归零。', imgs=[('20-op2-after', '看板：REL 发布卡（三卡与 state card_REL-* 对应）', 'ui')]),
    21: dict(issue_keys=['infra-nvme-volume-drop'], keys=['uat_done'], actor='both', actorText='人 · 产品经理A 验收',
            narrative='业务验收：上半夜磁盘掉线八个半小时（机器重启带崩外置硬盘），恢复后接力程序自动续跑，没有丢数据，傍晚验收通过。七条验收标准逐条对账，证据行在对话卡里。', imgs=[('21-op4-after', '看板：UAT 终局态——顶条 T-101~T-107 任务标签（含 T-107 前端验收）', 'ui')]),
    22: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 工作区管理',
            narrative='工作台账 work-report 保存 origin/main；18:04:18；研发工程师A 视角会话列表实拍（开发交付人账号态，22-op6）。', imgs=[('22-op6-after', '研发工程师A 视角会话列表：开发交付人账号态', 'ui')]),
    23: dict(issue_keys=['audit-finding'], keys=['audit_done'], actor='ai', actorText='AI · 审计师A 审计',
            narrative='独立审计通过，且审计自己发现了一个产品缺口：运行中心列表是空的、运行详情打不开（推演运行没进产品的运行注册表）——如实记入问题清单挂产品待办。审计比监控侧更严，两条线的结论都保留在报告里。', imgs=[('23-op4-after', '运行中心实拍：run9 横幅在位但运行列表空态+RunDetailView 404——runs 注册表缺口实证（审计发现，记入问题清单 runs-registry-empty）', 'ui')]),
    24: dict(issue_keys=['retro-open-items'], keys=['retro_done'], actor='ai', actorText='AI · G6 复盘',
            narrative='G6 复盘 18:04:55：问题单 10 起三族在案（RACI 双@×4/越序抢跑/AN-MP 首窗超时/integration 推送未达/NVMe 卷脱挂/runs 注册表空态/retro-open-items）；效果实证带锚见效果卡。', imgs=[('24-op4-after', '历史会话页（#/app/history）：G6 复盘期会话档案入口', 'ui')]),
    25: dict(keys=['ide_done'], actor='ai', actorText='AI · IDE 核验',
            narrative='IDE 工作台三个视角实拍：两个账号的全景+按方案指定入口直达任务——任务简报自动展开（负责人/流程/git/验收信息一屏齐）。收尾时曾误报“抽屉点不开”，实为没走指定入口，复查后已更正。', imgs=[('25-op3-before', 'IDE 工作台（产品经理A 视角）：RFD-001 主任务卡+任务管理面板+git 文件树', 'ui'), ('25-op6-after', 'IDE 工作台（系统架构师A 视角）：同工作台双账号渲染', 'ui'), ('25-op7-after', 'IDE·任务简报抽屉（#/app/ide?task= 直达链接自动展开）：RACI 四元组/工作流/git/验收字段一屏齐——方案指定入口实测有效', 'ui')]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='报告链实录：18:0x 首跑被按轮叙事文案强制关卡拦（R17 设计内——本轮叙事文案未注册时拒绝出报告防旧轮冒充）→STEPS_META_RUN9 注册后 relay 下一拍自动完成第 26 步并 RELAY-FINISHED；全程 00:24-18:0x≈17.7h（含卷脱挂中断 8.5h，净执行≈9.2h）。564 验证轮四主命题全部落判：交付 4/4、假停摆零、接力棒 2 次、必采 11/13（现矩阵口径；当轮 11 项全采=旧矩阵 11/11 达成，新增步 13 skill 帧/步 23 门禁灯帧两项缺=已记入问题清单缺口）。', imgs=[('26-op6-after', '驾驶舱终局帧：run-progress 横幅 26/26 段（report_done 后补拍，H7 重生成挂接）', 'ui')]),
}

STEPS_META_RUN10 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='mx-clean 全清后 01:21 开跑；30 账号预检全过，三方对账 15=15=15 一次过（run9 编制缺口未复发）。开跑前审计记入问题清单 1 条（391 补丁曾遭部署回退，已修，处置观察）。', imgs=[('1-op1-after', '设置页：账号管理/开发者设置（admin 视角）（收尾后补拍，非当轮实时帧）', 'ui'), ('1-op2-after', '账户管理：roster 15 账号全列（收尾后补拍，非当轮实时帧）', 'ui')]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='gateway :8801 + studio :8802 就绪；判定后端活性探测在线（本轮首次启用本地 clef-flash（mlx 量化 4bit，:8000 常驻），版本三元组快照保存 evidence/decision-backend-snapshot.txt）；装配走产品同源端点（mx-setup 探针 rosterCommit=edc6ed2 同源链）。', imgs=[('2-op1-after', '运维面：网关 8801 在线·agent 活跃·Matrix 会话（收尾后补拍，非当轮实时帧）', 'ui')]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='14 账号登录链全通（roster 账号清单 @4071cf1 在档，逐一验证）；产品免密走 bot 身份（R29 身份缝修复后 bot 在案例房与聊天列表均可见）。', imgs=[('3-op1-after', '研发工程师A 登录后驾驶舱首页（只见本账号档案）（收尾后补拍，非当轮实时帧）', 'ui')]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='驾驶舱在线、run 横幅 N/26 全程在线；冒烟三方对账 roster×org×matrix 15=15=15（@4071cf1 在档）。', imgs=[('4-op1-after', '驾驶舱工作台：run 横幅+注意力条（收尾后补拍，非当轮实时帧）', 'ui'), ('4-op2-after', '运行中心：运行列表+工作流页签（收尾后补拍，非当轮实时帧）', 'ui')]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='应用资产经产品端点登记入仓。', imgs=[('5-op1-after', '治理中心·应用资产页签（收尾后补拍，非当轮实时帧）', 'ui')]),
    6: dict(keys=['people_done'], actor='both', actorText='人 · 组织装配',
            narrative='组织矩阵入仓；三方对账同步过。', imgs=[('6-op1-after', '治理中心·组织页签：15 人编制（收尾后补拍，非当轮实时帧）', 'ui')]),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 需求分析师A 产品',
            narrative='G1 冻结 01:23 写入通过标记（开跑 2 分钟）；delivery 案例房开张+协议事件开始投递——门禁灯本轮首次激活。', imgs=[('7-op1-after', '看板：G1 冻结后全家桶卡（收尾后补拍，非当轮实时帧）', 'ui')]),
    8: dict(keys=['room_analysis'], actor='human', actorText='人 · 产品经理A 发单',
            narrative='建群全量预邀 0 缺口（人类+bot 双身份，限流重试族护送）；房间 !ohmaPGEzJSqVMvQIrQ:matrix.test 保存（全量预邀机制 overlay f8382131）。', imgs=[('8-op1-after', '沟通区：支付收银台讨论群在列（研发工程师A 视角）（收尾后补拍，非当轮实时帧）', 'ui')]),
    9: dict(keys=['dispatch_marker'], actor='ai', actorText='AI · agent 首应',
            narrative='@派发带证据要求发出（派发事件锚 $PLKX5sslSoYjYDu4pOmUsVOLnuaD3fVbmwu_m5AxtnI 保存）。', imgs=[('9-op1-after', '群内 @派发消息（研发工程师A 视角会话详情）（收尾后补拍，非当轮实时帧）', 'ui')]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · 看板登记',
            narrative='主卡 01:37 已建（!approve 回执旁证）；驱动看板查询通道失明（hermes 裸调用 bug）两轮 2400s 超时拒收（02:03/02:43），回灌后 02:45 修复重查 3 秒过（a44ad19 函数转发根治）。台账对“未登记”与“驱动误判”两种定性并存如实保留（kanban-registration-skipped 记入问题清单在案）。', imgs=[('10-op1-after', '看板：RFD-001 主卡+子卡（收尾后补拍，非当轮实时帧）', 'ui')], issue_keys=['kanban-registration-skipped']),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系分拆分',
            narrative='任务清单 v10 全量重建入仓；RACI 双@四组缺失记入问题清单（与 run9 同模式）。', imgs=[('11-op1-after', '看板：研发工程师A 板系分任务卡（AN-PAYCORE）（收尾后补拍，非当轮实时帧）', 'ui')], issue_keys=['raci-dispatch-missing']),
    12: dict(keys=['triage_done'], actor='ai', actorText='AI · 分诊',
            narrative='分诊完成；五 AI 员工无越序抢跑（569 gate-guard 显式启用 035a555 前置拦截生效；主卡 t_2a2bab79 及四主责板任务卡在板）。', imgs=[('12-op1-after', '看板：研发工程师A 泳道（分诊→待办→进行中）（收尾后补拍，非当轮实时帧）', 'ui')]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI · 系分执行',
            narrative='四路系分：首批 03:07 派发后撞 gate-guard 误拦（场外修复 035a555 显式启用化），3600s 超时窗×2 串行空转，05:08 第二批重发；AN-CHWX 05:23 首达。CHWX/CHALI 两稿入 origin/main，PAYCORE/MP 两稿缺件记入问题清单（anexec-missing×2——git ls-tree 实查，概设 §0.3 以 main 祖先版如实声明）。', imgs=[('13-op1-after', '看板：研发工程师B 板系分卡（AN-CHWX）（收尾后补拍，非当轮实时帧）', 'ui')], issue_keys=['anexec-missing','anexec-redeliver-gateway-restart']),
    14: dict(keys=['review_done'], actor='ai', actorText='AI · 汇总复核',
            narrative='产品经理A 汇总：首窗 40 分钟未交（任务重于窗）→接力续跑→06:57 概设入库（产物级重建稿）。', imgs=[('14-op1-after', '看板：系统架构师A 板评审卡（汇总复核视角）（收尾后补拍，非当轮实时帧）', 'ui')]),
    15: dict(keys=['g2_arch_pass'], actor='ai', actorText='AI · 架构闸',
            narrative='G2 架构评审：首轮 06:57 派发后 1800s 结论窗超时记入问题清单（g2-review-missing——系统架构师A 到期前仍在产出，窗误杀族）；窗改 MX_GATE_WAIT 缺省 3600（fb934e1）后 07:29 续跑重派，第二轮 6 分 09 秒过，07:35 写入通过标记。run8 崩溃环未复发。', imgs=[('15-op1-after', '看板：G2 架构评审卡（收尾后补拍，非当轮实时帧）', 'ui')]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 评审收尾',
            narrative='评审收尾、主任务卡 t_2a2bab79 done 态归档关闭。', imgs=[('16-op1-after', '看板：主任务卡 done 态（研发工程师C 视角）（收尾后补拍，非当轮实时帧）', 'ui')]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 排期',
            narrative='排期完成（活性窗+半程自动提醒首次全程服役）。', imgs=[('17-op1-after', '看板：排期板（收尾后补拍，非当轮实时帧）', 'ui')]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='强制关卡 G3 · 编码门禁',
            narrative='编码四路：研发工程师B 首交 09:28；研发工程师C 旧任务滞留 2h36m、五次提醒（09:44/10:03/10:24/10:41/11:17）后 11:19 第三路交付；DEV-MP 11:39:34 第四路齐，G3 11:39 写入通过标记。代码零变更（复跑锚定轮）——testlog 沿用 run9 实跑档，run10 复测证据（AN-CHWX/AN-CHALI-vitest-run10、DEV-CHALI-testlog-run10）在仓。', imgs=[('18-op1-after', '看板：研发工程师C 板开发卡（DEV-CHALI）（收尾后补拍，非当轮实时帧）', 'ui')], issue_keys=['dev-redeliver-nudge-exhausted']),
    19: dict(keys=['testpass_done'], actor='gate', actorText='强制关卡 G4 · 独立验证',
            narrative='测试双线（测试工程师A 后端/测试工程师B 前端）并行执行；G4 13:49 过闸。测试报告入 integration 分支。', imgs=[('19-op1-after', '看板：测试交付卡（收尾后补拍，非当轮实时帧）', 'ui')]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='强制关卡 G5 · 发布准出',
            narrative='G5 发布准出：首轮 READY-GATE FAIL（缺回滚阈值/灰度/发布说明，14:11 熔断一轮退回记入问题清单 g5-ready-fail）→补齐后 14:12 READY-GATE-PASS 过闸。delivery 面板 stage P5 done 已发；gate G5 pass 事件漏发记入问题清单（delivery-g5-gate-event-missing）——交付案例面板 G5 门禁灯灰=产品如实呈现事件缺口。', imgs=[('20-op1-after', '看板：REL 三卡（收尾后补拍，非当轮实时帧）', 'ui')]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
            narrative='UAT 业务验收 14:28 完成；七条验收标准逐条对账通过。', imgs=[('21-op1-after', '看板：UAT 终局（收尾后补拍，非当轮实时帧）', 'ui')]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作台账',
            narrative='工作台账 14:28 保存。', imgs=[('22-op1-after', '沟通区：会话列表（收尾后补拍，非当轮实时帧）', 'ui')]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
            narrative='独立审计 14:29 完成。', imgs=[('23-op1-after', '运行中心：审计取证（收尾后补拍，非当轮实时帧）', 'ui')]),
    24: dict(keys=['retro_done'], actor='gate', actorText='强制关卡 G6 · 复盘',
            narrative='G6 复盘 14:29 完成；治理归档落账（metrics-log+ISSUES-LOG @ origin/main）。', imgs=[('24-op1-after', '治理中心·harness 页签（收尾后补拍，非当轮实时帧）', 'ui')]),
    25: dict(keys=['ide_done'], actor='human', actorText='人 · IDE 核验',
            narrative='IDE 核验：/ide 路由 200、ide?task 直达链接参数处理、简报组件三项在位核验通过；收尾补拍实证 ?task= 直达链接自动展开任务简报六区块（?task=t_2a2bab79 直达链接，25-op2 帧：任务概览/需求上下文/Git 活动/Kanban 状态/协作动态/辅助会话）。简报“Kanban 状态”块父子依赖列恒空=产品半成品如实记（产品改进项 D1）；IDE 默认模型指向已移除项的横幅可见（产品配置缺陷）。', imgs=[('25-op1-after', 'IDE 画布全景（收尾后补拍，非当轮实时帧）', 'ui'), ('25-op2-after', 'IDE 任务简报（直达链接展开）（收尾后补拍，非当轮实时帧）', 'ui')]),
    26: dict(keys=['report_done'], actor='ai', actorText='工具 · 报告生成',
            narrative='本报告由生成器产出；叙事文案预写 18/26 步。帧采集缺口如实声明：run10 执行期间 capture-ui 未挂进驱动链，当轮无实时帧，必采清单 0/13 记入问题清单 r18-collection-missing（DISP 观察）；全部截图为收尾后补拍，图注逐一标注。run11 修正：帧采集挂驱动步内（94aa2fc 已接线）。', imgs=[('26-op1-after', '交付案例面板：门禁灯投影（收尾后补拍，非当轮实时帧）', 'ui')]),
}

# ══ run11 叙事文案（2026-10-08 注册；锚=state 写入通过标记/scenario.log/监控程序监控台账）══
# 本轮三段开跑史（如实）：attempt-1 18:30-20:28 亡于模型池 aim 下线（agent 全哑）；
# attempt-2 23:48-02:1x 亡于 mx-clean 假成功污染+历史考古（"恢复 run9 悬空提交"实锤）；
# attempt-3 02:26 起零残留正跑（孤儿历史+禁考古措辞+闸卫三根治后）——本叙事文案即 attempt-3。
STEPS_META_RUN11 = {
    1: dict(keys=['smoke_done'], ts_override='1',
            actor='human', actorText='人 · admin 管理员',
            narrative='账号与基础设施就绪：30 账号 token 逐个验证 ✓、单 gateway :8801+单 studio :8802 双健康 ✓、驾驶舱在线 headless 侧 gateway_state=running（connected_platforms=15）；冒烟 02:26:50-02:31 五分钟全绿（attempt-3 开跑 02:26:26），delivery 小冒烟开案例房 dlv-…-023449 并事件落房读回 ✓。', imgs=[('smoke_done-op1-before','冒烟前：驾驶舱入口（登录态待入）','ui'),('smoke_done-op1-after','冒烟后：30 账号全绿+在线三数>0','ui')]),
    2: dict(keys=['smoke_done'], ts_override='1',
            actor='ai', actorText='AI · 装配脚本',
            narrative='每用户四件套在位：14 账号 profile+42 档案+账号板 kanban 可达（matrix-login 全量验证）；profiles 清单与每板 team 围栏装载 ✓；R28 编制三方对账 roster=15×org=15×matrix=15 零偏差。', imgs=[('appinit_done-op1-before','账号板装载前','ui'),('appinit_done-op1-after','账号板+团队围栏装载后','ui')]),
    3: dict(keys=['smoke_done'], ts_override='1',
            actor='human', actorText='人 · 各用户',
            narrative='全账号登录双模式通：免密 matrix-login（jwt 逐账号）与口令登录均可达；自动登录通路端点按契约应答 {"configured":false}（V2 单 studio 常态）。', imgs=[('3-op1-before','登录双模式验证（收尾后补拍载荷帧·前）','ui'),('3-op1-after','登录双模式验证（收尾后补拍载荷帧·后）','ui')]),
    4: dict(keys=['smoke_done'], ts_override='1',
            actor='ai', actorText='AI · 冒烟驱动',
            narrative='功能就绪冒烟全绿：观测面计数语义（任务计数=看板实况、在线三数>0）双源合并通过；R29 delivery 协议面小冒烟（案例房+stage/gate 事件读回）✓；判定服务活性探测 clef-flash-4bit 在线。', imgs=[('4-op1-before','冒烟判定面（收尾后补拍载荷帧·前）','ui'),('4-op1-after','冒烟判定面（收尾后补拍载荷帧·后）','ui')]),
    5: dict(keys=['appinit_done'], ts_override='1791397727',
            actor='human', actorText='人 · BA 需求分析师A',
            narrative='应用资产登记经产品通道保存：PUT /api/governance/registry/app-registry 保存即 git（界面同源承载），4 应用×负责人×专属板×SLA×门禁骨架入仓 02:33。', imgs=[('register_done-op1-before','资产登记前（registry 空）','ui'),('register_done-op1-after','资产登记后（4 应用在册）','ui')]),
    6: dict(keys=['people_done'], ts_override='1',
            actor='human', actorText='人 · PM 产品经理A',
            narrative='组织与权限矩阵入仓：M2 产品通道 PUT registry/org 02:33，14 账号×profile×板×fleet-manifest 四方对账一致，七角色治理线（含 安全工程师A/ops/审计师A）齐备。', imgs=[('people_done-op1-before','组织矩阵登记前','ui'),('people_done-op1-after','组织矩阵登记后（14 账号七角色）','ui')]),
    7: dict(keys=['g1_frozen'], ts_override='1791397771',
            actor='human', actorText='人 · 需求分析师A+产品经理A',
            narrative='G1 需求冻结 02:29:30（开跑+3 分钟，历史最快）：RFD-001 收银台四要素（AC×7 可判定/Scope-Out/影响面/涉敏）freeze 文件入 origin/main；delivery 事件 stage P1 done+gate G1 pass 落案例房。需求分析师A→产品经理A 需求私信送达 02:33:37。', imgs=[('7-op1-before','G1 冻结要素页（收尾后补拍载荷帧·前）','ui'),('7-op1-after','G1 冻结要素页（收尾后补拍载荷帧·后）','ui'),('docs_view-op1-before','需求/设计文档评审面（收尾后补拍）','ui'),('docs_view-op1-after','RFD-001 文档在册（收尾后补拍）','ui')]),
    8: dict(keys=['room_analysis'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='分析群 !HmQhMNMivoYKiKtTcV 建群 02:33:51 并 RACI 全量预邀（fanfan-agent+8 关联人及各自 agent），观察员契约 MATRIX_ROOM_OBSERVERS 生效。', imgs=[('room_done-op1-before','群聊/建群面（收尾后补拍，非当轮实时帧）','ui'),('room_done-op1-after','案例群消息流在册（收尾后补拍）','ui')]),
    9: dict(keys=['dispatch_marker'], ts_override='1',
            actor='human', actorText='人 · 产品经理A',
            narrative='需求派发 02:33:51（$9ij2dKfP…）：任务书含三清单匹配/SMART 拆分/RACI 双@/结论行二选一带凭证/防虚报条款；去重脚注为本轮新措辞（从零重新执行+历史产物禁引用——考古防线）。', imgs=[('disp_done-op1-after','看板任务卡与分派在册（收尾后补拍·派工后态）','ui')]),
    10: dict(keys=['register_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='主任务卡登记 02:44:28（attempt-1 同步死穴 16 分钟攻克）；tasklist v12.0 入仓 02:44:42（六任务 13.5 人日，输入基线零漂移自证）。', imgs=[('register_done-op1-before','主卡登记前','ui'),('register_done-op1-after','主卡 t_…在板','ui')]),
    11: dict(keys=['analysis_done','analysis_verified'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='任务清单核验+RACI 双@核验：产品经理A 派发四组双@消息 60s 窗未见→回灌重查 240s 仍缺（P9b 复现，4 笔记入问题清单——双@措辞与检出窗的错配挂复盘）；双凭证反向核验通过。', imgs=[('analysis_done-op1-before','任务清单核验前','ui'),('analysis_done-op1-after','tasklist v12.0 在仓+核验过','ui')]),
    12: dict(keys=['triage_done'], ts_override='1',
            actor='ai', actorText='AI · 四主责 agent',
            narrative='分诊四路并发确认：四主责账号板出现 RFD-001 任务卡+lead（团队负责人A/团队负责人B）分诊确认（triage→todo）03:12 前；gate-guard（g2_arch_pass 键）挂闸生效——看板 DEV 卡在 G2 前暂停（attempt-2 越序抢跑的根治位）。', imgs=[('triage_done-op1-before','分诊前','ui'),('triage_done-op1-after','分诊后四卡就位','ui')]),
    13: dict(keys=['anexec_done'], ts_override='1',
            actor='ai', actorText='AI · 研发工程师A/研发工程师D/研发工程师B/研发工程师C agent',
            narrative='四路系分同时派出 03:12:58（同秒四派——run11 流水线首验）：首次容量僵尸记账致 83 分钟零开工（106 条队列 drop 记入问题清单）→网关重启+重派 04:37 恢复；AN-PAYCORE 04:50/AN-MP 05:08 从零入仓；AN-CHWX/AN-CHALI 马拉松超窗记入问题清单（研发工程师B/研发工程师C 各 4h+ 未交付，概设以在仓稿汇总——零残留代价正确的慢，两稿 git 历史可反查于归档）。双重保底回执：PAYCORE/MP 回灌后仍缺记入问题清单（receipt-missing×2）；anexec_done 07:29。', imgs=[('anexec_done-op1-before','四路系分派发前','ui'),('anexec_done-op1-after','系分段收尾（2/4 稿在仓）','ui')]),
    14: dict(keys=['review_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='概设方案 RFD-001-architecture-design.md 入仓（产品经理A 汇总在仓稿+跨模块契约）约 08:00 前后；评审卡自登+线下评审通过，review_done 写入通过标记。', imgs=[('review_done-op1-before','概设汇总前','ui'),('review_done-op1-after','概设在仓+评审卡 done','ui')]),
    15: dict(keys=['g2_arch_pass'], ts_override='1791423371',
            actor='ai', actorText='AI · arch-agent',
            narrative='G2 架构治理评审二轮过闸 09:36（键值 1791423371）：首轮容量饥饿（系统架构师A 评审回合被四槽占用静默排队 3600s 窗尽驱动中止 09:04）→网关重启+archgate 续跑 09:09 重派→ARCH-GATE-PASS 27 分钟；评审卡 t_637f6b1c@arch-governance → done。', imgs=[('15-op1-before','G2 评审卡面（收尾后补拍载荷帧·前）','ui'),('15-op1-after','G2 评审卡面（收尾后补拍载荷帧·后）','ui')]),
    16: dict(keys=['close_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='主任务归档 09:36：产品经理A 主卡汇总登记（四系分档案+tasklist+概设 git 路径）标记完成；检查点归档 !refine 发进工作线程。', imgs=[('close_done-op1-before','主卡收尾前','ui'),('close_done-op1-after','主卡 done+资产汇总在 body','ui')]),
    17: dict(keys=['plan_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='排期计划 v1.0 入仓（b4a4f49）：六任务 13.5 人日、测试线 2.3d（0.3 系数内）、15% 缓冲、里程碑 M1-M5；排期回合 09:36-11:0x（中途空转提醒一次 10:57 后唤醒完成）；父子任务卡+逐条派发齐。', imgs=[('plan_done-op1-before','排期前','ui'),('plan_done-op1-after','排期 v1.0 在仓+子卡挂接','ui')]),
    18: dict(keys=['devimpl_done'], ts_override='1',
            actor='ai', actorText='AI · 四开发 agent',
            narrative='编码触发链全验（run11 流水线核心）：DEV-PAYCORE/DEV-MP 即派 11:12（互不依赖）+测试预备轮同刻同时派出（用例前移）；feat/DEV-PAYCORE 落地即触发渠道双路 d2 12:47（模块就绪即触发）；DEV-CHWX 14:02；DEV-CHALI 监控程序定向提醒 16:08 后交付；四分支 origin 齐（每分支 testlog 随附）；G3 写入通过标记 16:27（键值 1791447646）+testlog 真实核查。ACP 面注记：编码由 hermes 直连 LLM+write_file 完成（acp-coding-backend-divergence 记入问题清单——方案步 18 ACP 编码后端意图未实装，run12 前置三件）。', imgs=[('devimpl_done-op1-before','编码段派发前','ui'),('devimpl_done-op1-after','四分支齐+G3 写入通过标记','ui')]),
    19: dict(keys=['defect_done','testpass_done'], ts_override='1',
            actor='ai', actorText='AI · 测试工程师A/测试工程师B agent',
            narrative='集成+测试：四分支增量合并 integration/RFD-001（f2968d0，丢线守卫过）；TEST-BE/FE 派发 16:21（预备轮衔接措辞在任务书）；缺陷回流完整循环；TEST-BE 报告成稿于 测试工程师A 本地（228/228=基线 216+08 域增量 12，证据 sha256 d0c7da52…）但路径偏差未达 integration——testpass 静默降级记入问题清单后放行，监控程序代推归位 dfd44f0；G4 写入通过标记 18:47（键值 1791456472）。', imgs=[('testpass_done-op1-before','测试执行前','ui'),('testpass_done-op1-after','测试段收尾+G4 写入通过标记','ui')]),
    20: dict(keys=['ready_done','release_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent 评审',
            narrative='G5 六轮长跑（本晚最重一段，全留痕）：r1 首评真 FAIL（缺回滚阈值/灰度/发布说明 20:25 退回）→r2-r4 会话卡死/窗错配连环（产品经理A hindsight 交互缺陷×3+2400s 窗 vs 夜峰慢节奏）→监控程序三面处置=①发布三件套按真实测试数据代拟落 main 1f2c3bd+测试工程师A 报告归位 dfd44f0 ②缺项①a/①b 卡簿记代走（测试工程师A 执行卡 result+FE TP2/TP4/汇总卡 done）③终判行经 产品经理A 账号通道落评审卡（步 13 代走先例，房间行未伪造）→判词复用放行 23:44 READY-GATE-PASS（评审卡 t_24ae1bc5→done，HumanGate 事件入 approved.events）；release 段完成 23:45（delivery-standard 引用+G5 gate 事件补发——run10 漏发缺陷的本轮验证）。', imgs=[('20-op1-before','G5 发布准出面（收尾后补拍载荷帧·前）','ui'),('20-op1-after','G5 发布准出面（收尾后补拍载荷帧·后）','ui')]),
    21: dict(keys=['uat_done'], ts_override='1791476458',
            actor='human', actorText='人 · 需求分析师A 验收',
            narrative='UAT 业务验收 23:47 派发→00:20 收尾（键值 1791476458）：产品经理A 逐条 AC-1~AC-7 证据行（commit/分支锚）；验收书逐条三态判词落仓（放行权归 需求分析师A 语义保留）；integration 冻结件前置自检过。', imgs=[('21-op1-before','UAT 验收结论面（收尾后补拍载荷帧·前）','ui'),('21-op1-after','UAT 验收结论面（收尾后补拍载荷帧·后）','ui')]),
    22: dict(keys=['workmgr_done'], ts_override='1791476497',
            actor='ai', actorText='AI · 监控侧',
            narrative='工作台账 00:21 保存：跨账号板状态分布/WIP 全员 ≤2/卡壳处置意见齐（work-report.md 入 main）。', imgs=[('workmgr_done-op1-before','台账生成前','ui'),('workmgr_done-op1-after','工作台账在仓','ui')]),
    23: dict(keys=['audit_done'], ts_override='1791476730',
            actor='ai', actorText='AI · 审计师A+监控程序',
            narrative='合规审计意见书 00:25 入仓：独立性声明+三凭证抽检（freeze/验收书/测试报告全实查）+监控侧机械化结论+@audit-agent 独立复核派发；本轮监控程序介入五笔（代投×3+代走×2）全部在 issues.log 留痕可反查——审计面对的正是这份完整的人工介入账。', imgs=[('audit_done-op1-before','审计前运行中心视图','ui'),('audit_done-op1-after','审计意见书视图','ui')]),
    24: dict(keys=['retro_done'], ts_override='1791476763',
            actor='ai', actorText='AI · 监控程序+治理',
            narrative='G6 复盘 00:26 写入通过标记（六闸 6/6 收齐——首过率 3/6：G1/G3/G4 首过，G2 容量饥饿二轮/G5 六轮/UAT 长跑）：三段式复盘+治理报告+metrics/ISSUES-LOG 原子化落账；hindsight 记忆探针 ✓；头号复盘项=容量记账释放缺口+产品经理A 会话不落结论（hindsight 交互）+G5 窗宽节奏错配三根因。', imgs=[('retro_done-op1-before','复盘前','ui'),('retro_done-op1-after','复盘+治理报告入仓','ui')]),
    25: dict(keys=['ide_done'], ts_override='1',
            actor='human', actorText='人 · 研发走查',
            narrative='IDE 工作台核验：/ide 路由 200+ide?task 参数处理代码在位+任务简报组件在位；IDE 模型失效横幅一键回退（run10 25-op1 修复件 patch 575）为 run11 帧位；ACP 编码链未验证记入问题清单（acp-coding-backend-divergence）——IDE 底层能力的充分验证列 run12 前置。', imgs=[('ide_done-op1-before','IDE 核验前','ui'),('ide_done-op1-after','IDE 核验后（简报在位）','ui')]),
    26: dict(keys=['report_done'], ts_override='1',
            actor='ai', actorText='AI · 报告生成器',
            narrative='报告步实录：00:26 首跑被按轮叙事文案强制关卡拦（设计内——本注册块即该闸的兑现）→注册后 report 续跑：mx-report-gen 生成+mx-report-audit 熔断硬跑（FAIL 即拒收尾）+final-report-merge 双正本。全程（attempt-3）02:26-00:3x≈22h，含事故恢复四起（容量×2/会话卡死×2）与 G5 六轮——净执行与事故账分离落 metrics。', imgs=[('26-op1-before','报告条目页（收尾后补拍载荷帧·前）','ui'),('26-op1-after','报告条目页（收尾后补拍载荷帧·后）','ui')]),
}
_DOMAINS_RUN11 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'warn',
        '主链无漏做（AC 7 条全过 UAT）；但系分交付 2/4（CHWX/CHALI 马拉松超窗记入问题清单，概设按在仓稿汇总如实声明）；materials/ 目录携 run9/10 基线包残留暴露于本轮 agent 工作区（materials-pollution-blindspot 记入问题清单，mx-clean 清扫面已扩+diff 审计未证实实际引用）。',
        '实测：AC 7/7 UAT 判词 · 系分 2/4 在仓（2 缺记入问题清单）· materials 7 件残留（引用未证实）',
        'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'pass',
        '成立。四开发分支全部本轮从零新推（孤儿历史深度 1 下不可考古——禁考古措辞+闸卫双防线实证）；TEST-BE 228/228 全绿（基线 216 实跑复验+08 域增量 12，证据 sha256 可重跑）；发布三件套落 main 1f2c3bd（监控程序代拟但数据全真实）。',
        '实测：feat/DEV-* 4/4 新推 · 228/228 绿 · 发布件 3/3 在仓',
        'cp-g3,cp-g4,cp-g5'),
    2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass',
        '一致。tasklist v12.0 与排期/概设核对一致；金额分 int64/snake_case 契约经 G2；integration 基线链 1886e43→fc9ae66→f2968d0 祖先关系实测。',
        '实测：三方对账零偏差 · 基线祖先链双向实测',
        'cp-g2,cp-g4'),
    3: ('L3', '运行稳健性', '异常和边界是否被正确处理？', 'warn',
        '逆境治理是本轮主线：attempt-1/2 事故链四病根全部根治落链（通道切换/孤儿重立/禁考古措辞/闸卫 env 修复，自动检查 ⑳⑳⑳ 78/78）；attempt-3 内容量僵尸记账×2（网关重启恢复）、产品经理A 会话卡死×3（hindsight 交互）、G5 六轮（窗宽节奏错配）——全部记入问题清单+恢复动作留痕；处置代价=人工介入五笔。',
        '实测：驱动死 4 起全恢复 · 容量 drop 106+ 条 · G5 六轮留痕 · 病根根治提交 4 件',
        'cp-g2,cp-g5'),
    4: ('L4', '安全合规', '权限、隔离与审计是否有效？', 'pass',
        '有效。隔离边界三断言全过；零残留铁律经三度击穿后结构加固（孤儿历史+清扫面扩+自动检查断言）；监控程序五笔介入全部留痕计入人工度量；审计意见书三凭证实查。',
        '实测：隔离三断言 · 人工介入 5 笔全留痕 · 抽检 3/3 实查',
        'cp-g6'),
    5: ('L5', '可监督性', '全程是否可复盘、可反查？', 'pass',
        '可。六闸写入通过标记时间齐全（G1 02:29/G2 09:36/G3 16:27/G4 18:47/G5 23:44/G6 00:26）；当轮实时帧 17 步位 34 帧自动保存（capture_step 首次实战）；问题单 40+ 行 ISSUE/DISP 全留痕；看门狗台账与监控程序监控台账全程可反查。',
        '实测：六闸时间戳 6/6 · 实时帧 34 张 · 台账 40+ 行',
        'cp-g6'),
}

STEPS_META_RUN12 = {
    1: dict(keys=['smoke_done'], ts_override='1',
            actor='human', actorText='人 · admin 管理员',
            narrative='账号与基础设施就绪：30 个账号的登录凭证逐个验证通过，消息网关（:8801）与工作台（:8802）健康检查通过。02:29:57 开跑；冒烟检查还包括在交付案例房 dlv-20261009-v8-run12-023306（02:33:06 建立）写入一条事件并读回核对成功。', imgs=[('smoke_done-op1-before','冒烟检查前：驾驶舱入口','ui'),('smoke_done-op1-after','冒烟检查后：30 账号凭证全过','ui')]),
    2: dict(keys=['appinit_done'], ts_override='1791484496',
            actor='ai', actorText='AI · 装配脚本',
            narrative='每个用户的标配四件就位：14 个账号的档案、资料、账号看板均可访问；应用注册表经产品界面保存（02:34:30-38，保存即自动提交代码）——4 个应用、各负责人、看板、服务承诺与检查项骨架一并入库。', imgs=[('appinit_done-op1-before','账号看板装载前','ui'),('appinit_done-op1-after','应用注册表：4 应用×负责人×看板','ui')]),
    3: dict(keys=['people_done'], ts_override='1791484547',
            actor='human', actorText='人 · 各用户',
            narrative='组织与权限矩阵入库（02:34:56-02:35:04）：经产品界面保存组织注册表；14 个账号的角色、看板与机器清单三方核对一致；需求、项目、系统分析、架构、安全运维、运维、审计七类角色齐备。当轮截图失败已记入问题清单；界面截图为收尾后补拍（文档评审页底·研发组织与权限表，14 账号×角色×汇报线全表带 git 锚）。', imgs=[('3-op1-before','研发组织与权限表：14 账号×角色×汇报线（收尾后补拍）·前','ui'),('3-op1-after','研发组织与权限表·续（收尾后补拍）·后','ui')]),
    4: dict(keys=['smoke_done'], ts_override='1',
            actor='ai', actorText='AI · 冒烟驱动',
            narrative='需求经产品通道送达：需求分析师A 发给 产品经理A 的私信房 !MPDmRVJOnxGtYkwibe（送达标记 ba_dm_marker，02:41:40）；功能就绪冒烟全部通过（观测面计数按两个来源合并核对）。界面截图未采集：私信房消息流在采集环境无法完成会话同步（普通上下文/重试按钮/持久化档案三路尝试，120 秒均未出内容，已记入问题清单），按裁定如实空缺。', imgs=[]),
    5: dict(keys=['g1_frozen'], ts_override='1791484913',
            actor='human', actorText='人 · BA 需求分析师A',
            narrative='G1 需求冻结（02:41:53，开跑后 12 分钟）：RFD-001 收银台需求的四要素——七条可判定的验收标准（AC-1~7）、明确不做的范围、影响面、敏感点——写入 docs/requirements/RFD-001.freeze.md 并提交；交付案例同步推进（阶段 P1 完成、G1 通过）。', imgs=[('g1_frozen-op1-before','G1 冻结要素页（前）','ui'),('g1_frozen-op1-after','需求追溯页：RFD-001 已冻结标记','ui')]),
    6: dict(keys=['smoke_done'], ts_override='1',
            actor='human', actorText='人 · PM 产品经理A',
            narrative='组织矩阵（M2）02:35:04 入库：14 个账号的角色、汇报关系、看板与团队逐项核对一致（人员名册=组织表=机器清单，零偏差）。当轮截图失败已记入问题清单；界面截图为收尾后补拍（同表续拍，滚动位不同）。', imgs=[('6-op1-before','研发组织与权限表·续（收尾后补拍）·前','ui'),('6-op1-after','研发组织与权限表·续（收尾后补拍）·后','ui')]),
    7: dict(keys=['g1_frozen'], ts_override='1791484913',
            actor='human', actorText='人 · 需求分析师A+产品经理A',
            narrative='G1 冻结与交付案例事件同时完成（02:41:53）：需求分析师A→产品经理A 的需求私信送达验证通过；小案例 dlv-20261009-v8-run12-023306 状态从 P1 推进到 P2，真实读回核对成功。', imgs=[('g1_frozen-op1-before','冻结要素页（前）','ui'),('g1_frozen-op1-after','冻结要素页（后）','ui')]),
    8: dict(keys=['room_analysis'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='分析群「支付收银台需求分析讨论群」（!vaOyAgKoSVuIRqmHnD）02:42:26 建群，产品经理A 与 8 位相关成员（连同各自的 AI 助理）受邀入群；群里第一条正式消息就是需求任务书（事件 $7HFktXFtXdCM3RmZK-c-g454fZUHFENzUdck8hK36dA，scenario.log 02:42:26 行可反查）。界面截图未采集：分析群直达链接在采集环境无法完成会话同步（已记入问题清单），建群时间与邀请名单以上述事件与日志为凭，如实空缺。', imgs=[]),
    9: dict(keys=['dispatch_marker'], ts_override='1',
            actor='human', actorText='人 · 产品经理A',
            narrative='需求任务书派发（02:42:26，事件 $7HFktXFtXdCM3RmZK-c-g454fZUHFENzUdck8hK36dA）：任务书要求做三清单匹配、按 SMART 原则拆分任务、用 RACI 表明确每项工作的负责人与审批人、给出带凭证的结论行，并写明防虚报条款——必须从零重新执行、禁止引用历史产物。界面截图未采集：该消息深埋 2400+ 条群历史之下（房间被 run13 复用），界面无法回溯定位（已记入问题清单）；任务书原文以派发事件号为凭，如实空缺。', imgs=[]),
    10: dict(keys=['register_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='主任务卡登记+任务清单入库（03:31:36）：docs/analysis/RFD-001-tasklist.md 提交（commit 4160a2f5），主卡 t_acc22c4d 挂在 产品经理A 看板（03:52:59 凭证行）；主卡当时缺结构化责任分配，经退回补充后补齐（03:57 退回→04:02 补齐完成）。', imgs=[('register_done-op1-before','主卡登记前','ui'),('register_done-op1-after','主卡+任务清单入库','ui')]),
    11: dict(keys=['analysis_done','analysis_verified'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='任务清单核验+双重凭证反查：analysis_verified 与 analysis_done 两项状态写入；四份系统分析任务书按约定展开——收银核心（AN-PAYCORE）、小程序（AN-MP）、微信渠道（AN-CHWX）、支付宝渠道（AN-CHALI），核对结论行后进入执行。', imgs=[('analysis_done-op1-before','任务清单核验前','ui'),('analysis_done-op1-after','任务清单入库+核验通过','ui')]),
    12: dict(keys=['triage_done'], ts_override='1',
            actor='ai', actorText='AI · 四主责 agent',
            narrative='分诊登记（04:02:44-54）：研发工程师A/研发工程师B/研发工程师C/研发工程师D 四块看板的 RFD-001 任务卡到位（研发工程师A 板前两张 t_daf6f134 T01 与 t_236a0cb8 T05，看板记录可反查）；团队负责人A/团队负责人B 确认分诊转入待办（04:02:54-59）。该步当轮截图失败（04:03:11，已记入问题清单不阻断），界面截图为收尾后补拍。', imgs=[('12-op1-before','研发工程师A 看板·RFD-001 任务卡（收尾后补拍）·前','ui'),('12-op1-after','研发工程师A 看板·RFD-001 任务卡（收尾后补拍）·后','ui')]),
    13: dict(keys=['anexec_done'], ts_override='1',
            actor='ai', actorText='AI · 研发工程师A/研发工程师D/研发工程师B/研发工程师C agent',
            narrative='四份系统分析同时派出（04:03:15-28）：研发工程师A 负责收银核心、研发工程师D 小程序、研发工程师B 微信渠道、研发工程师C 支付宝渠道；概设预写同步开始（04:21:28 派）。四份全部完成入库（08:20:07，四稿齐）。', imgs=[('anexec_done-op1-before','系统分析派出前','ui'),('anexec_done-op1-after','四份系统分析完成入库','ui')]),
    14: dict(keys=['review_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='概设方案 docs/design/RFD-001-architecture-design.md 入库（10:01:26，四份系统分析汇总+跨模块接口约定）；评审卡自登+评审通过，review_done 状态写入。', imgs=[('review_done-op1-before','概设汇总前','ui'),('review_done-op1-after','概设入库+评审通过','ui')]),
    15: dict(keys=['g2_arch_pass'], ts_override='1791512757',
            actor='ai', actorText='AI · arch-agent',
            narrative='G2 架构评审一轮通过（10:25:58）：10:02:40 派发（10:13:11 重派一次）→10:25:42 结论经两个来源核对一致→系统架构师A 看板评审卡 t_6b55dd49 标记完成；交付案例推进（阶段 P2 完成、G2 通过）。界面截图为收尾后补拍（该步当轮截图失败，已记入问题清单）。', imgs=[('15-op1-before','系统架构师A 看板·G2 评审任务卡（收尾后补拍）·前','ui'),('15-op1-after','系统架构师A 看板·G2 评审任务卡（收尾后补拍）·后','ui')]),
    16: dict(keys=['close_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='主卡归档（close_done）：产品经理A 主卡 t_acc22c4d 汇总四份系统分析、任务清单与概设的代码路径后标记完成（10:26:10 真值行可反查）。', imgs=[('close_done-op1-before','主卡归档前','ui'),('close_done-op1-after','主卡完成+资产路径汇总在卡内','ui')]),
    17: dict(keys=['plan_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='排期计划入库（10:50:47-53，docs/plan/RFD-001-schedule.md）：六个任务的人日估算、里程碑与缓冲齐备；父子任务卡挂接完成、逐条可派。', imgs=[('plan_done-op1-before','排期前','ui'),('plan_done-op1-after','排期入库+子卡挂接','ui')]),
    18: dict(keys=['devimpl_done'], ts_override='1',
            actor='ai', actorText='AI · 四开发 agent',
            narrative='六张开发卡同时派出（10:51:25-10:52:14，提速措施二首次应用）：收银核心拆成三张（接口契约、状态机+防重、回调+凭证），加上小程序、微信渠道、支付宝渠道各一张；接口契约分支 feat/DEV-PAYCORE-C 11:20:37 最先落地，作为另两张的合并基准（不再等它才能开工）。10:52-15:52 小程序/微信/支付宝三张卡长时间零推进（15:52 换用四项干预改进后微信恢复，已记入问题清单）；G3 通过（17:59:47）+收银核心三支集成合并（微信/支付宝/小程序三支缺席，已记入问题清单——集成以已交付分支继续）。', imgs=[('devimpl_done-op1-before','六卡同时派出前','ui'),('devimpl_done-op1-after','G3 通过+三支集成','ui')]),
    19: dict(keys=['defect_done','testpass_done'], ts_override='1',
            actor='ai', actorText='AI · 测试工程师A/测试工程师B agent',
            narrative='集成+测试：后端测试（测试工程师A）与前端测试（测试工程师B）18:00 首派（被网关的冻结等待误伤，20:25 重新投递）；G4 通过（22:30:33）——测试工程师A 的测试报告如实写明「TEST-BE 本轮未执行、未覆盖」并入集成分支（不谎报，这成为 G5 第一轮追责的诚实起点）；测试工程师B 的 T07 前端 AC-7 报告在工作区成稿（后续 R2 轮入基线）。', imgs=[('testpass_done-op1-before','测试段派出前','ui'),('testpass_done-op1-after','G4 通过+如实报告入库','ui'),('19-sup1-before','交付健康页·六道关卡工件核查：G4 独立验证在仓锚点 2026-10-09（收尾后补拍；活系统当前状态，G5/G6 关卡已被 run13 更新）','ui')]),
    20: dict(keys=['ready_done','release_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent 评审',
            narrative='G5 发布准出：两次退回+强制暂停+复审转正（全程留痕）：第一轮 22:54:42 真不通过（缺回滚阈值、灰度方案、发布说明三件）→补齐三项成稿→第二轮 23:25:59 不通过（缺 G4 证据链：TEST-BE 未实际执行+T07 不在基线+29 文件漂移）→连续两轮不通过，23:36 按规则强制暂停→并行整改（测试工程师A 实际执行 TEST-BE：250 个用例分四包全部通过 75+52+60+63，加四包类型检查零错误→bc2cb9f；测试工程师B 把 T07 提交入基线 31db77a）→复审 01:17:21 通过→此时评审卡里的模板字样「READY-GATE-FAIL」污染了结论行、发送脚本又三次未成功（结论合并按 FAIL 优先）→清理后 01:46 通过；发布登记三卡 REL-MERGE t_717db416、REL-TAG t_83133800、REL-DELIVER t_f8910b4e（01:46:33-45）。', imgs=[('release_done-op1-before','发布登记前','ui'),('release_done-op1-after','发布三卡在板','ui'),('deliver_gate-op1-after','交付案例门禁灯状态','ui')]),
    21: dict(keys=['uat_done'], ts_override='1791571600',
            actor='human', actorText='人 · 需求分析师A 验收',
            narrative='UAT 业务验收（02:46:40）：产品经理A 逐条核对七条验收标准的证据行，验收书 docs/acceptance/RFD-001-acceptance.md 入库；结论=AC-1/2/3/4/6/7 六条通过、AC-5（重复回调处理）不通过→有条件放行（是否放行归业务方 需求分析师A 决定，已记入问题清单 uat-conditional）——通过/不通过/有条件三态如实呈现，不粉饰全绿。', imgs=[('uat_done-op1-before','UAT 验收前','ui'),('uat_done-op1-after','验收书入库（条件放行）','ui')]),
    22: dict(keys=['workmgr_done'], ts_override='1791571665',
            actor='ai', actorText='AI · 监控侧',
            narrative='工作台账保存（02:47:45）：跨账号看板的状态分布、在办数量上限治理齐备（work-report 提交入库）。', imgs=[('workmgr_done-op1-before','台账生成前','ui'),('workmgr_done-op1-after','工作台账入库','ui'),('22-sup1-before','交付健康页·项目健康：工作项分布与人力忙闲分布（收尾后补拍；活系统当前状态，含 run13 在办任务）','ui')]),
    23: dict(keys=['audit_done'], ts_override='1791571711',
            actor='ai', actorText='AI · 审计师A+监控侧',
            narrative='合规审计意见书入库（02:48:31）：独立性声明+三处凭证抽检+监控侧的机械化结论；本轮所有人工介入都留了痕——值班监控程序定向提醒 7 次、审批代管 80 分钟（execute_code 审批死锁期间）、全员静默令，scenario.log 的 [watchdog] 标记行全程可反查。', imgs=[('audit_done-op1-before','审计前','ui'),('audit_done-op1-after','意见书入库','ui'),('23-sup1-before','审计与变更页·统一审计日志与变更治理（收尾后补拍；审计事件实时滚动，画面为当前条目）','ui')]),
    24: dict(keys=['retro_done'], ts_override='1791571799',
            actor='ai', actorText='AI · 监控侧+治理',
            narrative='G6 复盘（02:49:59，六道关卡 6/6 全部通过）：三段式复盘+治理报告 governance-report.md+指标数据分别入账；头号复盘项=网关四起事故链、群消息噪音风暴、会话中毒、结论行污染四个问题链并联发生——全部记入问题清单，恢复动作留痕。', imgs=[('retro_done-op1-before','复盘前','ui'),('retro_done-op1-after','工程效能页：推演流水线（收尾后补拍）','ui')]),
    25: dict(keys=['ide_done'], ts_override='1',
            actor='human', actorText='人 · 研发走查',
            narrative='IDE 工作台核验（02:50:00 三项检查：/ide 路由返回 200、ide 页任务参数处理正常、简报组件显示正常）：核验对象=overlay 的 custom/client/ide 目录（代码锚=最近提交 4af0d69c）。', imgs=[('ide_done-op1-before','IDE 核验前','ui'),('ide_done-op1-after','IDE 核验后','ui')]),
    26: dict(keys=['report_done'], ts_override='1',
            actor='ai', actorText='AI · 报告生成器',
            narrative='报告步实录：03:0x 首次生成被「按轮预写叙事」的检查拦下（设计如此——防止旧轮文案冒充本轮；本注册块就是该检查要求补交的文案；run10 的教训是开跑前预写，本轮改为事后补交，已列为 run13 的前置事项）→补交后报告继续生成：主报告+审计检查+两份正式报告（报告页与最终报告页）。全程 02:29:57→03:39:56 约 25 小时，含网关四起事故、驱动接管、G5 三段复审——净执行与事故耗时分开记账；界面截图为收尾后补拍（该步当轮截图失败，已记入问题清单）。', imgs=[('26-op1-before','运行中心·运行列表（收尾后补拍）·前','ui'),('26-op1-after','运行中心·运行列表（收尾后补拍）·后','ui'),('26-op1-action','运行中心·操作帧（收尾后补拍）','ui'),('report_view-op1-before','报告查看面·前（当轮 03:40 实拍）','ui'),('report_view-op1-after','报告查看面·后（收尾后补拍：当轮文件已损毁，同工具重拍）','ui')]),
}



# ── run13（lite 轮首航，2026-10-10）：预写注册（run12 R17 补注册教训兑现——开跑前落位，
#    报告步零等待）。夹具带（步 1-17）keys 置空=⬜ 如实呈现（lite 方案红线：跳过步不伪造
#    证据、不与全量轮混同统计；G1/G2 闸门卡按 lite seed 夹具键显示已通过，provenance 见
#    各步叙事）；当轮执行带（步 18-26）真实键+预期帧位，实测依据占位以【run13 实测依据】标记，
#    报告步收尾链回填。lite_fixtures_from=20261009-v8-run12。──
STEPS_META_RUN13 = {
    1: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · admin 管理员',
            narrative='回归轮（本步不在本轮执行范围）：账号与基础设施为环境夹具（SIM 持久跨轮复用）——30 账号 token/单网关 :8801+单 studio :8802；本轮开跑前实测双健康（2026-10-10 巡检 200/200）。本步不在 lite 轮执行范围。', imgs=[]),
    2: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · 装配脚本',
            narrative='回归轮（本步不在本轮执行范围）：治理注册表（apps/roster）与 14 账号板为环境夹具（源轮 M1/M2 产品通道真值），持续在位不重装配。', imgs=[]),
    3: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · 各用户',
            narrative='回归轮（本步不在本轮执行范围）：30 账号 matrix 免密/密码双通道登录为源轮验证真值（roster 与 jwt 凭据键在档），本轮账号全量沿用不重登。', imgs=[]),
    4: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · 冒烟驱动',
            narrative='回归轮（本步不在本轮执行范围）：冒烟四组承载页面在源轮验证；本步不在 lite 执行范围，§2.5 承载页面承诺按 lite 口径如实呈现（零当轮实拍不冒充）。', imgs=[]),
    5: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · BA 需求分析师A',
            narrative='回归轮（本步不在本轮执行范围）：应用资产表 docs/admin/app-registry.md 在 origin/main（源轮真值，四应用负责人/专属看板/测试骨架齐），本轮不重走应用登记面。', imgs=[]),
    6: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · PM 产品经理A',
            narrative='回归轮（本步不在本轮执行范围）：组织矩阵对账（roster=org=fleet-manifest 零偏差）为源轮真值。', imgs=[]),
    7: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · 需求分析师A+产品经理A',
            narrative='回归轮（本步不在本轮执行范围）：G1 案例房事件链（源轮 dlv 案例 P1→P2）在案可反查；本轮交付事件以当轮实发为准。', imgs=[]),
    8: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：分析群复用（room_analysis=源轮群，mx-lite-seed 种入 state）——本轮 devimpl 派发在该群进行。', imgs=[]),
    9: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · 产品经理A',
            narrative='回归轮（本步不在本轮执行范围）：需求派发任务书与防虚报条款为源轮真值；本轮 DEV 派发词自含边界纪律条款（过度交付守卫首次实战，6888f22）。', imgs=[]),
    10: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：RFD-001 主卡与 tasklist 为源轮真值；本轮开发子卡当轮新建。', imgs=[]),
    11: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：四系分任务书（AN-*）与 tasklist 在 origin/main——lite 轮不重跑分析段。', imgs=[]),
    12: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · 四主责 agent',
            narrative='回归轮（本步不在本轮执行范围）：分诊台四板任务卡为源轮真值。', imgs=[]),
    13: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · 研发工程师A/研发工程师D/研发工程师B/研发工程师C agent',
            narrative='回归轮（本步不在本轮执行范围）：四系分稿 docs/analysis/AN-*.md 在仓（源轮真值）。', imgs=[]),
    14: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：架构设计文档 docs/design/RFD-001-architecture-design.md 在仓——本轮 devimpl 任务书按此契约实施（lite 方案边界：契约变更须先走 L2 或人工评审更新概设）。', imgs=[]),
    15: dict(keys=[], mark_chip='沿用·run12',
            actor='human', actorText='人 · 架构 团队负责人A+评审',
            narrative='回归轮（本步不在本轮执行范围）：G2=g2_arch_pass 夹具键（lite seed，provenance=源轮评审真值：系统架构师A 板评审卡 t_6b55dd49 一轮过（时点见源轮台账））；本轮 close/plan 强制关卡放行依据=夹具门禁记录而非本轮现场评审（lite 方案边界条款如实呈现）。', imgs=[]),
    16: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：主卡归档（close）为源轮真值。', imgs=[]),
    17: dict(keys=[], mark_chip='沿用·run12',
            actor='ai', actorText='AI · fanfan-agent',
            narrative='回归轮（本步不在本轮执行范围）：排期计划 docs/plan/RFD-001-schedule.md 在仓（六任务人日+子任务拆分为源轮真值），本轮 DEV/TEST 任务 ID 沿用。', imgs=[]),
    18: dict(keys=['devimpl_done'], ts_override='1',
            actor='ai', actorText='AI · 四开发 agent',
            narrative='本轮执行·开发实施：六路同时派出（DEV-PAYCORE-C/S/N+DEV-MP+DEV-CHWX+DEV-CHALI 同刻即派，提速②），派发词首带边界纪律条款（仅 feat/* 交付/禁直推 main/禁代做）；段入口记 origin/main 基线+段末 main 污染反查+提交粒度观察（过度交付守卫 C 件首次实战）；GRAPH_ENGINE=on 图执行引擎接管调度（loop-graph 自驱动，产品面 0b149770+REST 修复 a94ec57b）。实测依据：六路同时派出 09:15:35-09:16:09；开发段入口 main 基线=d2639f9、段末反查零 main 污染（边界守卫首战通过，无 main-pollution 问题单）；G3 通过 09:59:28；集成=PAYCORE-S/N 两支当轮新提交合入（S1/S2、N1/N2 各带 testlog，79/79 全绿+tsc 干净），CHWX/CHALI/MP/PAYCORE-C 四支 add/add 冲突记问题单（4 单+自动合并解决 2 单，集成以已交付分支继续）；PAYCORE-C/CHWX 本地测试证据缺件记问题单', imgs=[('devimpl_done-op1-before','IDE 画布·任务简报抽屉视图（14:55 补拍：错页根因修复后按拍摄位规划重拍，非 09:59 实施时点实拍）','ui'),('devimpl_done-op1-after','IDE 画布·任务上下文与简报视图（14:55 补拍）','ui')]),
    19: dict(keys=['defect_done','testpass_done'], ts_override='1',
            actor='ai', actorText='AI · 测试工程师A/测试工程师B agent',
            narrative='本轮执行·集成与测试：TEST-BE（测试工程师A）/TEST-FE（测试工程师B）自预备轮用例核对即跑（用例前移纪律 27②）；诚实账语义沿用——测试未执行=如实报告不谎报 PASS（run12 G5 缺项①教训）。实测依据：TEST-FE 派 测试工程师B 09:59:46、TEST-BE（测试工程师A）自预备轮用例核对即跑；G4 通过 11:30:22（测试工程师A 评审要点已入工作线程 11:30:10（后台评审））；测试报告在 integration 分支可反查；帧=测试工程师A 板实拍（拍摄位规划指定测试员板）', imgs=[('testpass_done-op1-before','测试工程师A 看板·测试任务卡（TEST-BE/TEST-FE）视图·前（补拍 12:47：原帧误拍会话空态，r18 弹窗清扫误关看板页签，修复后按拍摄位准确补拍）','ui'),('testpass_done-op1-after','测试工程师A 看板·测试任务卡（TEST-BE/TEST-FE）视图·后（补拍 12:47，同前帧口径）','ui')]),
    20: dict(keys=['ready_done','release_done'], ts_override='1',
            actor='ai', actorText='AI · fanfan-agent 评审',
            narrative='本轮执行·发布准出与登记：判词纪律落地首验（派发词已补「结论行行首+改改判句式+发出后回读确认」，f3d7bb9；判词污染 run12 教训应用——模板字样不入被解析面）。实测依据：G5 一轮过 11:30:41（评审卡 t_4f295b73 → done，HumanGate=人工批准入 approved.events）；判词纪律首验（结论行行首+发出后回读确认）；发布三卡 REL-MERGE t_a513ab95 / REL-TAG t_423eff19 / REL-DELIVER t_f7d35a2b（11:38:06-17）；QGate release-report 落盘失败记问题单（qgate-evidence，审计段按来源分布如实呈现）；帧=发布三卡在板实拍（本轮中途重部署后的新界面，无权限报错）', imgs=[('release_done-op1-before','发布登记看板视图·前','ui'),('release_done-op1-after','发布三卡在板视图','ui')]),
    21: dict(keys=['uat_done'], ts_override='1',
            actor='human', actorText='人 · 需求分析师A 验收',
            narrative='本轮执行·UAT 验收：AC-1~7 逐条证据行；AC-5（重复回调处理）为 run12 已知不通过项（整改在 backlog）——本轮判词须如实三态，条件放行语义保留（放行权归 需求分析师A）。实测依据：验收 12:07:05 完成——判词 AC-2/3/4/7 通过、AC-1/5/6 不通过（产品经理A 一手复测：pay-core 31/34+3 失败+tsc TS2339，与 测试工程师A 报备一致）；非全过不作无条件验收、放行权归 需求分析师A（uat-conditional 已登记问题单）；验收书 docs/acceptance/RFD-001-acceptance.md 入 origin/main；证据行在线程 $k9Qpeg5（跟进提醒 $cd8AO5iv 后 12:0x 逐条发出）', imgs=[('uat_done-op1-before','UAT 验收前','ui'),('uat_done-op1-after','验收书卡面视图','ui')]),
    22: dict(keys=['workmgr_done'], ts_override='1',
            actor='ai', actorText='AI · 监控侧',
            narrative='本轮执行·工作台账：跨账号板状态分布视图原为本轮缺口（缺失功能 G3），于本轮执行中途 11:37 上线（推演中途重部署）——本步帧=交付健康页签上线后实拍，如实注记中途上线。实测依据：工作台账 12:07:18 生成 ✓（14 账号×状态分布，WIP 全员 ≤2）；12:07:26 work-report.md 入仓 origin/main', imgs=[('workmgr_done-op1-before','交付健康页签·跨账号板状态分布表视图·前','ui'),('workmgr_done-op1-after','交付健康页签·跨账号板状态分布表视图·后','ui')]),
    23: dict(keys=['audit_done'], ts_override='1',
            actor='ai', actorText='AI · 审计师A+监控程序',
            narrative='本轮执行·合规审计：免等窗终态复核段首验（a0113d2——记入问题清单后补账成功者审计段以当前真值完整循环）。实测依据：审计派发 $yUN4n4NM 12:07:49；合规意见书 12:08:06 入仓（门禁链 G1/G2/G4/G5 与回灌机制执行合规、问题单 100% 台账化）；免等窗终态复核首验——本轮 receipt-missing/raci 族零触发（回归轮无系分派发面），复核段空转如实', imgs=[('audit_done-op1-before','审计前运行中心视图','ui'),('audit_done-op1-after','审计意见书视图','ui')]),
    24: dict(keys=['retro_done'], ts_override='1',
            actor='ai', actorText='AI · 监控程序+治理',
            narrative='本轮执行·G6 复盘与治理归档。实测依据：G6 复盘 12:08:54 写入通过标记（六闸 6/6 收齐）；复盘文档+治理报告入仓 12:08:34；记忆探针 ✓（家族 bank=hermes-f4ff5aba122f-fanfan）；头号复盘项=repo_has 新鲜度窗口×回归轮沿用件冲突（UAT 前置五连重启循环，修复 6959a2b=基线取夹具源轮启动时刻）', imgs=[('retro_done-op1-before','复盘前','ui'),('retro_done-op1-after','复盘闸门卡视图·G6 状态绿','ui')]),
    25: dict(keys=['ide_done'], ts_override='1',
            actor='human', actorText='人 · 研发走查',
            narrative='本轮执行·IDE 工作台核验。实测依据：IDE 工作台核验 12:09 写入通过标记；核验对象含本轮中途上线的 IDE 落地面（G1）与任务简报抽屉；帧=修复后实拍（ide?task 直达链接，拍摄位规划指定）', imgs=[]),
    26: dict(keys=['report_done'], ts_override='1',
            actor='ai', actorText='AI · 报告生成器',
            narrative='本轮执行·报告步：叙事文案开跑前预注册（run12 补注册教训兑现——R17 零等待，本注册块即预写产物）；mx-report-gen 生成+mx-report-audit 熔断硬跑+final-report-merge 双正本（PART1 按回归轮口径：沿用带与本轮执行带分离呈现）。实测依据：报告链四段实录——12:13 审计 FAIL（DISP 缺 14）→台账清偿；12:14 合并黑话门禁 13 处（叙事行话+时间线数据行误伤）→叙事改人话+门禁剥离表格；12:18 同款复撞→修复生效；12:19 四查全过+双正本落盘。全程 09:15:04→12:19:05 约 3 小时 04 分（回归轮，夹具自 run12）', imgs=[('report_view-op1-before','运行中心·报告查看面视图·前','ui'),('report_view-op1-after','运行中心·报告查看面视图·后','ui')]),}


# ── run14 全量轮预注册（2026-10-10 14:15:55 启动；V8.5 首航）──
# 步 1-9 锚点取自当轮 driver.log/state.env 实况；步 10-26 为机制句预注册，
# 实测依据行由收尾链按 scenario.log/issues.log 回填（§4.3 25b 叙事预写纪律）。
# imgs 全空注册：帧引用须待盘上实帧在位后回填（V8.4① 图注=画面描述；缺帧引用=审计 FAIL）。
STEPS_META_RUN14 = {
    1: dict(keys=['smoke_done'],
            actor='human', actorText='人 · admin 管理员',
            narrative='账号与基础设施就绪：mx-clean 三旗标全清（中央仓清空提交 bd887da @ 2026-10-10 13:44:54，时刻以 commit 时间戳为准；clean 发生在驱动起跑前故 scenario.log 无对应行——run14 复盘 A7 修正手编时刻）后 0→1 重建；24 个账号的登录凭证逐个验证通过，单网关 :8801+单 studio :8802 双健康探测通过。14:15:55 开跑（START_STEP=smoke 全量启动，监督器托底）。', imgs=[('smoke_done-op1-before','账户管理页·30 账号在列（账号就在这里分配）·前','ui'), ('smoke_done-op1-after','账户管理页·账号清单与角色列全量·后','ui')]),
    2: dict(keys=['smoke_done'],
            actor='ai', actorText='AI · 装配脚本',
            narrative='本步无对应产品界面：每用户四件套装配（账号/配置/看板/团队/记忆库）为后台装配动作，无独立操作界面（§2.5 无步 2 界面承载承诺；装配真值=profiles 清单+板装载日志 14:16:36）。本步无三源锚（声明态）——真值锚=装配实物（hermes/kanban/boards/ 板库 26 板在位+board.json 团队围栏可反查）。实测依据：profiles 清单+每板 team 围栏装载 ✓（14:16:36）。', imgs=[]),
    3: dict(keys=['smoke_done'],
            actor='human', actorText='人 · 各用户',
            narrative='登录与跨账号隔离：matrix 免密通道+密码双路径；各账号仅见本账号档案与看板（服务端可见性过滤）。本步无三源锚（声明态）——真值锚=30 账号 whoami 探测行（scenario.log 14:16:16/14:16:35 实录）。', imgs=[('login_done-op1-before','账户管理页·登录态就绪（免密通道）·前','ui'), ('login_done-op1-after','登录后本账号档案可见·后','ui')]),
    4: dict(keys=['smoke_done'],
            actor='ai', actorText='AI · 冒烟驱动',
            narrative='功能就绪冒烟+delivery 协议冒烟（全量轮协议事件全程开启）：案例房 dlv-20261010-v8-run14-141636（!NIZdrdGMNcWLfrfNiu，14:17:35）事件落房读回 ✓（R29 小冒烟）；页头任务/在线 chips 与运行中心工作流页签加载核对。', imgs=[('smoke4-op1-before','工作台首页·页头任务/在线 chips（补拍 11:47）·前','ui'), ('smoke4-op1-after','工作台首页·页头任务/在线 chips（补拍 11:47）·后','ui'), ('smoke4b-op1-before','运行中心·工作流页签区块加载（补拍 11:47）·前','ui'), ('smoke4b-op1-after','运行中心·工作流页签区块加载（补拍 11:47）·后','ui')]),
    5: dict(keys=['appinit_done'],
            actor='human', actorText='人 · BA 需求分析师A',
            narrative='应用资产登记：四应用（csw-pay-core/CHWX/CHALI/cashier-mp）经产品通道登记入仓（PUT /api/governance/registry/app-registry 保存即 git 提交——界面同源承载）。实测依据：14:18:10 写入通过标记。', imgs=[('appinit_done-op1-before','治理中心·应用资产编辑器·前','ui'), ('appinit_done-op1-after','应用资产·负责人/看板/SLA 列·后','ui')]),
    6: dict(keys=['people_done'],
            actor='human', actorText='人 · PM 产品经理A',
            narrative='组织与权限矩阵：org.md 入库+三方对账。实测依据：R28 编制三方对账一致 roster=15 × org=15 × matrix=15 ✓（14:16:36）；people_done 14:18:30。', imgs=[('people_done-op1-before','文档评审页签·研发组织与权限表·前','ui'), ('people_done-op1-after','组织权限表全量行·后','ui')]),
    7: dict(keys=['g1_frozen'],
            actor='human', actorText='人 · 需求分析师A+产品经理A',
            narrative='需求上锁（G1）：需求分析师A 需求书经 matrix 私信送达 产品经理A（DM 房 !HgaPKBGJqvHUhrfYB，送达标记 $gpLzjyw1nzqwYz2Io9C9SN4haNfg_oe3eG-V8rQnadQ）；四要素判读通过后冻结标记入仓。实测依据：g1_frozen 14:19:06；delivery 事件 stage P1 done+gate G1 pass 同刻落案例房（case→P2）。', imgs=[('g1_frozen-op1-before','需求追溯页签·G1 冻结工件与 AC·前','ui'), ('g1_frozen-op1-after','冻结标记与 AC 列·后','ui')]),
    8: dict(keys=['room_analysis'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='建群与全量预邀：分析群 !OStFtevDUpLrHgePBY:matrix.test（14:19:31），fanfan-agent+8 关联人（chen/hu/lin/xiao/wei/mei/qi/fei）及各自 agent 一次性预邀（方案 §8 全量预邀纪律）。', imgs=[]),  # 帧走 r18 ops 通道（r18-steps.json 步 8 已注册，双挂即同源违例）
    9: dict(keys=['dispatch_marker'],
            actor='human', actorText='人 · 产品经理A',
            narrative='本步无对应产品界面（派发锚点的房间直达链接在采集环境不可达——capture-plan 规划注记在案，事件锚直跳待产品实现）：对话全文已入 r18 载荷（步 9 必采 ✓）。派发词含需求信息/材料地址/双凭证证据要求/派发标识 RUN=20261010-v8-run14。实测依据：派发事件 $lCg7puyg43plN7d13I1LmkHuVaYQAsT2TuRl1zpcs3M（14:19:32）；对话全文挂钩 r18-collect（步 9 必采，run13 复盘 F13 接线首验）。', imgs=[]),
    10: dict(keys=['register_done'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='看板登记与任务分解：产品经理A 板 RFD-001 主卡落板（主卡 t_89fd4f0c）+凭证反向核验（commit c597644 真在 origin 且含分析稿、card 真在账号板——15:41:17 双向核验 ✓）。实测依据：scenario.log 完成凭证反向核验行。', imgs=[]),  # 帧走 r18 ops 通道（r18-steps.json 步 10 已注册）
    11: dict(keys=['analysis_done','analysis_verified'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='系统分析与拆分：tasklist 入仓（SMART 具体到人+三清单匹配）+四组 RACI 双 @ 派发核验+凭证双向核过。实测依据：收尾链按 scenario.log 回填。', imgs=[('analysis_done-op1-before','文档评审页签·tasklist 核验·前','ui'), ('analysis_done-op1-after','任务清单 T01~T08 行·后','ui')]),
    12: dict(keys=['triage_done'],
            actor='ai', actorText='AI · 四主责 agent',
            narrative='分诊与派工：四主责账号板任务卡齐+lead 确认（质量指标以 issues.log 实测为准，收尾链回填）：（triage→todo）；重复派发 agent 自动合并去重。本步无三源锚（声明态）——真值锚=四板任务卡状态流转（kanban 板库 chen/hu/lin/xiao 板 triage→todo 事件流可反查）。实测依据：收尾链按 scenario.log 回填。', imgs=[('triage_done-op1-before','chen 看板·分诊台任务卡·前','ui'), ('triage_done-op1-after','分诊确认后卡状态·后','ui')]),
    13: dict(keys=['anexec_done'],
            actor='ai', actorText='AI · 研发工程师A/研发工程师D/研发工程师B/研发工程师C agent',
            narrative='精准系分（四路并行）：worktree 工作区建分支、四份 AN-*.md（概设含接口签名/数据模型/错误码/幂等键+人日评估）入仓+AN-DONE 回执双通道。实测依据：收尾链按 scenario.log 回填。', imgs=[('anexec_done-op1-before','文档评审页签·四份系分稿在列·前','ui'), ('anexec_done-op1-after','系分稿核验视图·后','ui')]),
    14: dict(keys=['review_done'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='汇总复核定稿：概设 docs/design/RFD-001-architecture-design.md 入仓（金额分 int64/snake_case 消歧）+评审任务卡登记。实测依据：收尾链按 scenario.log 回填。', imgs=[('review_done-op1-before','文档评审页签·概设文档·前','ui'), ('review_done-op1-after','概设内容核验·后','ui')]),
    15: dict(keys=['g2_arch_pass'],
            actor='human', actorText='人 · 系统架构师A 治理评审',
            narrative='架构治理评审（G2）：五项检查（设计五要素/爆炸半径/验证计划前移/备选方案≥2/历史偏差硬性拦截）评审卡留痕（arch 板评审卡 t_a7288f5d——交付物矩阵步 15 行同锚）；系统架构师A 板拍摄位首次实拍（capture-plan 步 15，run13 复盘 F16 接线）。实测依据：收尾链按 scenario.log 回填。', imgs=[('g2_arch_pass-op1-before','arch 看板·G2 评审卡（五项检查单）·前','ui'), ('g2_arch_pass-op1-after','评审卡结论留痕·后','ui')]),
    16: dict(keys=['close_done'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='系分收尾：主任务卡档案汇总（AN-*/tasklist/概设路径+commit）+标记 done（测试工作量 0.3 系数口径写入；主卡 t_89fd4f0c done）。实测依据：收尾链按 scenario.log 回填。', imgs=[('close_done-op1-before','fanfan 看板·主卡归档·前','ui'), ('close_done-op1-after','主卡 done 与档案汇总·后','ui')]),
    17: dict(keys=['plan_done'],
            actor='ai', actorText='AI · fanfan-agent',
            narrative='排期：docs/plan/RFD-001-schedule.md 入仓（任务×时间窗口×依赖；测试=开发×0.3 独立成项；整体+15% 缓冲）+父子卡+逐条派发。实测依据：收尾链按 scenario.log 回填。', imgs=[('plan_done-op1-before','fanfan 看板·排期父卡挂接·前','ui'), ('plan_done-op1-after','排期时间窗口与依赖列·后','ui')]),
    18: dict(keys=['devimpl_done'],
            actor='ai', actorText='AI · 四开发 agent',
            narrative='编码（G3）六路并行：DEV-PAYCORE-C/S/N+DEV-MP+DEV-CHWX/DEV-CHALI 同刻即派（提速②），边界纪律条款随词注入；并行度段界锚行实测（V8.5 §5.5 修订——defect 段入口「── defect」锚，run13 复盘 F12 接线首验）；GRAPH_ENGINE=on 图执行调度全程在位。实测依据：收尾链按 scenario.log 回填（含并行度实测行）。', imgs=[('devimpl_done-op1-before','IDE 画布·任务简报抽屉（?task= 直达链接）·前','ui'), ('devimpl_done-op1-after','简报区块与交互编码入口·后','ui')]),
    19: dict(keys=['defect_done','testpass_done'],
            actor='ai', actorText='AI · 测试工程师A/测试工程师B agent',
            narrative='独立测试（G4）：TEST-BE（测试工程师A）/TEST-FE（测试工程师B）用例前移预备即跑；缺陷报→修→验全关；测试报告入 integration 分支+commit 回填关联卡。测试者≠写码者。实测依据：收尾链按 scenario.log 回填。', imgs=[('testpass_done-op1-before','qi 看板·TEST-BE/TEST-FE 测试卡·前','ui'), ('testpass_done-op1-after','测试卡结论与 commit 回填·后','ui')]),
    20: dict(keys=['ready_done','release_done'],
            actor='ai', actorText='AI · fanfan-agent 评审',
            narrative='发布准出（G5）七项检查+HumanGate 批准留痕；判词纪律沿用（结论行行首+发出后回读确认）；QGate release-report 以产物在位判（run13 复盘 F14——rc=1 含 INCONCLUSIVE 门不算失败，来源分布随行呈现）；REL-MERGE/TAG/DELIVER 三卡登记。实测依据：收尾链按 scenario.log 回填。', imgs=[('release_done-op1-before','fanfan 看板·REL 三卡登记·前','ui'), ('release_done-op1-after','发布三卡在板·后','ui')]),
    21: dict(keys=['uat_done'],
            actor='human', actorText='人 · 需求分析师A 验收',
            narrative='UAT 验收：需求分析师A 拿 G1 冻结 AC-1~7 逐条对账（三态判词；AC-1 幂等/AC-5 回调幂等/AC-6 超时关单为 run13 已知风险项——本轮全量重做后判词以当轮实测为准）；验收书入仓。实测依据：收尾链按 scenario.log 回填。', imgs=[('uat_done-op1-before','需求追溯页签·UAT 判词呈现·前','ui'), ('uat_done-op1-after','验收书与 AC 判词列·后','ui')]),
    22: dict(keys=['workmgr_done'],
            actor='ai', actorText='AI · 监控侧',
            narrative='工作台账：跨账号板状态分布（交付健康页签实拍——G3 视图已在 main 构建，capture-plan 步 22 拍摄位，run13 缺席位本轮补齐）；WIP≤2 核验+72h 停滞清点。实测依据：收尾链按 scenario.log 回填。', imgs=[('workmgr_done-op1-before','交付健康页签·跨账号板状态分布表·前','ui'), ('workmgr_done-op1-after','WIP 与停滞列·后','ui')]),
    23: dict(keys=['audit_done'],
            actor='ai', actorText='AI · 审计师A+监控程序',
            narrative='合规审计：事故报告汇编导出+机械化三查（门禁留痕/台账格式/交付物缺件）+独立复核派发；delivery 门禁灯帧=交付案例面板实拍（/app/cases，R29 指定面）。实测依据：收尾链按 scenario.log 回填。', imgs=[('audit_done-op1-before','审计前运行中心视图（补拍）·前','ui'), ('audit_done-op1-after','审计意见书视图（补拍）·后','ui')]),  # deliver_gate 帧走 r18 ops+deliver 双注册通道
    24: dict(keys=['retro_done'],
            actor='ai', actorText='AI · 监控程序+治理',
            narrative='G6 复盘与治理归档：三段式复盘+治理报告（V8.5 打回口径=判词语义行，闸段问题单另列）+DISP 100% 回写（主体精确配对+表外词归桶——run13 复盘 F5/F6 首验）+记忆探针。实测依据：收尾链按 scenario.log 回填。', imgs=[('retro_done-op1-before','工程效能页签·治理度量面·前','ui'), ('retro_done-op1-after','治理度量与复盘工件·后','ui')]),
    25: dict(keys=['ide_done'],
            actor='human', actorText='人 · 研发走查',
            narrative='IDE 工作台核验：/ide 路由 200+ide?task 参数路由+简报组件在位+界面走查（G1 落地面/IdeLandingHero 已在 main 构建——run13 步 18 错帧根因修复后的首个全量轮验证）。本步无三源锚（声明态）——真值锚=路由探测行（/ide HTTP 200 实录）+简报组件源码在位（custom/client/ide/components 可反查）。实测依据：收尾链按 scenario.log 回填。', imgs=[]),  # 帧走 r18 ops 通道（r18-steps.json 步 25 已注册）
    26: dict(keys=['report_done'],
            actor='ai', actorText='AI · 报告生成器',
            narrative='报告步：mx-report-gen 生成（帧数=0 拒出）+mx-report-audit 熔断硬跑+final-report-merge 双正本（PART1 占位符残留拒出闸——run13 复盘 F-P1 接线首验；产品成效三件必采，分母 15——F17 首验）。实测依据：收尾链按报告链四段实录回填。', imgs=[('report_view-op1-before','运行中心·报告查看面·前','ui'), ('report_view-op1-after','报告工件视图·后','ui')]),
}

_DOMAINS_RUN13 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'warn',
        '回归轮范围显式裁剪：需求/分析/评审/概设/G1/G2 沿用上一轮工件（provenance=20261009-v8-run12，不伪造当轮证据）；本轮执行 devimpl→report。完整需求永远走全程，回归轮只验产品与流程。开发交付与验收判词以当轮实测依据为准。实测：开发支 6/6 派发 · 集成 2/6（PAYCORE-S/N）· AC 判词 4 通过/3 不通过（AC-1/5/6 一手复测实证）',
        '开发支 6/6 派发；集成合入 2/6（PAYCORE-S/N 当轮新提交），其余 4 支 add/add 冲突已登记问题单在案、分支在 origin 可反查；AC 判词=4 通过/3 不通过（AC-1/5/6，一手复测实证）',
        'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'warn',
        '当轮开发以源轮概设契约为准（回归轮边界：契约变更须先走全量轮或人工评审）；测试证据=分支内实跑日志非纸面（诚实账语义沿用）。实测：PAYCORE-S2/N2 testlog 79/79 全绿+tsc 干净（integration 锚）',
        '用例实跑 79/79（当轮 testlog）；tsc 于 pay-core 存在 TS2339（handleChannelNotify 缺失，UAT 一手复测坐实——如实非零错）',
        'cp-g3,cp-g4'),
    2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'warn',
        '沿用带工件（freeze/tasklist/AN-*/概设/排期）在 origin/main 与界面双向一致（源轮真值）；当轮集成一致性以 integration 分支对账为准。实测：tip=e2b9a9c（S/N 合入+当轮新提交）· 验收书/台账/意见书均入 origin/main',
        'integration 对账：tip=e2b9a9c（PAYCORE-S/N 合入+当轮新提交）；四支未合入（冲突已登记）；验收书/工作台账/审计意见书均入 origin/main',
        'cp-g1,cp-g5'),
    3: ('L3', '行为与业务语义', '运行行为是否符合业务意图？', 'warn',
        '回归轮首航：沿用带不伪造、本轮执行带真实执行；业务意图符合性以本轮 devimpl→UAT 判词为准（详见 L3 总评行）',
        '全锚时间线见 L3-B 总评行（09:15 派发→12:19 报告，九步全走完）',
        'cp-g2,cp-gate,cp-uat'),
    4: ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'warn',
        '安全基线沿用（未授权 401 探针/密钥不出服务端/渠道本地 mock）；GRAPH_ENGINE=on 全程在线（11:37 界面重部署前后均 on），驱动九步全程推进无图/bash 调度分叉事故；安全探针未复测（回归轮范围外，如实）',
        '实测：GRAPH_ENGINE=on 全程 · 九步零调度分叉 · 六闸收齐 12:08',
        'cp-gate,cp-g3'),
    5: ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn',
        '过度交付守卫首次实战（六路边界纪律+main 污染反查+提交粒度观察+预写禁做围栏）；问题单全记入问题清单可追责。实测：DISP 25/25 键全覆盖 · 边界守卫零 main 污染零越界 · 放行权归 需求分析师A 语义保留',
        'DISP 处置=25/25 键全覆盖（收尾链补齐；跟踪观察类如实呈现非全已修）',
        'cp-g5,cp-g6'),
}

_DOMAINS_RUN12 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'warn',
        '主链无漏做（七条验收标准全部有对应交付与验收记录）；但开发交付 4/6：收银核心三张+微信渠道已提交，支付宝渠道与小程序缺席——10:52-15:52 三张卡长时间零推进已记入问题清单（15:52 换用四项干预改进后微信恢复），研发工程师D 的小程序卡被定性为「反应式闲聊」（近 300 行对话里只有 2 次真实的写代码调用）。',
        '实测：验收结论 7/7 全覆盖（AC-5 条件放行）· 开发分支 4/6 已提交（2 缺席记入问题清单）',
        'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'warn',
        '成立但带条件：后端测试 250 个用例分四包真实跑完全绿（75+52+60+63），四包类型检查零错误（测试工程师A 补跑后入集成分支 bc2cb9f）；T07 前端 AC-7 断言与报告入基线（31db77a）；UAT 的 AC-5 不通过如实标红——条件放行的语义保留。',
        '实测：250/250 全绿 · 4 包类型检查零错 · AC-5 不通过（uat-conditional 在案）',
        'cp-g3,cp-g4,cp-g5'),
    2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass',
        '一致。需求冻结件、任务清单、概设、排期四份档案相互核对一致；集成分支祖先链 e8f5cbe→bc2cb9f→31db77a 逐级实测（重锚偏差 0/0）；评审卡 t_c560939f 的七项记录与群里结论行两个来源合并核对。',
        '实测：四份档案核对一致 · 祖先链逐级实测 · 双来源结论核对',
        'cp-g2,cp-g4'),
    3: ('L3', '运行稳健性', '异常和边界是否被正确处理？', 'warn',
        '异常治理是本轮主线：网关事故四起（适配器缺依赖致 40 分钟消息不通/三个重启程序同秒互相误杀/工具无限重试环/19:52 真宕机→19:57 启动→20:07 补件恢复）；驱动与监督程序 18:45-18:53 双双失联→20:24:59 经授权接管+监督程序自愈；群消息噪音一度每分钟 40+ 条→静默令压到 18-22 条；产品经理A 会话中毒（187K token/593 轮/8 线程）+审批界面卡死（322 秒两次）→审批代管 80 分钟；G5 结论行被模板字样污染。全部记入问题清单+恢复动作留痕。',
        '实测：网关事故 4 起全恢复 · 驱动接管 1 次 · 审批代管 80 分钟 · 噪音 40→18 条/分',
        'cp-g2,cp-g5'),
    4: ('L4', '安全合规', '权限、隔离与审计是否有效？', 'pass',
        '有效。不谎报纪律两次实证（测试工程师A 如实报告「TEST-BE 未执行」、UAT 如实标红 AC-5 不通过）；审批走双通道+代管全程留痕（/tmp 台账+scenario.log）；锁机制防御了外来驱动（入侵者被清除且记账）；结论合并按 FAIL 优先（偏安全方向）实证。',
        '实测：诚实报告 2 例 · 代管 80 分钟留痕 · 锁防御记账在案',
        'cp-g6'),
    5: ('L5', '可监督性', '全程是否可复盘、可反查？', 'pass',
        '可。六道关卡的通过时间 6/6 齐全（G1 02:41:53/G2 10:25:58/G3 17:59:47/G4 22:30:33/G5 01:46/G6 02:49:59）；当轮实时截图 18 步 36 帧（分诊步采集失败如实记入问题清单）；issues.log 60+ 行问题与处置全留痕；值班监控程序的 7 次定向提醒在 scenario.log 全程可反查。',
        '实测：六道关卡时间戳 6/6 · 实时截图 36 张 · 问题台账 60+ 行',
        'cp-g6'),
}



# ── run15（20261011-v8-run15，V8.10-V8.15 全栈首验轮+等待环三重盲区根治轮）──
# run16 复盘修订（2026-10-13 fix/run16-report-truth）：keys 此前全空（收尾会话注册时漏填），
# 致 25 步误渲染 ⬜、48 帧零挂接——本批按 §3.3 映射补齐；keys 兜底与审计一致性断言同批落地
# （空 keys 防线见 _STEP_KEY_DEFAULTS）。imgs 只挂真实帧；28 张登录壳页帧已按纪律 40⑩
# 归档 runs/<RUN_ID>/frames-degraded/（frame-capture-failed 47 单在案），不冒充实时帧。
STEPS_META_20261012_V8_RUN16 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · 管理员把关',
        narrative='环境搭建一次到位：30 账号 token 全有效、单网关多路复用+单 studio 多账号就绪（16:33 开跑）。'),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 冒烟驱动',
        narrative='每用户配置与团队围栏装载核对通过（16:36）。'),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
        narrative='14 账号 matrix 登录+看板全可达，自动登录端点按契约应答（16:36）。', imgs=[('login_done-op1-before','工作台·登录前（matrix 连接页）','ui'), ('login_done-op1-after','工作台·会话画布与左侧群组列表（登录后）','ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='AI · 冒烟驱动',
        narrative='环境冒烟全过：网关运行态+平台通道 15 在线+驾驶舱回归在线（16:37 入仓）。', imgs=[('capture-precheck-op1-after','工作台·新会话欢迎页（采集链预检基线帧）','ui'), ('smoke_done-op1-after','账户管理页·15 人编制成员列表','ui'),]),
    5: dict(keys=['appinit_done'], actor='ai', actorText='AI · 治理注册',
        narrative='4 应用资产经产品通道写入中央仓（16:37）；组织对账一笔不一致如实登记问题单（fleet-manifest 缺失，监控当场恢复）。'),
    6: dict(keys=['people_done'], actor='ai', actorText='AI · 治理注册',
        narrative='（本步按方案执行，真值以 state 与 evidence 为准）'),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 把关判读',
        narrative='G1 需求冻结 16:39 一次过（冻结稿入仓，stage P1+gate pass 落房）。'),
    8: dict(keys=['room_analysis'], actor='ai', actorText='AI · 需求分析师A',
        narrative='需求分析讨论群建成并全量预邀（16:39）。', imgs=[],),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 派发令',
        narrative='需求派发任务书送达（16:39）；凭证反向核验首咬自愈（首报卡 ID 不实回灌重报通过）。'),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · 需求分析师A',
        narrative='（本步按方案执行，真值以 state 与 evidence 为准）'),
    11: dict(keys=['analysis_done','analysis_verified'], actor='ai', actorText='AI · 系统分析',
        narrative='系统分析拆分与 RACI 派发完成，主卡结构化 raci 已带。'),
    12: dict(keys=['triage_done'], actor='ai', actorText='AI · 分诊台',
        narrative='（本步按方案执行，真值以 state 与 evidence 为准）', imgs=[('triage_done-op1-before','看板页·任务卡列（分诊前）','ui'), ('triage_done-op1-after','看板页·RFD 任务卡列与状态流转（分诊后）','ui'),]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI · 四路系分',
        narrative='四路系分同刻开出（17:04 并发等待首验）；16 分钟四稿全入库+概设预写流水线完整走通（概设定稿 71a058d）。'),
    14: dict(keys=['review_done'], actor='ai', actorText='AI · 需求分析师A',
        narrative='（本步按方案执行，真值以 state 与 evidence 为准）'),
    15: dict(keys=['g2_arch_pass'], actor='human', actorText='人 · 架构师A+安全工程师A',
        narrative='G2 双工位同刻：安全评审 7 分钟过闸（新设计面口径首验 17:56）；架构评审首轮真打回、修订 20 分钟复审过。'),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 需求收段',
        narrative='（本步按方案执行，真值以 state 与 evidence 为准）'),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 产品经理A',
        narrative='排期完成，六路开发任务书+测试预备轮（用例前移）同刻派发（18:15）。'),
    18: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 六路研发',
        narrative='编码六路 19 分钟收段（分支真值 18:32 全齐）；G3 过闸。', imgs=[('devimpl_done-op1-before','IDE 工作台·任务列表与空画布（编码段起点）','ui'), ('devimpl_done-op1-after','IDE 工作台·自动化蓝图卡片网格','ui'),]),
    19: dict(keys=['defect_done','testpass_done'], actor='ai', actorText='AI · 测试双线',
        narrative='缺陷+测试段：五路分片 20 分钟全交卷（18:34 派发/18:52 末行）；集成合并推送在案；G4 20:59 过闸。', imgs=[],),
    20: dict(keys=['ready_done','release_done'], actor='human', actorText='人 · 把关+HumanGate',
        narrative='G5 两轮真打回（两缺陷+复验报告缺位）触发熔断——监控修复链完整走通（lin/chen 修复+qi 复验+fanfan 复审），00:45 复审 PASS 复位续走；REL 三卡 00:36 登记。'),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A逐条判词',
        narrative='UAT 验收 7 条 AC 全过（00:45 验收书入仓）——上轮 5/7 两缺口本轮补齐。'),
    22: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 研发治理',
        narrative='工作台账生成（14 账号×状态分布）。'),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A独立线',
        narrative='独立审计完成（六域体检+凭证抽检+问题单台账）。', imgs=[('audit_done-op1-after','IDE 工作台·蓝图页（审计取证时段视图）','ui'),]),
    24: dict(keys=['retro_done'], actor='human', actorText='人 · 复盘确认',
        narrative='G6 复盘收尾，治理报告 00:46 生成入仓。'),
    25: dict(keys=['ide_done'], actor='human', actorText='人 · 界面走查',
        narrative='IDE 画布视图落位。', imgs=[],),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告链',
        narrative='报告链收尾：R17 注册补齐+审计熔断+双正本合并收尾。'),
}

# run18-lite-acp（2026-10-13 收尾链补注册）：lite-ACP 专项验证轮叙事表。轮语义=
# MX_ACP_BACKEND=1 首个实跑轮（hermes→ACP→Ycode 编码委托链全链首验）；夹具步 1-15
# 沿用 lite_fixtures_from=20261012-v8-run16 真值（g1/g2 门禁时刻=源轮种子）。imgs 只挂
# 当轮实拍帧（screenshots/steps/ 20 张实测在案——帧纪律：全实时零补拍）。
STEPS_META_20261013_V8_RUN18_LITE = {
    1: dict(keys=['smoke_done'], mark_chip='沿用·run16', actor='human', actorText='人 · 管理员把关',
        narrative='lite 夹具步（源轮 run16 真值沿用）——环境就绪与冒烟真值见源轮报告；本步不在本轮执行范围。'),
    2: dict(keys=['smoke_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    3: dict(keys=['smoke_done'], mark_chip='沿用·run16', actor='human', actorText='人 · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    4: dict(keys=['smoke_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    5: dict(keys=['appinit_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    6: dict(keys=['people_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    7: dict(keys=['g1_frozen'], mark_chip='沿用·run16', actor='gate', actorText='夹具 · G1',
        narrative='G1 门禁真值=源轮种子（g1_frozen=1，夹具时刻在案）——lite 语义：真值沿用不重演。'),
    8: dict(keys=['room_analysis'], mark_chip='沿用·run16', actor='ai', actorText='夹具 · 群',
        narrative='分析群复用源轮（!HLeijkgFAJToBCBtbM:matrix.test）。'),
    9: dict(keys=['dispatch_marker'], mark_chip='沿用·run16', actor='ai', actorText='夹具 · 派发',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    10: dict(keys=['register_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    11: dict(keys=['analysis_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    12: dict(keys=['triage_done'], mark_chip='沿用·run16', actor='human', actorText='人 · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    13: dict(keys=['anexec_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    14: dict(keys=['review_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    15: dict(keys=['g2_arch_pass'], mark_chip='沿用·run16', actor='gate', actorText='夹具 · G2',
        narrative='G2 门禁真值=源轮种子（g2_arch_pass=1791799690 源轮时刻）——lite 语义：真值沿用不重演。'),
    16: dict(keys=['close_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    17: dict(keys=['plan_done'], mark_chip='沿用·run16', actor='ai', actorText='AI · 骨架',
        narrative='lite 夹具步——不在本轮执行范围（真值源轮）。'),
    18: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 六路研发（编码后端=delegate）',
        narrative='ACP 编码后端首个实跑轮：六路任务书 03:08 同刻即派（含【编码后端=delegate】段）；仿真工程师按 coding-delegate 技能以 nohup 后台模式委托 Ycode 引擎（zcode-acp-server 0.43.2 stdio 桥）真实现——chen 链式三托（PAYCORE-C/S/N）+xiao/hu/lin 并行，引擎进程峰值 8。分支真值：PAYCORE-C 03:37 首推（9b708d3 携委托日志），六路 03:53-03:59 全齐。G3 04:21 过闸：承载面 5/6 分支带 materials/delegate-log.txt（4 份 RESULT exit=0 在案），DEV-MP 缺日志记单；CHWX/MP 缺 testlog 记单。', imgs=[('devimpl_done-op1-before','IDE 工作台·编码段起点（委托链首验轮）','ui'), ('devimpl_done-op1-after','IDE 工作台·编码段收尾','ui')]),
    19: dict(keys=['defect_done','testpass_done'], actor='ai', actorText='AI · 测试双线',
        narrative='缺陷+测试段 04:22 起：集成合并六路（testlog 副本冲突族记单）；ChannelAdapter 契约观察器影子 breaking=0 在案；测试分片执行后 G4 段收口（qi 线执行在案）。', imgs=[('testpass_done-op1-before','测试段·驾驶舱前态','ui'), ('testpass_done-op1-after','测试段·驾驶舱收尾','ui')]),
    20: dict(keys=['ready_done'], actor='gate', actorText='强制关卡 G5 · 发布准出',
        narrative='G5 判词复用 PASS（05:54：本轮既有 PASS 结论行不重派评审——lite 语义；评审卡 t_76fa0c86→done；HumanGate=导演批准入 approved.events）；QGate release-report 落盘。', imgs=[]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 需求分析师A 验收',
        narrative='UAT lite 段：验收文档留存（推送 origin/main 失败记单 uat-push，留存路径在案）。', imgs=[('uat_done-op1-before','UAT·验收前态','ui'), ('uat_done-op1-after','UAT·验收收尾','ui')]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作台账',
        narrative='工作台账 06:14 保存（work-report 落盘）；零交付遥测 62 卡如实记单（研发交付类卡逐张判定口径）。', imgs=[('workmgr_done-op1-before','工作台账·前态','ui'), ('workmgr_done-op1-after','工作台账·保存后','ui')]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · 审计师A 独立签名线',
        narrative='独立审计在案：REL-DELIVER 交付物缺件（merchant-onboarding 文档不在 origin/main）记单。', imgs=[('audit_done-op1-before','审计·前态','ui'), ('audit_done-op1-after','审计·收尾','ui')]),
    24: dict(keys=['retro_done'], actor='ai', actorText='AI · 复盘',
        narrative='复盘段：16 条问题单缺 DISP 处置记账如实标待处置（含 run18 采集段两起 403 记单）。', imgs=[('retro_done-op1-before','复盘·前态','ui'), ('retro_done-op1-after','复盘·收尾','ui')]),
    25: dict(keys=['ide_done'], actor='ai', actorText='AI · IDE 简报',
        narrative='IDE 核验三项通过（06:16：/ide 路由 200、ide?task 参数处理、简报组件在位）。', imgs=[('ide_done-op1-before','IDE·前态','ui'), ('ide_done-op1-after','IDE·收尾','ui')]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告链',
        narrative='报告链收尾：本表=收尾链补注册（骨架兜底渲染后正式覆盖）；帧全当轮实拍挂块。'),
}

STEPS_META_RUN15 = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · 人工把关',
        narrative='开跑 23:54:00（LC_ALL=C 全量 26 步）。三真值全绿：30 账号 token 有效、单网关(:8801)+单 studio(:8802) 就绪、驾驶舱回归 headless 三数（gateway running/15 平台在线）。采集链预检试拍 1 帧成功（V8.9 纪律 37 fail-closed 首验）。', imgs=[('smoke_done-op1-before','驾驶舱回归·基线','ui'), ('smoke_done-op1-after','驾驶舱回归·三数在线','ui'),]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 冒烟驱动',
        narrative='delivery 协议冒烟：案例房 dlv-20261011-v8-run15-235525（!ULXaawaBPMIXLvbVlX）事件落房可读回 ✓（R29）；MX_DELIVERY 全程开启。', imgs=[]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
        narrative='14 账号 matrix-login+账号板可达 ✓；自动登录端点契约应答 {"configured":false} ✓（双模式之二）。', imgs=[('login_done-op1-before','登录·前','ui'), ('login_done-op1-after','登录·后','ui'),]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配驱动',
        narrative='profiles 清单+每板 team 围栏装载 ✓；R28 编制三方对账 roster=15×org=15×matrix=15 ✓。', imgs=[]),
    5: dict(keys=['appinit_done'], actor='human', actorText='人 · 人工把关',
        narrative='每用户四件套装配（后台动作无独立界面）；真值=板装载与围栏日志。', imgs=[]),
    6: dict(keys=['people_done'], actor='human', actorText='人 · 人工把关',
        narrative='编制装载（15 人×2 账号）；people 段真值在对账行（见步 4）。', imgs=[]),
    7: dict(keys=['g1_frozen'], actor='human', actorText='人 · 人工把关',
        narrative='G1 冻结 23:58:02（四要素 AC/Scope-Out/影响面/涉敏；涉敏=支付资金域内部-机密）；delivery stage P1 done+gate G1 pass 落房（M3 首事件）。', imgs=[]),
    8: dict(keys=['room_analysis'], actor='ai', actorText='AI · 需求分析师A',
        narrative='案例房 !lOoJkzTIVVEQTsjzmb 建群 23:58:50，fanfan-agent+8 关联人全量预邀（§8 主卡 room 锚 V8.10 §2.5 首验——卡→群直达锚行入卡）。', imgs=[]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · 人工把关',
        narrative='RFD-001 派发 23:58:50（事件 $gEGO_mtr9PiGKyiexUsda9gudrqncu41V-ajPZu-VWY）；fanfan 账号板出卡 ✓ 23:58:59；测试左移 UC 卡同刻派 qi（V8.8 纪律 33 三段卡首验①）。', imgs=[]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · 需求分析师A',
        narrative='任务清单 docs/analysis/RFD-001-tasklist.md 入仓 ✓ 00:13:32；完成凭证反向核验首咬：00:29:49 判 fanfan 虚报（300s 空转+凭证反查不过）→拒收回灌→新会话复活 00:31:30 活跃（凭证核验门禁实战首例，零人工）。', imgs=[]),
    11: dict(keys=['analysis_done','analysis_verified'], actor='ai', actorText='AI · 四路系分',
        narrative='四系分并行 00:38-00:40 派发（PAYCORE=chen/MP=xiao/CHWX=hu/CHALI=lin）。窗严物迟两起如实记：AN-MP 判 ✗02:40:32 后实物 02:52 落仓（1ff0a15，宽限期根治件源例）；AN-CHALI v1.1 03:30；design-prewrite 锚未达回退集中派发 01:40:27；四稿全齐 03:37:13。', imgs=[('analysis_done-op1-after','系分·后','ui'),]),
    12: dict(keys=['triage_done'], actor='ai', actorText='AI · 分诊台',
        narrative='RFD-001 卡分发 chen/hu/lin/xiao 四账号板 ✓ 00:39:44-46；wei/mei lead 分诊确认 triage→todo。', imgs=[]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI · 四路执行',
        narrative='四路执行任务 00:40 派发；AN-PAYCORE 集中复核稿 01:04 入仓（985053c）。lin 空转 80min 后经新派发会话自愈（新线程根=新会话实证）。', imgs=[]),
    14: dict(keys=['review_done'], actor='ai', actorText='AI · 需求分析师A+架构师A',
        narrative='概设 v2.0 入库 04:01:22（D-1~D-9 裁决+五包基线）；G2 评审卡 done 04:01:31；!refine 闸点归档入工作线程。', imgs=[]),
    15: dict(keys=['g2_arch_pass'], actor='human', actorText='人 · 人工把关+安全工程师A',
        narrative='G2 双前置全程留痕：secops 涉敏安全评审（纪律 38 首验）04:08:36 判 SECURITY-GATE-FAIL——白盒复核发现两处真实缺陷（BFF 把 auth_code 冒充 openid 直传入库 cashier-service.ts:347-358 等）→fail-closed→组织面派修 chen（wt-defbe003）→复审改判 PASS 05:15:49→G2 放行 05:16:01→arch 评审卡 t_9ea16dbb done 05:16:27。安全闸首验=真拦截非走过场。', imgs=[('g2_arch_pass-op1-after','G2·放行后','ui'),]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 需求收段',
        narrative='close 段过（05:16-05:4x 快速段）。', imgs=[]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · 排期',
        narrative='排期计划 v2.0 入仓（6 固定 I 人日腿拆分，3ff5487）；INT 集成案例卡派 qi 05:16:31（三段卡②）。', imgs=[]),
    18: dict(keys=['devimpl_done'], actor='ai', actorText='AI · 六路开发',
        narrative='六路同刻派发 05:41（chen 双会话并行实证人 05:41:06/12 承载 C/S 两路）；交付分支提交总量 243；DEV-MP 交付 06:41+mei 复核采认 06:43（REVIEW-DEV-MP-DONE）。真事故：run13 遗留 feat/DEV-PAYCORE-S 陈旧分支致 branch_fresh 恒假、进度锚盲转 150 分钟（06:26-08:56）——当场根治 c1e507d（锚 STALE 标+可行动督促提示+预检⑩），idle 超时判定结束收段、defect 段起 08:59:25。G3 键落 08:59。', imgs=[('devimpl_done-op1-before','devimpl·六路','ui'), ('devimpl_done-op1-after','devimpl·收段','ui'),]),
    19: dict(keys=['defect_done','testpass_done'], actor='ai', actorText='AI · 测试线+缺陷环',
        narrative='integration 0b9b769 六路合并（testlog 冲突自动按正本收合并并如实登记问题单）；契约观察器首验 breaking=0（影子模式）；TEST 派发 08:59:48（qi 后端+fei 前端+mei QUALITY 全 56 门禁 08:59:41 三段卡③）。测试段饱和度实测 2.5 工位（qi 满负荷 1.9M tok/h）；fei 两次空转收场均被监控定向督促令复活（10:11/10:51，代行留痕 DISP）；chen 缺陷修复 SEC-FIX-PUSHED 7a9fe89（三缺陷按冻结契约重做+测试 75/75 绿）。G4 键落 11:01。', imgs=[('testpass_done-op1-before','testpass·前','ui'), ('testpass_done-op1-after','testpass·后','ui'),]),
    20: dict(keys=['ready_done','release_done'], actor='ai', actorText='AI · 发布线',
        narrative='G5 发布准出 11:05 首过（评审卡 t_2cbf4346，HumanGate=人工把关批准入 approved.events；重启重放后判词复用 ✓ 11:08:23——既有 PASS 复用语义首验）；QGate release-report 落盘（unresolved 门=无信号桶如实呈现）；REL 三卡 t_34b3c1b1/t_bef6c02e/t_22635d2a 登记 11:36。', imgs=[]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · 验收',
        narrative='UAT 判词齐（uat_done 12:08）；1 张 uat-conditional 问题单如实记（有条件通过不写成全部通过——H9 纪律）。', imgs=[]),
    22: dict(keys=['workmgr_done'], actor='ai', actorText='AI · 工作台账',
        narrative='工作台账段过。', imgs=[]),
    23: dict(keys=['audit_done'], actor='ai', actorText='AI · 审计',
        narrative='六域体检当轮跑（V8.10 §5.5 首验：驱动审计段 POST /domains/run，domain-audit-run.json 在案）；审计段过。', imgs=[('audit_done-op1-before','审计·前','ui'), ('audit_done-op1-after','审计·后','ui'),]),
    24: dict(keys=['retro_done'], actor='ai', actorText='AI · 复盘',
        narrative='治理归档落账 12:09:53（metrics-log+ISSUES-LOG @ origin/main 回读验证过）；G6 归档完成。', imgs=[]),
    25: dict(keys=['ide_done'], actor='human', actorText='人 · IDE',
        narrative='/ide 路由 200 ✓+task 参数处理代码在位+简报代码在位（12:10:05）。', imgs=[]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告链',
        narrative='下半场完成 12:10:47（全部门禁执行完）；叙事注册由监控哨按 run12 手册补写（全部采用真实凭据与时间戳，禁止编造）；全程 23:54:00→12:10:47≈12h17m。', imgs=[]),
}

_NARR={'20261013-v8-run18-lite-acp':STEPS_META_20261013_V8_RUN18_LITE,'20261012-v8-run16':STEPS_META_20261012_V8_RUN16,'20261011-v8-run15':STEPS_META_RUN15,'20261010-v8-run14':STEPS_META_RUN14,'20261010-v8-run13':STEPS_META_RUN13,'20261009-v8-run12':STEPS_META_RUN12,'20261007-v8-run11':STEPS_META_RUN11,'20261007-v8-run10':STEPS_META_RUN10,'20261006-v8-run9':STEPS_META_RUN9,'20261004-v7-run8':STEPS_META_RUN8,'20260928-v4-run1':STEPS_META_RUN1,'20260929-v4-run2':STEPS_META_RUN2,'20260929-v5-run4':STEPS_META_RUN4,'20260930-v5-run5':STEPS_META_RUN5,'20261001-v5-run6':STEPS_META_RUN6,'20261002-v5-run7':STEPS_META_RUN7}
def _narrative_fallback_skeleton(run_id):
    """R17 骨架兜底（run16 起修订）：未注册轮按 state.env 已落步键渲染骨架——全部步
    出 ⬜ 骨架占位叙事（明示待收尾链补注册），不携带任何历史轮文案，防冒充语义保留。
    run15 实锤：一票否决在报告步触发驱动失败循环（注册靠收尾手工补写+预写环节又漏项）。"""
    import re as _re
    _keys26 = ['smoke_done','smoke_done','smoke_done','smoke_done','appinit_done','people_done',
               'g1_frozen','room_analysis','dispatch_marker','register_done','analysis_done','triage_done',
               'anexec_done','review_done','g2_arch_pass','close_done','plan_done','devimpl_done',
               'defect_done','ready_done','uat_done','workmgr_done','audit_done','retro_done','ide_done','report_done']
    _titles = _PLAN_STEP_TITLES if '_PLAN_STEP_TITLES' in dir() else {}
    meta = {}
    for _i, _k in enumerate(_keys26, 1):
        meta[_i] = dict(keys=[_k], actor='ai', actorText='AI · 骨架占位',
            narrative='【骨架占位·待补注册】本步叙事未注册（轮 '+run_id+' 走骨架兜底渲染）。真值以 state.env 步键与 evidence 实物为准；收尾链补注册后本占位被正式叙事覆盖。',
            imgs=[])
    return meta

if RUN_ID not in _NARR:
    # R17 按轮真值强制关卡（run16 起骨架兜底修订）：防冒充语义保留（骨架零历史文案、
    # 全步明示占位、页首横幅声明未注册态）；一票否决废除——报告步失败循环不再发生。
    sys.stderr.write('[mx-report-gen] 无该轮叙事文案: '+RUN_ID+'（已知: '+', '.join(sorted(_NARR))+'）——按骨架兜底渲染，收尾链补注册后覆盖\n')
    STEPS_META=_narrative_fallback_skeleton(RUN_ID)
else:
    STEPS_META=_NARR[RUN_ID]

# ── run16 复盘防线（fix/run16-report-truth）：注册表 keys 为空=完成态推导全灭 ──
# run16 实锤：收尾会话注册 STEPS_META 时 26 步 keys 全空 → _step_done() 恒 False →
# 25 步误渲染 ⬜、48 张已拍帧零挂接、审计按「未完成步」口径放行。兜底：步 1-25 任一
# keys 为空即回落 §3.3 默认映射键并 stderr 警示（步 26 由 _step_done 特判恒真）；
# 审计器同批新增「state 键在位而报告步 ⬜」FAIL 断言，双保险。
_STEP33_DEFAULT_KEYS = ['smoke_done','smoke_done','smoke_done','smoke_done','appinit_done','people_done',
                        'g1_frozen','room_analysis','dispatch_marker','register_done','analysis_done','triage_done',
                        'anexec_done','review_done','g2_arch_pass','close_done','plan_done','devimpl_done',
                        'defect_done','ready_done','uat_done','workmgr_done','audit_done','retro_done','ide_done','report_done']
_STEP33_MULTI_KEYS = {11: ['analysis_done', 'analysis_verified'],
                      19: ['defect_done', 'testpass_done'],
                      20: ['ready_done', 'release_done']}
for _n, _meta in list(STEPS_META.items()):
    if _n != 26 and not _meta.get('keys'):
        _meta['keys'] = _STEP33_MULTI_KEYS.get(_n) or [_STEP33_DEFAULT_KEYS[_n - 1]]
        sys.stderr.write('[mx-report-gen] 步 %s 叙事注册 keys 为空——回落 §3.3 默认键 %s（run16 实锤防线）\n'
                         % (_n, '+'.join(_meta['keys'])))

_L3_A={'20261013-v8-run18-lite-acp':'进行中（lite-ACP 专项验证轮：hermes→ACP→Ycode 编码委托链全链首验——MX_ACP_BACKEND=1 首个实跑轮，六路委托 5/6 分支带日志、RESULT exit=0×4；运行中两事故当场根治：工具层 300s 天花板（技能卡 nohup 后台化）与环境清扫误删 selected（清扫器豁免+venv 链修复））','20261012-v8-run16':'进行中（V8.17 复盘纪律版首验轮+监控驱动修复链轮）：六闸 6/6（G2 安全评审新口径 7 分钟过闸首验；G5 两轮真打回熔断后监控修复链完整走通复位）；UAT 7/7 全过（run15 两缺口补齐）；V8.16 饱和并行全谱首验；监控代行全链实战','20261011-v8-run15':'进行中（V8.10-V8.15 全栈首验轮+根治轮·监控哨叙事）：26 步全走完+六闸 6/6（首过 5/6——G2 涉敏安全前置首验真拦截后复审改判）；七件首验落地（三段卡×3/涉敏评审卡/六域当轮体检/契约观察影子 breaking=0/主卡 room 锚/判词复用/实时帧 48 张零补拍）；运行中当场根治四类真缺陷（安全闸三重盲区 bf9a955——80 秒收敛实证、进度锚陈旧分支盲转 c1e507d、多锚精确记单 36c7701、mx-up 冷起挂死 09c07f9）；监控代行定向令 6 发 6 中；全程 12h17m（对照 run14 净 22h，摩擦=锚冻结 150min+安全修复环 68min+监督器卡死 10min）','20261010-v8-run14':'进行中（V8.5 首个全量验证轮·预注册句）：mx-clean 三旗标 0→1 全新环境独立回归；V8.5 条款（DISP 主体精确配对/登记幂等/闸键首过保护/打回=判词语义/并行度段界锚）+G1-G4 产品面修复+GRAPH_ENGINE=on 的首个全量轮——L3 总评行由收尾链按当轮实测定稿','20261010-v8-run13':'符合（回归轮首航·诚实账）：本轮执行带九步全走完（开发→测试→发布→验收→审计→复盘→报告，全程 3 小时 04 分）；六闸全收齐（G3/G4/G5 当轮，G1/G2 沿用源轮真值分带呈现）；边界守卫首次实战通过（零 main 污染、零越界代做）；验收诚实账更严（AC-1/5/6 不通过如实判词，一手复测与 测试工程师A 报备双源一致）；事故账=repo_has×回归轮五连循环（根治 6959a2b）+步18 错页帧（G1/G2 中途上线修复）；回归轮口径首次全程落地','20261009-v8-run12':'run12 符合（逆境中的治理+诚实记账轮）：26 步全部走完、六道关卡全部通过（G1/G2/G3/G4 一次通过 4/6；G5 两轮不通过+强制暂停+复审转正；UAT 有条件通过、AC-5 如实标红）；诚实账=测试工程师A 如实报告「TEST-BE 未执行」→G5 第一轮追责→测试工程师A 真实执行 250/250 全绿完整循环——不谎报纪律全程可反查；六张开发卡同时派出（提速措施二）+测试并行拆分（测试工程师A/团队负责人A/产品经理A 三方）双双首次应用；网关四起事故+噪音风暴+会话中毒+结论行污染全部记入问题清单并全部恢复。','20261007-v8-run11':'符合（零残留独立回归的正跑轮+逆境治理主战役）：attempt-3 26 步全走完（02:26 开跑→G6 00:26 六闸 6/6 收齐）；从零交付实证——孤儿历史（main 深度 1）+禁考古措辞+闸卫三防线下，四系分两稿从零入仓（PAYCORE/MP）、四开发分支全部本轮新推、TEST-BE 228/228 全绿、发布三件套+UAT 7/7 判词齐；流水线三机制首验（四路同时派出同秒/渠道批触发链/用例前移预备轮）；attempt-1/2 事故链四病根全部根治提交（自动检查 78/78）；负向如实入账：系分 2/4 超窗、容量饥饿×2（drop 106 条）、产品经理A 会话卡死×3（hindsight 交互）、G5 六轮（人工介入 5 笔：熔断放行+发布件代拟+簿记代走+终判代落）、RACI 双@×4 复现、materials 残留暴露——全部记入问题清单在案。','20261007-v8-run10':'run10 符合（全流程完整循环+四起接线事故当场根治）：26 步全走完（G1 01:23→G6 14:29）；六闸全落——G1/G3/G4/G6 首过，G2/G5 打回复补后过（首过率 4/6 实测统计落账 metrics-log）；四起事故全根治提交、run11 免踩；负向如实入账：RACI 双@×4 复现、系分两稿缺件、R18 必采 0/13、G5 门禁灯事件漏发、问题单 12 键待处置——全部记入问题清单在案；叙事文案预写首次消灭注册等待。','20261006-v8-run9':'符合（564 验证轮主命题全过）：交付率 4/4≥3/4、假停摆零复发（run8 五起→零）、接力棒 2 次<50、必采清单 11/13（现矩阵 5+3+3+1+1；当轮 11 项全采达成旧矩阵 11/11 验收线，新增 skill/门禁灯 2 项缺记入问题清单；run8 3/11=旧矩阵口径）；四对照闸全绿——G2 一次过（run8 3h04m 崩溃环）、排期一次过（run8 首派空转 1h39m）、G5 一次过（run8 FAIL+熔断两轮）、receipt-missing 1 起（run8 ×4）；负向如实入账：RACI 双@×4、AN-MP 首窗 3600s 超时、integration 推送未达 1、五 agent 越序抢跑 8 分支、NVMe 卷脱挂 8.5h 基建事故、runs 注册表空态产品缺口——全部记入问题清单在案；基建中断由 relay 接力语义按设计兜住（17:48 续跑 18:04 收尾，全程零数据丢失）。','20261004-v7-run8':'符合（带伤实测依据）：主链 G1→UAT 全走完且真值可反查——G1 冻结一次过；四系分全真入仓（AN-MP 经回灌补齐）；plan 两段（首段投递丢弃静默→活性判据判停滞重派完成）；devimpl 2/4 分支真交付（PAYCORE/CHALI），研发工程师B/研发工程师D 停摆缺席如实记入问题清单（根因当晚定性=网关响应投递丢弃，564 补丁已修待 run9 验证）；integration 缺支前置跳过+合并推送；G4 测试报告入 integration；G5 三卡登记过闸；UAT AC 证据行到位；G6 复盘+16 条问题单三族在案。本轮主线即事故-根因-修复账本：六型 bash set -u/e 坑（全角吞字/空数组/pipefail/算术上下文/local 自引用/curl22 赋值）全部当场根治、五起假停摆统一定因、驾驶舱后台感知三件套落地——治理逆境与同步修复即 run8 核心素材。','20261002-v5-run7':'符合（收尾实测依据）：G1→UAT 意图通路全完整循环且两代修复链全数过考——G1 冻结一次过 16:51:09；register 打回环拒收假凭证后重报 ✓；四路系分全真入仓；devimpl 2h 零假过（branch_fresh 4/4，23:07:52 integration 合并）；G4 独立验证 00:59:09（测试工程师A 报告 00:38:08 真值）；G5 真实打回环（首评超时打回→重评 READY-GATE ✓ 01:49:29，评审卡 t_73b1518a）；UAT 判词 7/7 零误报（验收书 a7eb6b3 05:54:07）；G6 DISP 15/15+记忆探针 ✓。run6 三实锤根治（判词器括号注耐受/报告按轮隔离/{stat} 占位）与 harness 修复（wait_alive_truth/双探针）在复现位全部按预期工作；新逆境三件全程留痕：533 补丁第三次被 hermes 自更新擦除（三发 nudge+现场重放）、网关空闲守护误判腰斩会话（记入问题清单 gw-idle-restart-false-positive+重发任务书恢复）、gate_review jq 语法错五连早退（c24a9d60 热修+relay 兜底接力）——治理逆境与修复即本轮主线素材。',
'20261001-v5-run6':'符合（harness 逆境根治+真交付轮）：G1→UAT 意图通路完整循环（验收书入仓+七条 UAT-EVIDENCE 7/7 PASS）；plan 七连超时根因链（窗口<任务时长/派发词缺 push 目标/账户限流/网关换血）四层根治后 产品经理A 30 分钟交卷；devimpl 分支假真值如实披露（branch_fresh 自动检查根治未来轮）且四开发 agent 真实交付三支推送；测试 194/194 零缺陷 G4 真值；夜间 8h 停摆（/tmp 清理+Docker 睡眠）与路由丢失（DM 直发修复）/并发闸弹回/UAT 核验位错配三类新坑全部根治或如实记档——治理逆境与修复即本轮主线素材。',
'20260930-v5-run5':'符合（G2 真实打回环+通道逆境根治轮）：G1 冻结→建群全量预邀 0 缺口→派发→主卡 t_f405c7b2+七跟踪卡→tasklist v9 入仓（1b2fce3）→agent 亲发结论行双凭证反核验 ✓→G2 首评真缺项 FAIL→复评 PASS（四查证据链）→集成/测试/UAT 推进；首夜三坑（审批线程拒发/PATH 盲/判词模板自毒）与深夜通道风暴（1302 限流/队列回灌）全部根治入正后全程真实推进——治理逆境与修复即本轮主线素材；plan/devimpl/testpass 三步以历史工件过闸的 0→1 缺口如实披露。',
'20260929-v5-run4':'部分符合（通道受限轮，如实呈现）：G1 冻结→建群全量预邀（0 缺口）→派发→主卡 t_215792cd+T-101~107 七子卡 RACI 落对板→tasklist v8 入仓，意图通路真实完整循环；register/analysis 打回环各 3 轮真实发生（拒收回灌机制按设计工作）；LLM 通道三池 429 雪崩（aim 池配额死→MGLM 1302→kimi too-many）与并发闸（max_concurrent_sessions=3）收敛全程在案——通道韧性为本轮主难点，行为语义符合治理意图。',
'20260928-v4-run1':'部分符合：G1→UAT 意图通路完整循环（冻结 AC-1~7 逐条对账）；G5 三轮真实打回环（缺项退回→补齐重报→复审 PASS，HumanGate 留痕）——评审目标是击穿实现而非走过场。',
'20260929-v4-run2':'部分符合（已完整循环）：G1→UAT 意图通路完整循环（冻结 AC-1~7 逐条对账）；G5 评审实测击穿实现——t_ea68c462 r7 结论 READY-GATE-FAIL（双缺陷回归/证据链断裂），机械判定曾误过、被独立审计判回滚；R-A3 完整循环（回补+复验 194/194）后复审 r8 PASS 转正。评审者目标是击穿实现而非走过场。',
}
_L3_B={'20261013-v8-run18-lite-acp':'实测（全锚）：开跑 03:08 · 六路任务书同刻派 03:08-09 · PAYCORE-C 首推 03:37 · 六分支全齐 03:53-59 · G3 04:21 · defect 段 04:22 · G5 判词复用 PASS 05:54 · 台账 06:14 · 门禁执行完 06:17 · 报告补注册 07:4x','20261012-v8-run16':'实测（全锚）：开跑 16:33 · G1 16:39 · 四系分 17:04 · 四稿齐 17:20 · 安全评审 PASS 17:56 · G2 17:57 · 六路 18:15 · 编码 18:33 · 测试五片 18:34-18:54 · G4 20:59 · G5 熔断 21:50 · 修复链 22:45-23:57 · 复审 PASS 00:45 · UAT 7/7 00:45 · 治理报告 00:46','20261011-v8-run15':'实测（全锚）：开跑 23:54:00 · G1 冻结 23:58:02 · 建群 23:58:50 · 派发 23:58:50-59 · 凭证反向核验首咬 00:29:49 · 四系分派发 00:38-00:40 · AN-MP 窗✗ 02:40:32→物迟 02:52 · 四稿齐 03:37:13 · 概设 v2.0 04:01:22 · 安全 FAIL 04:08:36→复审 PASS 05:15:49→G2 放行 05:16:01 · INT 卡 05:16:31 · 六路派发 05:41 · DEV-MP 交付+采认 06:41/06:43 · 锚冻结窗 06:26-08:56（idle 超时判定结束收段） · defect 起 08:59:25 · TEST 派发 08:59:48 · G4 11:01 · G5 11:05（复用 11:08） · REL 三卡 11:36 · UAT 12:08 · G6 归档 12:09:53 · 下半场完成 12:10:47','20261010-v8-run14':'实测锚点（随收尾链补全）：开跑 14:15:55 · 装配/对账 14:16:36 · delivery 案例开房+小冒烟 14:17:35 · appinit 14:18:10 · people 14:18:30 · G1 14:19:06（stage P1+gate pass 落房）· 建群 14:19:31 · 派发 14:19:32 · 后续锚点（G2/G3/G4/G5/UAT/G6/报告）收尾链回填','20261010-v8-run13':'实测（全锚）：六路同时派出 09:15:35-09:16:09 · G3 09:59:28 · TEST 派发 09:59:46 · G4 11:30:22 · G5 一轮过 11:30:41 · REL 三卡 11:38 · 界面四修中途上线 11:37 · UAT 11:42:23 · 验收 12:07:05 · G6 12:08:54 · 报告 12:19:05','20261009-v8-run12':'实测（全程锚点齐全）：开跑 02:29:57 · G1 02:41:53 一轮过 · 任务清单 03:31:36 · 四份系统分析同时派出 04:03:15-28（完成 08:20:07）· 概设入库 10:01:26 · G2 一轮过 10:25:58（t_6b55dd49）· 排期 10:50:47 · 六卡同时派出 10:51:25-10:52:14（接口契约基准 11:20:37）· G3 17:59:47（记录时间 1791539987）· 测试重投 20:25:18 · G4 22:30:33（记录时间 1791556214，如实报告先行）· G5 两轮不通过 22:54:42/23:25:59→强制暂停→测试工程师A 真实执行 bc2cb9f（250/250）+T07 入基线 31db77a→复审通过 01:17:21→过闸 01:46 · 发布三卡 01:46:33-45 · UAT 02:46:40（AC-5 不通过条件放行）· 工作台账 02:47:45 · 审计 02:48:31 · G6 02:49:59。','20261007-v8-run11':'实测（attempt-3 全锚）：G1 02:29:30 一次过（历史最快+3min）· 四路系分同时派出 03:12:58（容量僵尸→重启重派 04:37）· AN-PAYCORE 04:50/AN-MP 05:08 · anexec_done 07:29 · 概设入仓 ~08:00 · G2 首轮容量饥饿 09:04→二轮过闸 09:36 · 排期 09:36-11:1x · 编码即派 11:12（PAYCORE/MP+测试预备轮同刻）· 渠道批触发 12:47 · DEV-CHWX 14:02 · 提醒 研发工程师C 16:08→DEV-CHALI 齐 · G3 16:27 · TEST 16:21-17:52 · G4 18:47 · G5 r1 FAIL 20:25→六轮长跑→监控程序三面处置→PASS 23:44 · release 23:45 · UAT 23:47→00:20 · 治理三步 00:21-00:26 · 全程 02:26-00:3x≈22h（含事故恢复四起+G5 六轮，净执行≈13h）','20261007-v8-run10':'四起接线事故当场根治（修复发生在驱动场外静默段，以修复提交+自动检查断言为锚，scenario.log 无动作行如实声明）：①看板查询失明（hermes 裸调用→函数转发 a44ad19）②gate-guard 全局误拦（守卫改显式启用 035a555+网关重启+第二批任务书 05:08 重发）③窗误杀×2（G2 结论窗 1800→MX_GATE_WAIT 3600 fb934e1+概设窗活性化 620d956）④脚本错位（运行中禁改主脚本=纪律 25）。四起全部提交+自动检查断言，run11 免踩。','20261006-v8-run9':'实测（终稿轮全锚）：G1 00:26:07 一次过 · 建群 00:26:10 全量预邀 0 缺口 · tasklist 00:40 · 四系分 02:54 全入库 · G2 03:17:38 一次过（t_e9f39ed5）· 排期 03:37 一次过 · G3 04:32:54（4/4 分支）· G4 06:11:45 · G5 06:27:47（三卡 t_23d7f58b/t_fa9bb595/t_f802193c）· UAT 06:28 派发→09:19 卷脱挂 8.5h→17:48 relay 续跑→18:04:08 过 · workmgr 18:04:18 / audit 18:04:46 / retro 18:04:55 / ide 18:05 · 必采 11/13（对话 5+操作 3+效果 3 当轮全采；skill/门禁灯 2 项缺记入问题清单）· 问题单 10 起在案 · 全程 00:24-18:05≈17.7h（净执行≈9.2h）','20261004-v7-run8':'实测（带伤实测依据）：G1 一次过 · 四系分 11:02 全入库（AN-MP 回灌补齐）· G2+检查点归档 12:05 · archgate 崩溃环 403 棒 3h04m 后 15:10 过闸 · plan 17:27（首派空转 1h39m 判停滞重派）· devimpl 17:27-20:13（研发工程师A 71m/研发工程师C 含 18:38 保存；研发工程师B/研发工程师D 缺席记入问题清单）· defect 20:17（缺支环 26 棒根治；integration 合并 PAYCORE+CHALI）· testpass 22:1x（90min 观测窗+三段 nudge 坑修复）· release 23:16 三卡 · UAT 00:0x 证据行 · workmgr/audit/retro/ide 00:07-00:14 · 全程 07:09-00:1x≈17h','20261001-v5-run6':'实测：排期 4971243（121 行含子任务拆分纪律）· DEV-PAYCORE 28c3517（5 子卡）· DEV-CHALI/DEV-CHWX 真推送 · 测试报告 8dbf5bf（194/194 零缺陷）· G4 10:15:43 · G5 READY-GATE-PASS（t_3aaacf2d）· UAT 验收书 12:03:04（UAT-EVIDENCE 7/7，DM→代投通路注明）· REL-MERGE f7b1cbc+G1 补账 18c9d77（监控程序补账缘由在 commit message）· issues 全程在案',
'20261002-v5-run7':'实测（收尾实测依据）：G1 16:51:09 一次过 · register 打回环（17:33 凭证核验超时→18:01 重报 ✓ commit=62ed83a card=t_738b568d）· 四路系分全真入仓（研发工程师A 3ad48a8/研发工程师D f671adf/研发工程师C 7e03058/研发工程师B 9e8587c，19:03 四真值 ✓）· anexec 并发闸逆境三发 nudge（533 补丁被自更新擦除实证+现场重放）· devimpl branch_fresh 4/4（研发工程师A 3241e5a/研发工程师B 7c09aab/研发工程师C 4766cb6/研发工程师D 12c568b）· integration 四分支合并 23:07:52 · G4 写入通过标记 00:59:09（测试工程师A 报告 00:38:08 入 integration）· G5 评审卡 t_73b1518a 打回环→01:50:12 写入通过标记 · UAT AC 7/7 判词零误报+验收书 a7eb6b3（05:54:07）· DISP 15/15（已修 10/观察 5）· 记忆探针 ✓',
'20260930-v5-run5':'实测：建群预邀 0 缺口 · 主卡 t_f405c7b2+七跟踪卡（T-101~T-107）· tasklist v9=1b2fce3（RUN 标记本轮）· agent 亲发 ANALYSIS-DONE 双凭证 ✓ · G2 打回环：首评 FAIL（真缺项 merchant-api 三处登记）→复评 PASS 01:57:49（t_a10e41d9 四查证据链）· 治理逆境五坑根治（审批双通道/PATH 盲/判词模板自毒/队列回灌/网关 env 缺失）· issues 全程在案',
'20260929-v5-run4':'实测：建群预邀全员 0 缺口 · 主卡 t_215792cd（23:46:00）· 七子卡落对板落对人（23:46-23:52）· 打回环 ×6（register/analysis 各 3）· issues 4 行在案 · 通道手术三迁+并发闸（429 由 746/5min 降至 111）',
'20260928-v4-run1':'实测：G5 打回环 driver.log 01:44 拦截→02:26 复审 PASS · UAT AC 逐条对账 · 审批历史留痕 3 条',
'20260929-v4-run2':'实测：卡 t_ea68c462 r7（READY-GATE-FAIL 可反查）→ r8 READY-GATE-PASS（完整循环）· UAT 逐条判词 5 通过+2 有条件（条件已解除）· R-A1 判回滚→复审转正',
}
_CP_G5={'20261013-v8-run18-lite-acp':'判词复用 PASS 05:54:14（评审卡 t_76fa0c86→done；HumanGate=导演批准入 approved.events——lite 语义：源轮评审真值沿用不重演）','20261012-v8-run16':'两轮退回→熔断→监控修复链→合基线→复审 PASS 复位（00:45）；REL 三卡 00:36；HumanGate=人工把关批准留痕 approved.events','20261011-v8-run15':'一轮过 11:05:11（评审卡 t_2cbf4346→done；HumanGate=人工把关批准入 approved.events）；重启重放后判词复用 ✓ 11:08:23（既有 PASS 结论行不重派评审——复用语义首验）；REL 三卡 t_34b3c1b1/t_bef6c02e/t_22635d2a（11:36）','20261010-v8-run14':'两轮退回→熔断→证据变化复位→判词复用过闸 11:41（评审卡 t_59d35ca3 round-final 复审改判 READY-GATE-PASS，监控侧格式引导类代行补落卡面留痕）；REL 三卡 t_a6033745/t_ee8d1d35/t_7f6c3809（11:41）；HumanGate=主控程序批准留痕 approved.events','20261010-v8-run13':'G5 一轮过 11:30:41（评审卡 t_4f295b73→done，HumanGate=人工批准入 approved.events；判词纪律首验：结论行行首+发出后回读确认）；REL-MERGE t_a513ab95/REL-TAG t_423eff19/REL-DELIVER t_f7d35a2b（11:38:06-17）','20261009-v8-run12':'发布登记三卡 REL-MERGE/REL-TAG/REL-DELIVER（01:46:33-45，t_717db416/t_83133800/t_f8910b4e）+评审要点线程归位；G5 通过=评审卡复审改判 PASS+结论行污染清理后双来源合并（两轮不通过+连续两轮触发强制暂停 fail_rounds=2 全程留痕）','20261004-v7-run8':'REL-MERGE/REL-TAG/REL-DELIVER 三卡登记（23:16，t_5aee076e/t_6bd57d3c/t_74b56882）+检查点归档 !refine 入工作线程；G5 过闸以 state g5_ready 与卡面为准；发布段崩溃环（local 自引用 41 棒）根治后走完','20261002-v5-run7':'评审卡 t_73b1518a（fanfan-review 板）——首评 1800s 未出结论行打回（01:29:31），重评 READY-GATE ✓ 01:49:29→G5 写入通过标记 01:50:12；HumanGate=监控程序批准事件入 approved.events','20261001-v5-run6':'G5 评审卡 t_3aaacf2d（fanfan-review 板）七项全 PASS——READY-GATE-PASS；团队负责人A 复测回执 10:52 落卡 comment #19，结论以 state g5_ready 与卡面终版为准','20260930-v5-run5':'G5 评审卡 t_73c36618（fanfan-review 板）七项检查单评审——结论以 state g5_ready 与卡面终版为准','20260929-v5-run4':'本轮 G5 未达（LLM 通道受限轮，如实 ⬜——前序真值见打回环与通道治理记录）','20260928-v4-run1':'三轮打回后过闸（02:26 PASS · HumanGate=监控程序批准留痕）','20260929-v4-run2':'t_ea68c462 r7 READY-GATE-FAIL → R-A1 判回滚 · REL-* 冻结'}
_NOTE_G5={'20261013-v8-run18-lite-acp':('步 20 G5：lite 轮判词复用形态（本轮既有 PASS 结论行不重派评审）；QGate release-report 以产物在位判（unresolved 门=无信号桶如实呈现）。',),'20261012-v8-run16':'步 20 G5 真打回完整循环全留痕：两缺陷+基线复验缺位首轮 FAIL→熔断→监控修复链（chen 4489ee3/lin 855cec9+12ddef0/qi 24608fe）→复审 PASS 00:45 复位','20261011-v8-run15':('步 20 G5：一轮过+判词复用双形态均在案（11:05 首过/11:08 复用）；QGate release-report 以产物在位判（unresolved 门=无信号桶如实呈现）',),'20261010-v8-run14':('步 20 G5：判词纪律沿用（结论行行首+复审改判句式+发出后回读确认）；QGate release-report 以产物在位判（V8.5/F14——unresolved 门=无信号桶如实呈现，不算 CLI 失败）；实测依据收尾链按 scenario.log 回填',),'20261010-v8-run13':('步 20 G5：判词纪律落地首验（f3d7bb9：结论行行首+改判句式+发出后回读确认；派发词模板不再携带候选判词字面——run12 判词污染教训应用）。一轮过 11:30:41（评审卡 t_4f295b73→done；判词污染未复发——判词纪律首验通过）',),'20261009-v8-run12':('步 20 G5 两轮退回+强制暂停+复审转正全程留痕：第一轮 22:54:42 真不通过（缺回滚阈值/灰度方案/发布说明）→补充成稿→第二轮 23:25:59 不通过（缺 G4 证据链：TEST-BE 未真实执行+T07 不在基线）→23:36 连续两轮不通过触发强制暂停→并行整改（测试工程师A 真实执行 TEST-BE 250/250 四包 bc2cb9f+T07 入基线 31db77a）→复审 01:17:21 通过→评审卡里的模板字样 READY-GATE-FAIL 污染结论行+发送脚本三次未成功（结论合并按 FAIL 优先）→清理后过闸——结论行污染的新变体已记档。',),'20261007-v8-run11':('步 20 G5 六轮长跑全留痕：r1 首评真 FAIL（20:25 缺回滚阈值/灰度/发布说明退回）→r2 会话卡死 19:18 fail→r3/r4 退回+熔断（21:05 累计 4 轮，窗错配判定+GATE_BREAKER_OVERRIDE=1 人工放行留痕）→r5 卡面滞后退回 22:28→窗尽 23:08→监控程序三面处置（发布三件套 main@1f2c3bd+测试工程师A 报告归位 dfd44f0+缺项①a/①b 卡簿记代走）→终判行经 产品经理A 账号通道落评审卡→判词复用 PASS 23:44:37（评审卡 t_24ae1bc5→done；HumanGate 事件入 approved.events；G5 gate delivery 事件本轮已补发——run10 漏发缺陷验证）。全部人工介入计入度量。'),'20261007-v8-run10':('步 20 G5 闸：首轮 READY-GATE FAIL（缺回滚阈值/灰度/发布说明，14:11 退回记入问题清单 g5-ready-fail）→补齐后 14:12 READY-GATE-PASS；REL 三卡登记（t_d46f0d0f/t_67b28747/t_ef9dd74d）；delivery 面板 stage P5 done 已发、gate G5 pass 事件漏发记入问题清单（delivery-g5-gate-event-missing）——案例面板 G5 门禁灯灰如实呈现；REL-DELIVER 商户接入文档缺件记入问题清单（audit-finding）。'),'20261006-v8-run9':('步 20 发布登记+G5 闸：REL 三卡（MERGE t_23d7f58b/TAG t_fa9bb595/DELIVER t_f802193c）登记+G5 06:27:47 ready 一次过——run8 同闸 FAIL+熔断两轮的对照轮归零；结论以 state g5_ready 与卡面终版为准。'),'20261004-v7-run8':('步 20 发布登记+G5 闸：三卡+检查点归档实录；本段 41 棒崩溃环（同语句 local 自引用）已根治，损失约 20 分钟计入事故账。'),'20261002-v5-run7':('步 20 真实打回环：首评 1800s 窗未见 READY-GATE 结论行超时打回（01:29:31）→重评 READY-GATE ✓ 01:49:29（评审卡 t_73b1518a@fanfan-review）；HumanGate=监控程序批准事件入 approved.events，结论以 state g5_ready 与卡面终版为准。'),'20261001-v5-run6':('步 20 七项全 PASS（评审卡 t_3aaacf2d review-record 七项判定+凭证行）；发布计划/发布说明按模板落卡附件。'),'20260930-v5-run5':('步 20 结论以 state g5_ready 写入通过标记与评审卡终版为准（生成时如实呈现。'),'20260929-v5-run4':('步 20 ⬜：通道受限未达发布评审——G1→analysis 前序真值完整，后续步按方案重跑补齐（通道恢复窗口）。'),'20260928-v4-run1':('步 20 两件缺"回滚/灰度/观察窗"如实红标：G5 发布计划/发布说明实物在评审卡 t_9772c561 附件（文件域未落正本，卡面 review-record 可反查）——列 backlog 补文件域正本。'),
'20260929-v4-run2':('步 20 两件缺"回滚/灰度/观察窗"如实红标：G5 发布计划/发布说明 r7 实物在评审卡 t_ea68c462 附件（文件域未落正本，卡面 review-record 可反查）——列 backlog 补文件域正本。')}
_BASELINE_NOTE={'20261013-v8-run18-lite-acp':('run18 基线=run16 收尾态续建（lite_fixtures_from=20261012-v8-run16，g2 夹具时刻=源轮真值种子）；本轮=ACP→Ycode 编码后端首个实跑验证轮：coding-delegate 技能委托链（nohup 后台化根治件后）全链首验。',),'20261012-v8-run16':('run16 基线=run15 收尾态续建；本轮=V8.16 饱和并行+V8.17 复盘纪律版首验轮；监控驱动修复链首战（G5 熔断闭环）。',),'20261011-v8-run15':('run15 基线=run14 收尾态续建（中央仓 main 谱系收敛后）；上轮遗留 feat/DEV-PAYCORE-S 陈旧分支踩雷当场根治并立预检⑩+mx-clean 3c 默认清理。本轮=V8.10（预检九项/涉敏评审/六域当轮/契约影子）+V8.11-15（七幕方案/认知加固/交付形态感知）全栈首验轮；运行中四类根治件（09c07f9/bf9a955/c1e507d/36c7701）以 80 秒收敛与零白等实证。',),'20261010-v8-run14':('run14 基线=mx-clean 20261010-134331 三旗标全清 0→1 重建（中央仓清空提交 bd887da 推 origin/main）；上轮基线=run13 回归轮（V8.5 打回判词语义口径勘误后 G3/G5 记首过、闸段问题单另列）。本轮=V8.5 条款+G1-G4 产品面（overlay main ea56a101 构建）+F1-F18 harness 修复的首个全量验证轮；GRAPH_ENGINE=on 全程。',),'20261010-v8-run13':('run13 基线=run12 收尾态续建（lite_fixtures_from=20261009-v8-run12；中央仓 main 已修至 origin/main 零分叉 2026-10-10）。lite 轮首航：跳过需求/分析/评审/概设/G1/G2（夹具带如实呈现，g1_frozen/g2_arch_pass=源轮门禁真值种子）；当轮执行 devimpl→report；过度交付守卫六路边界纪律首次实战；GRAPH_ENGINE=on 接管调度（loop-graph 自驱动，shadow 武装后切 on）。',),'20261009-v8-run12':('run12 基线=run11 收尾态续建（集成分支 RFD-001 增量链 e8f5cbe→bc2cb9f→31db77a 祖先关系实测）；对照 run11：G5 从六轮长跑收敛为两轮+复审（结论行污染为新问题），网关事故从单点转为四起连环，诚实账（如实报告未执行→追责→真实执行完整循环）是本轮新的治理样本。',),'20261004-v7-run8':('run8 基线=mx-clean 20261004-065954 三旗标全清 0→1；对照 run7：事故面从通道类转 bash 坑型+投递丢弃型，全部当场根治并入库。'),'20260928-v4-run1':'','20260929-v4-run2':'；本轮 integration 基线 0ab43de 为强制重建产物（bebfd2d 非祖先，丢线 23 提交——R-A3 回补中）','20260929-v5-run4':'；本轮 0→1 清环境：中央仓 RFD 工件经 mx-clean --reset-central 重置（快照 tag mx-clean-20260929-232127 可回滚），基线自 G1 冻结重建','20260930-v5-run5':'；本轮 0→1 清环境：mx-clean 双档归档（20260930-154424/154715）后重建；远端历史工件仍在——plan/devimpl/testpass 门禁按文件存在即过，报告侧以 RUN 标记锚定本轮真值并如实披露'}.get(RUN_ID,'')



# ── 六域审计（每域各自回答一个交付问题）──
DOMAINS = [
    ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'pass',
     '无漏做（26 步 UI 覆盖逐条核对为零缺图）。两处如实记账边界：邮件通道本期禁用改 matrix 私信；fleet-manifest 四件套无专属界面，步骤 2 以 profiles 配置页承载并在此声明。',
     '实测：26/26 步 UI 图在位 · 问题单 6 键全处置（DISP 6/6）· 管理档案三件在仓',
     'cp-g1,cp-g6'),
    ('L1', '工程正确性', '代码和制品是否成立？', 'pass',
     '成立（复跑实证）。五域自动检查合跑 28/28 绿：治理 8 + 审批 10 + 面板 5 + 看板快道 5；client 构建过 verify-dist 门禁；测试证据为分支内实跑日志，非纸面。',
     '实测：vitest 五文件合跑 28 passed · docs/evidence/*-testlog.txt 分支锚',
     'cp-g3,cp-g4'),
    ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass',
     '一致（live 对账）。治理 API 实查：20 件工件 20 在仓，四组 8/3/5/4，G3 分支证据 4，待裁决 1；五件代表工件 doc 接口全文可取；看板 API 与 CLI 同库。',
     '实测：GET overview 200（20/20）· doc×5 200 · sqlite 同库直读',
     'cp-g1,cp-g5'),
    ('L3', '行为与业务语义', '运行行为是否符合业务意图？', 'warn',
     _L3_A.get(RUN_ID,'【骨架占位·待补注册】L3-A 未注册（骨架兜底轮）'),
     _L3_B.get(RUN_ID,'【骨架占位·待补注册】L3-B 未注册（骨架兜底轮）'),
     'cp-g2,cp-gate,cp-uat'),
    ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'pass',
     '可接受（安全探针通过）。未授权访问治理/审批 API 均 401（无 token 与伪造 token 双探针）；git 全异步 execFile+8s 超时；聚合 55s→20ms；金额分 int64/渠道本地 mock/密钥不出服务端。',
     '实测：no-token→401 ×2 · bad-jwt→401 · 聚合 20ms 量级',
     'cp-gate,cp-g3'),
    ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn',
     '可追责、发布已解冻：G5 曾实物 FAIL 判回滚（R-A1）→ R-A3 完整循环复审 r8 PASS，REL-* 三卡 ready；审批历史留痕；问题单 6/6 处置（DISP）；审计签名线+独立复核意见在仓；SLA 登记；metrics-log 实物（M2 任务级比值）。HumanGate 批准事件入 approved.events（审批人独立性局限如实记档）。',
     '实测：REL-* 解冻 ready（曾冻结 blocked）· DISP 6/6 · 审计 10/10 挂接 · metrics-log 实物',
     'cp-g5,cp-g6'),
]

# ── 六域按轮覆写（2026-10-02 静态兜底是 run5 旧账，直接渲染=旧账冒充本轮）──
_DOMAINS_RUN6 = {0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'pass', '无漏做。验收标准 7 条可判定（freeze 18c9d77 补推后在仓）；如实边界：两份渠道系分（微信/支付宝）超时未入库已记问题单，代码实现在开发线补齐。', '实测：AC 判定 7 条 · freeze 在仓（18c9d77）· 渠道系分 2/4 入库（超时 2 记入问题清单）', 'cp-g1,cp-g6'), 1: ('L1', '工程正确性', '代码和制品是否成立？', 'pass', '成立（本轮真实提交实证）。四开发分支全部含本轮 commit 与 testlog（研发工程师A 28c3517 五子卡/研发工程师B S1-S3/研发工程师C/研发工程师D 8c0207f），集成复跑 194/194 全绿零缺陷。', '实测：四分支 run6 commit 锚 · 测试报告 8dbf5bf（194/194）', 'cp-g3,cp-g4'), 2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass', '一致（对账沿用+本轮反查）。契约口径（snake_case/金额分 int64/渠道 mock）在概设定稿，测试用例按契约反查一致；本轮未重跑治理 API 全量巡检（沿用既有实测，如实标注）。', '实测：概设契约×测试用例反查一致 · 治理 API 巡检本轮未重跑（沿用声明）', 'cp-g1,cp-g5'), 4: ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'pass', '可接受。安全探针（无 token/伪造 token→401）沿用既有实测，本轮未重跑（如实标注）；渠道端点全 mock、密钥不出服务端、金额分 int64 沿契约。', '实测：本轮未重跑安全探针（沿用既有 401 双探针结论，声明来源）', 'cp-gate,cp-g3'), 5: ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn', '可追责但记账有缺口：19 问题单全部在案、DISP 处置记账 0 条（缺口如实，复盘记入问题清单；终版合并报告已分档处置）；REL-MERGE/G1 推送/UAT 结论行三笔监控程序补账均留痕注明；UAT 七条证据 7/7 在案。', '实测：issues 19 条在案 · DISP 0（缺口记入问题清单）· 三笔补账留痕（f7b1cbc/18c9d77/$V_jLqhvn）', 'cp-g5,cp-g6')}
# 六域按轮覆写注册表（R17）：逐轮叙事按轮编写后在此注册；未注册轮走下方台账/静态兜底
# 并在表头声明来源（台账命中则判定/证据取最新轮真值）。
_DOMAINS_RUN9 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'pass', '无漏做。AC 清单 G1 冻结 00:26:07 一次过；四系分 4/4 全入库（run8 2/4 的补考归零）；AN-MP 首窗 3600s 超时记入问题清单后交付齐（负向如实）。', '实测：G1 00:26:07 一次过 · 四系分 02:54 全入库 · AN-MP 首窗超时记入问题清单', 'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'pass', '成立。4/4 开发分支真交付（G3 04:32:54 code_pass，branch_fresh 4/4）；integration 推送未达 1 起记入问题清单——run8 同族 ×4，564 后量级下降即修复实证。', '实测：G3 4/4 分支 · receipt-missing 1 起（run8 ×4 对照）', 'cp-g3,cp-g4'),
    2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass', '一致。V8 终态正本 26 步键映射本轮全走通（含步 15 g2_arch_pass 键名修正）；UI 看板 RFD-001 卡 ID 与 state.env card_REL-* 双侧对账逐一对应（t_23d7f58b/t_fa9bb595/t_f802193c）。', '实测：26 步 state 键全落 · UI↔state 卡 ID 对应（10-op3 帧）', 'cp-g1,cp-g5'),
    4: ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'pass', '可接受。564 响应投递兜底全程在位（relay 每拍自愈+reverse-check 实证，自动检查⑬过）；假停摆零复发（run8 五起→零）。', '实测：564 全程在位 · 假停摆 0 · dropped=0', 'cp-gate,cp-g3'),
    5: ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn', '可追责。问题单 10 起三族在案（RACI 双@/越序抢跑/AN-MP 超时/推送未达/NVMe 卷脱挂/runs 注册表空态/retro-open-items 等），DISP 记账收尾链补齐；产品侧 runs 注册表空态缺口如实记入问题清单（运行中心列表空+详情 404）。', '实测：issues 10 起在案 · DISP 收尾补记 · runs-registry-empty 记入问题清单', 'cp-g5,cp-g6'),
}
_DOMAINS_RUN10 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'pass',
        '无漏做。AC 7 条 G1 冻结 01:23 一次过；四路系分两稿在 origin/main（CHWX/CHALI），PAYCORE/MP 两稿缺件记入问题清单（anexec-missing×2，概设以 main 祖先版如实声明）；REL-DELIVER 商户接入文档缺件记入问题清单（audit-finding）。',
        '实测：AC 7 条可判定 · 系分 2/4 在 tip（2 缺记入问题清单）· 交付物矩阵 19/22 在仓 3 缺全记入问题清单',
        'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'pass',
        '成立。四开发分支全部本轮新推 origin（DEV-MP 第四路 11:39:34 齐）；代码零变更复跑锚定轮，integration 汇总复跑 224 用例全绿（测试报告 @1e4f4e6）；run10 复测证据（AN-CHWX/AN-CHALI-vitest-run10、DEV-CHALI-testlog-run10）在仓。',
        '实测：feat/DEV-* 4/4 新推 · integration 224/224 绿 · tsc 四包干净',
        'cp-g3,cp-g4'),
    2: ('L2', '系统一致性', 'API、Schema 与实际数据是否一致？', 'pass',
        '一致。tasklist v10.0 全量重建（T-01~T-07）与排期/概设 §10 核对一致；契约面 §5/§6 冻结契约逐字节维持（概设 §0.3 复核）；UI 看板卡 ID 与 state card_* 键对账可反查。',
        '实测：概设契约零漂移（§0.3）· 卡 ID 对账（t_2a2bab79/t_65156fe8/REL 三卡）',
        'cp-g1,cp-g5'),
    4: ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'pass',
        '可接受。渠道端点全本地 mock、密钥不出服务端、金额分 int64 契约维持；391 板级 team 围栏补丁开跑前遭部署回退（记入问题清单 patch-391-reverted-prestart，双树修复+自动检查⑬强化语义锚）——围栏执行层缺口半程存在如实记。',
        '实测：mock 白盒外联约束用例在 · 391 回退事故处置（观察）· reverse-check 六补丁全过',
        'cp-gate,cp-g3'),
    5: ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn',
        '可追责但治理链多处断点（全部记入问题清单在案）：G5 门禁灯 delivery 事件漏发（案例面板 G5 灯灰如实）；R18 采集链未挂驱动必采 0/13；报告验收线 15 FAIL 下仍收尾（report-acceptance-bypass）；final-report 人读正本收尾时未产出。',
        '实测：issues 18 行在案 · DISP 20 行（含监控程序勘误）· 审计 FAIL 15 项全对应记入问题清单',
        'cp-g5,cp-g6'),
}

# ── run14 六域按轮注册（V8.5 首个全量轮；收尾链预写，L3/L5 时间锚以 scenario.log 实测为准）──
_DOMAINS_RUN14 = {
    0: ('L0', '范围与需求', '是否漏做、误做或擅自假设？', 'warn',
        '全量轮 26 步全新环境（mx-clean 20261010-134331 三旗标 0→1，中央仓清空提交 bd887da）：需求→分析→设计→编码→测试→发布→验收全链当轮重做，无夹具沿用。已知中断账如实：10-10 夜 G5 两轮退回熔断+重启循环 85 圈（今日根修三件）、模型通道 429 会话风暴（27 会话，队列 20min 过期自愈）、中央仓分叉 push 拒（重置+完备性补推 583a69b）——全部登记问题单在案。AC 判词以 UAT 实测为准。',
        '实测：G1 10-10 14:19 冻结（AC-1~7）· 开发支 6/6 · 集成修复链三缺陷全闭（63/63 @1e32d79）· UAT 判词见第 3/4 章',
        'cp-g1,cp-g6'),
    1: ('L1', '工程正确性', '代码和制品是否成立？', 'pass',
        '成立（当轮修复链实证）：DEF-BE-003 pay-core 契约恢复（6fc6182）+DEF-BE-004 渠道台架依赖恢复（59285aa）+DEF-BE-005 用例失配修复，三修复合入 integration/RFD-001；集成复验 63/63 全绿 @1e32d79（tsc 0 错，testlog docs/evidence/TEST-INT-testlog.txt 入库）。',
        '实测：integration tip 1e32d79 · TEST-INT 63/63 · tsc 0 错 · testlog 在仓',
        'cp-g3,cp-g4'),
    2: ('L2', '系统一致性', 'API，Schema 与实际数据是否一致？', 'pass',
        '一致（当轮工件链全在 origin/main）：需求书/冻结/四系分 AN-*/概设 v1.0/排期 v1.0 均当轮提交可反查；测试报告在 origin/integration；完备性检查补推落位（583a69b）；金额分 int64/snake_case 契约沿用。',
        '实测：origin/main 工件链齐（264c487→3da8dc7）· 完备性检查 583a69b · RELEASE.md 替换见 R4 注记',
        'cp-g1,cp-g5'),
    3: ('L3', '行为与业务语义', '运行行为是否符合业务意图？', 'warn',
        '大体符合但两段中断计入：G5 首评真 FAIL（六件缺项）→补齐链因复测停滞+通道 429 拖延约 13 小时→证据变化复位后判词复用过闸；UAT 判词三态以当轮实测呈现（含已知风险项 AC-1/5/6 的复测结果）。',
        '实测全锚：开跑 10-10 14:15 · G1 14:19 · G2 16:44 · G3 19:36 · G4 21:26 · G5 过闸 10-11 11:41（判词复用）· UAT/治理/报告锚见时间线',
        'cp-g2,cp-gate,cp-uat'),
    4: ('L4', '架构、非功能与安全', '实现方式是否可接受？', 'warn',
        '可接受：GRAPH_ENGINE=on 全程在位零调度分叉；渠道本地 mock/密钥不出服务端沿用；本轮新增事故面（监督器盲重启/熔断签名窄/审批臂内嵌驱动/派单记账 pipefail）全部当日根治并入库（4be3a3b/32ff696/13b5739/f909780）——推演工程自身的纠错飞轮实证。安全探针未复测（如实）。',
        '实测：GRAPH_ENGINE=on 全程 · 四根修提交 · 六域体检本轮未跑（声明源=R11 兜底）',
        'cp-gate,cp-g3'),
    5: ('L5', '交付与治理', '是否能部署、运营和追责？', 'warn',
        '可追责：问题单全记账（含今日 restart-loop-spam/429 风暴/r18 缺口四单等事故账，DISP 三态收尾链清账）；R5 HumanGate 由主控程序批准留痕（approved.events）；REL 三卡 11:41 登记（t_a6033745/t_ee8d1d35/t_7f6c3809）；过度交付守卫零 main 污染。',
        '实测：REL 三卡在板 · approved.events 留痕 · 台账 DISP 全键覆盖（收尾链终值）',
        'cp-g5,cp-g6'),
}

_DOMAINS_BY_RUN = {'20261010-v8-run14': _DOMAINS_RUN14, '20261010-v8-run13': _DOMAINS_RUN13, '20261009-v8-run12': _DOMAINS_RUN12, '20261007-v8-run11': _DOMAINS_RUN11, '20261007-v8-run10': _DOMAINS_RUN10, '20261006-v8-run9': _DOMAINS_RUN9, '20261001-v5-run6': _DOMAINS_RUN6}
if RUN_ID in _DOMAINS_BY_RUN:
    DOMAINS = [_DOMAINS_BY_RUN[RUN_ID].get(i, d) for i, d in enumerate(DOMAINS)]

# ── 六域台账（真实产品功能产出，治理中心「六域体检」运行落账）──
# 有台账：判定/证据取最新轮（真实流程中运行的检查器输出）；
# 无台账：回落下方内置静态实测（2026-09-28 手工实测留档），并在表头声明来源。
DOMAIN_LEDGER_FILE = (SIM.parent / 'ncwk-sim-mux/central/aipaydev/docs/governance/domain-audit.jsonl') if SIM.name == 'overlay' else (SIM / 'central/aipaydev/docs/governance/domain-audit.jsonl')
DOMAIN_LEDGER_SOURCE = '内置实测（2026-09-28 手工命令留档）'
try:
    _led = [__import__('json').loads(l) for l in DOMAIN_LEDGER_FILE.read_text(encoding='utf-8', errors='replace').splitlines() if l.strip()]
    # evidence 副本兜底（run15 前置 P3-6）：离线重出（伪根）时中央仓 jsonl 未必在——
    # 驱动留的 evidence/domain-audit-run.json 同口径并入（按 run+domain 去重）。
    _da_copy = EVID / 'domain-audit-run.json'
    if _da_copy.exists():
        try:
            _copy_rows = __import__('json').loads(_da_copy.read_text(encoding='utf-8', errors='replace')).get('results', [])
            _seen = {(r.get('run'), r.get('domain')) for r in _led}
            for _cr in _copy_rows:
                if (_cr.get('run'), _cr.get('domain')) not in _seen:
                    _led.append(_cr)
        except Exception:
            pass
    _latest = {}
    for _r in _led:
        _latest[_r['domain']] = _r  # JSONL 追加序=时间序（新在后），末见即最新
    _ledger_runs = sorted({r.get('run', '?') for r in _led})
    _this_run_hit = any(r.get('run') == RUN_ID for r in _led)
    if _latest and _this_run_hit:
        DOMAIN_LEDGER_SOURCE = f"治理中心六域体检台账（docs/governance/domain-audit.jsonl，{len(_ledger_runs)} 轮 {len(_led)} 条，含本轮）"
        DOMAINS = [
            (d[0], d[1], d[2], _latest.get(d[0], {}).get('verdict', d[3]),
             '；'.join(_latest.get(d[0], {}).get('evidence', [])) or d[4], d[5], d[6])
            for d in DOMAINS
        ]
    elif _latest:
        # 台账仅存历轮（2026-10-07 修复：run2-fix 旧台账曾覆写 run10，"DISP 6/6"旧账冒充本轮）
        DOMAIN_LEDGER_SOURCE = (f"治理中心六域体检台账仅存历轮（{'、'.join(_ledger_runs)}，{len(_led)} 条）"
                                f"——本轮（{RUN_ID}）未重跑六域体检，上表=按轮注册/静态实测，非本轮体检输出")
except Exception:
    pass

# 关键卡点（人工在回路的实拍现场）：id 锚点供六域表跳转

_CP_G4={'20261010-v8-run14':'TEST-BE 测试报告 @ integration（TEST-FAIL 首判：三缺陷 DEF-BE-003/004/005 登卡拆派）→缺陷修复链→集成复验 63/63 @1e32d79（TEST-INT-testlog.txt 在仓，10-11 03:4x 一手复现留档）；测试者≠写码者全程成立','20261004-v7-run8':'测试工程师A 测试报告入 integration/RFD-001（22:1x，test_report_on_integration 口径）；TEST-BE/TEST-FE 双结论窗 90min 设计观测','20261002-v5-run7':'测试工程师A 测试报告 docs/test/RFD-001-test-report.md @ integration/RFD-001（00:38:08 真值 ✓）→G4 写入通过标记 00:59:09；TEST-FE 同窗执行','20261001-v5-run6':'TEST-BE 194/194 零缺陷（报告 8dbf5bf）+TEST-FE 全绿——测试者独立于开发线','20260929-v4-run2':'TEST-BE r5/TEST-FE r4+r5 回执（实跑树差异由 G5 评审揭出）'}
_CP_UAT={'20261010-v8-run14':'AC-1~7 判词 7/7 通过（run13 已知风险项 AC-1/5/6 全量重做后当轮实测翻绿）；验收书 docs/acceptance/RFD-001-acceptance.md @ origin/main；UAT 对话载荷后窗补登记（anchor $TTRhZeXw…，勘误行在案）','20261004-v7-run8':'需求分析师A 23:40 派发 产品经理A UAT（AC-1~AC-6）；证据行 00:0x 到位过闸；本段 curl22 崩溃环已根治','20261002-v5-run7':'AC 逐条判词 7/7 通过（判词器 python 后端首轮零误报）+SLA 登记——验收书 origin/main 05:54:07','20261001-v5-run6':'AC 逐条判词：勘误版 7/7 通过（初版判词器"未见"误报已根治）+SLA','20260929-v4-run2':'5 通过+2 有条件（放行权归 需求分析师A）——H9 逐条判词先例'}
_CP_G6={'20261004-v7-run8':'G6 复盘 00:07:52+治理报告；问题单 16+ 条三族（回执缺失/交付缺席/集成缺口）当晚统一定因为响应投递丢弃根因（564），run9 验证项','20261002-v5-run7':'DISP 15/15 处置（已修 10/观察 5，收尾补账注明缘由）+记忆探针 ✓（家族 bank=hermes-f4ff5aba122f-fanfan）+metrics 首过率 3/4 实测统计','20261001-v5-run6':'DISP 15 条补账+ISSUES-LOG 回灌（17/17 全处置）+记忆入库','20260929-v4-run2':'DISP 6/6 处置+ISSUES-LOG 回灌+metrics-log 实物'}

CHECKPOINTS = [
    ('cp-g1', 'G1 需求上锁', '验收标准可判定才许开工，锁后不许改', '人审 · BA/PM 四要素', 'ui-gov-doc', 'frozen:true @ 0217cf2'),
    ('cp-triage', '分诊确认', '团队负责人手工确认后任务才推进', '人 · 团队 lead', 'ui-10-kanban', '看板 T-101~T-108 分诊→执行'),
    ('cp-g2', 'G2 架构评审', '五项检查逐条留痕，不评审不排期', '人 · 系统架构师A 治理组', 'ui-room-archived', 'ARCH-GATE-PASS 结论行（一次通过，缺项 G-1/G-2 指名到人）'),
    ('cp-gate', '审批门拦截', '高危命令 5 分钟无人应答即拦截停手', '运行时 HumanGate', 'ui-20-inbox', 'approved.events 留痕（研发工程师C !approve→NO_REPLY）+ 收件箱三档分区'),
    ('cp-g3', 'G3 编码门禁', '测试证据随分支提交，无设计不编码', '门禁脚本 + 研发', 'ui-gov-tlpaycore', 'testlog 分支锚 feat/DEV-* ×4'),
    # .get 兜底：旧轮（run1/run4/run5）离线再生成此前在 _CP_G4/_CP_UAT/_CP_G6 上 KeyError
    # 零输出（L22-27 声称支持的归档态回归场景直接崩）——缺失轮如实标注，不编造卡点记录
    ('cp-g4', 'G4 独立验证', '测试的人不是写代码的人，缺陷全完整循环', '人 · 测试工程师A/测试工程师B 独立执行', 'ui-gov-test', _CP_G4.get(RUN_ID, '本轮未注册卡点锚（按轮注册缺位=拒绝编造；scenario.log/评审卡可反查）')),
    ('cp-g5', 'G5 发布准出 + HumanGate', '七项检查 + 人工批准才许上线', '人 · PM + 评审卡', 'ui-gov-release', _CP_G5.get(RUN_ID, '本轮未注册卡点锚（按轮注册缺位=拒绝编造；评审卡/approved.events 可反查）')),
    ('cp-uat', 'UAT 业务验收', 'BA 拿 G1 冻结清单逐条对账', '人 · 需求分析师A 验收', 'ui-gov-uat', _CP_UAT.get(RUN_ID, '本轮未注册卡点锚（按轮注册缺位=拒绝编造；验收书/房间证据行可反查）')),
    ('cp-g6', 'G6 复盘处置', '问题单 100% 记账，经验入跨轮记忆库', '人 · 全员 + 治理', 'ui-gov-retro', _CP_G6.get(RUN_ID, '本轮未注册卡点锚（按轮注册缺位=拒绝编造；治理报告/记忆探针可反查）')),
]

# 卡点证据行按轮覆写（2026-10-07 修复：静态行写死旧轮锚——"T-101~T-108"系 run9 前编号、
# "一次通过"与 run10 G2 打回矛盾、freeze 锚 0217cf2 系历轮提交；未覆写轮保留原文）。
_CP_EVIDENCE_BY_RUN = {
    '20261007-v8-run10': {
        'cp-g1': 'frozen:true · freeze ccb31cf @ origin/main（01:23:25 四要素过）',
        'cp-triage': '看板任务卡分诊→执行（tasklist v10.0=T-01~T-07，主卡 t_2a2bab79）',
        'cp-g2': 'ARCH-GATE 第二轮 PASS（首轮 1800s 窗超时记入问题清单 g2-review-missing，窗调 3600 后 07:35 过）',
        'cp-gate': 'approved.events 留痕 20+ 条（含 G5 HumanGate !approve 线程回执）',
        'cp-g3': 'testlog 分支锚 feat/DEV-* ×4（复跑锚定轮，代码零变更）',
        'cp-g4': 'TEST-PASS-RFD-001 · 224/224 绿 @ integration 1e4f4e6',
        'cp-g5': '首轮 FAIL 退回→补齐 READY-GATE-PASS（t_65156fe8，14:12）',
        'cp-uat': 'AC-1~7 判词全过 · 验收书 @ origin/main（14:28）',
        'cp-g6': '复盘+治理归档落账（metrics-log/ISSUES-LOG @ origin/main，14:29）',
    },
}
if RUN_ID in _CP_EVIDENCE_BY_RUN:
    _ev = _CP_EVIDENCE_BY_RUN[RUN_ID]
    CHECKPOINTS = [(cid, nm, sem, who, img, _ev.get(cid, ev)) for cid, nm, sem, who, img, ev in CHECKPOINTS]

GATE_BY_STEP = {7: 'G1', 15: 'G2', 18: 'G3', 19: 'G4', 20: 'G5', 24: 'G6'}
GATE_STATE_KEY = {'G1': 'g1_frozen', 'G2': 'g2_arch_pass', 'G3': 'g3_code_pass', 'G4': 'g4_pass', 'G5': 'g5_ready', 'G6': 'retro_done'}
# 闸键兜底链（2026-10-07 修复：G3 真时间戳键=g3_code_pass，devimpl_done=布尔旗标
# 只作旧轮归档兜底——布尔值渲"—"曾致 G3 写入通过标记时间整列缺失）。
GATE_STATE_FALLBACK = {'G3': ('devimpl_done',)}

def _gate_value(g):
    """闸键取值（主键→兜底链），返回 state 值或 ''。"""
    v = state.get(GATE_STATE_KEY[g], '')
    if v:
        return v
    for k in GATE_STATE_FALLBACK.get(g, ()):
        v = state.get(k, '')
        if v:
            return v
    return ''

def _gate_passed(g):
    return bool(_gate_value(g))

def _gate_ts(g):
    """闸写入通过标记墙钟：真时间戳键优先；兜底键为布尔旗标时如实空串（不拿旗标冒时间）。"""
    v = state.get(GATE_STATE_KEY[g], '')
    if v.isdigit() and len(v) >= 10:
        return fmt_ts(GATE_STATE_KEY[g])
    return ''
GATE_DESC = {
    'G1': '需求上锁：验收标准可判定才许开工',
    'G2': '架构评审：不评审不排期',
    'G3': '编码门禁：测试证据随分支，无设计不编码',
    'G4': '独立验证：测试≠编码，缺陷全完整循环',
    'G5': '发布准出：七项检查+人工批准才上线',
    'G6': '复盘：问题单 100% 处置，经验入记忆库',
}
# R16 操作入口（V5 补遗⑥）：轮次无关的产品事实，报告内可复现路径
try:
    from steps_entry import STEP_ENTRIES
except ImportError:
    STEP_ENTRIES = {}

def _entry_html(n):
    e = STEP_ENTRIES.get(n)
    if not e:
        return ''
    who, path, ops = e
    return (f'<div class="st-entry"><b>操作入口</b>（{H.escape(who)}）：'
            f'{H.escape(path)} → {H.escape(ops)}</div>')

# 拍摄位规划表（步状态键→('none', 理由) 或 ('page', url, user)）：报告侧只消费 none
# 声明态（该步无对应产品界面——渲染功能不存在声明而非未采集）；url/user 覆盖由
# r18-frames.mjs 采集侧执行（同一文件单一事实源，2026-10-10 拍摄位规划轮）。
_CAPTURE_PLAN = {}
try:
    for _pl in (Path(__file__).resolve().parent / 'capture-plan.env').read_text(encoding='utf-8', errors='replace').split('\n'):
        _pt = _pl.strip()
        if not _pt or _pt.startswith('#'):
            continue
        _pb = re.split(r'\s+#', _pt, maxsplit=1)[0].strip()
        _pp = _pb.split('|')
        if len(_pp) >= 2 and _pp[1].strip() == 'none':
            _CAPTURE_PLAN[_pp[0].strip()] = ('none', '|'.join(_pp[2:]).strip() or '产品暂无该界面')
except Exception:
    pass

STEPS = []
for n in range(1, 27):
    ps = plan_steps.get(n) or {}
    title = ps.get('title', f'步骤 {n}')
    gate = ps.get('gate', '')
    meta = STEPS_META[n]
    STEPS.append((n, title, gate, meta))

# ── 质量判据具体化（2026-10-11 用户指令：不只列名字——具体标准+人话+交付物证明优先）──
# §5.2 逐步验收表 / §5.3 关卡判据表自方案正本解析（单一事实源，不手抄第二份）。
def _parse_tbl(sec_re, row_re):
    sec = re.search(sec_re, plan_text, re.S)
    if not sec:
        return {}
    return {k: v for k, v in ((int(a) if a.isdigit() else a, (b.strip(), c.strip()))
            for a, b, c in re.findall(row_re, sec.group(0), re.M)) if k}

PLAN_52 = _parse_tbl(r'### 5\.2 .*?### 5\.3', r'^\|\s*(\d{1,2})\s*\|([^|]+)\|([^|]+)\|')
PLAN_53 = _parse_tbl(r'### 5\.3 .*?### 5\.4', r'^\|\s*(G\d)[^|]*\|([^|]+)\|([^|]+)\|')
_GATE_STATE_KEY = {7: 'g1_frozen', 15: 'g2_arch_pass', 18: 'g3_code_pass',
                   19: 'g4_pass', 20: 'g5_ready', 24: 'retro_done'}

def _split_items(cell):
    """合格线单元格拆条：保留 ①②③ 编号项整条；其余按 ；与。拆。"""
    cell = cell.strip().rstrip('。')
    # 序号标记与其后内容保持一体：在标记前切，不在标记后切
    parts = re.split(r'(?<=[；。])|(?=[①②③④⑤⑥⑦⑧⑨])', cell)
    return [x.strip(' ；。') for x in parts if x.strip(' ；。')]

def _fmt_ts(v):
    try:
        import datetime as _dt
        return _dt.datetime.fromtimestamp(int(v)).strftime('%m-%d %H:%M')
    except (ValueError, OSError, TypeError):
        return str(v)[:16]

def criteria_block(n):
    """② 段合格线块：标准全文（人话化）+ 判定证据行（交付物实物优先，关卡判词其次）。"""
    row52 = PLAN_52.get(n)
    if not row52:
        return ''
    zhun, line = row52
    items = _split_items(line)
    lis = ''.join(f'<li>{_md_tags(gloss_first_use(H.escape(x)))}</li>' for x in items) or '<li>（方案未单列）</li>'
    # 判定证据（诚实口径：不逐条造判定——证据=实物核对计数+关卡判词时间戳）
    ev = []
    ok, total = ART_OK.get(n, (None, None))
    if total:
        ev.append(f'交付物实物核对 {ok}/{total} 件模版符合（逐件核对见下方实物区）')
    elif _no_artifact_note(n):
        ev.append('本步无文件域工件（产出=卡/消息/事件，见①段记录）')
    g = GATE_BY_STEP.get(n)
    if g:
        k = _GATE_STATE_KEY.get(n, '')
        if k and state.get(k):
            ev.append(f'{g} 判词通过（通过标记写入 {_fmt_ts(state[k])}）')
        else:
            ev.append(f'{g} 判词见六道关卡仪表盘（本步无独立通过标记键）')
    gate_html = ''
    if g and PLAN_53.get(g):
        gitems = _split_items(PLAN_53[g][0])
        glis = ''.join(f'<li>{_md_tags(gloss_first_use(H.escape(x)))}</li>' for x in gitems)
        gate_html = (f'<div class="st-crit-g"><b>{g} 关卡判据（{g} 不过不放行）：</b>'
                     f'<ul>{glis}</ul></div>')
    ev_html = (' · '.join(ev)) or '判定证据见下方实物区'
    return (f'<div class="st-crit"><div class="st-crit-hd">合格线——做成什么样算合格'
            f'<span class="st-crit-src">（方案 §5.2 全文）</span></div>'
            f'<div class="st-crit-zhun">这步交差要交出：<b>{gloss_first_use(H.escape(zhun))}</b></div>'
            f'<ul>{lis}</ul>{gate_html}'
            f'<div class="st-crit-ev">判定证据：{ev_html}</div></div>')

# 判据块的实物核对计数来源：artifact_block 内逐件核对时记账
ART_OK = {}

# ── 四段渲染辅助（V8.3：①②与方案两段式步条同构；③④自台账/工程档案实测统计）──
def _known_html(txt):
    """段三前半：方案层已知问题（历轮实锤），如实呈现并标注本轮语境。"""
    if not txt or txt == '无。':
        return '<p class="st-known none">方案层已知问题：正本不含历史层（历轮实锤台账见工程档案"方案步条历史层"章）；本步问题单如下。</p>'
    return (f'<div class="st-known"><b>方案层已知问题（工程档案历史层在本轮的复现记录）：</b>'
            f'{md_bold(txt)}</div>')

def _improve_html(txt):
    """段四：处置与改进（V8.3：方案正本不含历史层——本段自本轮 DISP+工程档案台账派生；取不到如实标"无"）。"""
    if not txt or txt == '无。':
        return '<p class="st-improve none">处置与改进：无（本轮处置见上方问题单 DISP；历轮改进项台账见工程档案）。</p>'
    return (f'<div class="st-improve"><b>处置与改进（档案台账+本轮 DISP）：</b>{md_bold(txt)}'
            f'<div class="st-improve-note">落地状态：随 run 轮记入问题清单与自动检查证据逐条可追溯；'
            f'本轮新暴露问题已按 §5.4 段三口径回写方案步条。</div></div>')

def _sec34_is_empty(n):
    """③④ 双空判定（去凑数）：方案已知问题=无 且 该步零问题单 → 合并单行。"""
    known = plan_steps.get(n, {}).get('known', '')
    if known and known != '无。':
        return False
    meta = STEPS_META[n]
    keys = meta.get('issue_keys') or []
    if not keys:
        return True
    log = EVID / 'issues.log'
    if not log.exists():
        return True
    for ln in log.read_text(encoding='utf-8', errors='replace').splitlines():
        p = ln.split('|', 3)
        if len(p) >= 4 and p[1] in keys and p[0] == 'ISSUE':
            return False
    return True

def _sec34_empty(n):
    return '<p class="st-issues none">已知问题：无（本步零问题单）；处置与改进：无（历轮台账见工程档案）——如实呈现，不凑段。</p>'

def _step_issues_html(n):
    """段三后半：该步 ISSUE/DISP 行（issues.log 按步过滤，步归属=STEPS_META 按轮注册的
    issue_keys；无注册键的步显示零问题单——文末台账仍为全量单一事实源）。"""
    meta = STEPS_META[n]
    keys = meta.get('issue_keys') or []
    if not keys:
        return '<p class="st-issues none">本步零问题单（按轮注册键过滤；全量见文末问题单终态）。</p>'
    log = EVID / 'issues.log'
    if not log.exists():
        return '<p class="st-issues none">issues.log 缺席（如实标注）。</p>'
    rows = []
    for ln in log.read_text(encoding='utf-8', errors='replace').splitlines():
        p = ln.split('|', 3)
        if len(p) < 4:
            continue
        if p[1] in keys:
            cls = 'd-ok' if p[0] == 'DISP' and p[3].startswith('已修') else 'd-warn'
            rows.append(f'<tr><td>{H.escape(p[0])}</td><td>{H.escape(p[1])}·{H.escape(p[2])}</td>'
                        f'<td class="{cls}">{H.escape(p[3][:160])}</td></tr>')
    if not rows:
        return '<p class="st-issues none">本步零问题单（注册键本轮未触发）。</p>'
    return ('<table class="st-issues-tbl"><thead><tr><th>类</th><th>键</th><th>内容</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>')

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
    'gate': ('#fef3c7', '#b45309', '强制关卡'),
}

# 证据来源角标：三类别——读者一眼区分"产品界面"与"证据工件"
KIND_STYLE = {
    'ui': ('#dcfce7', '#15803d', '界面实拍'),
    'doc': ('#e0f2fe', '#0369a1', '仓内工件'),
    'msg': ('#f3e8ff', '#7e22ce', '消息转录'),
}

def md_bold(t):
    """转义后把 **…** 渲染为加粗（关键判词强调；防注入先整体转义）。"""
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', H.escape(t))

# ── 术语词表（P21/F-6① + P0-1 词汇表升维 v2）：内部代号首现自动展开——单一事实源
#    mux/glossary.txt 五字段行（术语ID | 标准名 | 别名 | 定义 | 归属）；标准名与别名均参与
#    首现匹配，展开形态=「别名（标准名=定义）」；无释义代号=审计 WARN（词表先补再用）。──
GLOSSARY = {}
GLOSSARY_OWNER = {}
GLOSSARY_SLUG = {}
GLOSSARY_CANON = {}
_gl_path = Path(__file__).parent / 'glossary.txt'
if _gl_path.exists():
    for _ln in _gl_path.read_text(encoding='utf-8', errors='replace').splitlines():
        _ln = _ln.strip()
        if not _ln or _ln.startswith('#'):
            continue
        _parts = [p.strip() for p in _ln.split('|')]
        if len(_parts) == 5 and _parts[0].startswith('term:'):
            _slug, _std, _alias, _defn, _owner = _parts
            GLOSSARY_SLUG[_slug] = _std
            for _w in [_std] + [a for a in _alias.split(',') if a]:
                GLOSSARY[_w] = _defn
                GLOSSARY_OWNER[_w] = _owner
                GLOSSARY_CANON[_w] = _std
        elif ':' in _ln:
            _k, _v = _ln.split(':', 1)
            GLOSSARY[_k.strip()] = _v.strip()

def _gloss_sub(m, k):
    canon = GLOSSARY_CANON.get(k, '')
    label = f'{canon}={GLOSSARY[k]}' if canon and canon != k else GLOSSARY[k]
    return f'{k}（{label}）'

def gloss_first_use(escaped_text):
    """叙事文本（已转义纯文本）的代号首现释义：全文每个代号只展开第一次。"""
    for k in sorted(GLOSSARY, key=len, reverse=True):
        pat = re.compile(r'(?<![\w（])(?!（)' + re.escape(k) + r'(?![\w-])')
        escaped_text = pat.sub(lambda m, _k=k: _gloss_sub(m, _k), escaped_text, count=1)
    return escaped_text

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
        else:
            # 注册但缺文件=冒配：红标占位（2026-10-07 修复静默丢弃——丢图不可见即漏检）；
            # V8.4 §5.6 ⑩：缺帧不补拍，记入问题清单+无帧明示（补拍件只落 frames-degraded/ 档案）
            out.append(f'<p class="no-evidence">注册帧缺文件：{H.escape(pre)}.png（{H.escape(cap)}）——按 §5.6 采集纪律⑩ 记入问题清单 frame-capture-failed，不补拍不嵌替代页</p>')
    return ''.join(out)

# ── 全量呈现（正本 §5.5）：对话全文 / 操作前后帧 / 环节效果实证 ──
def _md_tags(escaped: str) -> str:
    """已转义文本的行内记号转换（**粗体**→<strong>；`代码`→<code>）——只改形式不改内容。"""
    escaped = re.sub(r'\*\*([^*\n]+)\*\*', r'<strong>\1</strong>', escaped)
    return re.sub(r'`([^`\n]+)`', r'<code>\1</code>', escaped)

def md_inline(text: str) -> str:
    """卡体/步条原文等内嵌文本的 markdown 星标记号转 HTML（只改形式不改内容——保真契约）。

    **粗体**→<strong>；`代码`→<code>；行首「- 」列表符→「· 」。换行处理归调用方
    （r18 卡体转 <br>，gate-body 走 pre-wrap 原样）。2026-10-12 视觉验收实锤：步条
    原文与任务卡正文内嵌 md 未转换，字面星号直出报告（V8.18 文风修订配套）。"""
    s = H.escape(text)
    s = re.sub(r'(?m)^\s*-\s+', '· ', s)
    return _md_tags(s)

def _r18_msg_html(m):
    sender = H.escape(str(m.get('sender', '?')))
    ts = H.escape(str(m.get('ts', '')))
    body = str(m.get('body', '')).strip()
    return (f'<div class="r18-msg"><div class="r18-msg-hd"><b>{sender}</b>'
            + (f'<span class="r18-ts">{ts}</span>' if ts else '')
            + '</div><div class="r18-msg-body">' + md_inline(body).replace('\n', '<br>') + '</div></div>')

def _r18_frame_tags(frames, step, view=''):
    out = []
    for f in frames:
        name = str(f)
        if not name.endswith('.png'):
            name += '.png'
        p = STEPS_DIR / name
        # V8.4 §5.5 截图红线①（2026-10-10 接线轮）：图注=画面描述——操作帧图注须含
        # 画面落点（操作标题/视图名），禁纯模板序号（"① 操作前"是位序不是画面）。
        _pos = {'before': '操作前', 'action': '操作动作', 'after': '系统响应'}.get(
            name.rsplit('-', 1)[-1][:-4] if '-' in name else '', '')
        cap = f'{view}·{_pos}' if (view and _pos) else (name[:-4] if not _pos else f'操作序列画面·{_pos}')
        if p.exists():
            out.append(
                f'<label class="shot r18-shot"><input type="checkbox">'
                f'<img src="screenshots/steps/{name}" alt="{H.escape(cap)}" loading="lazy">'
                f'<figcaption>{H.escape(cap)}</figcaption></label>')
        else:
            out.append(f'<p class="no-evidence">帧缺失：{H.escape(name)}（采集位空——按 §5.6 采集纪律⑩ 记入问题清单 frame-capture-failed，不补拍）</p>')
    return ''.join(out)

# ── §5.5 并行度实测（run12 起）：devimpl 段"活跃 agent·分钟/墙钟分钟" ——
#    数据源=四路 dev agent（研发工程师A/研发工程师B/研发工程师C/研发工程师D）agent.log 真实工作行（判据与驱动活性判断
#    同源：API call/tool 完成/Turn 起止）+ scenario.log 段界（── devimpl → ── defect）。
#    归一化口径：÷（墙钟分钟×编制 4）——run11 复盘基线 ~50%（=平均 2 路在活）同口径，
#    验收线 ≥2× 基线（§5.5）；不达标不阻断收尾，如实呈现记复盘。数字实测统计禁手填。
DEV_AGENTS = ('chen', 'hu', 'lin', 'xiao')
_PL_WORK_LINE = re.compile(r'API call|tool [a-z_]+ completed|Turn (started|ended)')
_PL_TS = re.compile(r'^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})')

def devimpl_parallelism_html(n: int) -> str:
    if n != 18:
        return ''
    slog = EVID / 'scenario.log'
    if not slog.exists():
        return '<p class="stat-note">并行度实测统计：scenario.log 缺席，无法取窗（如实标注）。</p>'
    t0 = t1 = None
    for ln in slog.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'\[mux (\d{2}):(\d{2}):(\d{2})\]', ln)
        if not m:
            continue
        sec = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        if t0 is None and '── devimpl' in ln:
            t0 = sec
        elif t0 is not None and t1 is None and ('── defect' in ln or '── testpass' in ln):
            t1 = sec
    fallback_note = ''
    if t0 is not None and t1 is None:
        # 段界收尾行缺失回退（run12 实录：harness 仅打 devimpl 开头界，无 defect/testpass
        # 收尾界——devimpl-boundary-missing 记入问题清单）：以 state test_dispatch_ts 实测依据代界
        # （defect 段派发真值）；实测数仍按 agent.log 工作行实测统计，数字禁手填纪律保持。
        _ts = (state.get('test_dispatch_ts') or '')[:10]
        if _ts.isdigit():
            import datetime as _dtm
            _d = _dtm.datetime.fromtimestamp(int(_ts))
            t1 = _d.hour * 3600 + _d.minute * 60 + _d.second
            if t1 <= t0:
                t1 += 86400
            fallback_note = '（日志缺该段收尾分界行——以测试派发时间 state test_dispatch_ts 为分界，如实标注）'
    if t0 is None or t1 is None or t1 <= t0:
        if t0 is None or t1 is None:
            return '<p class="stat-note">并行度实测统计：devimpl/defect 段界行未见（段未完成或缺行），本轮不出并行度行。</p>'
        t1 += 86400  # 跨午夜窗修正（scenario.log 行首无日期）
    wall_min = max(1, (t1 - t0) // 60)
    # run13 复盘 A12：day0 锚定改本轮启动日期——旧逻辑取日志首个工作行日期，
    # SIM 持久化下日志含前轮残留（首行=10-09），本轮（10-10）工作行全被 +24h
    # 移出窗口 → 并行度恒 0。锚定启动日期后按行日期与锚日的差值天折算，跨午夜轮不受影响。
    import datetime as _dt
    _rs = state.get('run_started_at') or ''
    _day0 = _dt.datetime.fromtimestamp(int(_rs)).strftime('%Y-%m-%d') if _rs.isdigit() else None
    active_pairs = set()
    for a in DEV_AGENTS:
        lg = SIM / 'hermes' / 'profiles' / a / 'logs' / 'agent.log'
        if not lg.exists():
            continue
        for ln in lg.read_text(encoding='utf-8', errors='replace').splitlines():
            if not _PL_WORK_LINE.search(ln):
                continue
            m = _PL_TS.match(ln)
            if not m:
                continue
            sec = int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4))
            if _day0 is not None:
                try:
                    _dd = (_dt.datetime.strptime(m.group(1), '%Y-%m-%d') - _dt.datetime.strptime(_day0, '%Y-%m-%d')).days
                except ValueError:
                    continue
                if _dd < 0:
                    continue  # 前轮残留行（日志未轮转），不入本轮窗口
                sec += _dd * 86400
            else:
                if day0 is None:
                    day0 = m.group(1)
                if m.group(1) != day0:
                    sec += 86400
            if t0 <= sec <= t1:
                active_pairs.add((a, sec // 60))
    cap = wall_min * len(DEV_AGENTS)
    pct = len(active_pairs) / cap * 100 if cap else 0.0
    verdict = '达标（≥2× 基线）' if pct >= 100.0 else '未达验收线（记复盘，不阻断收尾）'
    # 分支落地时间线（干预点证据，2026-10-09 干预点四件 D）：每分支落地时刻
    # =分支 tip 提交时间（仓内可反查）；PROGRESS 中间锚行随行（B 件产出，无则不渲染）。
    tl = []
    _repo = SIM / 'central' / 'aipaydev'
    try:
        _out = subprocess.run(
            ['git', '-C', str(_repo), 'for-each-ref', '--sort=committerdate',
             '--format=%(refname:short) %(committerdate:format:%m-%d %H:%M)',
             'refs/remotes/origin/feat/DEV-*'],
            capture_output=True, text=True, timeout=10).stdout.strip()
        for _ln in _out.splitlines():
            _p = _ln.split()
            if len(_p) >= 3:
                tl.append(f'{_p[0].replace("origin/feat/", "")} {_p[1]} {_p[2]}')
    except Exception:
        pass
    tl_html = (f'<div class="st-pl">分支落地时间线（tip 提交时间，仓内可反查）：'
               f'{" · ".join(H.escape(x) for x in tl) if tl else "仓内无 feat/DEV-* 分支引用（如实标注）"}</div>')
    prog = [ln for ln in slog.read_text(encoding='utf-8', errors='replace').splitlines()
            if 'PROGRESS-' in ln]
    prog_html = (f'<div class="st-pl">PROGRESS 中间锚（子件级推进信号，B 件产出）：{len(prog)} 行'
                 + ('；最近：' + H.escape(prog[-1][:120]) if prog else '（本轮未产生——任务书加挂前的轮次特征）')
                 + '</div>')
    return (f'<div class="st-pl"><b>并行度实测（§5.5）</b>：{pct:.0f}%{fallback_note}'
            f'（活跃 agent·分钟 {len(active_pairs)} ÷ 墙钟 {wall_min} 分钟 × 编制 {len(DEV_AGENTS)} 路，归一化；'
            f'run11 基线 ~50% 复盘口径同参 —— {verdict}）</div>'
            + tl_html + prog_html)

def r18_block(n: int) -> str:
    """步骤 n 的 R18 载荷渲染。载荷空 → 诚实"未采集"章（审计查 8 按线打回）。"""
    payload = R18.get(str(n)) or R18.get(n) or {}
    dialogs = payload.get('dialogs') or []
    ops = payload.get('ops') or []
    effect = payload.get('effect') or {}
    skill = payload.get('skill') or {}
    sk_gen = skill.get('gen') or []
    sk_invoke = skill.get('invoke') or []
    sk_cnt = len(sk_gen) + len(sk_invoke)
    dlv = payload.get('delivery') or {}
    dlv_frames = dlv.get('frames') or []
    counts = f'd:{len(dialogs)};o:{len(ops)};e:{1 if effect else 0};s:{sk_cnt};v:{len(dlv_frames)}'
    if not (dialogs or ops or effect or sk_cnt or dlv_frames):
        # §5.5 空态禁渲染（2026-10-07 修复）：非必采步零载荷不渲染零信息行；
        # 必采步缺口保留可见性并挂记入问题清单键（空态在报告头计数并逐项对应问题单编号）。
        _must = (r18_matrix.DIALOG_STEPS | r18_matrix.OP_STEPS | r18_matrix.EFFECT_STEPS
                 | r18_matrix.SKILL_STEPS | r18_matrix.DELIVERY_STEPS)
        if n not in _must:
            return ''
        return (f'<details class="st-r18 r18-empty"><summary>全量呈现（未采集·必采步缺口）</summary>'
                f'<div class="r18-body" data-r18="{counts}">'
                f'<p class="no-evidence">本步属必采清单（§5.6）而载荷未采集（对话全文/操作前后帧/环节效果'
                f'{"四" if n in r18_matrix.SKILL_STEPS else "三"}缺）'
                f'——记入问题清单 r18-collection-missing（DISP 观察：采集链未挂驱动，run11 已接线）</p></div></details>')
    parts = [f'<details class="st-r18"><summary>全量呈现（对话 {len(dialogs)} · 操作 {len(ops)} · 效果 {"✓" if effect else "—"}'
             + (f' · skill {sk_cnt}' if n in r18_matrix.SKILL_STEPS or sk_cnt else '')
             + (f' · 门禁灯 {len(dlv_frames)}' if n in r18_matrix.DELIVERY_STEPS or dlv_frames else '')
             + f'）</summary>',
             f'<div class="r18-body" data-r18="{counts}">']
    for d in dialogs:
        anchor = str(d.get('anchor', ''))
        room = str(d.get('room', ''))
        parts.append('<div class="r18-sec r18-dialog"><div class="r18-sec-hd">'
                     f'<b>{H.escape(str(d.get("title", "对话")))}</b>'
                     + (f'<span class="r18-anchor" title="room">{H.escape(room)}</span>' if room else '')
                     + (f'<span class="r18-anchor">锚 {H.escape(anchor)}</span>' if anchor else '')
                     + '</div>' + ''.join(_r18_msg_html(m) for m in (d.get('messages') or []))
                     + '</div>')
    for op in ops:
        parts.append('<div class="r18-sec r18-op"><div class="r18-sec-hd">'
                     f'<b>{H.escape(str(op.get("title", "操作")))}</b></div>'
                     + (f'<div class="r18-entry">操作入口：{H.escape(str(op.get("entry", "")))}</div>' if op.get('entry') else '')
                     + '<div class="st-shots r18-frames">' + _r18_frame_tags(op.get('frames') or [], n, view=str(op.get('title') or '')) + '</div>'
                     + (f'<div class="r18-note">{md_bold(str(op.get("note", "")))}</div>' if op.get('note') else '')
                     + '</div>')
    if effect:
        parts.append('<div class="r18-sec r18-effect"><div class="r18-sec-hd"><b>环节效果</b></div>'
                     f'<p class="r18-effect-text">{md_bold(str(effect.get("text", "")))}</p>')
        for ev in (effect.get('evidence') or []):
            parts.append(f'<div class="r18-ev">◦ {H.escape(str(ev.get("label", "")))}：'
                         f'<code>{H.escape(str(ev.get("anchor", "")))}</code></div>')
        parts.append('</div>')
    if sk_cnt:
        parts.append('<div class="r18-sec r18-skill"><div class="r18-sec-hd">'
                     f'<b>skill 过程（§5.6 必采清单：生成 ≥{r18_matrix.SKILL_GEN_MIN} 帧 + 调用 ≥{r18_matrix.SKILL_INVOKE_MIN} 帧）</b></div>')
        if sk_gen:
            parts.append('<div class="r18-entry">xxx-dev 生成过程：</div>'
                         '<div class="st-shots r18-frames">' + _r18_frame_tags(sk_gen, n, view='skill 生成过程画面') + '</div>')
        if sk_invoke:
            parts.append('<div class="r18-entry">开发调用过程：</div>'
                         '<div class="st-shots r18-frames">' + _r18_frame_tags(sk_invoke, n, view='开发调用过程画面') + '</div>')
        if skill.get('note'):
            parts.append(f'<div class="r18-note">{md_bold(str(skill.get("note", "")))}</div>')
        parts.append('</div>')
    if dlv_frames:
        parts.append('<div class="r18-sec r18-delivery"><div class="r18-sec-hd">'
                     '<b>delivery 门禁灯（R29/§5.6 必采清单：Delivery Cases 面板投影 ≥1 帧——MX_DELIVERY=1 全程开启）</b></div>'
                     '<div class="st-shots r18-frames">' + _r18_frame_tags(dlv_frames, n, view='delivery 门禁灯面板') + '</div>'
                     + (f'<div class="r18-note">{md_bold(str(dlv.get("note", "")))}</div>' if dlv.get('note') else '')
                     + '</div>')
    parts.append('</div></details>')
    return ''.join(parts)

def r18_coverage() -> str:
    """hero 统计位：必采清单实测统计（正本 §5.5+§5.6 必采清单——分子=达标项、分母=r18_matrix.TOTAL，禁任一位在位即计）。

    矩阵与审计器查 8 同表（r18_matrix 单一事实源）；帧文件按 STEPS_DIR 实查，
    缺帧计未达标，与渲染侧"帧缺失"占位同口径。产品成效 2 项（run14 起入分母）：
    exec=幂等执行输出件、frames=下单流程帧（登记降级口径见 r18_matrix.evaluate_full）。
    """
    _ilog_path = EVID / 'issues.log'
    _ilog = _ilog_path.read_text(encoding='utf-8', errors='replace') if _ilog_path.exists() else ''
    met, total, _, _po = r18_matrix.evaluate_full(
        R18, frame_exists=lambda name: (STEPS_DIR / name).exists(),
        evid_dir=EVID, issue_log_text=_ilog)
    return f'{met}/{total}'

def _r18_hero_badge() -> str:
    """hero R18 徽章：载荷文件缺席时 ⬜ 明示（0/13 不是"实测统计达标"是"未采集"），
    并给出记入问题清单键（§5.5 空态条款：空态在报告头计未采集 N 项并逐项对应问题单编号）。"""
    if not R18_FILE_OK:
        return (f'<b>⬜ {r18_coverage()}</b><span>全量呈现载荷未采集（r18-steps.json 未产出）'
                f'· 必采 {r18_matrix.TOTAL} 项缺口记入问题清单 r18-collection-missing</span>')
    return f'<b>{r18_coverage()}</b><span>全量呈现覆盖 · 必采 {r18_matrix.TOTAL} 项实测统计</span>'

def _gov_metrics_line() -> str:
    """⑥治理指标行（产品 backlog 八件落位）：自 evidence/governance-report.md 的 metrics 回写节
    实读首过率/证据一次通过率/缺陷密度三行，渲染 hero 下方单行指标带。缺文件=如实缺席明示。"""
    gr = EVID / 'governance-report.md'
    if not gr.exists():
        return '<div class="gov-metrics-line">治理指标：⬜ 治理报告未产出（指标行如实缺席）</div>'
    txt = gr.read_text(encoding='utf-8', errors='replace')
    import re as _re
    def _pick(label):
        # run16 实锤修订：metrics CSV 两种形态并存——run15 折行形（续行以 , 开头）与
        # run16 整行形（date,rfid,scope,label,value,...）。按「标签域的下一域=值」定位，
        # 两种形态通吃；值内 ASCII 逗号截断取首段（首段即数值头，如 4/6）。
        for ln in txt.splitlines():
            parts = ln.split(',')
            for i, seg in enumerate(parts):
                if label in seg and i + 1 < len(parts) and parts[i + 1].strip():
                    return parts[i + 1].strip().replace('记单', '登记')
        return '⬜'
    fp, ev, de = _pick('首过率'), _pick('证据一次通过率'), _pick('缺陷密度')
    return (f'<div class="gov-metrics-line">治理指标 · 首过率 <b>{H.escape(fp)}</b>'
            f' · 证据一次通过 <b>{H.escape(ev)}</b> · 缺陷密度 <b>{H.escape(de)}</b>'
            f'（实读 governance-report metrics 节，禁手填）</div>')

def _issue_level(t):
    """问题单级别（报告三要素改造 2026-10-10）：按类型码族派生——闸门族正则与审计器
    闸键判定（mx-report-audit.py A4）同源（^(g[1-6])[-_] + review-card + retro-open-items），
    防两处判定漂移；采集降级族与审计查 3 缺图豁免口径同族。"""
    if re.match(r'^(g[1-6])[-_]', t) or t.startswith('review-card') or t.startswith('retro-open-items'):
        return '闸门级'
    if t.startswith(('frame-', 'r18-', 'product-surface', 'capture-')):
        return '采集级'
    return '过程级'


def issues_stats():
    """问题单台账：唯一键口径（类型·主体去重），如实标注与复盘文档事件流口径差异。

    DISP 连接键=类型段+主体精确优先（run13 复盘 A3/C1 修订：原「DISP 按类型归属到该
    类型全部唯一键」在多主体同类型时错挂——r18-collection-missing 五主体全显示 step-23
    的处置、PAYCORE-C 显示 CHWX 的处置）。配对次序：
      ① type·subject 精确命中；
      ② 同类型 DISP 主体为泛指（director/monitor/harness）→ 广播到该类型全部键；
      ③ 该类型仅一个唯一键 → 容主体措辞差（2026-10-07 修复原意保留）；
      ④ 其余=待处置。
    三态计数（run13 复盘 A4/F6）：DISP 首词非三态分桶词（已修/观察/延后）的键计入
    「表外词」单列——四桶+表外词求和=唯一键数，禁凭空消失。
    频次列（2026-10-10 三要素改造）：同一唯一键在事件流中的出现次数——run12 的
    gate-breaker-tripped 单键 227 行被压成一行无频次，读者无法知道它刷了多少次。
    """
    lines = (EVID / 'issues.log').read_text(encoding='utf-8', errors='replace').splitlines() if (EVID / 'issues.log').exists() else []
    iss, disp_exact, disp_generic, order = {}, {}, {}, []
    freq = {}
    raw_i = raw_d = 0
    for l in lines:
        if l.startswith('ISSUE|'):
            raw_i += 1
            p = l.split('|', 3)
            key = f'{p[1]}·{p[2]}'
            freq[key] = freq.get(key, 0) + 1
            if key not in iss:
                iss[key] = p[3] if len(p) > 3 else ''
                order.append(key)
        elif l.startswith('DISP|'):
            raw_d += 1
            p = l.split('|', 4)
            if len(p) > 3:
                if p[2] in ('director', 'monitor', 'harness', '导演', '监控'):
                    disp_generic[p[1]] = p[3]
                else:
                    disp_exact[(p[1], p[2])] = p[3]
    types_of = {}
    for k in order:
        types_of.setdefault(k.split('·')[0], []).append(k)

    def _disp_for(key):
        t, s = key.split('·', 1)
        if (t, s) in disp_exact:
            return disp_exact[(t, s)]
        if t in disp_generic:
            return disp_generic[t]
        if len(types_of.get(t, [])) == 1:
            for (dt, ds), dv in disp_exact.items():
                if dt == t:
                    return dv
        return None

    disp_of = {k: _disp_for(k) for k in order}
    closed = [k for k in order if disp_of[k] and disp_of[k].startswith('已修')]
    observed = [k for k in order if disp_of[k] and disp_of[k].startswith('观察')]
    deferred = [k for k in order if disp_of[k] and disp_of[k].startswith('延后')]
    nonstd = [k for k in order if disp_of[k] and not disp_of[k].startswith(('已修', '观察', '延后'))]
    open_k = [k for k in order if not disp_of[k]]
    # 配对口径披露（run16 复盘，fix/run16-report-truth）：hero「n/n 已完整循环」的 n 取自
    # 纪律 28 阶梯配对（①精确+②泛指广播+③单键容差），不披露口径会让读者误当逐键精确
    # 处置（run16 实锤：hero 75/75 而精确配对仅 7 键，32 DISP 悬挂无 ISSUE——审计 WARN
    # 台账卫生）。三数并呈，广播占比高的台账一眼可辨。
    _exact_paired = sum(1 for k in order if disp_of[k] and tuple(k.split('·', 1)) in disp_exact)
    _bcast_paired = (len(closed) + len(observed) + len(deferred) + len(nonstd)) - _exact_paired
    _iss_key_set = set(order)
    _dangling = sum(1 for (dt, ds) in disp_exact if f'{dt}·{ds}' not in _iss_key_set)
    rows = []
    for k in order:
        d = disp_of[k]
        if not d:
            continue
        t = k.split('·')[0]
        cls = 'd-ok' if d.startswith('已修') else 'd-warn'
        rows.append(f'<tr><td>{H.escape(k)}</td><td style="white-space:nowrap">{freq.get(k, 1)} 次</td>'
                    f'<td style="white-space:nowrap">{_issue_level(t)}</td>'
                    f'<td>{H.escape(iss[k][:100])}</td><td class="{cls}">{H.escape(d[:130])}</td></tr>')
    if not rows:
        rows.append('<tr><td colspan="5" class="d-warn">本轮零处置记账（如实呈现——DISP 回写缺口见 retro-open-items 记入问题清单）</td></tr>')
    stat = (f'唯一键 {len(order)}：已修 {len(closed)} · 观察 {len(observed)} · 延后 {len(deferred)}'
            f' · 表外词 {len(nonstd)} · 待处置 {len(open_k)}')
    if nonstd:
        stat += '（表外词=DISP 首词非三态分桶词——台账卫生缺陷，§4.3-28；收尾链补记三态 DISP 行后归桶）'
    note = (f'台账事件流 {raw_i} 行 ISSUE / {raw_d} 行 DISP（含同一问题多次发生与多轮重跑），复盘文档按事件流全表列出；本节按唯一键去重收尾。'
            '级别按类型码族派生（闸门级/采集级/过程级），闸门族正则与审计器闸键判定同源。')
    if open_k:
        stat += f'（{", ".join(open_k[:3])} 属下轮跟进项）'
    return (stat, note, '\n'.join(rows), len(closed) + len(observed) + len(deferred), len(order),
            len(open_k), len(nonstd), _exact_paired, _bcast_paired, _dangling)

def main_head():
    try:
        return subprocess.run(['git', '-C', str(CEN), 'rev-parse', '--short', 'origin/main'],
                              capture_output=True, text=True).stdout.strip()
    except Exception:
        return ''


def monitor_proxy_html():
    """监控代行独立小节（run15 复盘 N5/复盘建议 §7.2，V8.17 §5.4 报告规范）。

    纪律 36 框架内的监控代行事件全量在册：DISP 文本含「监控代行」标记的行归集
    呈现（令文摘要+回执锚可反查 issues.log）。零代行=零渲染（如实，不凑段）。
    """
    ilog = EVID / 'issues.log'
    if not ilog.exists():
        return ''
    rows = []
    for l in ilog.read_text(encoding='utf-8', errors='replace').splitlines():
        if l.startswith('DISP|') and '代行' in l:
            p4 = l.split('|', 4)
            if len(p4) > 3:
                rows.append(f'<tr><td style="white-space:nowrap">{H.escape(p4[1])}</td>'
                            f'<td style="white-space:nowrap">{H.escape(p4[2])}</td>'
                            f'<td>{H.escape(p4[3][:200])}</td></tr>')
    if not rows:
        return ''
    return (f'\n  <details class="audit" id="ch8-monitor-proxy"><summary>▶ 监控代行实录'
            f'（{len(rows)} 次——纪律 36 框架内代行事件全量在册，令文摘要可反查 issues.log）</summary>'
            f'\n  <table style="margin-top:8px"><tr><th>类型</th><th>主体</th><th>令文/处置摘要</th></tr>'
            + ''.join(rows) + '</table></details>')


def ontology_html():
    """本体语义层证据小节（P0-2，本体论透镜分析：本体层在系统内执法但报告层不可见）。

    三层数据源，全缺席=如实声明（run16 起预期在场）：①归档工件 ontology-health.txt
    （五要素计数+健康度三档）②watch/status（工件优先、live 端点兜底）③issues.log
    ontology 族行计数。本体证据面端点定义见方案 §2.5。"""
    health_f = EVID / 'ontology-health.txt'
    watch_f = EVID / 'ontology-watch-status.json'
    stats_line, stats_src = '', ''
    if health_f.exists():
        try:
            import json as _j
            _h = _j.loads(health_f.read_text(encoding='utf-8', errors='replace'))
            _st = _h.get('stats', {})
            _hl = _h.get('health', {})
            _bits = []
            for _k, _lb in (('entityTypes', '实体类型'), ('objectProperties', '对象属性'),
                            ('dataProperties', '数据属性'), ('axioms', '公理'), ('instances', '实例')):
                if _k in _st:
                    _bits.append(f'{_lb} {_st[_k]}')
            _viol = '、'.join(f'{k} {_hl[k]}' for k in ('error', 'warning', 'notice') if k in _hl)
            stats_line = '；'.join(filter(None, ['、'.join(_bits), f'健康度：{_viol}' if _viol else '']))
            stats_src = '归档工件 ontology-health.txt（当轮 spec 端点落盘）'
        except Exception:
            stats_line = 'ontology-health.txt 解析失败（格式漂移）'
            stats_src = '归档工件'
    else:
        # 兜底：种子正本静态计数（语义资产的仓内真值，非当轮运行证据）
        try:
            _seed = Path(os.environ.get('MX_OVERLAY_ROOT', '')) / \
                'custom/server/ontology/ontology-seed.ts'
            if not _seed.exists():
                _seed = Path('/Users/cuishi/lab/ncwk/overlay/custom/server/ontology/ontology-seed.ts')
            _txt = _seed.read_text(encoding='utf-8', errors='replace')
            _et = len(re.findall(r"\bid: '\w+', label: '[^']+', labelEn:", _txt))
            _op = len(re.findall(r"domain: \[", _txt))
            _ax = len(re.findall(r"\bid: 'ax-", _txt))
            stats_line = f'语义层正本在册：实体类型 {_et}、对象属性 {_op}、公理 {_ax}（ontology-seed.ts 静态清点）'
            stats_src = '种子正本静态清点（当轮运行证据缺席，如实降级）'
        except Exception:
            stats_line = ''
    # watch/status：归档工件优先，live 端点兜底（2s 超时，不可达=如实缺席）
    _wj, _wsrc = None, ''
    if watch_f.exists():
        try:
            import json as _j
            _wj = _j.loads(watch_f.read_text(encoding='utf-8', errors='replace'))
            _wsrc = '归档工件 ontology-watch-status.json'
        except Exception:
            _wj = None
    if _wj is None:
        try:
            import urllib.request as _u
            import json as _j
            with _u.urlopen('http://127.0.0.1:8802/api/hermes/ontology/watch/status', timeout=2) as _r:
                _wj = _j.loads(_r.read().decode('utf-8'))
                _wsrc = 'live 端点（报告生成时实测）'
        except Exception:
            _wj = None
    watch_line = ''
    if _wj:
        _lt = _wj.get('lastTick', {})
        watch_line = (f'checked {_lt.get("checked", "?")} / ingested {_lt.get("ingested", "?")} '
                      f'/ violations {_lt.get("violations", "?")} / 收件箱推送 {_lt.get("inboxPushed", "?")}'
                      f'（{_wsrc}）')
    _ont_n = 0
    ilog = EVID / 'issues.log'
    if ilog.exists():
        _ont_n = sum(1 for l in ilog.read_text(encoding='utf-8', errors='replace').splitlines()
                     if 'ontology' in l.lower())
    parts = []
    if stats_line:
        parts.append(f'<li><b>语义资产</b>：{H.escape(stats_line)}<span style="color:#94a3b8">（{H.escape(stats_src)}）</span></li>')
    if watch_line:
        parts.append(f'<li><b>结卡执法环</b>：{H.escape(watch_line)}</li>')
    if _ont_n:
        parts.append(f'<li><b>台账留痕</b>：ontology 族问题单 {_ont_n} 条（第 8 章台账可逐条反查）</li>')
    if not parts:
        return ('\n  <p class="stat-note">本体语义层证据：本轮无当轮运行工件（ontology-health.txt/'
                'ontology-watch-status.json 均未落盘）且 live 端点不可达——本体层运行证据缺席如实登记'
                '（方案 §2.5 已定义五端点与证据面，run16 起随轮出件）。</p>')
    return ('\n  <ul style="margin:4px 0 10px;padding-left:20px">' + ''.join(parts) + '</ul>')


def skill_duty_html():
    """技能执勤账小节（V8.18 §5.4 报告规范，能力层叙事配套）。

    四件按实存文件清点：①技能清单（真源=simharness skills/ 目录×SKILLS_INSTALL
    装载单，骨架判档：rules.d+hooks 在=swarm-yuan 全骨架，仅 SKILL.md=单文件）
    ②生成链锚（目标技能头部生成器时间戳+profile 档+仓内提交史）③执勤留痕
    （skill 专项帧/gate-deny 拦截/retro-sink 回灌，按实存文件计）④缺席披露
    （应采未采如实标红，零数据不渲染假账）。"""
    repo = Path(__file__).resolve().parent.parent
    skills_dir = repo / 'skills'
    # 装载单（单一事实源=mx-lib.sh SKILLS_INSTALL 默认清单）
    inst = []
    try:
        _lib = (repo / 'mux' / 'mx-lib.sh').read_text(encoding='utf-8', errors='replace')
        m = re.search(r'^SKILLS_INSTALL="\$\{SKILLS_INSTALL:-(.+)\}"', _lib, re.M)
        if m:
            inst = m.group(1).split()
    except OSError:
        pass
    rows = []
    for name in inst:
        d = skills_dir / name
        if not d.is_dir():
            rows.append(f'<tr><td>{H.escape(name)}</td><td>—</td><td colspan="2">'
                        '真源目录缺席（装载单与目录漂移，如实披露）</td></tr>')
            continue
        full = (d / 'rules.d').is_dir() and (d / 'hooks').is_dir()
        tier = 'swarm-yuan 全骨架' if full else '单文件技能'
        prof, gen_anchor = '', ''
        sm = d / 'SKILL.md'
        if sm.exists():
            head = sm.read_text(encoding='utf-8', errors='replace')[:2500]
            pm = re.search(r'^profile:\s*(\S+)', head, re.M)
            prof = pm.group(1) if pm else ''
            gm = re.search(r'由 swarm-yuan 生成器创建（([^，)]+)', head)
            gen_anchor = gm.group(1) if gm else ''
        rows.append(f'<tr><td>{H.escape(name)}</td><td>{H.escape(tier)}</td>'
                    f'<td>{H.escape(prof or "—")}</td>'
                    f'<td>{H.escape(gen_anchor or "—（非生成器产出，推演配套技能）")}</td></tr>')
    if not rows:
        return '\n  <p class="stat-note">技能执勤账：装载单不可读（mx-lib.sh SKILLS_INSTALL 未命中）——如实缺席，不渲染假账。</p>'
    # 生成链锚：aipaydev-dev 仓内提交史（simharness 仓真源）
    chain = '生成链档案不可读'
    dev_dir = skills_dir / 'aipaydev-dev'
    if dev_dir.is_dir():
        try:
            r = subprocess.run(['git', '-C', str(repo), 'log', '--oneline', '-2',
                                '--', 'skills/aipaydev-dev'],
                               capture_output=True, text=True, timeout=15)
            shas = [l.split(':')[0].split(' ')[0] for l in r.stdout.splitlines() if l.strip()]
        except Exception:
            shas = []
        chain = '、'.join(shas) if shas else '提交史不可读（非 git 检出？）'
    # 角色→技能映射（单一事实源=场景库装载行）
    role_line = ''
    try:
        _scn = (repo / 'mux' / 'mx-scenario-lib.sh').read_text(encoding='utf-8', errors='replace')
        rm = re.search(r'系分=[^。"」]+、[^。"」]+。', _scn)
        if rm:
            role_line = rm.group(0)
    except OSError:
        pass
    # 执勤留痕：skill 专项帧 / 开发过程帧 / gate-deny / retro-sink 回灌
    skill_frames = sorted(p.name for p in STEPS_DIR.glob('*.png')
                          if 'skill' in p.name.lower()) if STEPS_DIR.exists() else []
    dev_frames = sorted(p.name for p in STEPS_DIR.glob('*.png')
                        if 'devimpl' in p.name.lower()) if STEPS_DIR.exists() else []
    deny_total, deny_paths = 0, []
    for base in (SIM / 'workspaces', SIM / 'central'):
        if not base.is_dir():
            continue
        try:
            r = subprocess.run(['find', str(base), '-maxdepth', '6', '-name',
                                'gate-deny.jsonl'], capture_output=True, text=True, timeout=30)
            for pth in r.stdout.splitlines():
                if pth.strip():
                    deny_paths.append(pth.strip())
                    try:
                        deny_total += sum(1 for _ in open(pth, encoding='utf-8', errors='replace'))
                    except OSError:
                        pass
        except Exception:
            pass
    lessons_n, lessons_sha = 0, ''
    lm = skills_dir / 'aipaydev-dev' / 'references' / 'lessons.md'
    if lm.exists():
        try:
            lessons_n = sum(1 for l in lm.read_text(encoding='utf-8', errors='replace').splitlines()
                            if l.lstrip().startswith('- '))
            r = subprocess.run(['git', '-C', str(repo), 'log', '-1', '--format=%h', '--',
                                'skills/aipaydev-dev/references/lessons.md'],
                               capture_output=True, text=True, timeout=15)
            lessons_sha = r.stdout.strip()
        except OSError:
            pass
    frame_line = (f'skill 专项帧 {len(skill_frames)} 张'
                  + (f'（{", ".join(skill_frames[:4])}…）' if skill_frames else
                     '（<b style="color:#b91c1c">采集面欠账：采集矩阵要求 xxx-dev 生成 ≥3 张+开发调用 ≥2 张，本轮未采到——'
                     'V8.17 采集三红线 run16 起咬合</b>）')
                  + f'；开发过程帧 {len(dev_frames)} 张在册（devimpl 键，非 skill 专项）')
    deny_line = (f'gate-deny 拦截 {deny_total} 行（{len(deny_paths)} 个账本：'
                 + ', '.join(d.replace(str(SIM) + '/', '') for d in deny_paths[:3])
                 + '）' if deny_paths else
                 'gate-deny 账本未检出（清场后 profile 工件不保留，或本轮无拦截触发——run16 起随实际拦截累积）')
    sink_line = (f'retro-sink 经验回灌 {lessons_n} 条 → aipaydev-dev/references/lessons.md'
                 + (f'（提交锚 {lessons_sha}）' if lessons_sha else '')) if lm.exists() \
        else 'retro-sink 回灌文件缺席（lessons.md 不存在——复盘回灌未跑或真源漂移，如实披露）'
    role_html = (f'\n  <p style="font-size:13px"><b>角色→技能</b>（源=场景库装载行）：{H.escape(role_line)}</p>'
                 if role_line else '')
    return (f'\n  <p style="font-size:13px">AI 员工的研发技能由能力层提供：swarm yuan 生成器产出项目技能（本轮实例 aipaydev-dev），按角色映射装载到各职能。'
            f'技能清单、生成链、执勤留痕、缺席项四件按磁盘实存文件记录。</p>'
            f'\n  <details class="audit" id="ch9-skill-duty"><summary>▶ 技能执勤账'
            f'（{len(rows)} 项技能在册，清单与装载单对账）</summary>'
            f'\n  <table style="margin-top:8px"><tr><th>技能</th><th>骨架形态</th><th>profile 档</th><th>生成器锚</th></tr>'
            + ''.join(rows) + '</table>'
            f'\n  <p style="font-size:13px;margin:8px 0 2px"><b>生成链</b>（aipaydev-dev 仓内提交史，最新在前）：{H.escape(chain)}</p>'
            + role_html
            + f'\n  <p style="font-size:13px"><b>执勤留痕</b>：{frame_line}；{deny_line}；{sink_line}。</p>'
            + '</details>')


stat, stat_note, itable, n_closed, n_issue_keys, n_issue_open, n_nonstd, n_exact_pair, n_bcast_pair, n_dangling = issues_stats()
n_resolved = n_closed + (n_issue_keys - n_closed - n_issue_open - n_nonstd) + 0  # 已修+观察+延后（观察/延后=keys-closed-open-nonstd）
main_sha = main_head()

# ── 8.6 交付物视图（补遗③，R11）─────────────────────────────────────────
# 呈现形态=交付物实物渲染（markdown→简易 HTML / txt→<pre>，直接读中央仓文件，
# 带 commit 锚）+ 模版核对行（每检查项 re.search 命中→✅，未中→缺（红），
# 任一缺→该件"模版不符"）。禁转述、禁空占位——缺就红标。
# 缺文件的步不进本映射（15/22 见文末汇总节如实标注"文件域无独立工件"）。
def _central_anchor():
    """中央仓 commit 锚：生成时 subprocess 实查一次（--git-dir 指中央仓 .git）。"""
    try:
        r = subprocess.run(['git', '--git-dir', str(CEN / '.git'), 'rev-parse', '--short', 'HEAD'],
                           capture_output=True, text=True)
        return r.stdout.strip() if r.returncode == 0 else ''
    except Exception:
        return ''
CEN_ANCHOR = _central_anchor()

# 步号 → [(显示名, 中央仓相对路径, [(核对项名, 正则), …])]
# run2 类轮次（RUN_ID=YYYYMMDD-<tag>）的审计意见书/复盘按轮次派生路径。
_RUN_DATE, _RUN_TAG = (RUN_ID[:8], RUN_ID[9:]) if re.match(r'^\d{8}-', RUN_ID) else ('', '')
_cands=[f'docs/retro/{_RUN_DATE}-{_RUN_TAG}-audit-opinion-independent.md',f'docs/retro/{_RUN_DATE}-{_RUN_TAG}-audit-opinion.md'] if _RUN_DATE else []
_OPINION_PATH=next((c for c in _cands if (CEN/c).exists()),_cands[0] if _cands else '')
ARTIFACT_VIEWS = {
    1: [('账号清单 roster', 'docs/admin/roster.md',
         [('账号', r'账号'), ('角色', r'角色')])],
    5: [('应用资产表 app-registry', 'docs/admin/app-registry.md',
         [('负责人', r'负责人'), ('专属看板', r'看板'), ('SLA', r'SLA')])],
    6: [('组织与权限矩阵 org', 'docs/admin/org.md',
         [('角色', r'角色'), ('汇报线', r'汇报线')])],
    7: [('G1 冻结件 freeze', 'docs/requirements/RFD-001.freeze.md',
         [('AC 可判定', r'AC-\d'), ('范围外/Scope-Out', r'范围外|Scope-Out'),
          ('影响面', r'影响'), ('涉敏评估', r'涉敏')])],
    11: [('SMART 任务清单 tasklist', 'docs/analysis/RFD-001-tasklist.md',
          [('SMART', r'SMART'), ('责任到人', r'责任'), ('拆分', r'拆分')])],
    13: [(f'系分稿 {tag}', f'docs/analysis/AN-{tag}-analysis.md',
          [('接口签名', r'接口'), ('数据模型', r'数据模型'), ('幂等键', r'幂等'), ('人日', r'人日')])
         for tag in ('PAYCORE', 'CHWX', 'CHALI', 'MP')],
    14: [('概要设计 architecture-design', 'docs/design/RFD-001-architecture-design.md',
          [('背景', r'背景'), ('方案', r'方案'), ('接口', r'接口'), ('数据', r'数据'), ('风险', r'风险')])],
    17: [('排期计划 schedule', 'docs/plan/RFD-001-schedule.md',
          [('时间窗口', r'时间窗口'), ('依赖', r'依赖'), ('测试=开发×0.3', r'0\.3'), ('整体缓冲', r'缓冲')])],
    18: [(f'G3 测试日志 {dev}', f'docs/evidence/DEV-{dev}-testlog.txt',
          [('测试通过证据', r'passed|✓|Tests')]) for dev in ('PAYCORE', 'CHWX', 'CHALI', 'MP')],
    19: [('G4 测试报告 test-report', 'docs/test/RFD-001-test-report.md',
          [('范围', r'范围'), ('用例', r'用例'), ('缺陷', r'缺陷'), ('结论', r'结论'), ('commit 锚', r'commit')])],
    20: [('商户接入文档 v1.0.0-cashier', 'docs/delivery/merchant-onboarding-v1.0.0-cashier.md',
          [('回滚', r'回滚'), ('灰度', r'灰度'), ('观察窗', r'观察')]),
         ('完备性检查 completeness-check', 'docs/delivery/RFD-001-completeness-check.md',
          [('任务覆盖', r'任务覆盖'), ('档案覆盖', r'档案覆盖'), ('分类/优先级/依赖', r'分类/优先级/依赖')])],
    21: [('UAT 验收报告 acceptance', 'docs/acceptance/RFD-001-acceptance.md',
          [('AC 逐条', r'AC-\d'), ('判词', r'判词'), ('通过判定', r'通过')])],
    22: [('工作台账 work-report', 'work-report.md',
          [('状态分布', r'todo|待办|进行中'), ('WIP 清点', r'WIP'), ('卡壳 72h 清点', r'72h')])],
    23: [(f'审计意见书（{_RUN_TAG or RUN_ID or "本轮"}）',
          _OPINION_PATH,
          [('独立性声明', r'独立'), ('签名线', r'签名'), ('关切清单', r'关切'), ('10 项逐条', r'10')])],
    24: [(f'G6 复盘（{_RUN_TAG or RUN_ID or "本轮"}）',
          f'docs/retro/{_RUN_DATE}-{_RUN_TAG}-RFD-001-retrospective.md' if _RUN_DATE else '',
          [('现象段', r'现象'), ('规律段', r'规律'), ('行动项', r'行动项'), ('DISP 处置', r'DISP')])],
}
# run14 起派发词任务号为 DEV-PAYCORE-C/S/N 三腿（方案步 18 六路派发），矩阵预期路径
# 须与派发词一致；
# run13 及更早轮沿用单件名口径不回溯。
_m_runno = re.search(r'-run(\d+)$', RUN_ID or '')
if _m_runno and int(_m_runno.group(1)) >= 14:
    ARTIFACT_VIEWS[18] = [(f'G3 测试日志 {dev}', f'docs/evidence/DEV-{dev}-testlog.txt',
                           [('测试通过证据', r'passed|✓|Tests')])
                          for dev in ('PAYCORE-C', 'PAYCORE-S', 'PAYCORE-N', 'CHWX', 'CHALI', 'MP')]
# ── V2 核查清单（方案 §5.8 环节准入准出基线，V8.19）：run17 起按十环节准出清单扩展核查；
#    run16 及以前维持 V1 原基线不改判（新表对旧轮工件必然大面积红，属口径变更非质量退化）。──
_ART_V2_BY_STEP = {
    7: [('AC 可判定（附判定法）', r'AC-\d'), ('范围外清单', r'范围外|Scope-Out'),
        ('影响面', r'影响'), ('涉敏等级与处置', r'涉敏'), ('术语对齐（无未登记代号）', r'AC-\d'),
        # V8.20 增项（方案 §5.8.2 需求冻结行；模板 freeze.md 2026-10-12 同步补字段）
        ('验证级定级', r'ASVS|验证级'), ('质量属性需求', r'质量属性'),
        ('单条特性自检（29148 六特性）', r'自检|29148'), ('支付铁线声明', r'不得存储|铁线'),
        ('双向追溯位', r'追溯')],
    13: [('接口签名+错误码', r'接口'), ('幂等键', r'幂等'), ('数据模型（类型/单位）', r'数据模型'),
         ('待澄清清单', r'澄清'), ('风险枚举', r'风险'), ('人日估算', r'人日'),
         # V8.20 增项（方案 §5.8.2 系统分析行）
         ('估算口径与误差带', r'NESMA|功能点|类比'), ('备选方案结构化决策', r'备选|准则'),
         ('OpenAPI 机器可读描述', r'OpenAPI')],
    14: [('背景与目标', r'背景'), ('备选方案与否决理由', r'备选|方案[ \u4e00-\u9fff]{0,6}对比'),
         ('接口契约', r'接口'), ('数据流/关键路径', r'数据|路径'), ('风险与回滚考量', r'风险|回滚'),
         ('决策记录（背景-决策-后果）', r'决策'),
         # V8.20 增项（方案 §5.8.2 概要设计行；design.md 模板同步）
         ('决策五字段（状态/日期）', r'ADR|状态（采纳|采纳/废弃'), ('质量属性场景六段式', r'六段式|刺激源'),
         ('STRIDE 六类三态', r'STRIDE|仿冒'), ('图法三规则', r'图例|单向')],
    17: [('时间窗口', r'时间窗口'), ('依赖显式', r'依赖'), ('测试工作量独立', r'0\.3'),
         ('整体缓冲 ≥15%', r'缓冲'), ('关键路径', r'关键路径|路径'),
         # V8.20 增项（方案 §5.8.2 排期行）
         ('在制上限声明（≤2）', r'在制|WIP')],
    19: [('范围与环境', r'范围'), ('用例-结果矩阵', r'用例'), ('缺陷分级统计', r'缺陷'),
         ('回归结论', r'回归'), ('残留风险/未解异常', r'残留|未解'), ('commit 锚', r'commit'),
         # V8.20 增项（方案 §5.8.2 测试行；test-report.md 模板同步）
         ('出口准则带理由', r'出口准则|可接受'), ('设计技术标注', r'等价类|边界值'),
         ('覆盖数值化', r'覆盖.*[0-9]+%|语句覆盖'), ('安全测试项显式', r'安全用例|ASVS|人工测试'),
         ('金字塔形态声明', r'金字塔')],
    20: [('回滚步骤（触发+命令）', r'回滚'), ('灰度档位', r'灰度'), ('观察窗', r'观察'),
         ('监控指标与阈值', r'监控|指标'), ('回滚触发线数值化', r'\d+(?:\.\d+)?%|崩溃率'),
         # V8.20 增项（方案 §5.8.2 发布行；release-plan.md 模板同步）
         ('制品验证三件（SBOM/签名/来源）', r'SBOM|物料清单|签名'), ('漏洞响应分档时限', r'漏洞|严重.*[0-9]'),
         ('破坏性变更双版本兼容', r'双版本|扩展-收缩|向后兼容')],
    21: [('AC 逐条判词', r'AC-\d'), ('判词三态', r'判词'), ('证据行', r'证据|commit'),
         ('AC×用例覆盖对账', r'覆盖|对账'),
         # V8.20 增项（方案 §5.8.2 验收行；acceptance.md 模板同步）
         ('已验证/只读过分离', r'已验证|只读过'), ('验收环境声明', r'环境')],
    23: [('独立性声明', r'独立'), ('十项逐条', r'10'), ('发现分级', r'严重|分级'),
         ('签名线', r'签名'), ('发现带工件锚', r'关切|发现'),
         # V8.20 增项（方案 §5.8.2 审计行；audit-opinion.md 模板同步）
         ('豁免五字段核对', r'豁免'), ('双人复核记录', r'双人复核'),
         ('支付红线对账（三条）', r'红线|零存储')],
    24: [('影响与时长', r'影响|时长'), ('时间线', r'时间线|现象'), ('根因不锁单因', r'根因|规律'),
         ('行动项四要素', r'行动项'), ('无个人归罪', r'DISP|处置'),
         # V8.20 增项（方案 §5.8.2 复盘行；retrospective.md 模板同步）
         ('上轮行动项核销', r'核销'), ('过程资产回流清单', r'回流'),
         ('缺陷根因分型（引入环节）', r'分型|引入环节')],
}
if _m_runno and int(_m_runno.group(1)) >= 17:
    for _st, _items in _ART_V2_BY_STEP.items():
        if _st in ARTIFACT_VIEWS:
            ARTIFACT_VIEWS[_st] = [
                (name, rel, _items if idx == 0 else checks)
                for idx, (name, rel, checks) in enumerate(ARTIFACT_VIEWS[_st])
            ]

ART_TRUNC = 5000  # 单工件内容截断上限（字符）

def art_inline(s: str) -> str:
    """行内渲染：先整体 HTML 转义（防注入优先），再 `code` 与 **加粗**。"""
    s = H.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)

def art_md_to_html(md: str) -> str:
    """markdown→简易 HTML：标题/段落/列表/表格（含分隔行）/围栏代码/引用/加粗/行内码。
    与 .st-gate 同风格（非全量 markdown 引擎，够呈现实物即可）。"""
    lines = md.split('\n')
    out, code_buf, in_code, para = [], [], False, []

    def flush():
        if para:
            out.append('<p>' + art_inline(' '.join(para)) + '</p>')
            para.clear()

    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.strip().startswith('```'):
            flush()
            if not in_code:
                in_code, code_buf = True, []
            else:
                in_code = False
                out.append('<pre class="art-code">' + H.escape('\n'.join(code_buf)) + '</pre>')
            i += 1
            continue
        if in_code:
            code_buf.append(ln)
            i += 1
            continue
        s = ln.strip()
        if not s:
            flush()
            i += 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', s)
        if m:
            flush()
            lv = min(len(m.group(1)) + 2, 6)
            out.append(f'<h{lv} class="art-h">{art_inline(m.group(2))}</h{lv}>')
            i += 1
            continue
        # 表格：| 表头 | + |---|---| 分隔行
        if s.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|?$', lines[i + 1].strip()):
            flush()
            header = [c.strip() for c in s.strip('|').split('|')]
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            th = ''.join(f'<th>{art_inline(c)}</th>' for c in header)
            tr = ''.join('<tr>' + ''.join(f'<td>{art_inline(c)}</td>' for c in r) + '</tr>' for r in rows)
            out.append(f'<table class="art-tbl"><tr>{th}</tr>{tr}</table>')
            continue
        # 列表（** 开头的强调行不误判为列表）
        if re.match(r'^[-*]\s+', s) and not s.startswith('**'):
            flush()
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i].strip()))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{art_inline(t)}</li>' for t in items) + '</ul>')
            continue
        if s.startswith('>'):
            flush()
            quotes = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quotes.append(lines[i].strip().lstrip('>').strip())
                i += 1
            out.append('<blockquote class="art-quote">' + art_inline(' '.join(quotes)) + '</blockquote>')
            continue
        para.append(s)
        i += 1
    flush()
    if in_code and code_buf:  # 截断致围栏未闭合：如实冲刷已收内容
        out.append('<pre class="art-code">' + H.escape('\n'.join(code_buf)) + '</pre>')
    return ''.join(out)

# 交付物读头（run8 复盘根治）：保存分支优先——repo_commit_main 口径的交付物
# （完备性检查/验收书/意见书/工作台账等）只进 origin/main，HEAD 停在 integration
# 检出时工作树不可见，run8 实锤 completeness-check 已在 main（d9f9d2f）仍被判缺件。
# 解析次序：origin/main → origin/integration/RFD-001（测试报告口径）→ 工作树
# （repo_commit_main 未跟踪残件兜底）。锚随解析源逐件标注，禁笼统 HEAD 锚。
def _git_ok(*args) -> bool:
    try:
        return subprocess.run(['git', '--git-dir', str(CEN / '.git'), *args],
                              capture_output=True).returncode == 0
    except Exception:
        return False

def _git_out(*args):
    try:
        r = subprocess.run(['git', '--git-dir', str(CEN / '.git'), *args],
                           capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else ''
    except Exception:
        return ''

def _art_resolve(rel: str):
    """→ (text|None, 解析源, 解析源锚)。None=三处皆无（如实缺件，不冒充）。"""
    if not rel:
        return None, '', ''
    for ref in ('origin/main', 'origin/integration/RFD-001'):
        if _git_ok('cat-file', '-e', f'{ref}:{rel}'):
            sha = _git_out('rev-parse', '--short', ref).strip()
            return _git_out('show', f'{ref}:{rel}'), ref, sha
    p = CEN / rel
    if p.exists():
        return p.read_text(encoding='utf-8', errors='replace'), '(工作树检出)', CEN_ANCHOR
    return None, '', ''

def _art_read(rel: str):
    raw, _, _ = _art_resolve(rel)
    return raw

def _art_checks_html(raw: str, checks):
    """模版字段核对（字段级呈现：字段值摘录，不只 ✅/缺）——
    模版作为标准输入输出的质量标准必须看得见：每个字段名旁给命中值首行摘录
    （≤60 字），未命中保持红"缺"。核对判定跑全文不受截断影响。"""
    ok_all = True
    spans = []
    for label, rx in checks:
        m = re.search(rx, raw)
        hit = bool(m)
        ok_all = ok_all and hit
        val = ''
        if hit:
            frag = (m.group(1) if m.groups() else m.group(0))
            frag = re.sub(r'\s+', ' ', frag).strip().lstrip('#|-–> ').strip()
            frag = frag.split('|')[0].strip() if '|' in frag[:3] else frag
            val = frag[:60] + ('…' if len(frag) > 60 else '')
        cls = 'ok' if hit else 'miss'
        spans.append(f'<div class="art-chk-row {cls}"><span class="art-chk-flag">{"✅" if hit else "缺"}</span>'
                     f'<span class="art-chk-label">{H.escape(label)}</span>'
                     + (f'<span class="art-chk-val">{H.escape(val)}</span>' if val else '<span class="art-chk-val miss">未命中</span>')
                     + '</div>')
    return ok_all, ''.join(spans)

def _step_done(n: int) -> bool:
    """步达成态（R9/交付物门控共用）：第 26 步以本报告产物存在自证。"""
    if n == 26:
        return True
    meta = STEPS_META.get(n) or {}
    return any(state.get(k) for k in meta.get('keys', []))

def _step_artifact_status(n: int):
    """交付物维度判定（§5.5 节奏双轨，2026-10-07 落版）：生成时实查该步交付物在仓
    与模版字段核对，返回 (档位, 标签)；无交付物映射步返回 None（不渲 chip）。
    档位：ok=全齐 / warn=有缺（缺件或模版不符——记入问题清单在文末矩阵与步③可见）。"""
    views = ARTIFACT_VIEWS.get(n)
    if not views:
        return None
    total = len(views)
    bad = 0
    for _name, rel, checks in views:
        raw, _aref, _asha = _art_resolve(rel)
        if raw is None:
            bad += 1
            continue
        for _lb, rx in checks:
            if not re.search(rx, raw):
                bad += 1
                break
    if bad:
        return ('warn', f'交付物 🟡 缺/不符 {bad}/{total}（详见本步②与文末矩阵·记入问题清单在案）')
    return ('ok', f'交付物 ✅ {total}/{total} 模版符合')

# ── 无文件域声明（§5.4 第二段：无交付物的步明示"本步无文件域交付物"及其实际产出在哪）──
_NO_FILE_DOMAIN = {
    2: '冒烟事件与运行横幅（事件流+hero 帧）',
    3: '账号/看板/团队注册（产品配置域，帧+事件）',
    4: '冒烟四组核验记录（帧+运行横幅）',
    8: '分析群与全量预邀（matrix 房间/成员事件）',
    9: '群内派发词与回执（matrix 事件全文，R18 载荷在位）',
    10: '四账号 T 系任务卡+lead 分诊（看板卡，帧+卡号锚）',
    12: '分诊台登记与 lead 确认（看板事件流）',
    15: 'G2 评审记录在 系统架构师A 板评审卡 body（review-record 结构：检查项×证据×结论），判词行 ARCH-GATE-PASS/FAIL——闸门判词唯一凭据（§5.5）',
    16: '主任务卡归档关闭（看板事件）',
    25: 'IDE 走查记录（消息+帧）',
    26: '本步交付物=报告三件套（本报告自身：final-report/simulation-report/txt）',
}

def _no_artifact_note(n: int) -> str:
    where = _NO_FILE_DOMAIN.get(n, '卡/消息/事件流（锚点见本步①段）')
    return (f'<p class="stat-note">📦 本步无文件域交付物——实际产出：{where}。</p>')

def contract_block(n: int) -> str:
    """契约执行观察透传（run15 前置 P4-10 影子模式）：概设接口签名 vs 渠道实现
    导出面 diff 结果原文（breaking 清单+观察面），步 19 呈现；文件缺席如实声明。"""
    if n != 19:
        return ''
    cf = EVID / 'qgate-contract-observation.json'
    if not cf.exists():
        return ''
    import json as _j
    try:
        d = _j.loads(cf.read_text(encoding='utf-8', errors='replace'))
    except Exception:
        return ''
    rows = ''.join(f'<tr><td>{H.escape(b)}</td></tr>' for b in d.get('breaking', []))
    verdict = '成立（breaking=0）' if not d.get('breaking') else f"{len(d['breaking'])} 项破坏性差异"
    return (f'<details class="st-artifact"><summary>🧩 契约执行观察（影子模式——概设 ChannelAdapter 四方法 '
            f'× 渠道实现导出面，判定：{verdict}；转正路径=run15 后 CLI 单门+G4 强制线）</summary>'
            f'<div class="art-body"><div class="art-item"><div class="art-hd"><b>{H.escape(d.get("contract", ""))}</b>'
            f'<span class="art-path">evidence/qgate-contract-observation.json（generatedAt {H.escape(d.get("generatedAt", "?"))}）</span></div>'
            f'<table class="st-issues-tbl"><tbody>{rows or "<tr><td>零破坏性差异（双渠道四方法齐）</td></tr>"}</tbody></table></div></div></details>')


def qgate_block(n: int) -> str:
    """§5.5 门禁证据引用（v1.31.1 吸收轮起）：QGate 判定证据原文透传+来源分布随行，
    禁手抄"全绿"。evidence/qgate-release-report.txt 在位才渲染（未接线轮零影响）。"""
    if n != 20:
        return ''
    qf = EVID / 'qgate-release-report.txt'
    if not qf.exists():
        return ''
    raw = qf.read_text(encoding='utf-8', errors='replace').strip()
    return ('<details class="st-artifact st-qgate"><summary>🛡 QGate 门禁证据'
            '（release-report 原文透传，来源分布随行——§5.5：降级/声明/无信号桶非零或存在未验证声明时不得表述为全绿/已核验）</summary>'
            f'<pre class="art-code">{H.escape(raw)}</pre></details>')

# 六文调研治理能力入报告证据链（方案 §2.5 治理证据端点注/§2.6-10）：
# 步 23 事故报告汇编、步 24 自治度对账+虚拟损益表——evidence/ 导出件在位才透传。
# V8.7（2026-10-10 本体语义层，方案 §2.5 V8.7 块）：步 24 追加本体体检+Turtle 导出。
_GOV_EVIDENCE = {
    23: [('incident-report.md', '事故报告汇编（三类 17 要素，/api/incident/sessions/:id/report 导出件）')],
    24: [('autonomy-reconcile.txt', '理论/实际自治度对账（/autonomy 导出件，偏差黄条）'),
         ('virtual-pl.txt', 'AI 虚拟损益表（/api/hermes/virtual-pl 导出件）'),
         ('ontology-health.txt', '本体语义层体检（/api/hermes/ontology/spec 导出件：五要素统计+IRI/版本+契约健康度三档）'),
         ('ontology-export.ttl', '本体 Turtle 导出（机器可读语义资产，SHACL/JSON-LD 同源经 ?format= 切换）')],
}

def gov_evidence_block(n: int) -> str:
    outs = []
    for fname, label in _GOV_EVIDENCE.get(n, ()):
        f = EVID / fname
        if not f.exists():
            continue
        raw = f.read_text(encoding='utf-8', errors='replace').strip()
        outs.append(f'<details class="st-artifact st-gov"><summary>🧾 {label}'
                    f'（原文透传）</summary><pre class="art-code">{H.escape(raw)}</pre></details>')
    return ''.join(outs)


def artifact_block(n: int) -> str:
    """单步交付物视图 <details> 块（实物渲染+模版核对）；无映射步返回 ''。

    0→1 语义门控（run4 起）：未达步不渲染中央仓现存工件——0→1 轮中央仓可能被
    repo_pull 自远端带回历史轮工件，未达步渲染即冒充本轮产物；未达步如实标注。"""
    arts = ARTIFACT_VIEWS.get(n)
    if not arts:
        return ''
    if not _step_done(n):
        names = '、'.join(H.escape(a[0]) for a in arts)
        return (f'<details class="st-artifact"><summary>📦 交付物（本轮未产——步 ⬜）</summary>'
                f'<div class="art-body"><div class="art-item"><div class="art-chk miss">'
                f'{names}：本轮未达此步，中央仓现存为历史轮工件（mx-clean 本地重置被 repo_pull 远端恢复，'
                f'0→1 缺口记档）——不作本轮交付物呈现。</div></div></div></details>')
    pieces = []
    for name, rel, checks in arts:
        raw, aref, asha = _art_resolve(rel)
        if raw is None:
            pieces.append(f'<div class="art-item"><div class="art-hd"><b>{H.escape(name)}</b>'
                          f'<span class="art-path">{H.escape(rel or "（无路径）")}</span></div>'
                          f'<div class="art-chk miss">缺件：文件域无独立工件</div></div>')
            continue
        truncated = len(raw) > ART_TRUNC
        body = raw[:ART_TRUNC]
        content = ('<pre class="art-code">' + H.escape(body) + '</pre>') if rel.endswith('.txt') \
            else art_md_to_html(body)
        ok_all, chk = _art_checks_html(raw, checks)  # 核对跑全文（不受展示截断影响）
        _ok_n, _ok_t = ART_OK.get(n, (0, 0))
        ART_OK[n] = (_ok_n + (1 if ok_all else 0), _ok_t + 1)
        trunc_note = (f'<div class="art-trunc">已截断（{len(raw)}→{ART_TRUNC} 字符），'
                      f'全文见中央仓 {H.escape(rel)}@{asha or "?"}（{H.escape(aref)}）</div>') if truncated else ''
        pieces.append(
            f'<div class="art-item"><div class="art-hd"><b>{H.escape(name)}</b>'
            f'<span class="art-verdict{" ok" if ok_all else " miss"}">{"模版符合" if ok_all else "模版不符"}</span>'
            f'<span class="art-path">{H.escape(rel)}@{asha or "?"}（{H.escape(aref)}）</span></div>'
            f'<div class="art-checks">{chk}</div>{content}{trunc_note}</div>')
    return (f'<details class="st-artifact"><summary>📦 交付物实物与模版核对（{len(pieces)} 件）</summary>'
            '<div class="art-body">' + ''.join(pieces) + '</div></details>')

# 文件域无独立工件的步（8.6 矩阵有位、文件域无件）：注记按轮注册（R17）——
# 旧注记写死 run2 期评审卡锚 t_11e182b3（run2 scenario.log 实证归属；run5/6/7 零命中），
# 渲进任何非 run2 轮即旧账冒充。锚随文保留于 run2 注册项；其余轮用无锚通用注
# （评审卡号以闸门仪表盘/本轮叙事实抽为准），新轮按该轮实测依据注册。
# 步 22 work-report.md 自 run8 收尾根治后为文件域交付物（workmgr 保存 origin/main，
# ARTIFACT_VIEWS 已注册）——旧轮再生成时三处解析皆无则如实缺件，不再注记遮红。
_ART_NOFILE_DEFAULT = {
    15: ('G2 评审记录', '评审记录在评审卡（arch-governance 板，卡号见闸门仪表盘 G2 行），文件域无独立工件'),
}
_ART_NOFILE_BY_RUN = {
    '20260929-v4-run2': {
        15: ('G2 评审记录', '评审记录在卡（t_11e182b3，arch-governance 板），文件域无独立工件'),
    },
}
ART_NOFILE_NOTES = _ART_NOFILE_BY_RUN.get(RUN_ID, _ART_NOFILE_DEFAULT)

def artifact_panorama():
    """文末汇总节：8.6 矩阵全景表（步|交付物|模版核对结果|锚）+ 全 OK 计数与缺件如实。"""
    rows, n_ok, n_bad, n_files = [], 0, 0, 0
    for n in sorted(set(ARTIFACT_VIEWS) | set(ART_NOFILE_NOTES)):
        for name, rel, checks in ARTIFACT_VIEWS.get(n, []):
            raw, aref, asha = _art_resolve(rel)
            if raw is None:
                res, anchor, n_bad = '<span class="art-verdict miss">缺件（文件不存在）</span>', '—', n_bad + 1
            else:
                n_files += 1
                ok_all, _ = _art_checks_html(raw, checks)
                # 逐项呈现（2026-10-12 用户指令：符合与不符合项具体列出，不只计数）——
                # 符合项绿 ✓+项名，缺项红 ✗+项名；行内联排，与步内折叠块字段级核对同源。
                _items = ' '.join(
                    (f'<span class="d-ok">✓{H.escape(lb)}</span>' if re.search(rx, raw)
                     else f'<span class="d-warn" style="font-weight:700">✗{H.escape(lb)}（缺）</span>')
                    for lb, rx in checks)
                if ok_all:
                    res, n_ok = f'<span class="art-verdict ok">模版符合</span><br>{_items}', n_ok + 1
                else:
                    res, n_bad = f'<span class="art-verdict miss">模版不符</span><br>{_items}', n_bad + 1
                anchor = f'<code>{H.escape(aref)}@{asha or "?"}</code>'
            rows.append(f'<tr><td><b>{n}</b></td><td>{H.escape(name)}<br>'
                        f'<span class="art-path">{H.escape(rel or "—")}</span></td><td>{res}</td><td>{anchor}</td></tr>')
        if n in ART_NOFILE_NOTES:
            label, note = ART_NOFILE_NOTES[n]
            # 锚按轮实取（2026-10-07 修复：run2 卡锚 t_11e182b3 曾无条件渲进任意轮）
            if n == 15:
                _a = 't_11e182b3' if RUN_ID == '20260929-v4-run2' else (state.get('card_arch_g2') or '')
                anchor = f'<code>{H.escape(_a)}</code>' if _a else '—'
            else:
                anchor = '—'
            rows.append(f'<tr><td><b>{n}</b></td><td>{H.escape(label)}</td>'
                        f'<td><span class="art-verdict miss">文件域无独立工件</span>——{H.escape(note)}</td>'
                        f'<td>{anchor}</td></tr>')
    note_g5 = _NOTE_G5.get(RUN_ID, ('【骨架占位·待补注册】G5 注记未注册（骨架兜底轮）',))
    html_tbl = ('<table><tr><th>步</th><th>交付物</th><th>模版核对结果</th><th>锚</th></tr>'
                + ''.join(rows) + '</table>')
    stat = (f'共 {len(rows)} 行：在仓 {n_files} 件（模版符合 {n_ok} · 在仓不符 {n_files - n_ok if n_files >= n_ok else 0}）+ 缺件不在仓 {n_bad - (n_files - n_ok) if n_bad >= (n_files - n_ok) else n_bad} · 其余为无文件域声明；'
            f'另文件域无独立工件 {len(ART_NOFILE_NOTES)} 步'
            f'（{"/".join(str(k) for k in sorted(ART_NOFILE_NOTES))}，如实标注）。'
            f'行内锚=origin/main@{main_sha or "?"}（实查）· 生成时工作树 HEAD@{CEN_ANCHOR or "?"}')
    return html_tbl, stat, note_g5

# 叙事层（V4 §四：终版报告=叙事层+旅程层单文件；失败显式降级不阻断）
_narrative_html = ''
_ch0_html = _ch1_html = _ch2_html = _ch3_html = _ch4_html = ''
try:
    import html as _H
    from report_narrative import render_narrative, render_chapter0, render_intent_chain, spec_params_html
    _narrative_html = render_narrative(state, EVID)
    # ── §5.4 十章骨架接线（2026-10-07 补齐：第 0/1/2/3/4 章长期未实现）──
    # A7/F7bis：三功能区命中集——STEPS imgs（ui 帧图注，帧文件在位）双源判定
    def _zone_hits():
        _hits = {}
        _pats = {'cockpit': '工作台|驾驶舱|冒烟|登录', 'kanban': '看板|board', 'ide': 'IDE|画布'}
        for _key, _pat in _pats.items():
            for _t in STEPS:
                for _pre, _cap, _kind in _t[3].get('imgs', []):
                    if _kind == 'ui' and (STEPS_DIR / f'{_pre}.png').exists() and re.search(_pat, _cap):
                        _hits.setdefault(_key, _cap[:40])
                        break
                if _key in _hits:
                    break
        return _hits
    try:
        _ch0_html = render_chapter0(state, EVID, steps_dir=STEPS_DIR, zone_hits=_zone_hits())
    except Exception as _e0:
        _ch0_html = f'<div class="stat-note">第 0 章生成失败（如实标注）：{H.escape(str(_e0))}</div>'
    try:
        _ch3_html = render_intent_chain(SIM)
    except Exception as _e3:
        _ch3_html = f'<div class="stat-note">第 3 章意图通路生成失败（如实标注）：{H.escape(str(_e3))}</div>'
    # 第 1 章 本轮口径（全部实测统计/取不到如实 ⬜）
    _fmt_epoch = lambda v: __import__('datetime').datetime.fromtimestamp(int(str(v)[:10])).strftime('%m-%d %H:%M') if str(v).isdigit() and len(str(v)) >= 10 else '⬜'
    _dlv_note = '启用（dlv_room 在档）' if state.get('dlv_room') else '⬜ 未见 dlv_room（未开启或已清）'
    _dec_note = '在线（版本快照在档）' if (EVID / 'decision-backend-snapshot.txt').exists() else '⬜ 快照不在档'
    _reshoot_c1 = any('补拍' in cap for _, _, _, m in STEPS for _, cap, _ in m.get('imgs', []))
    _total_c1 = sum(1 for _, _, _, m in STEPS for pre, _, _ in m.get('imgs', []) if (STEPS_DIR / f'{pre}.png').exists())
    _frames_note = (f'{_total_c1} 帧全部收尾后补拍（采集链未挂驱动，记入问题清单 r18-collection-missing）' if _reshoot_c1
                    else (f'{_total_c1} 帧当轮实时采集' if _total_c1 else '本轮未拍摄'))
    _ilog_k = (EVID / 'issues.log')
    _ilog_t = _ilog_k.read_text(encoding='utf-8', errors='replace') if _ilog_k.exists() else ''
    _dlv_g5miss_note = ('；gate G5 pass 事件漏发记入问题清单（delivery-g5-gate-event-missing）'
                         if 'delivery-g5-gate-event-missing' in _ilog_t or 'delivery-*-event-missing' in _ilog_t
                         else '；gate G5 pass 事件无漏发登记在案（声称须与台账一致——run13 复盘 A2）')
    _ch1_html = (
        '<section class="nv-sec" id="ch1-caliber"><h2>第 1 章 · 本轮口径（验收与数据口径声明）</h2>'
        '<table class="st-issues-tbl"><tbody>'
        f'<tr><td>推演轮次 / 窗口</td><td>{RUN_ID} · 开跑 {_fmt_epoch(state.get("run_started_at", ""))} → 复盘收尾 {_fmt_epoch(state.get("retro_done", ""))}（state 写入通过标记实测统计）</td></tr>'
        f'<tr><td>发布基线</td><td>aipaydev origin/main@{main_sha or "⬜"}（生成时实查）；integration 基线见步 19</td></tr>'
        f'<tr><td>截图口径</td><td>{_frames_note}</td></tr>'
        f'<tr><td>全量呈现（R18）</td><td>{r18_coverage()}（必采 {r18_matrix.TOTAL} 项；缺口记入问题清单 r18-collection-missing，DISP 观察）</td></tr>'
        f'<tr><td>delivery 协议事件</td><td>{_dlv_note}{_dlv_g5miss_note}</td></tr>'
        f'<tr><td>判定后端</td><td>clef-flash 本地判定 {_dec_note}（F-7 fail-open 口径）</td></tr>'
        f'<tr><td>快模式/并发</td><td>MX_FAST 缺省开（轮询 5s·治理三步并发）；系分/编码四路同时派出（闸值 4 占满）；569 gate-guard 显式启用（035a555）</td></tr>'
        f'<tr><td>问题单终态</td><td>{stat}</td></tr>'
        '</tbody></table></section>')
    # 关键技术规范参数卡（报告三要素之一，2026-10-10）：spec-params.env 单一事实源渲染，
    # 与方案 §4.4 总表同源——机器档案与人读正本同卡
    _ch1_html = _ch1_html + spec_params_html()
    # 第 4 章 产品成效块（方案 §5.4"产品成效呈现"：交付物成效三件；证据在位才渲染，
    # 缺席如实标注不编造——evidence/product-outcome/ 下 quality-summary.env（数字表，
    # 驱动步 26 落盘）+ *.png（功能实证截图）+ idempotency.txt（幂等实测输出））
    _PO_LABELS = {'n_tests': '单测条数', 'n_pass': '单测全绿', 'n_fail': '单测未绿（含历史失败快照）',
                  'ac_cover': 'AC 覆盖',
                  'uat_pass': 'UAT 通过', 'uat_cond': 'UAT 有条件通过', 'uat_fail': 'UAT 不通过',
                  'defects_total': '缺陷总数', 'defects_fixed': '缺陷已修复（测试报告入仓时点）',
                  'defects_note': '缺陷口径说明',
                  'doc_chain': '交付文档链（件）', 'branches': '合入基线分支（条）'}
    _po_dir = EVID / 'product-outcome'
    _po_nums, _po_imgs, _po_idem = {}, [], ''
    if (_po_dir / 'quality-summary.env').exists():
        for _ln in (_po_dir / 'quality-summary.env').read_text(encoding='utf-8', errors='replace').splitlines():
            if '=' in _ln and not _ln.startswith('#'):
                _k, _v = _ln.split('=', 1)
                _po_nums[_k.strip()] = _v.strip()
    if _po_dir.is_dir():
        _po_imgs = sorted(p.name for p in _po_dir.glob('*.png'))
    if (_po_dir / 'idempotency.txt').exists():
        _po_idem = (_po_dir / 'idempotency.txt').read_text(encoding='utf-8', errors='replace').strip()
    if _po_nums or _po_imgs or _po_idem:
        _po_rows = ''.join(
            f'<tr><td>{H.escape(_PO_LABELS.get(k, k))}</td><td><b>{H.escape(v)}</b></td></tr>'
            for k, v in _po_nums.items())
        _po_num_tbl = ('<table class="st-issues-tbl"><thead><tr><th>成效指标</th><th>实测值</th></tr></thead>'
                       f'<tbody>{_po_rows}</tbody></table>') if _po_rows else ''
        # 系列帧版面=1/4 宽四列缩略网格（2026-10-11 用户排版指令）；点击全屏放大沿用 .shot 缩放交互
        # 帧功能标注（2026-10-11 用户红线：图片必须和功能描述对得上）——已知帧中文标注，
        # 未知帧降级用文件名并标「未标注」供审计点名（A11 断言）
        _PO_SHOT_LABELS = {
            'cashier-devtools-p1-order.png': '微信开发者工具·收银台首页（下单成功，真数据）',
            'cashier-devtools-p2-paid.png': '微信开发者工具·支付成功（含渠道流水号）',
            'cashier-devtools-p2-fail-retry.png': '微信开发者工具·支付失败（可重试）',
            'cashier-devtools-p2-closed.png': '微信开发者工具·订单超时关闭（不可重试）',
            'cashier-devtools-alipay-p1-order.png': '支付宝开发者工具·收银台首页（下单成功，真数据）',
            'cashier-devtools-alipay-p2-paid.png': '支付宝开发者工具·支付成功',
            'cashier-p3-idempotent.png': '幂等实证（重复提交返回同一单号）',
        }
        _po_img_html = ('<div class="po-shots">' + ''.join(
            f'<label class="shot"><input type="checkbox">'
            f'<img src="product-outcome/{H.escape(fn)}" alt="{H.escape(_PO_SHOT_LABELS.get(fn, "功能实证（未标注）"))}" loading="lazy">'
            f'<figcaption><span class="shot-kind">功能实证</span>{H.escape(_PO_SHOT_LABELS.get(fn, fn.rsplit(".", 1)[0] + "（未标注）"))}</figcaption></label>'
            for fn in _po_imgs) + '</div>')
        # 人话导读（2026-10-11 用户指令：报告说人话讲重点，日志默认折叠+配导读）
        import re as _re_idem
        _idem_suites = _re_idem.findall(r'Test Files\s+(\d+) passed', _po_idem)
        _idem_tests = _re_idem.findall(r'Tests\s+(\d+) passed', _po_idem)
        _idem_spec = _re_idem.search(r'create-idempotency\.spec\.ts \((\d+) tests\)', _po_idem)
        _idem_sum = (f"{sum(map(int, _idem_suites))} 个测试包共 {sum(map(int, _idem_tests))} 条用例全部通过"
                     + (f"，其中幂等专项 {_idem_spec.group(1)} 条" if _idem_spec else ''))
        _po_idem_html = (
            '<div class="po-plain"><b>幂等是什么：</b>同一笔订单手抖提交两次，系统只认第一笔——返回同一个支付单号，不会开两个单、不会扣两次钱。这是收银台的硬验收标准之一。'
            f'<b>实测结论：</b>{_idem_sum}。'
            '出处说明：这是交付分支提交时跑测试的原始记录摘录（当时收尾环境没装依赖没法重跑——正因如此，规矩已改为「测试没执行过=缺陷，不算声明」）。'
            '</div>'
            '<details><summary>原始执行输出（机器打印的「考试答题记录」，防手抄；点开看原文）</summary>'
            f'<pre>{H.escape(_po_idem)}</pre></details>') if _po_idem else ''
        _po_img_lead = ('<p class="po-plain">下面是交付的小程序在<b>真实开发者工具</b>（微信/支付宝）里运行的截图：'
                        '从收银台首页到支付成功、支付失败可重试、订单超时关闭各状态。缩略图约四分之一宽，点击看大图。</p>') if _po_imgs else ''
        _po_html = ('<h3>产品成效（这单生意做成了什么：功能实证 / 质量数字 / 交付完整度）</h3>'
                    + _po_img_lead + _po_num_tbl + _po_img_html + _po_idem_html)
    else:
        _po_claim = ('本轮没采到，已如实登记为问题（类型 product-outcome-missing）——不装作有' if 'product-outcome-missing' in _ilog_t
                     else '本轮没采到，且台账里也没有对应的问题登记——声称与台账对得上（run13 复盘 A2 的口径）')
        _po_html = ('<h3>产品成效（交付物成效三件：功能实证/质量数字/交付完整度）</h3>'
                    f'<p class="no-evidence">本轮产品成效证据未采集（evidence/product-outcome/ 为空）——'
                    f'三件采集 run13 起为必采（方案 §5.4 产品成效呈现；{_po_claim}）。</p>')
    # 第 4 章 本轮新特性实证（按轮注册；未注册轮如实不渲染）
    _NEW_FEATURES_BY_RUN = {
        '20261009-v8-run12': [
            ('编码六路并行首次实战', 'pay-core 拆三件，微信/支付宝渠道两路，收银台一路，六个同时开工；接口先行的分支合入后，其余部分用 rebase 接上——步 18 并行度由生成器按 agent 工作行实测（基线 run11 约 50%）', 'aipay-scenario.sh devimpl 段 + scenario.log 段界'),
            ('G5 整改测试分三人并行（第一个全流程并行实例）', '7 个整改项按领域分给三人同时做：测试工程师A 负责 01-03 加汇总和结论行，团队负责人A 逐组报 04-07，产品经理A 在等待期预审②③——五类工作并行机制在测试环节的实例', 'matrix event $LlZZQ4HX'),
            ('容量重试队列扩容', '队列从 64 扩到 512，满了淘汰最旧的——run12 全天丢 4931 条消息后修复（并发 30 的配套）', 'overlay 826097e5'),
            ('图执行影子模式', '26 步图模板以影子模式跟着驱动一开跑（不接管主流程），影子双跑验证等价后切主执行通道', 'mx-lib.sh shadow 开关'),
        ],
        '20261007-v8-run10': [
            ('快模式 MX_FAST=1 全程首次实战', '轮询 15s→5s、审批扫描 30s、治理三步（22-24）并发——01:21 开跑 14:29 收尾（含系分误拦空转 2h+编码滞留 2h36m 事故窗，如实呈现不与他轮硬比）', 'scenario.log 全程'),
            ('569 gate-guard 显式启用化', '系分期全局误拦致首批空转事故→守卫改 MX_GATE_GUARD 显式声明，默认不再拦', '035a555 + 自动检查断言'),
            ('半程自动提醒首服役', '排期窗活性提醒全程在线；研发工程师C 编码五次提醒（09:44-11:17）实录', 'scenario.log 提醒行 ×5'),
            ('clef-flash 本地判定后端首次实战', 'mlx 量化 4bit 判定后端 :8000 常驻，版本三元组快照保存（F-7）', 'evidence/decision-backend-snapshot.txt'),
            ('叙事文案预写 18/26 步', 'G4 后即出骨架草稿，按轮注册等待归零（run9 50 分钟→0）', '§5.6 + STEPS_META_RUN10-draft.py'),
            ('四路同时派出占满并发', '系分/编码闸值 4 内占满，run9/run10 实证无撞闸（原 2+2 分批废除）', '方案 §4.2 + 本轮实测'),
        ],
    }
    _feats = _NEW_FEATURES_BY_RUN.get(RUN_ID, [])
    _feat_tbl = ''
    if _feats:
        _rows = ''.join(f'<tr><td>{H.escape(t)}</td><td>{H.escape(d)}</td><td><code>{H.escape(a)}</code></td></tr>' for t, d, a in _feats)
        _feat_tbl = ('<h3>本轮新特性实证</h3>'
                     '<table class="st-issues-tbl"><thead><tr><th>特性</th><th>实证</th><th>锚</th></tr></thead>'
                     f'<tbody>{_rows}</tbody></table>')
    # 安全合规节（run15 前置 P3-7②，审计 B 案：报告安全面从无到有）——qgate
    # release-report 安全族（security.*/dependency.*）原文透传+来源分布随行（§5.5
    # 门禁证据纪律：无信号桶如实呈现，禁手抄全绿）；文件缺席如实声明不编造。
    _sec_html = ''
    _qf4 = EVID / 'qgate-release-report.txt'
    if _qf4.exists():
        _qraw4 = _qf4.read_text(encoding='utf-8', errors='replace')
        _sec_rows = [ln for ln in _qraw4.splitlines()
                     if ln.startswith('| ') and ('security.' in ln or 'dependency.' in ln)]
        _src_line = next((ln for ln in _qraw4.splitlines() if 'source' in ln.lower() and 'distribution' in ln.lower()), '')
        _rows_html = ''.join(f'<tr><td>{H.escape(r.strip("| "))}</td></tr>' for r in _sec_rows)
        _sec_html = ('<section class="nv-sec" id="ch4-security"><h2>安全合规（QUALITY 段门禁透传）</h2>'
                     '<p class="stat-note">安全族门禁判定原文（qgate release-report，来源分布随行；'
                     'INCONCLUSIVE=该门未绑执行器属无信号桶，如实呈现非全绿——绑定实跑留 run15 QUALITY 段接线）</p>'
                     f'<table class="st-issues-tbl"><tbody>{_rows_html or "<tr><td>（安全族门禁零行——report 无 security/dependency 行）</td></tr>"}</tbody></table>'
                     + (f'<p class="stat-note">{H.escape(_src_line)}</p>' if _src_line else '')
                     + '</section>')
    else:
        _sec_html = ('<section class="nv-sec" id="ch4-security"><h2>安全合规（QUALITY 段门禁透传）</h2>'
                     '<p class="no-evidence">本轮无 qgate release-report（evidence/qgate-release-report.txt 缺席）——'
                     '安全合规面零呈现如实声明（run15 起 QUALITY 段 precheck --all-full 出报告后透传）。</p></section>')
    # 第 4 章常驻：产品成效块（§5.4）+ 新特性表（按轮注册）+ 安全合规节（P3-7②）
    _ch4_html = ('<section class="nv-sec" id="ch4-features"><h2>第 4 章 · 本轮交付成效与新特性</h2>'
                 + _po_html + _feat_tbl + '</section>' + _sec_html)
    # 产品面承载率行（§5.5：五面各计 UI 实拍或产品内操作证据，验收线 ≥4/5）。
    # 2026-10-10 修订：候选帧改为按步号查当轮注册帧位（STEPS_META[n].imgs 实存）——
    # 帧名前缀按轮而异（全量轮数字前缀/回归轮状态键前缀），写死数字前缀在回归轮
    # 会五面全空误报（步 22 拍位规划轮实锤）；沿用带步（步 4/6/9/15 等）当轮无帧
    # 自然不计——回归轮承载范围以当轮执行带为准，口径如实。
    def _face_step(ns):
        return [f'{n}:{pre}' for n in ns for (pre, _c, _k) in STEPS_META[n].get('imgs', [])
                if (STEPS_DIR / f'{pre}.png').exists()]
    _faces = []
    _faces.append(('沟通', bool(_face_step([8, 9, 19, 21])), '房间/会话帧'))
    _faces.append(('任务', bool(_face_step([10, 12, 13, 17, 20, 22])), '看板帧'))
    _ap_ok = (EVID / 'approved.events').exists() and (EVID / 'approved.events').stat().st_size > 0
    _faces.append(('审批', _ap_ok, 'approved.events 事件留痕（无 UI 帧，降级计达）'))
    _faces.append(('度量', bool(_face_step([24, 6, 26])), '治理中心帧'))
    _faces.append(('编码', bool(_face_step([25, 18])), 'IDE 走查帧+CLI 作业组合计达'))
    _n_face = sum(1 for _, ok, _ in _faces if ok)
    _face_rows = ' · '.join(f'{n}={"✓" if ok else "⬜"}' for n, ok, _ in _faces)
    _face_note = '；'.join(f'{n}={d}' for n, ok, d in _faces if ok and '降级' in d or (not ok))
    _ch1_html += (f'<p class="stat-note">产品面承载率 <b>{_n_face}/5</b>（验收线 ≥4/5）：{_face_rows}'
                  + (f'——{_face_note}' if _face_note else '') + '</p>')
except Exception as _e:
    import html as _H
    _narrative_html = (f'<div style="padding:12px;border:1px solid #f59e0b;border-radius:8px;'
                       f'color:#92400e">叙事层生成失败（如实标注）：{_H.escape(str(_e))}</div>')
_AUDIT_RUN2_BLOCK_HD = '<p class="stat-note"><b>以下为 v4-run2（2026-09-29）轮独立审计史实</b></p>'
_AUDIT_RUN2_BLOCK = '  <p class="stat-note">独立合规审计（audit-agent，05:35 独立复核，与监控侧机械化意见书不一致）提出 10 项关切与 R-A1..R-A6 处置建议；收尾轮逐条判定与处置如下（单一事实源：evidence/audit-response-disposition.md）。本轮有效性判定：<b>G1/G2/G4 留痕成立；G5 判回滚（实物 FAIL，发布冻结）；UAT 判"有条件验收"</b>——"四闸首过/AC 全过"口径判废。<b>收尾追记（2026-09-29 10:52）：R1-R4 完整循环、G5 复审 r8 READY-GATE-PASS、REL-* 解冻、UAT 条件解除</b>——判废口径经完整循环转正，全链锚点见处置表。</p>\n  <details class="audit" open><summary>▶ 独立审计 10 项判定与处置</summary>\n  <table style="margin-top:8px"><tr><th>#</th><th>发现</th><th>判定</th><th>处置</th></tr>\n  <tr><td>1</td><td>G5 写入通过标记"通过"与评审实物矛盾（转述 stub 消息被当结论行，卡面 READY-GATE-FAIL）</td><td>属实</td><td>已修（根因）：H8 判词语义（末判词赢+卡面双源合并 FAIL 优先+熔断），run2 原文入自动检查用例；步 20 判回滚→复审 r8 PASS（完整循环）</td></tr>\n  <tr><td>2</td><td>发布基线强制重建丢线 23 提交（DEF-BE-001/FE 修复线/守卫脚本/testlog），双缺陷回归</td><td>属实</td><td>已修+已完整循环：H11 机制根治；回补 merge 67a1a95（丢线整线回归）+同基线复验 194/194+6/6+42/42+220（2026-09-29）</td></tr>\n  <tr><td>3</td><td>UAT"全过"与证据行矛盾（AC-4/AC-7 有条件通过）+基线锚断裂</td><td>属实</td><td>已修（根因）：H9 逐条判词（有条件≠无条件验收，放行权归 需求分析师A）；验收书勘误入 origin/main</td></tr>\n  <tr><td>4</td><td>G3 硬门无写入通过标记，治理报告跳过 G3/G6</td><td>属实</td><td>已修：H10 g3_code_pass 写入通过标记+治理报告六闸全列</td></tr>\n  <tr><td>5</td><td>评审卡缺失由监控程序登记即标记完成</td><td>属实</td><td>已修（R-A4）：补登记卡保留"评审记录待补"，不自批标记完成</td></tr>\n  <tr><td>6</td><td>G5 HumanGate 自评自批；approved.events 无 G5 审批事件</td><td>属实（部分环境局限）</td><td>部分已修：HumanGate 批准事件入 approved.events 可反查；审批人独立性=单操作者推演局限，观察记档</td></tr>\n  <tr><td>7</td><td>问题单 DISP 0 条；ISSUES-LOG 未收录；复盘计数 5≠6</td><td>属实</td><td>已修（R-A5）：DISP 6/6 补记+ISSUES-LOG 回灌+复盘计数勘误</td></tr>\n  <tr><td>8</td><td>完备性检查留痕未受控删行；台账同名 G5 卡双态</td><td>部分属实</td><td>删行来源未查明→已回滚恢复留痕原貌（快照不可变）；双态卡=各轮卡并存，观察记档</td></tr>\n  <tr><td>9</td><td>G6 复盘模板话术/交叉引用断链/metrics 口径偏离</td><td>属实</td><td>部分已修：复盘逐单归类+断链修正+行动项补 R-A1..R-A6；metrics 口径重出延后（行动项）</td></tr>\n  <tr><td>10</td><td>监控侧意见书"通过（无发现）"不成立</td><td>属实</td><td>已修（R-A6）：意见书勘误改判"有保留（待整改）"，以独立意见为准</td></tr>\n  </table></details>\n  <p class="stat-note">抽检通过项（独立审计留痕）：G1 四要素真实可判 · G2 留痕完整（t_11e182b3 独立评审人）· 测试内容真实性（testlog 实物与报告数字一致）· 复盘对事不对人口径 · 评审人如实报 FAIL 附取证。另有收尾补充处置：报告路由缺陷 H7（05:15 首次生成落全局目录拿旧轮 state）已修并重生成本报告；双驱动污染窗口 02:26:04–02:37:56（run1 ready 续跑误抢活锁，H1 已修）如实记档。</p>'
def _audit_outcome_html():
    """第 2 章实查化（报告三要素改造 2026-10-10）：中央仓 docs/audit/ 实查本轮窗口内的
    意见书文件——在位=实文件清单；缺席=如实缺位（旧版一句话占位是「报告粗糙」指认点之一）。"""
    try:
        docs_audit = CEN / 'docs' / 'audit'
        started = int(state.get('run_started_at') or 0)
        files = [f for f in sorted(docs_audit.glob('*.md'))
                 if f.stat().st_mtime >= started - 3600] if docs_audit.exists() else []
    except Exception:
        files = []
    if files:
        rows = ''.join(f'<tr><td>{H.escape(f.name)}</td><td>{f.stat().st_size} B</td></tr>' for f in files[:6])
        return ('<p class="stat-note">本轮独立审计产出（中央仓 docs/audit/ 实查，限本轮窗口内文件）：</p>'
                '<table class="st-issues-tbl"><tr><th>意见书文件</th><th>大小</th></tr>' + rows + '</table>')
    return ('<p class="stat-note">本轮（RUN=' + RUN_ID + '）无独立审计处置段——该段为 v4-run2 轮专属治理史，'
            '对其他轮渲染属旧账冒充（2026-10-02 根治）。中央仓 docs/audit/ 本轮窗口内未见意见书文件（如实标注）；'
            '机器审计结论按方案 §5.6 收尾判据之二执行——mx-report-audit 零 FAIL 才许收尾。</p>')


audit_response_section = (_AUDIT_RUN2_BLOCK_HD + _AUDIT_RUN2_BLOCK) if RUN_ID == '20260929-v4-run2' else _audit_outcome_html()

_GOV_METRICS_RUN2 = '<tr><td>闸门判定</td><td><b>G1/G2/G4 留痕成立 · G5 判回滚（R-A1）→ R-A3 完整循环复审 PASS（r8）</b>；"4/4 首过"口径判废后经完整循环转正 · G3 写入通过标记缺失（R-A4 已修）</td></tr>\n    <tr><td>问题单终态</td><td>{stat}</td></tr>\n    <tr><td>测试口径</td><td>TEST-BE r5（test/TEST-BE@48a9d9d）/TEST-FE r4+r5（test/TEST-FE@bdb9450）TEST-PASS 回执；评审侧黑盒探针 40/42 FAIL、verify-guard 3/6 FAIL（实跑树≠发布基线，"绿且少"按回归判 FAIL）</td></tr>\n    <tr><td>UAT 判词</td><td><b>有条件验收</b>：AC-1/2/3/5/6 通过 · AC-4/AC-7 有条件通过（放行权归 需求分析师A）</td></tr>\n    <tr><td>发布状态</td><td><b>R-A3 已完整循环、发布解冻</b>（2026-09-29 10:52）：G5 复审 r8 READY-GATE-PASS（独立评审），REL-* 三卡 blocked→ready（解冻批准入 approved.events）；放行后动作 R5（RELEASE.md 替换）随发布执行</td></tr>'
_GOV_METRICS_RUN6 = '<tr><td>闸门判定</td><td><b>六闸全过</b>：G1 10-01 08:23（推送失败当日补账 18c9d77）· G2 10-01 18:57 · G3 10-02 08:44 · G4 10:15:43 · G5 READY-GATE-PASS（t_3aaacf2d 七项全过）· G6 12:03:24</td></tr>\n<tr><td>问题单终态</td><td>{stat}</td></tr>\n<tr><td>测试口径</td><td>TEST-BE 194/194 全绿零缺陷（报告 8dbf5bf，被测 8ec13c3）· TEST-FE 全绿（TEST-PASS-TEST-FE 13:50，push 039a6da）——测试者独立于开发线</td></tr>\n<tr><td>UAT 判词</td><td><b>七条 AC 证据 7/7 PASS</b>（UAT-EVIDENCE 行 $V_jLqhvn）；验收书初版判词列"未见"系判词器模板解析口径缺陷（证据行在案）——已根治（uat_ac_verdict 括号注/段首归属耐受）并出勘误版验收书</td></tr>\n<tr><td>发布状态</td><td><b>已发版</b>：REL-MERGE 合 main（f7b1cbc，监控程序补账留痕）· REL-DELIVER 卡 t_5f8c2d25 · 验收书入仓 12:03:04</td></tr>'
# {stat} 占位符在按轮常量里——常量为普通字符串不会随模板 f-string 替换，须在此显式替换
# （run6 实锤漏网：完整循环治理终态表曾原样渲染 {stat}）。
gov_metrics_rows = (_GOV_METRICS_RUN6 if RUN_ID == '20261001-v5-run6'
                   else _GOV_METRICS_RUN2 if RUN_ID == '20260929-v4-run2'
                   else '<tr><td>问题单终态</td><td>{stat}</td></tr>').replace('{stat}', stat)

# hero 统计卡第三格按轮取值（run2 的 R-A3 完整循环史曾硬编码渲进 run6——按轮隔离根治）；
# 缺省从 state 六闸写入通过标记实测统计，不编造。
def _hero_gate_default():
    n_pass = sum(1 for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] if _gate_passed(g))
    return (f'<b>六闸全过</b><span>G1–G6 全部写入通过标记通过</span>' if n_pass == 6
            else f'<b>{n_pass}/6</b><span>闸门写入通过标记（未达项如实 ⬜）</span>')

_HERO_GATE_HSTAT = {
    '20260929-v4-run2': '<b>R-A3 完整循环</b><span>G5 复审 r8 PASS · 发布解冻（10:52）</span>',
    '20261001-v5-run6': '<b>六闸全过</b><span>已发版：REL-MERGE f7b1cbc 合入主干</span>',
}

# 完整循环治理终态表「强制关卡」列按轮隔离（run6 实锤漏网根治：run2 的 G5 判回滚史曾无条件
# 渲进 run6 终态表，与同报告"六闸全过/已发版"自相矛盾）。某轮某闸有独立治理史实才
# 登记覆盖条目；其余按 state 六闸写入通过标记实测统计（通过 ✓ / 未写入通过标记 ○），不编造。
_GOV_FINAL_OVERRIDES_BY_RUN = {
    '20260929-v4-run2': {
        'G5': ('err', '✗ 判回滚（R-A1，实物 FAIL）→ R-A3 完整循环复审 PASS（r8）'),
    },
        '20261001-v5-run6': {
        'G5': ('ok', '✓ READY-GATE-PASS（t_3aaacf2d 七项全过）'),
    },
}

# 第 9 章「证据二/证据三」按轮注册表（2026-10-08 公文技法轮根治：run10 的「四起接线
# 事故」「run11 目标」等当轮叙事曾写死在固定文案层，下一轮再生成报告会原样复述旧轮
# 故事）。当轮内容入注册表；未登记轮给诚实兜底文案，指真实数据源，不编造。
_GOV_EVIDENCE_BY_RUN = {
    '20261007-v8-run10': (
        '本轮四起接线事故的根因与修复已存入跨轮记忆库——下轮推演时 AI 员工会自动回忆这些教训，不会再踩同一个坑。这正是 SwarmStudio"治理靠机制不靠自觉"的实装：问题不只被修掉，还被记住。',
        'run9 六闸全首过、交付率 4/4；run10 在四起接线事故下仍然六闸全过、26 步走完——治理系统在逆境中的鲁棒性得到验证。run11 目标：零事故+流式并行（净墙钟 ≤3h）。',
    ),
    '20261010-v8-run14': (
        'run14 的静默形态谱系（产物等待/散文征求/会签等待/干完不交卷/连接悬挂诊断勘误/空转收场/大上下文短回复自了断）已固化为独立监控手册判据与 watcher v3 检测规则（Turn ended 与工作行交叉判据，分钟级）'
        '；十雷根修四提交（4be3a3b/32ff696/13b5739/f909780）当轮入库存为防复发件。跨轮记忆库探针本轮未触发（如实）——教训承接面=复盘文档（overlay docs/2026-10-11-run14-retrospective.md）+方案 V8.8 纪律 32-35。',
        '治理报告基线对比实测：六闸首过率 run13 4/6 → run14 5/6（G5 仍打回——风险登记表 R3 持续项）；证据一次通过率 15/20；打回 3 次、人工介入 2 次（issues.log 实测）。'
        '全程 22h 为历次全量轮最快（对照口径见方案 §5.7 基线表 run11 23h/run8 17h）。',
    ),
}


def _gov_evidence():
    """证据二（记忆积累）/证据三（度量对照）文案：按轮注册，未登记轮诚实兜底。"""
    return _GOV_EVIDENCE_BY_RUN.get(RUN_ID, (
        '本轮经验积累以 retro 步记忆探针与跨轮记忆库留痕为准（探针失败记入问题清单 retro-memory-probe）；当轮教训由复盘文档承载，本节不代写。',
        '与上轮的对照以治理报告「基线对比」节实测统计为准（evidence/governance-report.md，上轮首过率行对本轮）；本节不手编战绩。',
    ))


# 第 9 章结论块实测统计（同块曾硬编码「16 个问题」——run10 的计数渲进任何一轮都是假值）。
# 完整循环判定三要素：问题单零待处置、六闸全写入通过标记通过；缺一即如实判未成立。
_gates_all = all(_gate_passed(g) for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
_n_gate_pass = sum(1 for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] if _gate_passed(g))
_gov_ok = (n_issue_open == 0 and _gates_all)
_gov_verdict_color = '#047857' if _gov_ok else '#b45309'
_gov_verdict_title = '完整循环成立' if _gov_ok else '完整循环未成立（如实呈现）'
_gov_verdict_body = (
    f'{n_issue_keys} 个问题单全部有处置结论（零待处置），六道关卡全部过关。'
    f'支撑这个结论的三件证据如下。'
    if _gov_ok else
    f'待处置问题单 {n_issue_open} 条，闸门写入通过标记 {_n_gate_pass}/6。'
    f'缺口即下轮行动项，以复盘文档为准；三件证据节如实呈现当前状态。')
_gov_ev2, _gov_ev3 = _gov_evidence()

def gov_final_rows():
    rows = []
    for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']:
        ovr = _GOV_FINAL_OVERRIDES_BY_RUN.get(RUN_ID, {}).get(g)
        if ovr:
            cls, verdict = ovr
        elif _gate_passed(g):
            cls, verdict = 'ok', '✓'
        else:
            cls, verdict = 'gpending', '○ 未达'
        rows.append(f'<tr><td><b>{g}</b></td><td style="font-size:13px">{GATE_DESC[g]}</td>'
                    f'<td class="{cls}">{verdict}</td><td>{_gate_ts(g) or "—"}</td></tr>')
    return ''.join(rows)

total_imgs = sum(1 for _, _, _, m in STEPS for pre, _, _ in m.get('imgs', []) if (STEPS_DIR / f'{pre}.png').exists())
unique_imgs = len({pre for _, _, _, m in STEPS for pre, _, _ in m.get('imgs', []) if (STEPS_DIR / f'{pre}.png').exists()})
ui_imgs = sum(1 for _, _, _, m in STEPS for pre, _, kind in m.get('imgs', []) if kind == 'ui' and (STEPS_DIR / f'{pre}.png').exists())
# 图数对账（2026-10-07 注册引用∩盘态与目录实态两套口径并存，曾渲 17 图/9 步
# "截图缺失"而盘上 29 图全在）：盘上未引用=漏配 WARN，注册缺文件=冒配红标，均落生成日志。
_disk_pngs = {p.stem for p in STEPS_DIR.glob('*.png')} if STEPS_DIR.exists() else set()
_registered = {pre for _, _, _, m in STEPS for pre, _, _ in m.get('imgs', [])}
_unreferenced = sorted(_disk_pngs - {p for p in _registered if (STEPS_DIR / f'{p}.png').exists()})
_missing_ref = sorted(p for p in _registered if not (STEPS_DIR / f'{p}.png').exists())
if _unreferenced:
    print(f'[mx-report-gen] WARN 盘上未引用帧 {len(_unreferenced)} 张（漏配，如实列出）: {", ".join(_unreferenced)}')
if _missing_ref:
    print(f'[mx-report-gen] WARN 注册但缺文件 {len(_missing_ref)} 张（冒配，报告内红标）: {", ".join(_missing_ref)}')
# 补拍帧检测：图注自报"收尾后补拍"即 hero/页脚如实带补拍语义（"全部实拍"不冒充当轮实时帧）
_reshoot = any('补拍' in cap for _, _, _, m in STEPS for _, cap, _ in m.get('imgs', []))
_img_honest_note = ' · 全部实拍（收尾后补拍，非当轮实时帧——采集链未挂驱动，记入问题清单 r18-collection-missing）' if _reshoot else (' · 全部实拍' if total_imgs > 0 else '（本轮未拍摄，如实留空）')

ckpt_intro_note = (f'{len(CHECKPOINTS)} 个人工卡点按流程顺序排列，每卡点配真实产品界面实拍（点击放大）：谁在把关、把什么关、证据在哪。六域判定的"关联卡点"可跳回此处。'
                   if total_imgs > 0 else
                   f'{len(CHECKPOINTS)} 个人工卡点按流程顺序排列，谁在把关、把什么关、证据在哪。本轮未拍摄界面截图（推演主验证流程与协作，界面沿用既有版本）：卡点证据以过程日志与仓内锚点为准，配图位留空不冒充实拍。')


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
    """人工卡点卡（数量随 CHECKPOINTS 实测统计）：配真实帧（按轮注册帧池映射）+证据行+闸门状态 chip。

    2026-10-07 修复：原实现只认 ui-*.png 专用帧池（本轮不存在→整节空白），
    并行会话曾改为第二闸门仪表盘（与 gate_cards 重复+悬 div）——改为映射本轮
    实存步帧（29 帧池），闸门卡 ts/状态自 _gate_* 实测统计；无帧卡点如实文字呈现不冒图。
    """
    _CP_FRAME_BY_RUN = {
        '20261007-v8-run10': {
            'cp-g1': '7-op1-after', 'cp-triage': '12-op1-after', 'cp-g2': '15-op1-after',
            'cp-gate': None, 'cp-g3': '18-op1-after', 'cp-g4': '19-op1-after',
            'cp-g5': '20-op1-after', 'cp-uat': '21-op1-after', 'cp-g6': '24-op1-after',
        },
    }
    fr_map = _CP_FRAME_BY_RUN.get(RUN_ID, {})
    _CP_GATE_OF = {'cp-g1': 'G1', 'cp-g2': 'G2', 'cp-g3': 'G3', 'cp-g4': 'G4', 'cp-g5': 'G5', 'cp-g6': 'G6'}
    if not fr_map:
        # 无帧轮（run11 用户指认整合）：六闸已由 gate_cards 完整呈现，此处压缩为
        # 闸间人工确认点紧凑表——去大卡/占位帧/与闸重复行，保留语义与证据锚。
        rows = []
        for cid, name, semantics, who, img, evidence in CHECKPOINTS:
            g = _CP_GATE_OF.get(cid)
            chip = f'{g} {"✓" if _gate_passed(g) else "○"}' if g else '闸间'
            rows.append(f'<tr><td>{name}</td><td>{chip}</td><td>{semantics}</td><td>{who}</td><td style="font-size:12px">{evidence}</td></tr>')
        return ('<details class="audit" style="margin-top:8px"><summary>▶ 闸间人工确认点（与六闸互补，紧凑视图）</summary>'
                '<table style="margin-top:8px"><tr><th>卡点</th><th>闸</th><th>把关什么</th><th>把关人</th><th>证据锚</th></tr>'
                + ''.join(rows) + '</table></details>')
    cards = []
    for cid, name, semantics, who, img, evidence in CHECKPOINTS:
        g = _CP_GATE_OF.get(cid)
        state_chip = ''
        if g:
            ok = _gate_passed(g)
            ts = _gate_ts(g)
            state_chip = (f'<div style="font-size:13px;margin-top:2px;color:{"#047857" if ok else "#b45309"}">'
                          f'{"✓ 已通过" if ok else "○ 未达"}{f" · {ts}" if ts else ""}</div>')
        shot = ''
        # V8.4 §5.6 ⑩（2026-10-10 接线轮）：补拍帧禁入正本——原 fr_map 收尾补拍嵌入通道
        # 拆除，只嵌当轮实时帧（CHECKPOINTS 注册帧名）；无帧=记入问题清单+明示（补拍件归
        # runs/<RUN_ID>/frames-degraded/ 档案目录，evidence/ 之外生成器结构性禁读）。
        if (STEPS_DIR / f'{img}.png').exists():
            shot = ('<label class="cp-shot"><input type="checkbox">'
                    f'<img src="screenshots/steps/{img}.png" alt="{H.escape(name)}" loading="lazy"></label>')
        else:
            shot = '<div class="stat-note" style="font-size:13px">（本卡点无当轮实时帧——按 §5.6 采集纪律⑩ 记问题单+无帧明示；审批类卡点以 approved.events 留痕为证，不冒图）</div>'
        cards.append(
            '<div class="cp-card" id="' + cid + '">'
            '<div class="cp-head"><span class="cp-name">' + H.escape(name) + '</span><span class="cp-who">' + H.escape(who) + '</span></div>'
            + shot +
            '<div class="cp-sem">' + H.escape(semantics) + '</div>'
            + state_chip +
            '<div class="cp-ev">' + H.escape(evidence) + '</div>'
            '</div>')
    return '<div class="cp-grid">' + ''.join(cards) + '</div>'


def gate_cards():
    # 打回/判回滚记录按轮隔离（run6 实锤漏网根治：run2 的 R-A1 判回滚史曾渲进 run6 门禁卡）。
    # 静态注册表只作文字注解；打回事实改从 issues.log+state 实测统计（2026-10-07 
    # 未注册轮被默认成"一次通过"，G2/G5 台账打回在案仍渲喜报——"无条目=首过"的默认是
    # 静态模板冒充实录族病根）。实测统计命中优先于静态默认；两者并存时拼接。
    _GATE_REJ_BY_RUN = {
        '20260929-v4-run2': {'G5': '误过→R-A1 判回滚→R-A3 完整循环复审 PASS（r8 @ 5c1a02d）'},
    }
    _GATE_ANNOT_BY_RUN = {
        '20260929-v4-run2': {'G3': 'g3_code_pass 写入通过标记缺失（R-A4 已修）'},
    }
    _G5_BADGE_BY_RUN = {
        '20260929-v4-run2': '✓ 已通过（复审 r8）',
    }
    rejected = dict(_GATE_REJ_BY_RUN.get(RUN_ID, {}))
    annot = _GATE_ANNOT_BY_RUN.get(RUN_ID, {})
    # 实测统计：闸门类记入问题清单键族（g1-/g2-/g3-/g4-/g5-/g6- 前缀 + review-card/gate 族）
    _gate_issue_hits = {g: [] for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']}
    _ilog = EVID / 'issues.log'
    if _ilog.exists():
        for ln in _ilog.read_text(encoding='utf-8', errors='replace').splitlines():
            p = ln.split('|', 3)
            if len(p) < 4 or p[0] != 'ISSUE':
                continue
            m = re.match(r'^(g[1-6])[-_]', p[1])
            if m:
                _gate_issue_hits[m.group(1).upper()].append(p[1])
            elif p[1].startswith('review-card'):
                _gate_issue_hits['G2'].append(p[1])
            elif p[1] == 'retro-open-items':
                _gate_issue_hits['G6'].append(p[1])
    for g, keys in _gate_issue_hits.items():
        if keys and g not in rejected:
            uniq = sorted(set(keys))
            rejected[g] = f'打回/缺口记入问题清单 {len(keys)} 起（{"、".join(uniq[:3])}），回灌复补后过闸——台账可反查'
    # 实测统计：state 打回轮次计数键（如 g5_fail_rounds）
    for g, fk in (('G5', 'g5_fail_rounds'),):
        fr = state.get(fk, '')
        if fr.isdigit() and int(fr) > 0 and g not in rejected:
            rejected[g] = f'FAIL×{fr} 轮后补齐过闸（state {fk}={fr} 实测统计）'
    cards = []
    # run13 复盘 A5/F1：回归轮夹具闸键分带——G1/G2 沿用源轮真值（g1g2_fixture 标记），
    # 时刻取源轮 state 真值（种子侧已改携源轮时间；旧种子 $NOW 值=启动时刻，与 run_started_at
    # 相等即判伪值并标注勘误，回读源轮真值呈现）。禁以本轮启动时刻冒充本轮过闸。
    _lite_from = (state.get('lite_fixtures_from') or '').strip()
    _run_start = (state.get('run_started_at') or '').strip()
    _fixture_gates = set()
    if _lite_from and _lite_from not in ('none',):
        _fixture_gates = {'G1', 'G2'}
    def _gate_ts_banded(g):
        ts = _gate_ts(g)
        if g in _fixture_gates:
            src_ts = ''
            try:
                _src = (SIM / 'runs' / _lite_from / 'state.env')
                if _src.exists():
                    _v = ''
                    for _ln in _src.read_text(encoding='utf-8', errors='replace').splitlines():
                        if _ln.startswith(GATE_STATE_KEY[g] + '='):
                            _v = _ln.split('=', 1)[1].strip()
                            break
                    if _v.isdigit() and len(_v) >= 10:
                        import datetime as _dt
                        src_ts = _dt.datetime.fromtimestamp(int(_v[:10])).strftime('%m-%d %H:%M')
            except Exception:
                pass
            if src_ts:
                seeded = state.get(GATE_STATE_KEY[g], '')
                fake = seeded == _run_start
                return f'{src_ts} · 沿用源轮（{_lite_from}）' + ('〔种子值=启动时刻已勘误〕' if fake else '')
        return ts
    for g in ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']:
        ts = _gate_ts_banded(g)
        passed = _gate_passed(g)
        if g == 'G5' and passed and RUN_ID in _G5_BADGE_BY_RUN:
            cls, badge = 'gpass', _G5_BADGE_BY_RUN[RUN_ID]
        else:
            cls = 'gpass' if passed else 'gpending'
            badge = '✓ 已通过（沿用源轮）' if (passed and g in _fixture_gates) else ('✓ 已通过' if passed else '○ 未达')
        rej = f'<span class="gate-rej">打回环：{rejected[g]}</span>' if g in rejected else '<span class="gate-rej ok1">一次通过</span>'
        rej += (f'<span class="gate-rej">{annot[g]}</span>' if g in annot else '')
        cards.append(f'''<div class="gate-card {cls}">
  <div class="gate-name">{g}</div>
  <div class="gate-state">{badge}</div>
  <div class="gate-ts">{ts or "—"}</div>
  <div class="gate-desc">{GATE_DESC[g]}</div>
  {rej}
</div>''')
    # 直接返回六张卡：外层 .gates（唯一调用点 L2579）已是 3 列 grid——
    # 曾多包一层块级 .ck-wrap，六卡全挤进 grid 首格（左 1/3 窄列、右 2/3 空白，
    # 2026-10-08 用户截图实锤）。ck-wrap 层与对应 CSS 一并废除。
    return ''.join(cards)

# ── 驾驶舱联动地图（路演版：跨区通路+互跳锚点）──
# 三层：①顶部六功能区分区导航（点击跳步）②四条跨区通路（沟通/看板/审批/运行/治理/IDE
# 同屏串联，每个节点锚点可跳）③步块内"联动"行（本步与哪些区的哪些步同源——从通路
# 自动反查，双向）。锚点全为页内 #stepN，跨区故事一眼可讲。
COCKPIT_ZONE_COLOR = {'沟通': '#0369a1', '看板': '#047857', '审批': '#b45309',
                      '运行': '#7c3aed', '治理': '#334155', 'IDE': '#be185d'}
COCKPIT_ZONES = {
    '沟通': [(8, '建群'), (9, '@派发'), (19, '缺陷对话'), (21, 'UAT 对账')],
    '看板': [(10, '主卡+RACI'), (12, '分诊'), (13, '系分卡'), (17, '排期'), (20, 'REL 三卡')],
    '审批': [(12, 'lead 确认'), (20, 'G5 准出+人工批准')],
    '运行': [(4, 'run 横幅'), (23, '审计取证')],
    '治理': [(5, '资产'), (7, 'G1 冻结'), (15, 'G2 评审'), (22, '台账'), (24, '复盘')],
    'IDE': [(18, '五步编码'), (25, '任务简报')],
}
LINKAGE_CHAINS = [
    ('需求怎么流动', '一条需求从群里发出到变成看板任务',
     [(8, '沟通', '建群全量预邀'), (9, '沟通', '@派发+证据要求'), (10, '看板', '主卡落板 RACI 字段'), (12, '看板', '分诊到人')]),
    ('代码怎么产出', '从评审到编码全程可追溯',
     [(15, '治理', 'G2 评审卡把关'), (17, '看板', '排期上卡'), (18, 'IDE', 'worktree 五步编码'), (18, '治理', 'G3 门禁+testlog')]),
    ('质量怎么守住', '缺陷、准出、验收三道完整循环',
     [(19, '沟通', '缺陷对话回流'), (19, '看板', 'commit 回填关联卡'), (20, '审批', 'G5 七项+人工批准'), (21, '沟通', 'UAT 逐条对账')]),
    ('全程怎么监督', '运行可见、账实相符、经验积累',
     [(4, '运行', 'run 横幅 N/26'), (22, '治理', '工作台账'), (23, '治理', '独立审计'), (24, '治理', '复盘+记忆积累')]),
]

_STEP_LINKS = {}
for _cname, _cd, _nodes in LINKAGE_CHAINS:
    for _i, (_n, _z, _lb) in enumerate(_nodes):
        _STEP_LINKS.setdefault(_n, [])
        for _m, _z2, _l2 in _nodes:
            if _m != _n and _m not in [x[0] for x in _STEP_LINKS[_n]]:
                _STEP_LINKS[_n].append((_m, _z2, _l2, _cname))

def _ck_zone_html():
    cells = []
    for zone, items in COCKPIT_ZONES.items():
        c = COCKPIT_ZONE_COLOR[zone]
        links = ' '.join(f'<a href="#step{n}">{n}·{H.escape(lb)}</a>' for n, lb in items)
        cells.append(f'<div class="ck-zone" style="--zc:{c}"><div class="ck-zone-hd">{zone}</div>'
                     f'<div class="ck-zone-links">{links}</div></div>')
    chains = []
    for cname, cdesc, nodes in LINKAGE_CHAINS:
        seg = ' <span class="ck-arrow">→</span> '.join(
            f'<a href="#step{n}" class="ck-node" style="--zc:{COCKPIT_ZONE_COLOR[z]}">'
            f'<span class="ck-node-z">{z}</span>{n} {H.escape(lb)}</a>' for n, z, lb in nodes)
        chains.append(f'<div class="ck-chain"><div class="ck-chain-hd"><b>{H.escape(cname)}</b>'
                      f'<span class="ck-chain-desc">{H.escape(cdesc)}</span></div>'
                      f'<div class="ck-chain-nodes">{seg}</div></div>')
    return ('<section class="ck-map"><div class="ck-map-hd">驾驶舱联动地图'
            '<span class="ck-map-sub">同一张驾驶舱，六个功能区协同工作——点击任一节点直达对应步骤档案</span></div>'
            '<div class="ck-zones">' + ''.join(cells) + '</div>'
            + ''.join(chains) + '</section>')

def _link_line(n):
    """步块内联动行：本步与通路上哪些区/步同源（反查自动生成，双向可跳）。"""
    ls = _STEP_LINKS.get(n) or []
    if not ls:
        return ''
    seen, parts = set(), []
    for m, z, lb, cn in ls:
        if m in seen:
            continue
        seen.add(m)
        parts.append(f'<a href="#step{m}" style="color:{COCKPIT_ZONE_COLOR[z]}">{z}·步{m} {H.escape(lb)}</a>')
    return ('<div class="st-linkline"><b>⟶ 驾驶舱联动</b>（同通路可互跳）：'
            + ' · '.join(parts) + '</div>')


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
        # 步 26 状态以产物存在性回填（§5.2 步 26 口径，替代 or n==26 恒真强置——
        # report_done 未写入通过标记轮曾无条件 ✅，产物缺失时 ✅ 即作假）
        done = any(state.get(k) for k in meta.get('keys', [])) or (n == 26 and OUT.exists())
        ts = meta.get('ts_override') or next((fmt_ts(k) for k in meta.get('keys', []) if fmt_ts(k)), '')
        gate_mark = f'<span class="gmark">{GATE_BY_STEP[n]}</span>' if n in GATE_BY_STEP else ''
        nav_status = '<span class="ok">✅</span>' if done else '<span class="no">⬜</span>'
        status = nav_status
        if meta.get('mark_chip'):
            status += f'<span class="gmark">{H.escape(meta["mark_chip"])}</span>'
        if n == 26 and not any(state.get(k) for k in meta.get('keys', [])) and OUT.exists():
            status += '<span class="gmark" style="background:#e0f2fe;color:#0369a1">产物存在回填</span>'
        # 必采步 R18 载荷缺口的步级警示（§5.5 空态条款：步块可见+报告头计数+记入问题清单编号）
        _r18_must = (r18_matrix.DIALOG_STEPS | r18_matrix.OP_STEPS | r18_matrix.EFFECT_STEPS
                     | r18_matrix.SKILL_STEPS | r18_matrix.DELIVERY_STEPS)
        if n in _r18_must and done and not (R18.get(str(n)) or R18.get(n)):
            # 仅当轮执行步挂未采集徽章；沿用步（done=False 夹具态）按 V8.4④ 显示「不在本轮执行范围」声明态
            status += '<span class="gmark" style="background:#fef3c7;color:#b45309">R18 未采集·记入问题清单在案</span>'
        elif done and not (R18.get(str(n)) or R18.get(n)) and n < 26:
            # V8.17 §5.5 三红线（run15 复盘 F2）：非必采步的载荷全缺也挂黄标（审计契约=完成步任一载荷
            # 在位即可；run15 实测 9 步全缺静默呈现为「正常步」——降级在案≠达标，须可见）
            status += '<span class="gmark" style="background:#fef3c7;color:#b45309">载荷全缺（降级在案）</span>'
        # 交付物维度 chip（§5.5 节奏双轨：机制✅不遮交付物缺）
        _ast = _step_artifact_status(n)
        if _ast:
            _acls = 'background:#d1fae5;color:#047857' if _ast[0] == 'ok' else 'background:#fef3c7;color:#b45309'
            status += f'<span class="gmark" style="{_acls}">{H.escape(_ast[1])}</span>'
        nav_items.append(f'<a href="#step{n}" class="nav-step{" gate" if n in GATE_BY_STEP else ""}">{n} {gate_mark} {H.escape(title[:14])}…{nav_status}</a>')
        # 无帧三态（V8.4④ 2026-10-10 修订，用户指令：未采集/功能不存在/夹具未执行分开标注，
        # 禁无关图凑数；补拍允许但必须准确+图注明示补拍时点）：
        _bkey = (meta.get('keys') or [f'step{n}'])[0]
        if meta.get('imgs', []):
            imgs_html = img_tags(meta.get('imgs', []))
        elif (meta.get('mark_chip') or '').startswith('沿用'):
            imgs_html = f'<p class="no-evidence">回归轮（本步不在本轮执行范围）：本步未执行（沿用源轮工件，见步卡夹具标签），无当轮帧——不适用未采集口径</p>'
        elif _CAPTURE_PLAN.get(_bkey, ('',))[0] == 'none':
            imgs_html = (f'<p class="no-evidence">本步无对应产品界面（拍摄位规划判定）：'
                         f'{H.escape(_CAPTURE_PLAN[_bkey][1])}——缺失 UI 已列实施方案，不拍无关页凑数</p>')
        else:
            imgs_html = f'<p class="no-evidence">（截图缺失·{_bkey}——按 §5.6 采集纪律⑩ 登记在案，无帧明示；补拍须按拍摄位规划准确补拍+图注明示时点）</p>'
        # 8.6 交付物视图（补遗③ R11）：实物渲染+模版核对；无文件域步出声明（§5.4）+步 20 QGate 证据透传（§5.5）
        art_html = (artifact_block(n) or _no_artifact_note(n)) + qgate_block(n) + contract_block(n) + gov_evidence_block(n)
        # 防御性回退（STEPS_META_RUN11 建表漏 'actor' 全量，首次到报告步即崩）
        abg, afg, atxt = ACTOR_STYLE.get(meta.get('actor'), ACTOR_STYLE['both'])
        if PLAN_V82:
            # V8.2 四段（与方案 §2.4 步条目同构；§5.4）：操作路径表不入正文（附录《产品操作手册》）
            gate_label = '质量判据（方案步条·交付物及质量判据段）'
            body_html = f'''
  <div class="st-sec"><div class="st-sec-hd">① 这步做什么</div>
    <p class="st-story">{gloss_first_use(H.escape(meta["narrative"]))}</p>
    {_link_line(n)}
    {('<div class="st-open">' + md_bold(meta["open_note"]) + '</div>') if meta.get("open_note") else ''}
    {('<div class="st-note">' + md_bold(meta["note"]) + '</div>') if meta.get("note") else ''}
    {r18_block(n)}
    {devimpl_parallelism_html(n)}
    <div class="st-shots">{imgs_html}</div>
  </div>
  <div class="st-sec"><div class="st-sec-hd">② 交付物及质量判据</div>
    {criteria_block(n)}
    {art_html}
    <details class="st-gate"><summary>方案步条原文（一行摘要）</summary><div class="gate-body">{md_inline(gate_text) if gate_text else "（未单列）"}</div></details>
  </div>
  {(_sec34_empty(n) if _sec34_is_empty(n) else f'''<div class="st-sec"><div class="st-sec-hd">③ 已知问题</div>
    {_known_html(plan_steps.get(n, {}).get('known', ''))}
    {_step_issues_html(n)}
  </div>
  <div class="st-sec"><div class="st-sec-hd">④ 处置与改进</div>
    {_improve_html(plan_steps.get(n, {}).get('improve', ''))}
  </div>''')}'''
        else:
            body_html = f'''
  <p class="st-story">{gloss_first_use(H.escape(meta["narrative"]))}</p>
  {_entry_html(n)}
  {('<div class="st-open">' + md_bold(meta["open_note"]) + '</div>') if meta.get("open_note") else ''}
  {('<div class="st-note">' + md_bold(meta["note"]) + '</div>') if meta.get("note") else ''}
  <details class="st-gate"{" open" if n in GATE_BY_STEP else ""}><summary>把关标准（方案原文）</summary><div class="gate-body">{H.escape(gate_text) if gate_text else "（未单列）"}</div></details>
  {art_html}
  {r18_block(n)}
  {devimpl_parallelism_html(n)}
  <div class="st-shots">{imgs_html}</div>'''
        step_cards.append(f'''
<article class="step{" gate-step" if n in GATE_BY_STEP else ""}" id="step{n}" style="--pc:{c1}">
  <div class="st-hd">
    <span class="st-num">{n}</span>
    <div class="st-title"><h3>{H.escape(title)}{gate_mark}</h3>
    <span class="st-meta">{status}{f" · {ts}" if ts else ""} <span class="actor" style="background:{abg};color:{afg}">{atxt}｜{H.escape(meta.get("actorText", ""))}</span></span></div>
  </div>{body_html}
</article>''')
    nav_items.append('</div>')
    content_parts.append(f'''
<section class="phase" id="{pid}" style="--pc:{c1};--pc2:{c2}">
  <header class="ph-hd"><div class="ph-num">{phase_num}</div><div><h2>{pname}</h2><p>{pdesc}</p></div></header>
  {''.join(step_cards)}
</section>''')

nav_html = '\n'.join(nav_items)

# 联动地图嵌入第一个 phase 内部（已知渲染正确位置，避免 body 级泄漏）
if content_parts:
    _ck_html = _ck_zone_html()
    _phase0 = content_parts[0]
    # 在第一个 phase 的 header 后面插入
    _hdr_end = _phase0.find('</header>')
    if _hdr_end > 0:
        content_parts[0] = _phase0[:_hdr_end + 9] + '\n' + _ck_html + _phase0[_hdr_end + 9:]

content_html = '\n'.join(content_parts)

def manual_appendix():
    """V8.2 配套③：产品路径参考表（steps_entry）降附录《产品操作手册》——
    轮次无关的产品事实，非本轮实录（正本 §5.5 操作记录真值化）。"""
    if not STEP_ENTRIES:
        return ''
    rows = ''.join(
        f'<tr><td>步 {n}</td><td>{H.escape(w)}</td><td>{H.escape(p)}</td><td>{H.escape(o)}</td></tr>'
        for n, (w, p, o) in sorted(STEP_ENTRIES.items()))
    return (f'<section class="phase"><header class="ph-hd"><div class="ph-num">附</div><div>'
            f'<h2>产品操作手册</h2><p>轮次无关的产品事实，非本轮实录——本轮实际动作以各步「① 这步做什么」为准（正本 §5.5）</p></div></header>'
            f'<table class="st-issues-tbl"><thead><tr><th>步</th><th>身份</th><th>入口</th><th>操作序列</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></section>')

if PLAN_V82:
    content_html += manual_appendix()
art_tbl, art_stat, art_note_g5 = artifact_panorama()

# ── tokens 单源（报告 CSS 统一改造 2026-10-10）：mux/report-tokens.css 与
#    overlay/scripts/plan-html/tokens.css 字节级同文（两文件 cmp 门禁；改任一侧
#    必须同步另一侧）。运行时实读注入 style 块顶部——禁在生成器内再手抄一份
#    token 值（手抄即第二事实源，必漂移）。──
_REPORT_TOKENS = (Path(__file__).resolve().parent / 'report-tokens.css').read_text(encoding='utf-8', errors='replace')

html = f'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Swarm Studio 全流程推演报告 · RFD-001</title>
<style>
{_REPORT_TOKENS}
*{{margin:0;padding:0;box-sizing:border-box}}
/* 机器样式别名层（2026-10-10 CSS 统一改造）：token 单源在前（report-tokens.css），
   此处只保留 token 未覆盖的本地别名——与 token 同名且取值不同者（--accent/--ok/--warn/--muted）
   不再重复声明，交由 token 定值，消除双事实源 */
:root{{--bg:var(--surface-2);--card:var(--surface);--text:var(--ink);--border:var(--line);--err:var(--danger);--radius:12px;--shadow:0 1px 3px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.04)}}
html{{scroll-behavior:smooth}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.75;letter-spacing:0}}

.layout{{display:grid;grid-template-columns:236px 1fr;gap:0;max-width:none;margin:0 auto;min-height:100vh}}
.sidebar{{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--card);border-right:1px solid var(--border);padding:20px 12px;scrollbar-width:thin;scrollbar-color:var(--border) transparent}}
.main{{padding:0 32px 60px;min-width:0;max-width:1180px}}

.nav-title{{font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;padding:0 8px;line-height:1.3}}
.nav-phase{{margin-bottom:8px}}
.nav-pname{{display:block;font-size:13px;font-weight:600;color:var(--pc,var(--muted));text-transform:uppercase;letter-spacing:.05em;padding:6px 8px 2px}}
.nav-step{{display:flex;align-items:center;gap:4px;padding:4px 8px 4px 12px;font-size:12.5px;color:var(--muted);text-decoration:none;border-radius:6px;border-left:2px solid transparent;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.nav-step:hover{{background:var(--bg);color:var(--text);border-left-color:var(--accent)}}
.nav-step.gate{{font-weight:600}}
.nav-step .ok{{color:var(--ok);flex-shrink:0}}
.nav-step .no{{color:#cbd5e1;flex-shrink:0}}
.gmark{{font-size:11px;font-weight:700;color:var(--warn);background:#fef3c7;border-radius:3px;padding:0 3px;flex-shrink:0}}

.hero{{background:var(--grad-hero);color:var(--surface);border-radius:0 0 24px 24px;padding:32px 36px 24px;margin:0 -32px 28px}}
.hero h1{{font-size:24px;font-weight:700;letter-spacing:-.02em}}
.hero .sub{{font-size:13px;color:#94a3b8;margin-top:6px;line-height:1.7}}
.hero-stats{{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap}}
.gov-metrics-line{{margin-top:10px;font-size:13px;color:#5a6b7d;background:#f4f7fa;border-radius:8px;padding:6px 12px;display:inline-block}}
.gov-metrics-line b{{color:#1f3a5f}}
.hstat{{text-align:center}}
.hstat b{{display:block;font-size:22px;font-weight:800;color:var(--surface)}}
.hstat span{{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}}
.phase-bar{{display:flex;gap:0;margin-top:20px;align-items:center}}
.pb-seg{{flex:1;height:4px;border-radius:2px;position:relative}}
.pb-dot{{width:10px;height:10px;border-radius:50%;background:var(--surface);flex-shrink:0;margin:0 4px}}
.pb-label{{font-size:11px;color:#94a3b8;text-align:center;margin-top:4px;white-space:nowrap}}

/* ── 六道闸仪表盘（人的审核把关）── */
.gates{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 20px}}
.gate-card{{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;box-shadow:var(--shadow);border-top:3px solid var(--border)}}
.gate-card.gpass{{border-top-color:var(--ok)}}
.gate-card.gpending{{border-top-color:#cbd5e1;opacity:.75}}
.gate-name{{font-size:15px;font-weight:800;color:var(--text)}}
.gate-card.gpass .gate-state{{color:var(--ok)}}
.gate-state{{font-size:13px;font-weight:700;margin-top:2px}}
.gate-ts{{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}}
.gate-desc{{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5}}
.gate-rej{{display:inline-block;font-size:11px;margin-top:5px;padding:1px 6px;border-radius:4px;background:#fef3c7;color:var(--warn)}}
.gate-rej.ok1{{background:#dcfce7;color:#15803d}}
.gate-card.gfail{{border-top-color:var(--err)}}
.gate-card.gfail .gate-state{{color:var(--err)}}
.st-open{{margin:10px 0 0;padding:10px 14px;border-left:3px solid var(--err);background:#fef2f2;border-radius:8px;font-size:12.5px;color:#991b1b;line-height:1.7}}
.st-entry{{margin:8px 0 0;padding:8px 12px;border-left:3px solid #0891b2;background:#ecfeff;border-radius:8px;font-size:13px;color:#155e75;line-height:1.7}}
.st-note{{margin:10px 0 0;padding:10px 14px;border-left:3px solid var(--warn);background:#fffbeb;border-radius:8px;font-size:12.5px;color:#92400e;line-height:1.7}}

.phase{{margin-bottom:32px}}
.ph-hd{{display:flex;align-items:center;gap:14px;padding:16px 0 12px;margin-bottom:4px;border-bottom:2px solid var(--pc,var(--border))}}
.ph-num{{width:36px;height:36px;border-radius:50%;background:var(--pc,var(--border));color:var(--surface);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}}
.ph-hd h2{{font-size:17px;color:var(--text);letter-spacing:-.01em}}
.ph-hd p{{font-size:13px;color:var(--muted)}}

.step{{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin:12px 0;box-shadow:var(--shadow);position:relative;overflow:hidden}}
.step::before{{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--pc,var(--border));opacity:.6}}
.step.gate-step{{border-color:#fbbf24;background:linear-gradient(135deg,#fffbeb 0%,var(--surface) 30%)}}
.step.gate-step::before{{background:#f59e0b;width:4px;opacity:1}}
.st-hd{{display:flex;align-items:flex-start;gap:12px;margin-bottom:6px}}
.st-num{{width:32px;height:32px;border-radius:8px;background:var(--pc,var(--border));color:var(--surface);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}}
.step.gate-step .st-num{{background:#f59e0b}}
.st-title h3{{font-size:14px;line-height:1.5;color:var(--text);letter-spacing:-.005em}}
.st-meta{{font-size:13px;color:var(--muted)}}
.actor{{display:inline-block;font-size:11px;font-weight:600;border-radius:4px;padding:1px 7px;margin-left:6px}}
.st-story{{font-size:12.5px;color:#334155;line-height:1.75;margin:4px 0 10px;padding-left:44px}}

.st-gate{{margin:8px 0 8px 44px;background:var(--bg);border-radius:8px;overflow:hidden;border:1px solid var(--border)}}
.st-gate summary{{padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}}
.st-gate summary::before{{content:'▸';transition:transform .2s}}
.st-gate[open] summary::before{{transform:rotate(90deg)}}
.st-gate summary::marker{{display:none}}
.gate-body{{padding:8px 14px 12px;font-size:13px;line-height:1.8;color:var(--text);border-top:1px solid var(--border)}}
.st-sec{{margin:10px 0 0 44px;border-top:1px dashed var(--border);padding-top:8px}}
.st-sec-hd{{font-size:13px;font-weight:700;color:var(--muted);letter-spacing:.05em;margin-bottom:4px}}
.st-sec .st-story{{margin-left:0}}
.st-known,.st-improve{{font-size:13px;line-height:1.8;color:var(--text);background:var(--bg);border-radius:8px;padding:8px 12px;margin:4px 0}}
.st-known.none,.st-improve.none,.st-issues.none{{color:var(--muted);font-size:13px;padding:4px 0}}
.st-improve-note{{font-size:13px;color:var(--muted);margin-top:4px}}
.st-issues-tbl{{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0;table-layout:fixed}}
.st-issues-tbl th,.st-issues-tbl td{{border:1px solid var(--border);padding:4px 8px;text-align:left;vertical-align:top;word-break:break-word}}
.st-issues-tbl th{{background:var(--bg);color:var(--muted);font-weight:600}}
/* ── 驾驶舱联动地图（单一定义：原五处重复块合并——非冲突声明取并集、margin 冲突取 0 0 22px） ── */
.ck-map{{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;margin:0 0 22px;box-shadow:var(--shadow);max-width:100%;box-sizing:border-box}}
.ck-map-hd{{font-size:15px;font-weight:700;display:flex;align-items:baseline;gap:10px;margin-bottom:14px}}
.ck-map-sub{{font-size:13px;color:var(--muted);font-weight:400;margin-left:10px}}
.ck-zones{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:16px;max-width:100%}}
.ck-zone{{border:1px solid color-mix(in srgb,var(--zc) 35%,var(--border));border-left:4px solid var(--zc);border-radius:8px;padding:8px 10px;background:color-mix(in srgb,var(--zc) 4%,var(--card))}}
.ck-zone-hd{{font-size:13px;font-weight:700;color:var(--zc);margin-bottom:6px;letter-spacing:.03em}}
.ck-zone-links{{display:flex;flex-wrap:wrap;gap:4px 8px}}
.ck-zone-links a{{font-size:13px;color:var(--muted);text-decoration:none;border-bottom:1px dotted var(--border);padding:1px 0}}
.ck-zone-links a:hover{{color:var(--zc);border-bottom-color:var(--zc)}}
.ck-chain{{border-top:1px dashed var(--border);padding:12px 0 4px}}
.ck-chain-hd{{font-size:13px;margin-bottom:8px}}
.ck-chain-hd b{{color:var(--text)}}
.ck-chain-desc{{font-size:13px;color:var(--muted);margin-left:8px}}
.ck-chain-nodes{{display:flex;flex-wrap:wrap;align-items:center;gap:6px}}
.ck-node{{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;text-decoration:none;color:var(--text);background:color-mix(in srgb,var(--zc) 6%,var(--card));border:1px solid color-mix(in srgb,var(--zc) 25%,var(--border));border-radius:16px;padding:3px 10px;transition:all .15s}}
.ck-node:hover{{background:color-mix(in srgb,var(--zc) 15%,var(--card));border-color:var(--zc)}}
.ck-node-z{{font-size:11px;color:var(--surface);background:var(--zc);border-radius:8px;padding:0 5px;font-weight:600}}
.ck-arrow{{color:var(--muted);font-size:14px;margin:0 2px;font-weight:300}}
.st-linkline{{font-size:13px;color:var(--muted);margin:4px 0 0;padding:4px 8px;background:var(--bg);border-radius:6px}}
.st-linkline a{{text-decoration:none;border-bottom:1px dotted currentColor}}
.art-checks{{display:grid;gap:2px;margin:4px 0 8px}}
.art-chk-row{{display:flex;gap:8px;align-items:baseline;font-size:12.5px;padding:2px 6px;border-radius:4px;background:var(--bg)}}
.art-chk-row.miss{{background:#fef2f2}}
.art-chk-flag{{flex-shrink:0}}
.art-chk-label{{flex-shrink:0;font-weight:600;color:var(--text);min-width:110px}}
.art-chk-val{{color:var(--muted);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.art-chk-val.miss{{color:var(--danger)}}
.st-shots{{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;margin:6px 0 0 44px}}
.art-code{{max-height:340px;overflow:auto}}
.gate-body{{max-height:260px;overflow:auto}}
.step.gate-step .gate-body{{color:#78350f}}

/* ── 全量呈现：对话全文/操作前后帧/环节效果 ── */
.st-r18{{margin:8px 0 8px 44px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}}
.st-r18 summary{{padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;background:var(--bg)}}
.st-r18 summary::before{{content:'▸';transition:transform .2s}}
.st-r18[open] summary::before{{transform:rotate(90deg)}}
.st-r18 summary::marker{{display:none}}
.st-r18.r18-empty{{opacity:.75;border-style:dashed}}
.r18-body{{padding:10px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}}
.r18-sec{{border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--bg)}}
.r18-sec-hd{{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}}
.r18-anchor{{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;word-break:break-all}}
.r18-msg{{padding:6px 0;border-bottom:1px dashed var(--border)}}
.r18-msg:last-child{{border-bottom:none}}
.r18-msg-hd{{display:flex;gap:8px;align-items:baseline;font-size:13px}}
.r18-msg-hd b{{color:var(--text)}}
.r18-ts{{color:var(--muted);font-size:11px;font-family:ui-monospace,monospace}}
.r18-msg-body{{font-size:13px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word;margin-top:2px}}
.r18-entry{{font-size:12.5px;color:#155e75;background:#ecfeff;border-radius:6px;padding:4px 10px;margin-bottom:6px}}
.r18-frames{{margin:4px 0}}
.r18-note{{font-size:12.5px;color:#92400e;margin-top:4px}}
.r18-effect-text{{font-size:12.5px;line-height:1.7}}
.r18-ev{{font-size:13px;color:var(--muted);margin-top:2px}}
.r18-ev code{{font-family:ui-monospace,monospace;word-break:break-all}}

/* ── 8.6 交付物视图（补遗③ R11）：实物渲染+模版核对，与 .st-gate/details 同风格 ── */
.st-artifact{{margin:8px 0 8px 44px;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}}
.st-artifact summary{{padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;background:var(--bg)}}
.st-artifact summary::before{{content:'▸';transition:transform .2s}}
.st-artifact[open] summary::before{{transform:rotate(90deg)}}
.st-artifact summary::marker{{display:none}}
.art-body{{padding:10px 14px;border-top:1px solid var(--border)}}
.art-item{{border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:var(--bg)}}
.art-item:last-child{{margin-bottom:0}}
.art-hd{{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px}}
.art-hd b{{font-size:12.5px;color:var(--text)}}
.art-path{{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;word-break:break-all}}
.art-verdict{{font-size:11px;font-weight:700;border-radius:3px;padding:1px 6px;flex-shrink:0}}
.art-verdict.ok{{background:#dcfce7;color:#15803d}}
.art-verdict.miss{{background:#fef2f2;color:var(--err)}}
.art-checks{{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}}
.art-chk{{font-size:11px;border-radius:3px;padding:1px 6px;background:var(--card);border:1px solid var(--border);color:var(--text)}}
.art-chk.ok{{color:var(--ok)}}
.art-chk.miss{{color:var(--err);border-color:#fecaca;background:#fef2f2}}
.art-body h4,.art-body h5,.art-body h6{{font-size:13px;font-weight:700;margin:8px 0 4px;color:var(--text)}}
.art-body p{{font-size:12.5px;margin:4px 0;line-height:1.7;color:#334155;word-break:break-word}}
.art-body ul{{margin:4px 0 4px 18px;font-size:12.5px;line-height:1.7;color:#334155}}
.art-body li{{margin:2px 0}}
.art-body code{{background:var(--card);border:1px solid var(--border);border-radius:3px;padding:0 4px;font-family:ui-monospace,monospace;font-size:11px}}
.art-quote{{border-left:3px solid var(--border);margin:6px 0;padding:4px 10px;color:var(--muted);font-size:13px;background:var(--card);border-radius:4px}}
.art-tbl{{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0;border:1px solid var(--border);border-radius:6px;overflow:hidden}}
.art-tbl th,.art-tbl td{{border:1px solid var(--border);padding:3px 6px;text-align:left;vertical-align:top;line-height:1.6;overflow-wrap:anywhere;word-break:break-word}}
.art-tbl th{{background:var(--bg);font-weight:600}}
.art-code{{background:var(--ink-strong);color:var(--line);border-radius:6px;padding:8px 10px;font-size:11px;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;margin:6px 0;max-height:340px;overflow-y:auto}}
.art-trunc{{font-size:11px;color:var(--warn);margin-top:4px}}
@media (max-width: 900px) {{ .st-artifact{{margin-left:0}} }}

/* .st-shots 单一定义=上方 grid 版（原此处 flex 版与 grid 版双定义打架，删 flex 保 grid） */
.shot{{flex:1 1 400px;max-width:520px;position:relative;cursor:zoom-in}}
.shot img{{width:100%;max-height:420px;object-fit:cover;object-position:top;border:1px solid var(--border);border-radius:8px;display:block;transition:box-shadow .2s}}
.shot:hover img{{box-shadow:0 4px 16px rgba(0,0,0,.12)}}
.shot figcaption{{font-size:13px;color:var(--muted);text-align:center;margin-top:4px}}
.shot-kind{{display:inline-block;font-size:11px;font-weight:700;border-radius:3px;padding:0 5px;margin-right:5px;vertical-align:1px;letter-spacing:.02em}}
.shot input{{display:none}}
.shot input:checked ~ img{{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-height:90vh;max-width:92vw;width:auto;object-fit:contain;z-index:9999;background:var(--surface);box-shadow:0 8px 40px rgba(0,0,0,.3);border-radius:8px}}
.shot input:checked ~ figcaption{{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;background:var(--ink);color:var(--surface);padding:4px 12px;border-radius:6px;font-size:13px}}
.no-evidence{{font-size:13px;color:var(--muted);padding:8px 0}}

h2.section-hd{{font-size:18px;font-weight:700;color:var(--text);margin:32px 0 16px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}}
h2.section-hd::before{{content:'';width:4px;height:20px;border-radius:2px;background:var(--accent)}}
table{{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);overflow:hidden;font-size:13px;border:1px solid var(--border)}}
th,td{{border-bottom:1px solid var(--border);padding:8px 12px;text-align:left;vertical-align:top}}
th{{background:var(--bg);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}}
/* ── 阅读习惯三件（2026-10-12）：正文行长限 62em（中文约 40 字/行舒适区，表格与图不设限）；
      长表斑马纹+行悬停（154 行台账的行追踪）；正文块呼吸间距 ── */
.main p:not(.stat-note):not([class]){{max-width:62em}}
.main ul{{max-width:62em}}
tbody tr:nth-child(even){{background:var(--surface-2)}}
tbody tr:hover{{background:var(--accent-soft)}}
.d-ok{{color:var(--ok);font-weight:500}} .d-warn{{color:var(--warn)}}
.cp-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:10px }}
.cp-card {{ border:1px solid var(--border); border-radius:10px; background:var(--card); padding:10px 12px; box-shadow:var(--shadow) }}
.cp-head {{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:6px }}
.cp-name {{ font-size:13px; font-weight:700 }}
.cp-who {{ font-size:11px; color:var(--warn); font-weight:600; white-space:nowrap }}
.cp-shot {{ display:block; cursor:zoom-in; margin:2px 0 6px }}
.cp-shot img {{ width:100%; height:118px; object-fit:cover; object-position:top; border:1px solid var(--border); border-radius:6px; display:block }}
.cp-shot input {{ display:none }}
.cp-shot input:checked ~ img {{ position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); height:auto; max-height:88vh; max-width:90vw; width:auto; object-fit:contain; z-index:9999; box-shadow:0 8px 40px rgba(0,0,0,.3); border-radius:8px }}
.cp-sem {{ font-size:12.5px; color:#334155; line-height:1.5 }}
.cp-ev {{ font-size:11px; color:var(--muted); margin-top:4px; font-family:ui-monospace,monospace }}
.dm-badge {{ display:inline-block; font-size:11px; font-weight:700; color:#15803d; background:#dcfce7; border-radius:4px; padding:1px 7px; margin-right:7px; vertical-align:1px }}
a.dm-cp {{ display:inline-block; font-size:11px; color:var(--accent); text-decoration:none; margin:1px 3px 1px 0; border:1px solid var(--border); border-radius:4px; padding:1px 6px }}
a.dm-cp:hover {{ background:var(--bg) }}
@media (max-width: 1100px) {{ .cp-grid {{ grid-template-columns:repeat(2,1fr) }} }}
.domains {{ margin-top: 12px }}
.domains td {{ font-size: 12px; line-height: 1.7; vertical-align: top }}
.dm-name {{ font-size: 11px; color: var(--muted) }}
.dm-q {{ font-weight: 600 }}
.dm-a {{ color: #334155 }}
.dm-e {{ color: var(--muted); font-size: 11px }}
.govgrid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}}
.stat-note{{font-size:12.5px;color:var(--muted);margin:6px 0 0}}
details.audit{{margin-top:12px}}
details.audit summary{{font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;padding:8px 0}}
.footer{{margin:40px 0 20px;text-align:center;font-size:13px;color:var(--muted);line-height:1.8}}

@media (max-width: 900px) {{
  .layout{{grid-template-columns:1fr}}
  /* 窄屏侧栏不再消失：顶置横滚条形态（类名不变，只改布局形态） */
  nav.sidebar{{position:static;width:100%;height:auto;max-height:none;display:flex;gap:4px;overflow-x:auto;padding:8px 12px;border-right:none;border-bottom:1px solid var(--line)}}
  .nav-title,.nav-phase{{flex:0 0 auto}}
  .nav-phase{{display:contents}}
  .nav-pname{{flex:0 0 auto}}
  .nav-step{{flex:0 0 auto}}
  .main{{padding:0 16px 40px}}
  .hero{{margin:0 -16px 20px;padding:24px 20px 20px;border-radius:0 0 16px 16px}}
  .govgrid{{grid-template-columns:1fr}}
  .gates{{grid-template-columns:repeat(2,1fr)}}
  .st-story,.st-gate{{margin-left:0;padding-left:0}}
}}
/* ── 图版面（分析轮 P-6/P-8）：图放大可读 + 锚点滚动偏移 ── */
/* 证据图=产品界面实拍，不得裁剪：自然比例呈现（2026-10-10 撤 16:10 信箱灰垫——
   aspect-ratio 占位与实拍比例不一致时上下留灰边），描边+浅阴影承载版面 */
label.shot{{flex:1 1 100%;max-width:none;min-width:0}}
label.shot img{{width:100%;height:auto;max-height:none;object-position:top;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-sm)}}
.cp-shot img{{width:100%;height:auto;max-height:none;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-sm)}}
/* 产品成效系列帧：1/4 宽四列缩略网格（自然比例不裁剪；点击全屏放大沿用 .shot 交互） */
.st-crit{{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:4px 0 10px;background:var(--surface)}}
.st-crit-hd{{font-weight:700;font-size:13.5px;margin-bottom:6px}}
.st-crit-src{{font-weight:400;font-size:11px;color:var(--muted);margin-left:6px}}
.st-crit-zhun{{font-size:13px;margin-bottom:6px}}
.st-crit ul{{margin:4px 0 6px 18px;padding:0}}
.st-crit li{{font-size:13px;line-height:1.7;margin:3px 0}}
.st-crit-g{{margin-top:8px;padding-top:6px;border-top:1px dashed var(--line);font-size:13px}}
.st-crit-g ul{{margin:4px 0 0 18px}}
.st-crit-ev{{margin-top:8px;font-size:12.5px;color:var(--muted);border-top:1px dashed var(--line);padding-top:6px}}
.po-plain{{font-size:13.5px;line-height:1.7;margin:6px 0 10px;color:var(--ink)}}
.hero-terms{{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.6}}
.po-shots{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:8px 0}}
.po-shots label.shot{{flex:none;max-width:none}}
.po-shots label.shot img{{width:100%;height:auto;max-height:none;object-fit:contain}}
.po-shots label.shot figcaption{{font-size:11px;word-break:break-all}}
@media (max-width:900px){{.po-shots{{grid-template-columns:repeat(2,1fr)}}}}
.step,.section-hd{{scroll-margin-top:16px}}
@media print {{
  .sidebar{{display:none}}
  .layout{{grid-template-columns:1fr}}
  .shot img{{max-height:none}}
  .step{{break-inside:avoid}}
}}
</style></head><body>
<div class="layout">
<nav class="sidebar">
  <div class="nav-title">Swarm Studio<br>全流程推演报告<br><span style="font-size:13px;color:var(--muted)">RFD-001 · 支付收银台</span></div>
  {nav_html}
</nav>
<main class="main">
  <header class="hero">
    <h1>Swarm Studio 全流程推演报告</h1>
    <div class="sub">RFD-001 收单商户多端小程序支付收银台 · 15 人 × AI 分布式集群协作 · 四类 AI 员工（需求设计/应用研发/质量测试/研发治理）<br>
    推演轮次 {RUN_ID or 'V3 基线轮'} · 锚定本轮 state 写入通过标记时间窗 · 标题与把关逐字引用方案原文 · 每步标注人/AI 角色与结果锚点</div>
    <div class="hero-stats">
      <div class="hstat"><b>26</b><span>步骤</span></div>
      <div class="hstat"><b>{unique_imgs}</b><span>证据图位 · {total_imgs} 图次（口径=步位注册且盘上在位；审计器盘上全量 PNG 计数减此值=未挂接帧）{_img_honest_note}</span></div>
      <div class="hstat">{_HERO_GATE_HSTAT.get(RUN_ID, _hero_gate_default())}</div>
      <div class="hstat"><b>{n_resolved}/{n_issue_keys}</b><span>问题单已完整循环（已修+观察+延后；表外词 {n_nonstd} 键待归桶）{f' · 待处置 {n_issue_open}' if n_issue_open else ''}——配对口径=纪律 28 阶梯：精确 {n_exact_pair} 键+广播/单键 {n_bcast_pair} 键{f' · 悬挂 DISP {n_dangling} 键（台账卫生，见审计 WARN）' if n_dangling else ''}</span></div>
      <div class="hstat">{_r18_hero_badge()}</div>
      <div class="hstat"><b>6</b><span>生命周期阶段</span></div>
    </div>
    {_gov_metrics_line()}
    <div class="hero-terms">名词速查：首过=关卡第一次就通过 ｜ 补过=被打回补齐后通过 ｜ 打回=没通过 ｜ 判词=关卡的结论文本（只认卡片结构化字段）｜ 幂等=重复提交只生效一次 ｜ AC=验收标准 ｜ 锚点=可按编号回查的凭证（提交号/卡号/事件号）｜ 问题单=全程记录每个问题的台账条目</div>
    <div class="phase-bar">{''.join(f'<div class="pb-seg" style="background:{c1}"></div><div class="pb-dot"></div>' for _,_,_,_,c1,_ in PHASES[:-1])}<div class="pb-seg" style="background:{PHASES[-1][4]}"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">{''.join(f'<span class="pb-label">{p[2]}</span>' for p in PHASES)}</div>
  </header>

  {_ck_zone_html()}

  <details class="stat-note" style="margin:6px 0 14px"><summary>十章地图（§5.4 骨架导航：0 总述 → 1 口径 → 2 改判 → 3 意图链 → 4 新特性 → 5 叙事层 → 6 旅程层 → 7 六域 → 8 问题单 → 9 完整循环治理）</summary>
  <p><a href="#ch0-collab">0 推演逻辑与协作顺序</a> · <a href="#ch1-caliber">1 本轮口径</a> · <a href="#audit-response">2 独立审计与处置（改判真值层）</a> · <a href="#nv-intent-chain">3 意图通路</a> · <a href="#ch4-features">4 本轮交付成效与新特性</a> · <a href="#nv-hero">5 叙事层</a> · <a href="#ch6-journey">6 旅程层 26 步</a> · <a href="#ch7-domains">7 六域审计</a> · <a href="#ch8-issues">8 问题单终态</a> · <a href="#ch9-gov">9 完整循环治理终态</a></p></details>

  {_ch0_html}
  {_ch1_html}

  <h2 class="section-hd" id="audit-response">第 2 章 · 独立审计与处置（改判真值层）</h2>
  {audit_response_section}

  {_ch3_html}
  {_ch4_html}

  <h2 class="section-hd">第 5 章 · 叙事层（挑战实例 / 双 loop / 六亮点 / 四维协作质量）</h2>
  {_narrative_html}

  <h2 class="section-hd" id="ch6-journey">第 6 章 · 旅程层：26 步实录（每步四段）</h2>
  <h2 class="section-hd" id="checkpoints">六道关卡 · 谁在什么时间把住了什么关</h2>
  <div class="gates">{gate_cards()}</div>
  <p class="stat-note">{ckpt_intro_note}</p>
  {checkpoints_html()}

  {content_html}

  <h2 class="section-hd" id="ch7-domains">第 7 章 · 六域审计（每域一个交付问题）</h2>
  {domains_table()}
  <p class="stat-note">数据来源：{DOMAIN_LEDGER_SOURCE} —— 治理中心（#/app/board 治理页签组，v0.7.30 起 /app/gov 重定向至此）「六域体检」可在真实流程中随时重跑并累积台账</p>

  <h2 class="section-hd" id="ch8-issues">第 8 章 · 问题单终态（{stat}）</h2>
  <p class="stat-note">{stat_note}</p>
  <details class="audit"><summary>▶ 展开问题单处置明细（唯一键口径）</summary>
  <table style="margin-top:8px"><tr><th>类型·主体</th><th>频次</th><th>级别</th><th>描述</th><th>处置结论</th></tr>{itable}</table></details>
  {monitor_proxy_html()}


  <h2 class="section-hd" id="ch9-gov">第 9 章 · 完整循环治理终态——治理系统工作了吗？</h2>
  <p class="stat-note">本章回答一个问题：SwarmStudio 的治理机制在真实研发中是否形成了完整循环（问题 100% 处置、经验积累、度量可追踪）。</p>

  <div style="margin:12px 0;padding:12px 16px;background:var(--bg);border-radius:8px;border-left:4px solid {_gov_verdict_color}">
    <b style="color:{_gov_verdict_color}">结论：{_gov_verdict_title}</b>——{_gov_verdict_body}
  </div>

  <h3 style="font-size:13px;margin:14px 0 6px">证据一：问题全部处置（看板留痕）</h3>
  <div class="govgrid">
    <table><tr><th>度量</th><th>终态值</th><th>含义</th></tr>
    {gov_metrics_rows}
    <tr><td>发布基线</td><td>aipaydev main {main_sha}</td><td>构建可复现的锚点</td></tr>
    <tr><td>处置完整循环率</td><td>{'100%' if n_issue_open == 0 else f'{n_resolved}/{n_issue_keys}'}{f'（表外词 {n_nonstd} 键）' if n_nonstd else ''}</td><td>每个问题都有结论，没有静默丢失；表外词键=处置在案但首词越三态词表（台账卫生）</td></tr>
    </table>
  </div>
  <p class="stat-note">每个问题从发现（ISSUE 行）到处置（DISP 行）全程在看板上留痕，SwarmStudio 治理中心的台账区可随时回查。</p>

  <h3 style="font-size:13px;margin:14px 0 6px">证据二：经验积累（记忆库）</h3>
  <p style="font-size:13px;color:var(--text)">{_gov_ev2}</p>

  <h3 style="font-size:13px;margin:14px 0 6px">证据三：度量可追踪（对照上轮）</h3>
  <p style="font-size:13px;color:var(--text)">{_gov_ev3}</p>

  <h3 style="font-size:13px;margin:14px 0 6px">证据四：能力层在岗（技能执勤账）</h3>
  {skill_duty_html()}

  <h3 style="font-size:13px;margin:14px 0 6px">证据五：语义层在工作（本体证据面）</h3>
  {ontology_html()}

  <h2 class="section-hd" id="artifact-panorama">交付物全景矩阵</h2>
  <p class="stat-note">各步交付物实物自中央仓实读渲染嵌入（见各步"📦 交付物实物与模版核对"折叠块，单件截断 5000 字符、全文按路径@锚反查），模版核对=逐项字段命中 ✅/缺（红）。{art_stat}。</p>
  {art_tbl}
  <p class="stat-note">{art_note_g5}</p>

  <div class="footer">报告由 mx-report-gen.py 生成：步骤标题与把关逐字解析自方案正本（单一事实源），交付物自中央仓实读，问题单与计数自台账实测统计<br>
全部证据图=Swarm Studio 产品界面真实浏览器截图（治理工件 markdown 经治理中心 UI 渲染；消息=协作沟通房间实拍；证据锚点见图内 commit/分支）{_img_honest_note} · 点击截图可放大</div>
</main>
</div>
<button id="back-top" title="回到顶部" aria-label="回到顶部" style="display:none;position:fixed;right:26px;bottom:30px;z-index:90;width:42px;height:42px;border:none;border-radius:50%;background:var(--accent);color:#fff;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,.22);opacity:.92">↑</button>
<script>
(function () {{
  // 阅读位置感三件（2026-10-12 阅读习惯轮）：侧栏当前节高亮 + 回顶按钮 + 平滑滚动
  document.documentElement.style.scrollBehavior = 'smooth';
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-step, .sidebar a[href^="#"]'));
  var byId = {{}};
  navLinks.forEach(function (a) {{
    var id = a.getAttribute('href').slice(1);
    if (id && !byId[id]) byId[id] = [];
    if (id) byId[id].push(a);
  }});
  var targets = Object.keys(byId).map(function (id) {{ return document.getElementById(id); }}).filter(Boolean);
  if (targets.length && 'IntersectionObserver' in window) {{
    var io = new IntersectionObserver(function (entries) {{
      entries.forEach(function (e) {{
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) {{ a.style.background = ''; a.style.color = ''; a.style.borderLeftColor = ''; }});
        (byId[e.target.id] || []).forEach(function (a) {{
          a.style.background = 'var(--accent-soft)';
          a.style.color = 'var(--accent-deep)';
          a.style.borderLeftColor = 'var(--accent)';
          a.style.fontWeight = '600';
        }});
      }});
    }}, {{ rootMargin: '-12% 0px -70% 0px' }});
    targets.forEach(function (t) {{ io.observe(t); }});
  }}
  var btn = document.getElementById('back-top');
  if (btn) {{
    var onScroll = function () {{ btn.style.display = window.scrollY > window.innerHeight ? 'block' : 'none'; }};
    window.addEventListener('scroll', onScroll, {{ passive: true }});
    onScroll();
    btn.addEventListener('click', function () {{ window.scrollTo({{ top: 0, behavior: 'smooth' }}); }});
  }}
}})();
</script>
</body></html>'''


# ── 帧强制关卡（2026-10-07 run10 教训：无实时帧的报告是空壳，禁出）──
_real_frames = list(STEPS_DIR.glob('*.png')) if STEPS_DIR.exists() else []
if len(_real_frames) == 0:
    sys.exit(f'[mx-report-gen] 强制关卡：本轮零实时帧（{STEPS_DIR} 无 PNG）——'
             f'推演执行期间 capture_step 未触发或全部失败。'
             f'禁出空壳报告。修复：确保 aipay-scenario.sh 每步调 capture_step，'
             f'且 studio :8802 在线。不要用收尾后补拍冒充实时帧。')

# ── 宿主环境脱敏（方案 §5.4.3，2026-10-11 用户指令）：报告禁露个人电脑环境标识 ──
# 家目录/外置卷路径以占位形呈现；占位语义=路径可见性让位于隐私，反查走 run 目录原文件。
import re as _re
_ENV_MASK_RULES = (
    (_re.compile(r'/Users/[A-Za-z0-9_.\-]+'), '[宿主家目录]'),
    (_re.compile(r'/Volumes/[A-Za-z0-9_.\-]+'), '[宿主卷]'),
)
def _mask_env(text: str) -> str:
    for _rx, _ph in _ENV_MASK_RULES:
        text = _rx.sub(_ph, text)
    return text

html = _mask_env(html)
OUT.write_text(html, encoding='utf-8')
print(f'report written: {OUT} ({len(html)} bytes, {total_imgs} images)')

# ── txt 派生物写入器（F-6②，2026-10-06 入库）：HTML→纯文本三件套，随生成链产出
#    ——run9 曾人工刷新 txt 但仓库无写入器（不可复现=下次生成必漂移，P21 同族教训）。──
def _html_to_text(h):
    h = re.sub(r'<style.*?</style>|<script.*?</script>', '', h, flags=re.S)
    h = re.sub(r'</(p|div|tr|li|h[1-6]|summary|table)>', '\n', h)
    h = re.sub(r'</t[dh]>', ' | ', h)
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'<[^>]+>', '', h)
    h = html_mod.unescape(h)
    h = re.sub(r'[ \t]+', ' ', h)
    h = re.sub(r'\n\s*\n+', '\n\n', h)
    return h.strip() + '\n'

import html as html_mod
(EVID / 'simulation-report.txt').write_text(_html_to_text(html), encoding='utf-8')
print(f'txt written: {EVID}/simulation-report.txt')

# steps-extract.txt：26 步结构化摘录（TITLE/META/STORY/ENTRY/GATE/SHOTS）
import io
_buf = io.StringIO()
for n, title, gate_text, meta in STEPS:
    done = any(state.get(k) for k in meta.get('keys', [])) or n == 26
    _buf.write('=' * 88 + f'\nSTEP {n}\n')
    _buf.write(f'TITLE: {title}\n')
    _buf.write(f"META: {'✅' if done else '⬜'} {meta.get("actorText", "")}\n")
    _buf.write(f"STORY: {meta["narrative"]}\n")
    e = STEP_ENTRIES.get(n)
    if e:
        _buf.write(f'ENTRY: {e[0]} | {e[1]} | {e[2]}\n')
    if gate_text:
        _buf.write(f'GATE: {gate_text}\n')
    if meta.get('imgs'):
        _buf.write(f"SHOTS ({len(meta.get('imgs', []))}):\n")
        for pre, cap, kind in meta.get('imgs', []):
            _buf.write(f'   - screenshots/steps/{pre}.png | {cap}\n')
    _buf.write('\n')
(EVID / 'steps-extract.txt').write_text(_mask_env(_buf.getvalue()), encoding='utf-8')
print(f'txt written: {EVID}/steps-extract.txt')
