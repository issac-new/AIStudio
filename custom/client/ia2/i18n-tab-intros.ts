// overlay/custom/client/ia2/i18n-tab-intros.ts
// 「swarm kanban」页签说人话导语（2026-10-04 用户裁定：除看板外页签完全看不懂——
// 面向产品/研发/测试，用行业通用术语，从"看到什么、数据哪来、能做什么"三段给价值）。
// 本地小字典通道（同 i18n-tasks-tabs 先例：不依赖 473 locale 树）。
export interface TabIntro {
  /** 这是什么：一句话定位 */
  what: string
  /** 数据来自：来源与口径，如实（缺失如何呈现） */
  source: string
  /** 你能做什么：受众动作与价值 */
  act: string
}

export const TAB_INTROS: Record<'zh' | 'en', Record<string, TabIntro>> = {
  zh: {
    orchestra: {
      what: '任务协同图：选一个业务结果（根任务），一张图看清这件事如何由人、智能体与控制点协同完成。',
      source: '看板任务链（依赖边）+ RACI 审批 + 自主度阶梯审批点 + 升级记录，实时聚合；人/智能体按 -agent 后缀口径判定。',
      act: '负责人核对五问：结果谁负责、人机怎么分工、哪里必须人确认、异常怎么升级、跑完沉淀什么可复用资产。',
    },
    trace: {
      what: '每张任务卡与它的执行记录对照表：跑了几轮、每轮结果、最近完成时间。',
      source: '看板任务与其运行历史，实时聚合。',
      act: '研发核对需求交付到哪一步；测试圈定回归范围；产品确认没有需求掉队。',
    },
    accounts: {
      what: '交付状态总览：工作项分布 + 六道交付关卡（需求冻结/架构评审/代码门禁/独立验证/发布准出/复盘）工件核查 + 六维检查结论。',
      source: '看板与 git 仓实查；缺失项如实标灰，不编造。',
      act: '管理者每周扫一眼，缺件补件；检查不过的维度按证据整改，不是拍脑袋。',
    },
    observatory: {
      what: '自动化任务与仿真运行的观测台：任务链拓扑、每步耗时与当前状态。',
      source: '运行中心实时数据。',
      act: '研发排查"我的任务卡在哪一步、为什么还没出结果"；点节点看执行明细。',
    },

    // ── 推演中心六签（U1 可用性批：按使用动线写，不按数据域写）──

    // ── D13 时序六阶段（工作页导语）──
    'stage-setup': { what: '从 0 开始搭建：建组织、建账号、定团队领导与协调关系、准备环境与资产、接入 hermes agent，末步跑环境冒烟测试。', source: '组织资产注册表与健康探测。', act: '五步全部完成后才进入需求阶段。' },
    'stage-reqs': { what: '第一张需求单进场：验收标准定清、范围划清、G1 上锁、建群、选运行模式启动。', source: '冻结单与质量门键。', act: '锁后不许改；启动后进入分析。' },
    'stage-design': { what: '任务分解、系统分析、概设、G2 评审、排期——把需求拆成可执行的活儿。', source: '看板任务链与文档评审。', act: '没设计不开发。' },
    'stage-build': { what: '六路并行开发+独立测试；日常协调全在这：看板、沟通、IDE、等你决定的人工介入请求。', source: '看板/沟通流/审批待办。', act: '在制上限 2；完成必带双凭证。' },
    'stage-accept': { what: 'G5 发布准出、完备性检查、UAT 逐条判定——交付完成。', source: '审批事件与验收书。', act: '判定只认结构化字段。' },
    'stage-govern': { what: '台账、审计、复盘、遗留项清算、度量检查——组织越跑越聪明。', source: 'issues.log/遗留项台账/巡检官。', act: '开新运行前遗留项必须清零。' },
    'sim-overview': {
      what: '一轮运行的总览屏：跑到第几步、六道质量门过了几道、有没有遗留项，一屏看全。',
      source: '运行状态文件与遗留项台账实读，数字全部实测、缺席如实标注。',
      act: '启动后先来这里。「遗留项未清算」亮红=上轮遗留没清不能开新运行——去治理中心·遗留项清算处理。',
    },
    'sim-supervision': {
      what: '值班盯盘位：观察窗时间线+接棒员研判，回答「现在卡在哪、谁没动」。',
      source: '监督 journal 只读流（开窗/轮询/研判/判定）。',
      act: '运行期间周期看。发现停滞先读研判再决定介入，不用翻原始日志。',
    },
    'sim-ops': {
      what: '基础设施检查：四个服务通不通、调度器活不活、有没有空闲工作者。',
      source: '各服务健康端点实时探测+hermes-agent 健康命令包装。',
      act: '页面异常或消息不动时先来这里查红点；全绿说明底座没问题，去监督面板查组织面。',
    },
    'sim-evidence': {
      what: '查证据的地方：消息事件号、git 提交号，贴进去一键反查原文。',
      source: 'synapse 与 git 实查，缺席如实标注不硬凑。',
      act: '对任何数字/判定有疑问就点它——锚点抽屉给原文；重要消息可存证备查。',
    },
    'sim-delivery': {
      what: '交付进度表：六个开发分支推没推、14 件交付物齐不齐。',
      source: '中央仓 git 与证据目录实读。',
      act: '收尾前核对。「旧残留」分支=上轮遗留该清理；缺的交付物去催对应负责人。',
    },
    'sim-trace': {
      what: '需求对账单：当初冻结的每条验收标准，测试和 UAT 各给出了什么判定。',
      source: '冻结单×测试报告×验收书三源聚合。',
      act: '验收复盘时逐条过。「未判定」条目=还没有人决策，去找需求分析师。',
    },
    // ── 治理中心七签 ──
    'gov-process': {
      what: '六道质量门的守门记录：哪道门被打回过、修复单走到哪一步。',
      source: 'orgloop 修复单台账。',
      act: '质量门 FAIL 后来这里跟踪修复进度。界面没有绕过质量门的按钮——那是设计。',
    },
    'gov-orgAssets': {
      what: '组织花名册与家底：人员权限、应用资产、密钥台账。',
      source: '各注册表只读聚合。',
      act: '开轮前检查编制齐不齐；密钥到期轮换在这里登记（不含密钥本体）。',
    },
    'gov-clearance': {
      what: '遗留项清单：上轮运行留下的代偿（程序替人干的活），根治一笔消一笔。',
      source: '代偿台账逐笔实读。',
      act: '开新运行前必须清零或豁免。紫色=豁免须写理由；resolve 填 PR 号标记已根治。',
    },
    'gov-issues': {
      what: '问题清单对账：这轮登记的每个问题，处理了没有。',
      source: '轮次 issues.log 实读。',
      act: '复盘前查处置率；红色未处理的逐条要有说法。',
    },
    'gov-audit': {
      what: '留痕查验：审计四查状态、基线变更记录。',
      source: '审计与变更事件流。',
      act: '交付验收前过审计；对改动有疑问查变更记录（带提交号）。',
    },
    'gov-docs': {
      what: '文档完整性核对：14 件交付物逐字段检查，缺什么红显什么。',
      source: '交付物注册表×证据目录。',
      act: '收尾时做文档完整性检查，缺项去补再交。',
    },
    'gov-metrics': {
      what: '组织度量检查五卡：效率/集群/语义/会话/成本，含磁盘水位预警。',
      source: '巡检官快照与度量端点。',
      act: '复盘时看趋势；磁盘红灯=立即处理（96% 事故先例）。',
    },
    'gov-org': {
      what: '团队协作的三面镜子：协作断点诊断（信息/决策/责任/资源/反馈哪一环断了）、知识图谱（谁和谁在哪些任务上共事）、决策时间线（谁在何时批了什么）。',
      source: '结案任务与审批记录沉淀，跨轮累积。',
      act: '复盘会从这里取材；排兵布阵看协作网络；升级没人认领时先查断点诊断。',
    },
    'gov-registry': {
      what: '能力与流程的登记处：能力台账（每项能力由哪个模块承载、缺口多少）、任务状态机（状态怎么流转才合法）、派发前自动规则检查。',
      source: '能力台账与规则文件（git 版本化），运行消费实况来自看板与用量记录。',
      act: '查"这个功能归谁管"；新能力先登记再开工；调整流程规则改这里，不用改代码。',
    },
    'gov-audit': {
      what: '操作留痕与变更管控：可检索的审计日志（谁在何时对什么做了什么）+ 变更单分级评审、冻结窗口与管控基准。',
      source: '各系统审计事件聚合；变更单为真实流程产物。',
      act: '出问题时查责任链；发布封板期查有没有违规穿透的变更；月度看管控基准是否超标。',
    },
    'gov-docs': {
      what: '治理文档的集中评审入口：需求/设计/测试文档是否入库、是否最新、待裁决项。',
      source: 'git 仓文档实查，带提交锚点。',
      act: '评审人在这里过文档、做裁决；缺件或过期的文档会被标出督促补齐。',
    },
    'gov-harness': {
      what: '研发过程的账本：六类成本账（人力/token/工具/等待/返工/安全）+ 能力目录 + L1-L5 成熟度自检 + 工程要素对账。',
      source: '用量记录、任务实况与代码锚点；缺数据标 unavailable 不造数。',
      act: '工程负责人月度复盘"投入花在哪、哪最亏"；成熟度自检给出下一步改进优先级。',
    },
  },
  en: {
    orchestra: {
      what: 'Orchestration chart: pick a business outcome (root task) and see in one graph how people, agents and control points deliver it together.',
      source: 'Kanban task chains (dependency edges) + RACI approvers + autonomy-ladder approval points + escalations, live; humans/agents classified by -agent suffix.',
      act: 'Owners verify the five questions: who owns the outcome, how work splits human/agent, where humans must confirm, how anomalies escalate, what reusable assets remain.',
    },
    trace: {
      what: 'Each task card mapped to its runs: rounds, outcomes, latest finish time.',
      source: 'Aggregated live from kanban tasks and run history.',
      act: 'Devs check delivery progress; testers scope regression; PMs confirm no requirement dropped.',
    },
    accounts: {
      what: 'Delivery status overview: work-item distribution + six gate artifact checks + six-domain health verdicts.',
      source: 'Live from kanban and git; missing items shown honestly in grey.',
      act: 'Managers scan weekly and close gaps; failing domains get evidence-based fixes.',
    },
    observatory: {
      what: 'Observatory for automated tasks and simulation runs: topology, per-step duration, live status.',
      source: 'Run Center live data.',
      act: 'Devs answer "where is my task stuck"; click a node for execution detail.',
    },


    'stage-setup': { what: 'Build from zero: org, accounts, team leads, environment and assets, hermes agents, smoke test.', source: 'Registries and health probes.', act: 'Complete all five steps before requirements.' },
    'stage-reqs': { what: 'First requirement: freeze ACs, scope, G1 lock, rooms, pick run mode and launch.', source: 'Freeze doc and quality-gate keys.', act: 'No edits after lock.' },
    'stage-design': { what: 'Decompose, system analysis, review G2, schedule.', source: 'Kanban chains and doc review.', act: 'No development without design.' },
    'stage-build': { what: 'Parallel development + independent testing; daily coordination lives here.', source: 'Kanban/chat/approval queue.', act: 'WIP limit 2; dual credentials.' },
    'stage-accept': { what: 'G5 release readiness, completeness, UAT verdicts.', source: 'Approval events.', act: 'Structured verdicts only.' },
    'stage-govern': { what: 'Ledger, audit, retro, closure of open items, metrics review.', source: 'issues.log/open-item ledger/inspector.', act: 'Clear open items before a new run.' },
    'sim-overview': { what: 'Cockpit of a simulation run: step progress, six gates, compensation debt at a glance.', source: 'Run state file and ledger, live.', act: 'Start here after launching. Red clearance lamp = unresolved debt, settle it first.' },
    'sim-supervision': { what: 'On-duty watch desk: observation windows and analyst briefs answer "where is it stuck".', source: 'Read-only supervision journal.', act: 'Check periodically during a run; read briefs before intervening.' },
    'sim-ops': { what: 'Infrastructure health: four services, dispatcher, idle workers.', source: 'Live /health probes + hermes-agent commands.', act: 'When things feel dead, check red dots here first.' },
    'sim-evidence': { what: 'Evidence lookup: paste an event id or commit hash to see the original.', source: 'Live synapse/git lookups.', act: 'Distrust any number? Click it. Anchor drawer shows the source.' },
    'sim-delivery': { what: 'Delivery sheet: six feature branches pushed? 14 deliverables complete?', source: 'Central repo git + evidence dir.', act: 'Verify before closing a run; chase missing deliverables.' },
    'sim-trace': { what: 'Requirements reconciliation: each frozen AC vs test and UAT verdicts.', source: 'Freeze × test report × acceptance.', act: 'Walk AC rows at acceptance; unjudged items need a decision.' },
    'gov-process': { what: 'Quality-gate keeping records: which gate was rejected, repair ticket progress.', source: 'orgloop repair ledger.', act: 'Track gate-FAIL repairs here. No gate bypass button by design.' },
    'gov-orgAssets': { what: 'Roster and assets: people, permissions, app registry, key ledger.', source: 'Read-only registries.', act: 'Check staffing before a run; log key rotations (no secrets).' },
    'gov-clearance': { what: 'Open items: compensations left from the last run; resolve one, clear one.', source: 'Compensation ledger TSV.', act: 'Must be zero or waived before a new run. Waive needs a reason.' },
    'gov-issues': { what: 'Issue reconciliation: every registered issue, disposed or not.', source: 'Run issues.log.', act: 'Check disposal rate before retro; red rows need answers.' },
    'gov-audit': { what: 'Audit trail: four-check status, baseline changes.', source: 'Audit and change event streams.', act: 'Pass audit before acceptance; query changes by commit.' },
    'gov-docs': { what: 'Doc completeness: 14 deliverables field-checked, missing in red.', source: 'Deliverable registry × evidence dir.', act: 'Run completeness check at closing; fix gaps.' },
    'gov-metrics': { what: 'Org health five cards incl. disk watermark alarm.', source: 'Inspector snapshots and metric endpoints.', act: 'Review trends at retro; red disk lamp = act now.' },

    'gov-org': {
      what: 'Three mirrors of teamwork: breakpoint diagnosis (info/decision/ownership/resource/feedback), knowledge graph (who worked with whom), decision timeline.',
      source: 'Accumulated from closed tasks and approvals.',
      act: 'Fuel for retrospectives; staffing from the collaboration graph; check breakpoints when escalations stall.',
    },
    'gov-registry': {
      what: 'Registry of capabilities and process rules: capability ledger, task state machine, pre-dispatch rule checks.',
      source: 'Git-versioned ledger and rule files; live consumption from kanban and usage records.',
      act: 'Find what owns a feature; register new capabilities first; tune process rules here, not in code.',
    },
    'gov-audit': {
      what: 'Audit trail and change control: searchable audit log plus tiered change review, freeze windows, control baselines.',
      source: 'Aggregated audit events; change records are real process artifacts.',
      act: 'Trace accountability after incidents; check freeze-window violations before release; watch monthly baselines.',
    },
    'gov-docs': {
      what: 'Central review entry for governance docs: presence, freshness, pending verdicts.',
      source: 'Live git inspection with commit anchors.',
      act: 'Reviewers decide here; missing or stale docs get flagged for follow-up.',
    },
    'gov-harness': {
      what: 'The R&D process ledger: six cost accounts, capability catalog, L1-L5 maturity self-check, engineering-primitive reconciliation.',
      source: 'Usage records, task facts, code anchors; missing data marked unavailable.',
      act: 'Engineering leads review monthly where effort goes; maturity check ranks next improvements.',
    },
  },
}

export function pickTabIntros(locale: string | undefined | null): Record<string, TabIntro> {
  return String(locale ?? 'zh').startsWith('zh') ? TAB_INTROS.zh : TAB_INTROS.en
}
