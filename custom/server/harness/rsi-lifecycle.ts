// overlay/custom/server/harness/rsi-lifecycle.ts
// RSI 生命周期审计器（2026-11-20 综述吸收轮 A）。
//
// 出处：《When, Where, and How Experience Becomes Structure》（alphaxiv
// 2611.recursive-self-improvement-llm-agentsv1）七阶段生命周期（Collect→
// Evaluate→Diagnose→Abstract→Update→Verify→Consolidate）＋ Figure 5 环路矩阵。
// 与 rsi-maturity 分工：那个答「RSI 到几级」（fs 探测分级），这个答「每条更新
// 环路缺哪段」（声明式矩阵）。纯函数零 IO——格态与锚点是静态声明，演进走 spec
// 修订；锚点漂移由 rsi-lifecycle.test.ts 抽查兜底。
// NR 纪律（论文口径）：nr＝「未实现该阶段操作」，不等于「该环路无最终评估」；
// 每格 note 必须定性真缺口/论文允许省略/另批在途三者之一。
// 调研对账正本：docs/reports/2026-11-20-rsi-lifecycle-survey.md。

/** 七阶段（论文 §4.1 顺序，分析工具非流水线） */
export const RSI_LIFECYCLE_STAGES = [
  'Collect',
  'Evaluate',
  'Diagnose',
  'Abstract',
  'Update',
  'Verify',
  'Consolidate',
] as const

export type RsiLifecycleStage = (typeof RSI_LIFECYCLE_STAGES)[number]

/** 格态：implemented=有实现该阶段操作的机制；partial=有但弱/只在别处；
 *  nr=未实现（论文 NR 语义）。 */
export type RsiCellStatus = 'implemented' | 'partial' | 'nr'

export interface RsiLifecycleCell {
  stage: RsiLifecycleStage
  status: RsiCellStatus
  /** 机制锚点（file 或 file:line；implemented/partial 必填，nr 留空） */
  anchor: string
  /** 缺口/边界定性：真缺口｜论文允许省略｜另批在途 */
  note: string
}

export interface RsiLifecycleLoop {
  /** 环路键（kebab） */
  key: string
  /** 环路名（组件归属） */
  title: string
  /** 环路一句话：什么触发→改什么→怎么留存 */
  what: string
  /** 综述组件归属（Prompt/Memory/Skill/Harness 或跨组件） */
  component: 'Prompt' | 'Memory' | 'Skill' | 'Harness' | 'cross'
  cells: RsiLifecycleCell[]
}

export interface RsiLifecycleGapLine {
  loop: string
  stage: RsiLifecycleStage
  status: RsiCellStatus
  note: string
}

export interface RsiLifecycleReport {
  loops: RsiLifecycleLoop[]
  /** 汇总：各格态计数（总格数=环路数×7） */
  summary: { implemented: number; partial: number; nr: number; total: number }
  /** 缺口行：全部 partial/nr 格（排序：nr 先，按环路×阶段） */
  gapLines: RsiLifecycleGapLine[]
  /** 主张层级证据图（2026-11-26 可信 RSI 正文级轮）：八组要求 × 更新、后继、元改进三层。 */
  claimLevels: RsiClaimLevelMap
  meta: {
    source: string
    /** 论文判据引用（审计语义正本） */
    criteria: string
    boundary: string
  }
}

// ---- 主张层级证据图（2026-11-26 可信 RSI 正文级轮；综述 §2.3、表 8、图 8） ----

/** 综述表 8 的八组要求。 */
export const RSI_TRUST_REQUIREMENTS = [
  { key: 'validity', nameZh: '改进有效性' },
  { key: 'behavioral', nameZh: '行为约束与对齐' },
  { key: 'fairness', nameZh: '公平' },
  { key: 'security', nameZh: '系统安全与韧性' },
  { key: 'privacy', nameZh: '隐私与数据治理' },
  { key: 'transparency', nameZh: '透明与可解释' },
  { key: 'control', nameZh: '人类控制与可纠正' },
  { key: 'accountability', nameZh: '问责与治理' },
] as const

export type RsiTrustRequirement = (typeof RSI_TRUST_REQUIREMENTS)[number]['key']

/** 更新层问「这次修改可不可信」，后继层问「改动的效果是否留得住」，元改进层问「改进机制本身被修订后还成不成立」。 */
export const RSI_CLAIM_LEVELS = ['update', 'successor', 'meta'] as const

export type RsiClaimLevel = (typeof RSI_CLAIM_LEVELS)[number]

