// overlay[eval] 四层指标金字塔（百度评测体系轮 B3，2026-10-19）。
//
// 范式来源：《百度 Agent 评测体系技术拆解》§2——指标随被测对象分层：模型层看
// 通用能力、应用层看组件、Agent 层看端到端、线上层看业务效果。本域诚实口径映射：
//   模型层 = 判定端质量（校准 ECE/样本数/在线态/多裁判清单）
//   应用层 = 组件面（链路六环节分段 / 异常分桶 / 过程双指标）
//   Agent 层 = 端到端（pass@1/pass@k / result·trajectory·risk / 红线否决）
//   线上层 = 发布门禁六检查（TTFT/QPS/响应分档如实 no_data）
//
// 不造数原则延续：无数据的层条目缺席呈现（层 status=no_data）；呈现色调的
// 数值线（0.9 等）是呈现口径非门禁——门禁阈值单一事实源在 releaseGate.ts。
import type { EvalLink, EvalRun, RunAggregates } from './types'
import { EVAL_LINKS } from './metrics'

export type PyramidLayerKey = 'model' | 'app' | 'agent' | 'online'

export interface PyramidReading {
  key: string
  label: string
  value: string
  tone: 'good' | 'bad' | 'muted'
}

export interface PyramidLayer {
  key: PyramidLayerKey
  status: 'pass' | 'warn' | 'no_data'
  readings: PyramidReading[]
}

export interface PyramidSummary {
  layers: PyramidLayer[]
  /** 集锚点漂移（run.setHash ≠ 当前集指纹）：整塔读数不可与新集直接对比。 */
  anchorDrift: boolean
}

const LINK_LABELS: Record<EvalLink, string> = {
  intent: '意图',
  tool_choice: '工具选择',
  params: '参数',
  evidence: '证据',
  state: '状态',
  expression: '表达',
}

/** 呈现色调线（非门禁）：环节/双指标读数的 good/bad 分界。 */
const PRESENT_GOOD = 0.9
const PRESENT_TRAJ_MAX = 0.2

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function layerOf(key: PyramidLayerKey, readings: PyramidReading[]): PyramidLayer {
  if (readings.length === 0) return { key, status: 'no_data', readings }
  return { key, status: readings.some((r) => r.tone === 'bad') ? 'warn' : 'pass', readings }
}

