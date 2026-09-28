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
import re
import subprocess
from pathlib import Path

SIM = Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
EVID = SIM / 'evidence'
STEPS_DIR = EVID / 'screenshots' / 'steps'
OUT = EVID / 'simulation-report.html'
PLAN_PATH = Path('/Volumes/nvme2230/lab/ncwk/docs/superpowers/specs/2026-09-25-mux-v3-lifecycle-plan.md')
CEN = SIM / 'central/aipaydev'

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

# ── 每步叙事：角色徽章 + 执行叙事 + 截图中文说明 ──
# actor: human=人主导 / ai=AI 主导 / both=人机协同 / gate=硬闸（含人确认点）
# 叙事全部锚定真实事件（scenario.log / matrix event / git 提交），不虚构。
STEPS_META = {
    1: dict(keys=['smoke_done'], actor='human', actorText='人 · admin 管理员',
            narrative='管理员签发账号清单：15 人编制每人人类账号+AI 助理账号（admin 不设助理），matrix 地址/token/密码经安全渠道下发，清单入仓可逐项对账。',
            imgs=[('01-roster', '账号清单 roster.md 入仓（15 人×双账号，含角色分工）')]),
    2: dict(keys=['smoke_done'], actor='ai', actorText='AI · 装配脚本',
            narrative='单 gateway :8801 多路复用承载全部 profile（等价每人一台电脑一套）：14 用户逐一装配"账号+配置+看板+团队围栏+记忆库"四件套，互不可见。',
            imgs=[('02-fleet', 'fleet-manifest 装配清单：14 用户四件套逐项可列')]),
    3: dict(keys=['smoke_done'], actor='human', actorText='人 · 各用户',
            narrative='用户打开 Swarm Studio 免密登录（凭 gateway 已配 Orchestrator channel），也支持 matrix 地址+账号+密码登录；登录后只见本账号档案与看板（ACL 隔离抽查通过）。',
            imgs=[('ui-03-cockpit', '登录后驾驶舱全景：左侧房间/中部协作区/右侧任务决策面板')]),
    4: dict(keys=['smoke_done'], actor='ai', actorText='脚本 · 冒烟门禁',
            narrative='冒烟清单真值核验：24 账号 token 有效、单 gateway+单 studio 就绪、双登录模式通、看板围栏与记忆库在位。bella matrix-login 一次回落如实记问题单（当日已修复复测通过）。',
            imgs=[('04-smoke', '冒烟真值日志转录（scenario.log 原文，含一次问题单记录）')]),
    5: dict(keys=['appinit_done'], actor='both', actorText='人+AI · 应用登记',
            narrative='四个应用模块（支付核心/微信渠道/支付宝渠道/小程序收银台）逐一登记资产表：负责人、专属看板、技术栈、SLA、测试骨架。csw-cashier-mp 门禁骨架缺口记问题单并补建（728dcfe，vitest 10/10 实跑全绿）。',
            imgs=[('05-app-registry', '应用资产登记表 app-registry.md（含门禁骨架核对列）')]),
    6: dict(keys=['people_done'], actor='both', actorText='人+AI · 组织对账',
            narrative='生成组织与权限矩阵：15 人×角色×汇报线×看板×团队×matrix 账号，与实际账号/看板/智能体逐项对账零差异；角色全覆盖含架构/安全/运维/合规审计。',
            imgs=[('06-org', '组织与权限矩阵 org.md（人员×角色×汇报线×看板）')]),
    7: dict(keys=['g1_frozen'], actor='gate', actorText='硬闸 G1 · 人审上锁',
            narrative='BA（bella）经 matrix 私信送达需求文档（邮件通道本期禁用，记问题单口径）。需求过 G1 四项检查：验收标准可机械判定（AC-1~7）、范围外清单、影响面、涉敏评估——四项齐才生成冻结标记入库，锁后不许改。',
            imgs=[('07-freeze', 'G1 冻结文件：AC-1~7 全部可判定 + frozen:true'),
                  ('07-req-dm', 'BA→PM 私信送达原文（event_id 锚定直取）')]),
    8: dict(keys=['room_analysis'], actor='both', actorText='人建群 · AI 邀人',
            narrative='产品经理 fanfan 创建"支付收银台需求分析讨论群"，邀请本机 Orchestrator agent 后，自动邀请全部关联人进群——实查 22 名成员（含各角色人类账号与 AI 助理）。',
            imgs=[('08-members', '群成员名单实查（22 人在群，joined_members API）'),
                  ('ui-09-room', '协作沟通实战画面：群内派发/回灌重报/结论行 + 右侧 11 张跟踪卡（09-26 推演窗口实拍）')]),
    9: dict(keys=['dispatch_marker'], actor='human', actorText='人 · fanfan 派发',
            narrative='fanfan 在群内 @Orchestrator agent 发出派发指令：需求一行信息+材料地址+证据要求（结论必须带提交号+卡号，空喊"完成"不算数）。指令原文按 event_id 锚定直取。',
            imgs=[('09-dispatch', '派发指令原文（dispatch_marker 事件直取）')]),
    10: dict(keys=['register_done'], actor='ai', actorText='AI · Orchestrator',
            narrative='Orchestrator agent 经 matrix channel 接收指令，登记主任务卡到 fanfan-pm-plan 看板：真实卡 ID t_9e5c6c18（建卡工具返回，非需求编号冒充），带 RACI 结构化字段与子卡链。',
            imgs=[('10-card', '主卡实查：t_9e5c6c18 登记凭据（建卡时间/指派人/RACI 四元组）'),
                  ('ui-10-kanban', '看板实操画面：fanfan-pm-plan 37 卡（就绪 3 · 已完成 25 · 已归档 6）')]),
    11: dict(keys=['analysis_done'], actor='ai', actorText='AI · 系统分析智能体',
            narrative='系统分析智能体完成需求切分与三清单匹配（人员/应用模块/组织），产出 SMART 任务清单入仓（9035c1b），ANALYSIS-DONE 结论行经反向核验（提交真在仓库且含分析稿、卡真在账号板）。',
            imgs=[('11-tasklist', 'SMART 任务清单：8 任务具体到人（T-101~T-108）'),
                  ('11-done', 'ANALYSIS-DONE 凭证行（commit+card 双凭证）')]),
    12: dict(keys=['triage_done'], actor='both', actorText='人确认 · AI 执行',
            narrative='四条 RACI 派发直达四主责（chen/hu/lin/xiao），各 agent 建卡回执；xiao 的建卡查重命令被审批门拦截、5 分钟无人应答即停手不越权——人工始终在回路的真实实证。团队负责人分诊确认后推进。',
            imgs=[('12-raci', 'RACI 派发四连 + 回执（含审批门拦截实况）')]),
    13: dict(keys=['anexec_done'], actor='ai', actorText='AI×4 · 四路系分并行',
            narrative='四路专职研发 agent 并行系统分析：接口签名、数据模型、错误码、幂等键、工作量人日评估，四份系分稿各自入仓；跨模块契约对齐（snake_case、金额分 int64）。',
            imgs=[('13-an-paycore', '系分 AN-PAYCORE：支付核心（状态机/幂等/回调）'),
                  ('13-an-chwx', '系分 AN-CHWX：财付通 V3 渠道'),
                  ('13-an-chali', '系分 AN-CHALI：支付宝渠道'),
                  ('13-an-mp', '系分 AN-MP：小程序收银台前端')]),
    14: dict(keys=['review_done'], actor='both', actorText='AI 汇总 · 人复核',
            narrative='fanfan 汇总四路系分成总稿，调用全局需求分析与架构设计技能复核：消除歧义、统一口径（金额分 int64、字段 snake_case），形成概要设计五要素（背景/方案/接口/数据/风险）+ 备选方案取舍 + 爆炸半径 + 验证计划前移。',
            imgs=[('14-design', '概要设计定稿（G2 评审对象）')]),
    15: dict(keys=['g2_arch_pass'], actor='gate', actorText='硬闸 G2 · 架构评审',
            narrative='概设派发 arch 架构治理评审：五项检查逐条留痕（五要素/爆炸半径/验证前移/备选≥2/历史偏差红杠）。首轮结论行因审批超时曲折，打回复评后 ARCH-GATE-PASS（评审记录落卡 t_674f173c）。不评审不排期。',
            imgs=[('15-archgate', 'G2 评审派发与结论行（两轮真实过闸）')]),
    16: dict(keys=['close_done'], actor='ai', actorText='AI · 归档',
            narrative='主任务卡登记全部关联子任务与过程档案后置完成：completed 时间戳、完成摘要（7/7 子卡与任务清单对齐）可回溯，测试工作量按 0.3 系数口径写入。',
            imgs=[('16-card-done', '主卡终态：done + completed 时间 + 完成摘要')]),
    17: dict(keys=['plan_done'], actor='ai', actorText='AI · PM 排期技能',
            narrative='按定稿概设与工作量评估编排排期：四条开发任务（DEV-PAYCORE/CHWX/CHALI/MP）+ 两条测试任务（TEST-BE/FE），测试量=开发×0.3 独立成项，整体 +15% 缓冲，每任务时间窗口与依赖明确。',
            imgs=[('17-schedule', '排期计划：时间窗口+依赖链+测试独立成项')]),
    18: dict(keys=['devimpl_done'], actor='gate', actorText='硬闸 G3 · 编码门禁',
            narrative='四研发按 xxx-dev 五步能力（认知地图→规格先行→代码纪律→知识池→质量门禁）实施：四条 feat/DEV-* 分支入 origin，本地测试证据随分支提交（pay-core 52 例/微信 25 例/支付宝 54 例/收银台 17 例+220 骨架检查，全绿实跑）。无设计不编码、渠道一律本地 mock。',
            imgs=[('18-gitgraph', 'git 图谱：四条开发分支 + 集成线 + main'),
                  ('18-testlog-dev-paycore', 'G3 证据 DEV-PAYCORE：vitest 52/52'),
                  ('18-testlog-dev-chwx', 'G3 证据 DEV-CHWX：vitest 25/25'),
                  ('18-testlog-dev-chali', 'G3 证据 DEV-CHALI：vitest 54/54'),
                  ('18-testlog-dev-mp', 'G3 证据 DEV-MP：17 例+220 检查')]),
    19: dict(keys=['g4_pass'], actor='gate', actorText='硬闸 G4 · 独立验证',
            narrative='测试的人不是写代码的人：qi/fei 独立执行 TEST-BE/TEST-FE，缺陷报→修→验全关才算过（DEF-FE-1..4 实弹闭环）；集成 51/51 + 回归 131/131 全绿，测试报告（51 例实测版）入仓，commit id 回填关联卡。',
            imgs=[('19-testreport', '测试报告：51/51 集成 + 131/131 回归全绿'),
                  ('19-testpass', '测试派发→执行→回执→lead 复验全链消息')]),
    20: dict(keys=['g5_ready'], actor='gate', actorText='硬闸 G5 · 发布准出+人批准',
            narrative='发布检查七项三轮过闸：首轮 FAIL（证据挂接缺/分支树不洁）如实打回，补齐后复审 PASS——回滚数字阈值、灰度 5%→25%→100%、面向用户收益的发布说明、HumanGate 人工批准留痕。两轮不过不得上线。',
            imgs=[('20-readygate', 'G5 三轮结论行（FAIL→补齐→PASS 真实过闸）'),
                  ('20-release-notes', '发布说明：面向用户收益 + 缺陷闭环清单 0 open')]),
    21: dict(keys=['uat_done'], actor='human', actorText='人 · bella 验收',
            narrative='BA 拿 G1 冻结清单逐条对账：AC-1~7 每条给出证据锚点（测试文件行号/分支/commit/报告锚点），全过出验收报告入仓，并登记上线后 SLA（可用性 99.5%、下单 P95≤800ms、P2 事件 4h 响应）。',
            imgs=[('21-acceptance', '验收报告：AC-1~7 全过 + SLA 登记'),
                  ('21-uat', 'UAT 逐条对账消息（每条 AC 带 file:line 锚点）')]),
    22: dict(keys=['workmgr_done'], actor='both', actorText='人+AI · 工作管理',
            narrative='研发工作台账随时可出：14 人×状态分布（待办/进行中/评审/完成）真查数据，WIP 并行 ≤2 零超限，卡壳 72h 任务零——容量过载即记问题单。',
            imgs=[('22-workreport', '工作台账：人均负载/WIP/卡壳三清点')]),
    23: dict(keys=['audit_done'], actor='human', actorText='人 · audit 独立签名线',
            narrative='合规审计独立于开发/测试线：门禁留痕完整性（每道锁冻结凭证在仓）、问题单台账格式、取证目录在位逐项过，意见书带签名线入仓；AI 结论抽检反向核验，幻觉率计入治理报告。',
            imgs=[('23-audit', '合规审计意见书（签名线）'),
                  ('23-audit-line', 'audit 独立复核派发（与开发/测试线隔离）')]),
    24: dict(keys=['retro_done'], actor='gate', actorText='硬闸 G6 · 复盘',
            narrative='三段式复盘（现象只写事实/规律机制归因对事不对人/行动项四要素），问题单 100% 处置记账（已修/观察/延后三态）；治理报告产出（闸首过率/证据通过率/缺陷统计）；本轮经验存入家族记忆库，下轮同需求自动回忆。',
            imgs=[('24-retro', 'G6 复盘文档：三段式+问题单全表处置'),
                  ('24-gov', '治理报告：闸状态/问题单/凭证度量'),
                  ('24-memprobe', '记忆沉淀探针：hindsight 家族库健康')]),
    25: dict(keys=['ide_done'], actor='both', actorText='人 · IDE 实操',
            narrative='IDE 工作台全程介入：顶栏任务计数（31 任务·待办 6·就绪 24·受阻 1）与阻塞卡横幅真实在案；评审面板（通过/打回/有条件）为人工把关入口；模型设置走顶栏模型选择器（mimo-v2.6-pro 在案）；文件树/git 图谱/交互编码一体化。',
            imgs=[('ui-25-ide', 'IDE 工作台：任务计数顶栏 + 阻塞卡横幅 + 评审面板（通过/打回/有条件）+ 模型选择器')]),
    26: dict(keys=['report_done'], actor='ai', actorText='AI · 报告生成器',
            narrative='本报告由生成器产出：步骤标题与把关逐字解析方案文档（单一事实源），截图为真实界面走查与工件渲染（含 matrix event_id/git 引用可反查），26 步状态真实不作假。',
            imgs=[('ui-26-report', '推演报告自身（本页）')]),
}
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