/** examined＝有机制评估这一格；partial＝有机制但覆盖不全；not_evaluated＝没有评估过。 */
export type RsiClaimCellStatus = 'examined' | 'partial' | 'not_evaluated'

export interface RsiClaimCell {
  requirement: RsiTrustRequirement
  level: RsiClaimLevel
  status: RsiClaimCellStatus
  /** 机制锚点（仓库相对路径）；not_evaluated 可以留空。 */
  anchor: string
  note: string
}

export interface RsiClaimLevelMap {
  cells: RsiClaimCell[]
  summary: Record<RsiClaimCellStatus, number>
  source: string
  boundary: string
}

/** 五条真实更新环路的声明式矩阵（锚点以 2026-11-20 main f1f09ea3a 为基线） */
export const RSI_LIFECYCLE_LOOPS: RsiLifecycleLoop[] = [
  {
    key: 'qgate-fail-exp',
    title: 'qgate FAIL → 经验候选 → 受控注入（跨组件主环路）',
    what: '门禁失败回流成 antipattern 经验候选，人审后受控注入下一轮派发词',
    component: 'cross',
    cells: [
      { stage: 'Collect', status: 'implemented', anchor: 'custom/server/expcandidates/qgate-ingest.ts', note: '.qgate/runs FAIL/CONDITIONAL 机械回流＋sha1 指纹幂等聚合' },
      { stage: 'Evaluate', status: 'implemented', anchor: 'custom/qgate/（六态判定，仅 exercised 可 PASS）', note: 'qgate 判定本身就是对照验收的执行评估' },
      { stage: 'Diagnose', status: 'partial', anchor: 'custom/server/expcandidates/exp-types.ts', note: 'antipattern 归一给缺陷模式，但无「该改哪个组件」定位（综述 Diagnose=定位干预目标）' },
      { stage: 'Abstract', status: 'implemented', anchor: 'custom/server/expcandidates/exp-types.ts', note: '三形态提取（antipattern/good_path/sop）＋fingerprint 去重' },
      { stage: 'Update', status: 'partial', anchor: 'custom/server/expcandidates/exp-controller.ts', note: 'curate 状态机只改候选库（Memory 面），不构造 Prompt/Skill 组件本身' },
      { stage: 'Verify', status: 'partial', anchor: 'custom/server/expcandidates/exp-controller.ts（reflection-guard 422）', note: '形式守门（查泛泛/过窄/自相矛盾），效果验证延迟到 R2 重测闸与 Agnes 批一（在途）——同综述 ReasoningBank「写入前无逐条测试」缺口' },
      { stage: 'Consolidate', status: 'implemented', anchor: 'custom/server/expcandidates/exp-inject.ts', note: 'approved＋三前提＋injectedRuns 留痕；EXPERIENCE_INJECT 默认关（断点刻意留人）' },
    ],
  },
  {
    key: 'workbench-proposal',
    title: '改进实验台：提案→探测→晋级→回滚（Harness 面）',
    what: '人提案、台正则、门拦险；九面分开演化，冠军链即演化史',
    component: 'Harness',
    cells: [
      { stage: 'Collect', status: 'implemented', anchor: 'custom/server/harness/workbench/service-auto-probe.ts', note: '一键探测自动采集（噪声×2/等预算×1/反事实/执行证迹）' },
      { stage: 'Evaluate', status: 'implemented', anchor: 'custom/server/harness/workbench/types.ts（ProbeMetrics）', note: 'passAt1/回归/留出/成本全量指标' },
      { stage: 'Diagnose', status: 'implemented', anchor: 'custom/server/harness/workbench/loop-advice-evolution.ts', note: '起草建议＋失败假设禁止换皮重提（D7）＋停滞/剪枝信号' },
      { stage: 'Abstract', status: 'implemented', anchor: 'custom/server/harness/workbench/library（experiences）', note: '经验库＋editClass 分类＋垫脚石档案' },
      { stage: 'Update', status: 'implemented', anchor: 'custom/server/harness/workbench/apply.ts', note: 'HARNESS2_APPLY 双闸＋写前快照写后校验' },
      { stage: 'Verify', status: 'implemented', anchor: 'custom/server/harness/workbench/loop-report.ts', note: '晋级门 27 blocker＋16 warning（综述 Prompt/Harness 列全报验证——本环路同款在位）' },
      { stage: 'Consolidate', status: 'implemented', anchor: 'custom/server/harness/workbench/loop-core.ts（champion 链/回滚）', note: '晋级/回滚/垫脚石候选＋经验 90 天半衰' },
    ],
  },
  {
    key: 'skill-fingerprint',
    title: 'swarm-yuan 指纹感知局部更新（Skill 元环路）',
    what: '项目结构变化触发局部重探查与清单单条更新——生成→使用→演进→再更新',
    component: 'Skill',
    cells: [
      { stage: 'Collect', status: 'implemented', anchor: 'skills/swarm-yuan/scripts/project-fingerprint.sh', note: '--diff 感知文件数/扩展名/路径集变化' },
      { stage: 'Evaluate', status: 'implemented', anchor: 'skills/swarm-yuan/scripts/project-fingerprint.sh', note: '骤降过半拒写防坏基线' },
      { stage: 'Diagnose', status: 'implemented', anchor: 'skills/swarm-yuan/SKILL.md（生命周期段）', note: '变化定位到受影响清单条目（局部更新而非全量重探）' },
      { stage: 'Abstract', status: 'implemented', anchor: 'skills/swarm-yuan/SKILL.md（三载体）', note: '组件清单/配方/规则三载体沉淀' },
      { stage: 'Update', status: 'implemented', anchor: 'skills/swarm-yuan/scripts/generate-skill.sh', note: '--upgrade 局部更新＋--verify-completeness 执法' },
      { stage: 'Verify', status: 'implemented', anchor: 'skills/swarm-yuan/verifier/v1/run-verifier.sh', note: 'fixtures 双向反例＋vacuous-pass 清零 fail-closed；mark-active 三关' },
      { stage: 'Consolidate', status: 'implemented', anchor: 'skills/swarm-yuan/assets/memory-writeback.sh', note: '决策留痕＋记忆写回（幂等分节）' },
    ],
  },
  {
    key: 'skill-lifecycle',
    title: '技能退役扫描与召回（Skill 维护环）',
    what: '使用率信号驱动归档候选，MANIFEST 登记可一键召回',
    component: 'Skill',
    cells: [
      { stage: 'Collect', status: 'implemented', anchor: 'team/shared/skill-lifecycle.py', note: 'agent.log/state.db 使用记录为代理指标' },
      { stage: 'Evaluate', status: 'implemented', anchor: 'team/shared/skill-lifecycle.py', note: '30 天未用/无记录 14 天阈值评估（默认 dry-run）' },
      { stage: 'Diagnose', status: 'partial', anchor: 'team/shared/skill-lifecycle.py', note: '只有使用率信号；综述 Figure 8 三分（选错/跳步/缺步）不在归档判据里（本批 C 补诊断函数）' },
      { stage: 'Abstract', status: 'nr', anchor: '', note: '退役决策不提炼可复用内容——论文允许省略该阶段（七阶段非流水线），非缺口' },
      { stage: 'Update', status: 'implemented', anchor: 'team/shared/skill-lifecycle.py', note: '归档进 skills-archive＋MANIFEST 登记' },
      { stage: 'Verify', status: 'partial', anchor: 'custom/server/harness/workbench/types.ts（skillDifferential）', note: '有/无技能差分只在 workbench 晋级面，未接退役决策（综述 SLIM：退役检查须覆盖低频但重要用途 paper:1194-1198）——真缺口' },
      { stage: 'Consolidate', status: 'implemented', anchor: 'team/shared/skill-lifecycle.py（restore/ALWAYS_PROTECT）', note: '一键召回＋保护名单＋域退役判据（推演轮证据，2026-11-12 用户裁决版）' },
    ],
  },
  {
    key: 'retro-ledger',
    title: '推演复盘 → N 台账 → 下一轮整改（外环）',
    what: 'run 轮复盘四分类，挂账编号化，下一轮回写验证',
    component: 'cross',
    cells: [
      { stage: 'Collect', status: 'implemented', anchor: 'simharness/mux/mx-report-audit.py', note: '帧审计＋trace/decisions 哈希链台账' },
      { stage: 'Evaluate', status: 'implemented', anchor: 'docs/superpowers/specs/*runNN-full-retrospective*', note: '四分类复盘（A 值守根治/B 本批复治/C 定案/D 挂账）' },
      { stage: 'Diagnose', status: 'implemented', anchor: 'docs/superpowers/specs/*pending-batch*', note: '根因层是台账一等字段（计量基建缺口/机制面断链…）' },
      { stage: 'Abstract', status: 'implemented', anchor: 'simharness/mux/mx-retro-sink.sh', note: 'lesson 提取＋60 字符指纹去重＋下轮 skills 分发携带' },
      { stage: 'Update', status: 'implemented', anchor: 'docs/superpowers/specs/（rootfix spec）', note: 'B 类 rootfix 立批＋N 台账承接' },
      { stage: 'Verify', status: 'implemented', anchor: 'scripts/recurrence-report.mjs', note: '下一轮回写节＋复发账本第 3 次升级设计评审＋守门测试' },
      { stage: 'Consolidate', status: 'implemented', anchor: '.swarm-yuan/decisions.jsonl', note: '决策哈希链＋spec 收据＋lessons 轮间沉淀' },
    ],
  },
]