/** 四层金字塔（纯函数，从既有聚合面读数——不新增采集面）。 */
export function pyramidOf(run: EvalRun, anchorDrift: boolean): PyramidSummary {
  const agg = run.aggregates
  const layers: PyramidLayer[] = []

  // 模型层：判定端质量
  const model: PyramidReading[] = []
  model.push(
    agg.judgeOnline
      ? { key: 'judge_online', label: '判定端', value: '在线', tone: 'good' }
      : { key: 'judge_online', label: '判定端', value: '离线（纯 S0 降级）', tone: 'bad' },
  )
  if (agg.calibration) {
    if (agg.calibration.samples > 0 && agg.calibration.ece !== null) {
      const ece = agg.calibration.ece
      model.push({ key: 'ece', label: '校准 ECE', value: ece.toFixed(3), tone: ece <= 0.15 ? 'good' : 'bad' })
      if (agg.calibration.brier !== null) model.push({ key: 'brier', label: 'Brier', value: agg.calibration.brier.toFixed(3), tone: 'muted' })
    } else {
      model.push({ key: 'ece', label: '校准 ECE', value: agg.calibration.samples > 0 ? 'ece 缺席' : '无 p 留痕', tone: 'muted' })
    }
  }
  const multiModel = run.attempts.find((a) => a.judgeMeta?.models?.length)
  if (multiModel?.judgeMeta?.models) {
    model.push({ key: 'judges', label: '多裁判', value: multiModel.judgeMeta.models.join(' / '), tone: 'muted' })
  }
  layers.push(layerOf('model', model))

  // 应用层：组件面
  const app: PyramidReading[] = []
  if (agg.byLink) {
    for (const link of EVAL_LINKS) {
      const seg = agg.byLink[link]
      if (!seg || seg.total === 0) continue
      app.push({
        key: `link_${link}`,
        label: `${LINK_LABELS[link]}环`,
        value: `${pct(seg.passRate ?? 0)}（${seg.passed}/${seg.total}）`,
        tone: (seg.passRate ?? 0) >= PRESENT_GOOD ? 'good' : 'bad',
      })
    }
  }
  if (agg.processMetrics && agg.processMetrics.attemptsCompared > 0) {
    const pm = agg.processMetrics
    if (pm.toolHeadAccuracy !== null) {
      app.push({ key: 'tool_head', label: '工具选择正确率', value: pct(pm.toolHeadAccuracy), tone: pm.toolHeadAccuracy >= PRESENT_GOOD ? 'good' : 'bad' })
    }
    if (pm.trajectoryMatchScore !== null) {
      app.push({ key: 'traj_match', label: '绕路比', value: pm.trajectoryMatchScore.toFixed(2), tone: pm.trajectoryMatchScore <= PRESENT_TRAJ_MAX ? 'good' : 'bad' })
    }
  }
  if (agg.byException && agg.byException.some((b) => b.type !== 'none')) {
    const worst = [...agg.byException].filter((b) => b.type !== 'none' && b.passAtK !== null).sort((a, b) => (a.passAtK ?? 1) - (b.passAtK ?? 1))[0]
    if (worst) app.push({ key: 'exception_worst', label: '最弱异常桶', value: `${worst.type} ${pct(worst.passAtK ?? 0)}`, tone: (worst.passAtK ?? 0) >= PRESENT_GOOD ? 'good' : 'bad' })
  }
  layers.push(layerOf('app', app))

  // Agent 层：端到端
  const agent: PyramidReading[] = []
  agent.push({ key: 'pass_at_1', label: 'pass@1', value: agg.passAt1 === null ? '—' : pct(agg.passAt1), tone: 'muted' })
  agent.push({ key: 'pass_at_k', label: 'pass@k', value: agg.passAtK === null ? '—' : pct(agg.passAtK), tone: 'muted' })
  if (agg.byLayer.result !== null) agent.push({ key: 'result_layer', label: '结果断言', value: pct(agg.byLayer.result), tone: 'muted' })
  if (agg.byLayer.trajectory !== null) agent.push({ key: 'traj_layer', label: '轨迹断言', value: pct(agg.byLayer.trajectory), tone: 'muted' })
  if (agg.byLayer.risk !== 'none') {
    agent.push(
      agg.byLayer.risk === 'clean'
        ? { key: 'risk', label: '红线', value: 'clean', tone: 'good' }
        : agg.byLayer.risk === 'violated'
          ? { key: 'risk', label: '红线', value: 'violated（一票否决）', tone: 'bad' }
          : { key: 'risk', label: '红线', value: 'unknown（无已判结论）', tone: 'muted' },
    )
  }
  layers.push(layerOf('agent', agent))

  // 线上层：发布门禁（如实缺口——TTFT/QPS 等属 live 口径）
  const online: PyramidReading[] = []
  if (agg.releaseGate) {
    for (const check of agg.releaseGate.checks) {
      online.push({
        key: `gate_${check.key}`,
        label: check.key,
        value: check.status === 'no_data' ? 'no_data' : `${check.measured}（阈值 ${check.threshold}）`,
        tone: check.status === 'pass' ? 'good' : check.status === 'fail' ? 'bad' : 'muted',
      })
    }
    online.push({ key: 'gate_verdict', label: '门禁总判', value: agg.releaseGate.verdict, tone: agg.releaseGate.verdict === 'fail' ? 'bad' : agg.releaseGate.verdict === 'pass' ? 'good' : 'muted' })
  }
  layers.push(layerOf('online', online))

  return { layers, anchorDrift }
}

export type { RunAggregates }
