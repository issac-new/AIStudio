"""steps_entry.py — 26 步「操作入口」表（V5 补遗⑥ R16 数据源，轮次无关的产品事实）

每步三元组：(登录身份, 入口路径, 操作序列)。口径：
- 入口一律落在工作台 /app 路由树内（补遗⑤ §13.1 聚焦判定），登录页除外；
- 路径写产品语言（菜单/按钮名），与 13.2 在用面清单锚点一致；
- 报告读者按「身份+路径+序列」可逐步复现同一操作（R16 验收线）；
- 步号语义以方案正本 §2.4 为唯一事实源（2026-10-07 修复步 13/14 错位：
  旧表 13=评审卡审批/14=派发系分，系更早版 26 步映射，与 V8.2 正本不符）。

路由与页签勘误（2026-10-06 差异审计 P1 落版；2026-10-07 页签词表对齐实测；
2026-10-17 V8.37 按时序六阶段 IA 全表重锚；2026-10-18 V8.44 按左侧导航+阶段页签全表重锚）：
当前产品事实（单一事实源=overlay custom/client/ia2/{IaSideNav.vue,stage-meta.ts,
stage-tabs.ts,routes.ts,sim-tabs.ts}）：
- 左侧导航五组：常用（流程总览 /app、工作台 /app/collab、看板 /app/board、
  审批收件箱 /app/inbox、检索 /app/search）＋流程（①搭建 /app/stage/setup、
  ②需求 /app/stage/reqs、③分析设计 /app/stage/design、④开发 /app/stage/build、
  ⑤验收 /app/stage/accept、⑥治理 /app/stage/govern）＋整轮（全流程推演 /app/sim）
  ＋专题（流程架构/本体/评测/技能治理）＋管理（系统设置）。
- 六阶段页单层页签（?tab=，共 29 签）：① steps/org/accounts/teams/assets/agents；
  ② reqs/docs/g1/preflight/launch；③ tasks/analysis/g2/schedule；
  ④ today/board/approvals/risk/quality；⑤ overview/trace/delivery/uat/g5/cases；
  ⑥ clearance/issues/audit/metrics/docs/gateLog。
- 全流程推演（/app/sim，原仿真中心）六签：运行总览/监督面板/运行监控/证据库/
  运行编排/推演设置；交付健康与需求追溯已迁⑤验收。
- 治理中心壳已解体：/app/gov 与 /app/gov/* 全部 redirect 到阶段页并带 ?tab=；
  旧 /app/runs、/app/eng、/app/journey、?tab=trace/accounts/observatory 等
  经 routes 重定向可达（零断链兜底），但入口表以阶段页规范路径为准。
- 「应用资产」编辑器实体在⑥治理·文档评审签管理维护区（GovDocsReviewView），
  不是①搭建·环境与资产签；组织编辑器另有①搭建·组织签直挂。
- IDE 任务工作区（GET /api/ide/task-workspace）：文件树/终端/记忆/新会话跟随
  kanban 任务根；任务简报含「任务工作区」「任务会话」两块。
- 起跑前以正本 §4.1 前置⑤ 实弹校验为准；旧路由可达不豁免对账。
"""