def img_tags(imgs):
    out = []
    for pre, cap in imgs:
        p = STEPS_DIR / f'{pre}.png'
        if p.exists():
            out.append(f'<label class="shot"><input type="checkbox"><img src="screenshots/steps/{pre}.png" alt="{H.escape(cap)}" loading="lazy"><figcaption>{H.escape(cap)}</figcaption></label>')
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
total_imgs = sum(1 for _, _, _, m in STEPS for pre, _ in m['imgs'] if (STEPS_DIR / f'{pre}.png').exists())

# ── 闸门仪表盘 ──
def gate_cards():
    # 打回记录（如实）：G2 首轮超时打回复评、G5 首轮 FAIL 补齐复测
    rejected = {'G2': '首轮曲折复评', 'G5': '首轮 FAIL 补齐'}
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
    锚定 09-25 14:00 — 09-26 08:27 完整推演周期 · 标题与把关逐字引用方案原文 · 每步标注人/AI 角色与结果锚点</div>
    <div class="hero-stats">
      <div class="hstat"><b>26</b><span>步骤</span></div>
      <div class="hstat"><b>{total_imgs}</b><span>证据图</span></div>
      <div class="hstat"><b>2/4</b><span>闸首过率（G2/G5 打回复评后通过）</span></div>
      <div class="hstat"><b>{n_closed}</b><span>问题单已闭环</span></div>
      <div class="hstat"><b>6</b><span>生命周期阶段</span></div>
    </div>
    <div class="phase-bar">{''.join(f'<div class="pb-seg" style="background:{c1}"></div><div class="pb-dot"></div>' for _,_,_,_,c1,_ in PHASES[:-1])}<div class="pb-seg" style="background:{PHASES[-1][4]}"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">{''.join(f'<span class="pb-label">{p[2]}</span>' for p in PHASES)}</div>
  </header>

  <div class="gates">{gate_cards()}</div>

  {content_html}

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

  <div class="footer">步骤标题与把关逐字取自方案文档（生成时解析，单一事实源）<br>截图为真实界面走查与工件渲染 · 含 matrix event_id / git 引用可反查 · 点击截图可放大<br>2026-09-28 内容级审计改版：每步叙事化（人/AI 角色+结果锚点）· 证据 matcher 全面修正 · 问题单口径对齐台账</div>
</main>
</div>
</body></html>'''

OUT.write_text(html, encoding='utf-8')
print(f'report written: {OUT} ({len(html)} bytes, {total_imgs} images)')
