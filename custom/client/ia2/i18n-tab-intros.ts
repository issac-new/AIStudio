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
    trace: {
      what: '每张任务卡与它的执行记录对照表：跑了几轮、每轮结果、最近完成时间。',
      source: '看板任务与其运行历史，实时聚合。',
      act: '研发核对需求交付到哪一步；测试圈定回归范围；产品确认没有需求掉队。',
    },
    accounts: {
      what: '交付状态总览：工作项分布 + 六道交付关卡（需求冻结/架构评审/编码门禁/独立验证/发布准出/复盘）工件核查 + 六维体检结论。',
      source: '看板与 git 仓实查；缺失项如实标灰，不编造。',
      act: '管理者每周扫一眼，缺件补件；体检不过的维度按证据整改，不是拍脑袋。',
    },
    observatory: {
      what: '自动化任务与推演运行的观测台：任务链拓扑、每步耗时与当前状态。',
      source: '运行中心实时数据。',
      act: '研发排查"我的任务卡在哪一步、为什么还没出结果"；点节点看执行明细。',
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