/**
 * 主张层级证据图：八组要求 × 三层，针对改进实验台的更新环路（锚点以 2026-11-26 main b6b93c207 为基线）。
 * 与上面的环路矩阵分工：矩阵答「每条环路缺哪段」，这张图答「哪一类主张从来没有被评估过」。
 * 元改进层的「未评估」是设计取舍：递归深度锁 1，改进机制由人经规格修订，仓内没有做过配对延续实验。
 */
export const RSI_CLAIM_LEVEL_CELLS: RsiClaimCell[] = [
  // ---- 更新层：一次被采纳的修改 ----
  { requirement: 'validity', level: 'update', status: 'examined', anchor: 'custom/server/harness/workbench/loop-report.ts', note: '晋级门评估增益是否超出噪声带，并读留出集、等预算基线与反事实变体；留出集缺席默认告警，设 HARNESS2_RSI_REQUIRE_HELDOUT=1 才拦' },
  { requirement: 'behavioral', level: 'update', status: 'partial', anchor: 'custom/server/harness/workbench/types.ts', note: '约束断言由人记录，记录了失败才拦；未记录默认告警，不强制' },
  { requirement: 'fairness', level: 'update', status: 'not_evaluated', anchor: '', note: '改进对象是 agent harness，没有按人群拆分的结果读数；分组评估没有做过' },
  { requirement: 'security', level: 'update', status: 'partial', anchor: 'custom/server/harness/workbench/loop-advice-leakage.ts', note: '有基准泄漏批评者与候选可写根限制；候选内容没有投毒或后门扫描' },
  { requirement: 'privacy', level: 'update', status: 'not_evaluated', anchor: '', note: '候选写入 profiles 与 skills 之前没有敏感信息扫描' },
  { requirement: 'transparency', level: 'update', status: 'examined', anchor: 'custom/server/lineage/lineage.ts', note: '提案差异摘要、证据角色披露与会话溯源三源聚合' },
  { requirement: 'control', level: 'update', status: 'examined', anchor: 'custom/server/harness/workbench/apply.ts', note: '人工批准后才写盘；写盘前留快照，回滚遇到外部修改即拒绝覆盖' },
  { requirement: 'accountability', level: 'update', status: 'examined', anchor: 'custom/server/approval-ledger', note: '批准写全局审批账本；提案记录批准人、批准时刻与批准时绑定的候选摘要' },
  // ---- 后继层：被采纳的改动留到后续版本之后 ----
  { requirement: 'validity', level: 'successor', status: 'partial', anchor: 'custom/server/harness/workbench/multi-objective.ts', note: '有增益保留率与回归样本库；保留率要留出基线在场才算得出，未覆盖的能力无从判断' },
  { requirement: 'behavioral', level: 'successor', status: 'partial', anchor: 'custom/server/harness/workbench/loop-joint-evidence.ts', note: '后继序列逐个按三个角色定态；约束断言靠人记录，没有记录的后继在这一格是未评估' },
  { requirement: 'fairness', level: 'successor', status: 'not_evaluated', anchor: '', note: '没有跨版本的分组结果读数' },
  { requirement: 'security', level: 'successor', status: 'partial', anchor: 'custom/server/harness/workbench/loop-joint-evidence.ts', note: '回滚残留可见（组件库条目、引用它的后继、起点建立在它之上的提案）；多文件写盘前逐文件比对创建时快照，被外部修改即拦（存量提案缺快照不拦）；派生内容的投毒传播没有检测' },
  { requirement: 'privacy', level: 'successor', status: 'not_evaluated', anchor: '', note: '继承下来的记忆与技能里是否带着敏感信息，没有检查' },
  { requirement: 'transparency', level: 'successor', status: 'examined', anchor: 'custom/server/harness/workbench/component-library.ts', note: '冠军链、组件库条目（带来源提案与产出侧来源信息）与经验库都保留版本' },
  { requirement: 'control', level: 'successor', status: 'partial', anchor: 'custom/server/harness/workbench/service.ts', note: '回滚恢复文件并退役经验，多文件回滚先全部校验再恢复；来源已回滚的零件不再提供给起草器；起点建立在它之上的提案只列出，不自动撤回' },
  { requirement: 'accountability', level: 'successor', status: 'examined', anchor: 'custom/server/harness/workbench/store.ts', note: '提案全史保留批准、晋级与回滚记录，回滚含操作人与原因' },
  // ---- 元改进层：改进机制本身被修订 ----
  { requirement: 'validity', level: 'meta', status: 'not_evaluated', anchor: '', note: '晋级规则、起草提示与调度策略由人经规格修订；修订前后没有做过同起点、同预算的配对延续实验' },
  { requirement: 'behavioral', level: 'meta', status: 'not_evaluated', anchor: '', note: '机制修订后没有重验行为约束' },
  { requirement: 'fairness', level: 'meta', status: 'not_evaluated', anchor: '', note: '机制修订后没有重验公平要求' },
  { requirement: 'security', level: 'meta', status: 'not_evaluated', anchor: '', note: '机制修订后没有重验安全规则' },
  { requirement: 'privacy', level: 'meta', status: 'not_evaluated', anchor: '', note: '机制修订后没有重验隐私与数据使用规则' },
  { requirement: 'transparency', level: 'meta', status: 'examined', anchor: '.swarm-yuan/spec-receipts.jsonl', note: '机制修订走规格，规格入库带内容收据，改写可被判漂移' },
  { requirement: 'control', level: 'meta', status: 'examined', anchor: 'custom/server/harness/rsi-maturity.ts', note: '递归深度锁 1：候选写不到晋级规则、审批账本与留出集，改进机制的修改权在人' },
  { requirement: 'accountability', level: 'meta', status: 'examined', anchor: '.swarm-yuan/decisions.jsonl', note: '机制级决策进决策台账（哈希链），与规格收据可对账' },
]

