// overlay[eval] 指标注册表与动作绑定（百度评测范式轮 §4：评估器即回报函数）。
//
// 核心纪律：每个指标先回答「这个读数驱动什么动作」。驱动不了任何动作的指标
// 只允许标 report_only，并在产品面列为「装饰指标」告警——不静默混进指标墙。
//
// 本注册表覆盖评测域（含红队）；治理域指标（成本账/九层/过程质量）不并入，
// 边界在页面上注明，避免两套口径互相冒充单一事实源。

/** 指标读数可驱动的动作。 */
export type MetricAction =
  | 'gate_block'
  | 'reflow'
  | 'rubric_revise'
  | 'human_review'
  | 'advice'
  | 'dataset_curate'
  | 'report_only'

export type MetricLayer =
  | 'result'
  | 'trajectory'
  | 'process'
  | 'efficiency'
  | 'risk'
  | 'reliability'
  | 'safety'
  | 'coverage'

export interface MetricDef {
  key: string
  layer: MetricLayer
  zh: string
  en: string
  unit: string
  direction: 'higher_better' | 'lower_better' | 'neutral'
  /** 读数来源锚点（file:symbol 或聚合字段路径）——审计与漂移定位用。 */
  source: string
  drives: MetricAction[]
  /** 尚未接线的说明（仅 report_only 或有缺口时填写）。 */
  gap?: string
}

export const METRIC_ACTIONS: Array<{ key: MetricAction; zh: string; en: string }> = [
  { key: 'gate_block', zh: '门禁阻断', en: 'Gate block' },
  { key: 'reflow', zh: '坏例回流', en: 'Reflow to regression' },
  { key: 'rubric_revise', zh: '断言修订', en: 'Rubric revision' },
  { key: 'human_review', zh: '人工复核', en: 'Human review' },
  { key: 'advice', zh: '优化建议/A-B', en: 'Advice / A-B decision' },
  { key: 'dataset_curate', zh: '评测集补题', en: 'Dataset curation' },
  { key: 'report_only', zh: '仅报告', en: 'Report only' },
]

/**
 * 指标单一事实源。
 * 新增聚合指标必须在此登记（守门测试：聚合产出的指标键必须可查），
 * 且 drives 至少一项——否则测试红。
 */