STEP_ENTRIES = {
    1: ('admin（Super Admin）', '左侧导航 → ①搭建 → 账号（#/app/stage/setup?tab=accounts）',
        '新建账号（人类+AI 助理双账号并建）→ 分配角色/团队 → roster 提交入仓（保存即 git）'),
    2: ('super_admin（装配面）', '左侧导航 → ①搭建 → 智能体/环境与资产（#/app/stage/setup?tab=agents 或 assets）',
        '逐账号装配"账号+配置+看板+团队围栏+记忆库"四件套 → 板可见性按账号隔离核验（patch 558/547）'),
    3: ('各用户（15 人编制）', '登录页 → 流程总览（#/app）→ 本账号档案',
        '登录 → 落流程总览（搭建五步+交付五阶段总览）→ 只见本账号档案与看板'),
    4: ('admin', '左侧导航五组＋顶部上下文栏＋流程总览（#/app）＋全流程推演（#/app/sim）',
        '任务计数=看板实况核对 → 在线三数（人/智能体/机器）>0 核对 → 下拉点选跳转；全流程推演·运行总览抽查'),
    5: ('admin', '左侧导航 → ⑥治理 → 文档评审 → 管理维护区应用资产编辑器（#/app/stage/govern?tab=docs）',
        '六列表单登记应用（负责人/专属看板/技术栈/SLA/测试骨架）→ 保存即 git 提交'),
    6: ('admin', '左侧导航 → ①搭建 → 组织（#/app/stage/setup?tab=org）',
        '账号↔团队↔负责人关系维护 → 组织矩阵导出入仓对账'),
    7: ('需求分析师A（BA）', 'matrix 私信送达 → ②需求 → 文档评审 G1 工件区（#/app/stage/reqs?tab=docs）',
        '需求文档四项检查（AC 可判定/范围外/影响面/涉敏）→ 冻结标记入仓（锁后不许改）'),
    8: ('产品经理A（PM）', '左侧导航 → 工作台会话画布（#/app/s/chat）',
        '创建需求分析讨论群 → 按 RACI 全量预邀（人+agent 双账号并邀）→ 成员面板核验'),
    9: ('产品经理A（PM）', '群会话画布（#/app/s/group/:roomId）',
        '群内 @fanfan-agent 派发指令（需求一行信息+材料地址+证据要求）'),
    10: ('产品经理A（PM）', '左侧导航 → ③分析设计 → 任务分解（#/app/stage/design?tab=tasks）',
        '选 fanfan-pm-plan 板 → RFD-001 主卡+子卡登记 → 卡面 RACI 徽章核对'),
    11: ('AI · 系统分析智能体', '③分析设计 → 系统分析（#/app/stage/design?tab=analysis）',
        '接收派发 → 需求切分+三清单匹配 → 分析稿与任务清单入仓 → 结论行回群'),
    12: ('各团队 lead（研发工程师A/研发工程师B/研发工程师C/研发工程师D）', '④开发 → 看板（#/app/stage/build?tab=board）Triage 列',
        '分诊台登记卡确认（triage→todo）→ 本账号板出现任务卡'),
    13: ('AI · 研发智能体（四路并行）', '任务 workspace worktree + xxx-dev 定制技能；产出回③分析设计·系统分析',
        '精准系分：材料/仓库/历史文档归集 → 接口签名/数据模型/错误码/幂等键/工作量评估产出 → 系分稿入仓 → 完成回执发两遍保送达（群消息+私信各一次）'),
    14: ('产品经理A（PM）', '③分析设计 → 系统分析（#/app/stage/design?tab=analysis）',
        '四稿齐后汇总复核（消歧/消冲突/理层次）→ 概设入仓 → 评审任务卡登记'),
    15: ('系统架构师A（架构治理）', '③分析设计 → 任务分解（#/app/stage/design?tab=tasks）arch-governance 板评审卡',
        'G2 五项检查（设计五要素/影响面排查/验证计划/备选方案/历史踩坑记录硬拦）→ 结论行回房+评审卡判词同步'),
    16: ('产品经理A（PM）', '③分析设计 → 任务分解（#/app/stage/design?tab=tasks）',
        'SMART 任务排期入卡（任务卡具体到人+人日，编号随本轮 tasklist）'),
    17: ('AI · 研发智能体', '③分析设计 → 排期（#/app/stage/design?tab=schedule）',
        '创建 feat/DEV-* 分支 → 编码提交（每条 AC 对应用例）'),
    18: ('AI · 研发智能体', 'IDE 工作区（#/app/ide；任务右栏或页面切换进入；任务简报含任务工作区/任务会话）',
        '编码+单测（pay-core≥8/其余≥6 全绿）→ testlog 随分支提交 → 运行证据可看全流程推演·运行总览（#/app/sim）'),
    19: ('测试工程师A/测试工程师B（测试，≠写码者）', '④开发 → 看板（#/app/stage/build?tab=board）qi 板；质量与测试签',
        '按 AC 全量用例执行 → 缺陷报告→修复→复验全过关（一条不落）→ 测试报告六要素入仓'),
    20: ('PM+评审卡（HumanGate）', '⑤验收 → G5 审批（#/app/stage/accept?tab=g5）',
        'G5 七项检查 → !approve 人工批准（approved.events 留痕可反查）→ 发布计划入仓'),
    21: ('需求分析师A（BA）', '⑤验收 → 需求追溯（#/app/stage/accept?tab=trace）',
        'AC 逐条判词（三态逐条）→ 验收书入仓（放行权归 需求分析师A）'),
    22: ('全员 + 治理 AI', '⑤验收 → 交付健康（#/app/stage/accept?tab=delivery）容量与台账区',
        '工作台账（按人×状态分布/WIP/卡壳 72h）→ 存进中央仓根目录'),
    23: ('审计师A（审计）', '⑥治理 → 审计与变更（#/app/stage/govern?tab=audit）；交付门禁灯在⑤验收·交付案例',
        '独立意见书入仓 → 与推演监控结论有出入的走处置台账（audit-response-disposition.md）'),
    24: ('全员', '⑥治理 → 度量检查（#/app/stage/govern?tab=metrics）',
        '问题单 100% DISP 回写（已修/观察/延后三态）→ 经验写进跨轮记忆库'),
    25: ('人（修复介入演示）', 'IDE 工作区（#/app/ide，任务右栏；?task= 直达链接，简报含任务工作区/任务会话）',
        '任务简报六区块 → 交互编码修复 → git 图谱核验提交'),
    26: ('报告链（工具侧）', '流程总览/看板/IDE 三界面走查；报告查看=全流程推演（#/app/sim?run=:runId）',
        'mx-report-gen 生成 → mx-report-audit 断言 → final-report-merge 双正本 → 交付案例页回看轮次投影'),
}