/** 证据图的格态计数（纯函数）。 */
export function buildRsiClaimLevelMap(): RsiClaimLevelMap {
  const cells = RSI_CLAIM_LEVEL_CELLS
  const count = (s: RsiClaimCellStatus): number => cells.filter((c) => c.status === s).length
  return {
    cells,
    summary: { examined: count('examined'), partial: count('partial'), not_evaluated: count('not_evaluated') },
    source: 'Trustworthy Recursive Self-Improvement in the Era of Large Models（arXiv 2610.35193v1）§2.3 主张三层、表 8 纵向检查清单、图 8 证据覆盖',
    boundary: '声明式盘点（以改进实验台的更新环路为对象，锚点为静态声明，演进走 spec 2026-11-26-trustworthy-rsi-fulltext 修订）；元改进层的未评估是递归深度锁 1 的设计取舍',
  }
}
export function buildRsiLifecycleReport(): RsiLifecycleReport {
  const cells = RSI_LIFECYCLE_LOOPS.flatMap((l) => l.cells)
  const count = (s: RsiCellStatus) => cells.filter((c) => c.status === s).length
  const gapLines: RsiLifecycleGapLine[] = []
  for (const loop of RSI_LIFECYCLE_LOOPS) {
    for (const cell of loop.cells) {
      if (cell.status !== 'implemented') gapLines.push({ loop: loop.key, stage: cell.stage, status: cell.status, note: cell.note })
    }
  }
  gapLines.sort((a, b) => (a.status === b.status ? 0 : a.status === 'nr' ? -1 : 1))
  return {
    loops: RSI_LIFECYCLE_LOOPS,
    summary: { implemented: count('implemented'), partial: count('partial'), nr: count('nr'), total: cells.length },
    gapLines,
    claimLevels: buildRsiClaimLevelMap(),
    meta: {
      source: 'When, Where, and How Experience Becomes Structure（alphaxiv 2611.recursive-self-improvement-llm-agentsv1）§4 七阶段＋Figure 5',
      criteria: 'NR＝未实现该阶段操作≠无最终评估；Evaluate（已发生的执行）≠Verify（候选改动）；七阶段是分析工具非流水线',
      boundary: '声明式矩阵（锚点为静态盘点，演进走 spec 2026-11-20-rsi-lifecycle-absorption 修订）；与 rsi-maturity 互补——那个答到几级，这个答缺哪段',
    },
  }
}