export const METRIC_DEFS: MetricDef[] = [
  {
    key: 'pass_at_1',
    layer: 'result',
    zh: 'pass@1（首样本通过率）',
    en: 'pass@1',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'aggregate.ts aggregateRun',
    drives: ['advice'],
  },
  {
    key: 'pass_at_k',
    layer: 'result',
    zh: 'pass@k（k 次采样任一通过）',
    en: 'pass@k',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'aggregate.ts aggregateRun',
    drives: ['gate_block', 'reflow'],
  },
  {
    key: 'layer_result',
    layer: 'result',
    zh: 'Result 层断言通过率',
    en: 'Result layer pass rate',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'aggregate.ts layerPassRate',
    drives: ['reflow'],
  },
  {
    key: 'layer_trajectory',
    layer: 'trajectory',
    zh: 'Trajectory 层断言通过率',
    en: 'Trajectory layer pass rate',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'aggregate.ts layerPassRate',
    drives: ['rubric_revise', 'reflow'],
  },
  {
    key: 'risk_veto',
    layer: 'risk',
    zh: '红线一票否决',
    en: 'Risk veto',
    unit: 'boolean',
    direction: 'lower_better',
    source: 'aggregate.ts riskVeto',
    drives: ['gate_block', 'reflow', 'human_review'],
  },
  {
    key: 'unknown_ratio',
    layer: 'reliability',
    zh: 'unknown 判词占比',
    en: 'Unknown ratio',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'aggregate.ts unknownRatio',
    drives: ['rubric_revise', 'human_review'],
  },
  {
    key: 'rubric_drilldown_hint',
    layer: 'reliability',
    zh: 'Rubric 下钻提示',
    en: 'Rubric drilldown hint',
    unit: 'boolean',
    direction: 'lower_better',
    source: 'aggregate.ts rubricDrilldownHint',
    drives: ['rubric_revise'],
  },
  {
    key: 'efficiency_tokens',
    layer: 'efficiency',
    zh: '平均 token 消耗',
    en: 'Average tokens',
    unit: 'tokens',
    direction: 'lower_better',
    source: 'aggregate.ts byLayer.efficiency.avgTokens',
    drives: ['advice'],
  },
  {
    key: 'efficiency_cost',
    layer: 'efficiency',
    zh: '平均单任务成本',
    en: 'Average cost per task',
    unit: 'usd',
    direction: 'lower_better',
    source: 'aggregate.ts byLayer.efficiency.avgCostUsd',
    drives: ['advice'],
  },
  {
    key: 'efficiency_steps',
    layer: 'efficiency',
    zh: '平均步数',
    en: 'Average steps',
    unit: 'steps',
    direction: 'lower_better',
    source: 'aggregate.ts byLayer.efficiency.avgSteps',
    drives: ['advice'],
  },
  {
    key: 'efficiency_duration',
    layer: 'efficiency',
    zh: '平均时长',
    en: 'Average duration',
    unit: 'ms',
    direction: 'lower_better',
    source: 'aggregate.ts byLayer.efficiency.avgDurationMs',
    drives: ['gate_block', 'advice'],
  },
  {
    key: 'ttft',
    layer: 'efficiency',
    zh: '首 token 时延',
    en: 'TTFT',
    unit: 'ms',
    direction: 'lower_better',
    source: 'releaseGate.ts release gate ttft',
    drives: ['gate_block'],
  },
  {
    key: 'tool_success_rate',
    layer: 'process',
    zh: '工具调用成功率',
    en: 'Tool success rate',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'releaseGate.ts tool_success',
    drives: ['gate_block'],
  },
  {
    key: 'degrade_rate',
    layer: 'reliability',
    zh: '判定降级率',
    en: 'Judge degradation rate',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'releaseGate.ts degrade_rate',
    drives: ['gate_block', 'human_review'],
  },
  {
    key: 'calibration_ece',
    layer: 'reliability',
    zh: '裁判校准误差（ECE）',
    en: 'Judge calibration (ECE)',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'calibration.ts calibrationReport',
    drives: ['rubric_revise', 'human_review'],
  },
  {
    key: 'link_pass_rate',
    layer: 'trajectory',
    zh: '链路六环节分段通过率',
    en: 'Six-link pass rate',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'metrics.ts byLinkOf',
    drives: ['reflow', 'rubric_revise'],
  },
  {
    key: 'exception_pass_rate',
    layer: 'coverage',
    zh: '异常场景分桶通过率',
    en: 'Exception bucket pass rate',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'metrics.ts byExceptionOf',
    drives: ['reflow', 'advice'],
  },
  {
    key: 'tool_head_accuracy',
    layer: 'process',
    zh: '工具选择正确率',
    en: 'Tool head accuracy',
    unit: 'ratio',
    direction: 'higher_better',
    source: 'metrics.ts processMetricsOf',
    drives: ['rubric_revise', 'advice'],
  },
  {
    key: 'trajectory_match_score',
    layer: 'process',
    zh: '轨迹绕路比',
    en: 'Trajectory detour ratio',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'metrics.ts processMetricsOf',
    drives: ['rubric_revise', 'advice'],
  },
  {
    key: 'six_dimensions',
    layer: 'coverage',
    zh: '六维度量分面',
    en: 'Six-dimension facets',
    unit: 'mixed',
    direction: 'neutral',
    source: 'metrics.ts sixDimensionsOf',
    drives: ['report_only'],
    gap: '当前只展示不驱动动作；候选动作=按最弱维度自动生成改进任务（需与建议域接线）',
  },
  {
    key: 'dimension_coverage',
    layer: 'coverage',
    zh: '能力维度覆盖度',
    en: 'Capability dimension coverage',
    unit: 'fraction',
    direction: 'higher_better',
    source: 'coverage.ts coverageOfSets',
    drives: ['dataset_curate'],
  },
  {
    key: 'redteam_evasion_rate',
    layer: 'safety',
    zh: '红队逃逸率',
    en: 'Red-team evasion rate',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'redteam/engine.ts runRedteam',
    drives: ['dataset_curate', 'gate_block'],
    gap: '门禁消费待接线：当前只回写红队报告，未进入发布门禁阈值',
  },
  {
    key: 'redteam_false_positive_rate',
    layer: 'safety',
    zh: '红队良性样本误报率',
    en: 'Red-team false positive rate',
    unit: 'ratio',
    direction: 'lower_better',
    source: 'redteam/engine.ts runRedteam',
    drives: ['rubric_revise'],
    gap: '误报驱动规则修订待接线：当前只出报告',
  },
]

export interface ActionObservation {
  action: MetricAction
  observed: number
  label: string
}

export interface ConsumptionInputs {
  runs: Array<{
    aggregates: {
      passAt1: number | null
      passAtK: number | null
      riskVeto: boolean
      releaseGate?: { measuredCount: number }
    }
    attempts?: Array<{ verdicts: Array<{ source: string; previousValue?: string }> }>
  }>
  iterations: number
  /** 带 origin 的回流任务数（跨集）。 */
  reflows: number
  /** 已显式标注维度的任务数（评测集补题动作的消费证据）。 */
  dimensionTaggedTasks: number
  /** 红队运行次数（有报告即视为安全指标被消费）。 */
  redteamRuns: number
}

export interface ConsumptionSummary {
  observations: ActionObservation[]
  /** 每个指标是否至少有一个动作有消费证据。 */
  wired: Record<string, boolean>
  summary: { total: number; wired: number; unwired: number; decoration: number }
  decorationKeys: string[]
}

const ACTION_LABELS: Record<MetricAction, string> = {
  gate_block: '有实测项的门禁判定',
  reflow: '带溯源的坏例回流',
  rubric_revise: 'Rubric 迭代账本',
  human_review: '人工仲裁判词',
  advice: '有运行报告可消费',
  dataset_curate: '已显式标注维度的任务',
  report_only: '无消费（仅报告）',
}

/** 从真实账本汇总动作消费证据（纯函数；不造数，零账本即零）。 */
export function summarizeConsumption(inputs: ConsumptionInputs): ConsumptionSummary {
  let humanVerdicts = 0
  for (const run of inputs.runs) {
    for (const attempt of run.attempts ?? []) {
      for (const verdict of attempt.verdicts) {
        if (verdict.source === 'human' || verdict.previousValue !== undefined) humanVerdicts += 1
      }
    }
  }
  const gateRuns = inputs.runs.filter((r) => (r.aggregates.releaseGate?.measuredCount ?? 0) > 0 || r.aggregates.riskVeto).length
  const observations: ActionObservation[] = METRIC_ACTIONS.map((act) => {
    let observed = 0
    switch (act.key) {
      case 'gate_block': observed = gateRuns; break
      case 'reflow': observed = inputs.reflows; break
      case 'rubric_revise': observed = inputs.iterations; break
      case 'human_review': observed = humanVerdicts; break
      case 'advice': observed = inputs.runs.length; break
      case 'dataset_curate': observed = inputs.dimensionTaggedTasks + inputs.redteamRuns; break
      default: observed = 0
    }
    return { action: act.key, observed, label: ACTION_LABELS[act.key] }
  })
  const observedByAction = new Map(observations.map((o) => [o.action, o.observed]))
  const wired: Record<string, boolean> = {}
  for (const def of METRIC_DEFS) {
    wired[def.key] = def.drives.some((a) => a !== 'report_only' && (observedByAction.get(a) ?? 0) > 0)
  }
  const decorationKeys = METRIC_DEFS.filter((d) => isDecoration(d)).map((d) => d.key)
  const wiredCount = METRIC_DEFS.filter((d) => wired[d.key]).length
  return {
    observations,
    wired,
    summary: {
      total: METRIC_DEFS.length,
      wired: wiredCount,
      unwired: METRIC_DEFS.length - wiredCount,
      decoration: decorationKeys.length,
    },
    decorationKeys,
  }
}

/** 装饰指标：动作集只含 report_only（或为空）。 */
export function isDecoration(def: Pick<MetricDef, 'drives'>): boolean {
  const actionable = def.drives.filter((a) => a !== 'report_only')
  return actionable.length === 0
}

export interface MetricRegistryView {
  metrics: Array<MetricDef & { wired: boolean; decoration: boolean }>
  actions: typeof METRIC_ACTIONS
  consumption: ConsumptionSummary
  boundary: string
}

/** 产品面读模型：注册表 + 消费证据合并（控制器与页面共用一份形状）。 */
export function buildRegistryView(consumption: ConsumptionSummary): MetricRegistryView {
  return {
    metrics: METRIC_DEFS.map((def) => ({
      ...def,
      wired: consumption.wired[def.key] ?? false,
      decoration: isDecoration(def),
    })),
    actions: METRIC_ACTIONS,
    consumption,
    boundary: '本注册表覆盖评测域（含红队）；治理域指标（成本账/九层体检/过程质量）见「度量检查」页，二者不互相冒充单一事实源。',
  }
}
