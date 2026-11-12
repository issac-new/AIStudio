// overlay/harness：Run Result 四维（2026-11-12 ai-agent-handbook 吸收）。
//
// 手册第 13/16/30 章的判据：一次 Run 的「执行状态/仿真有效性/证据完整性/质量」
// 是四个独立维度，压成一个「成功/失败」就无法归因。本模块只做纯聚合：
// 输入是各域已有事实，缺席标 unknown 并写 limitations，不猜、不补零。
//
// 设计约束（spec 2026-11-12-ai-agent-handbook-absorption D4/D7）：
// - 每维带 source/evidenceRefs/limitations，消费面可反查到来源。
// - 仿真有效性由 simcenter/simrun 提供；本层不推导。
// - 质量由 eval/resultContract 提供；本层不跑评测。

export type ExecutionStatus = 'completed' | 'failed' | 'cancelled' | 'unknown'
export type SimulationStatus = 'valid' | 'violated' | 'unchecked' | 'unknown'
export type EvidenceStatus = 'complete' | 'partial' | 'unknown'
export type QualityStatus = 'pass' | 'fail' | 'gap' | 'unknown'

export interface RunResultDimension<T extends string> {
  status: T
  /** 事实来源（模块/端点名）；unknown 时为 "none"。 */
  source: string
  /** 可反查的证据引用（记录 id/路径/端点），缺席为空数组。 */
  evidenceRefs: string[]
  /** 为什么是当前状态；unknown 必须写明缺什么。 */
  limitations: string[]
}

export interface RunResult {
  execution: RunResultDimension<ExecutionStatus>
  simulation: RunResultDimension<SimulationStatus>
  evidence: RunResultDimension<EvidenceStatus>
  quality: RunResultDimension<QualityStatus>
}

export interface ExecutionFact {
  outcome?: string | null
  exitCode?: number | null
  reason?: string | null
  recordId?: string | null
}

export interface SimulationFact {
  validity?: SimulationStatus | null
  source?: string | null
  evidenceRefs?: string[]
  limitations?: string[]
}

export interface EvidenceFact {
  completeness?: EvidenceStatus | null
  missing?: string[]
  source?: string | null
  evidenceRefs?: string[]
}

export interface QualityFact {
  verdict?: QualityStatus | string | null
  source?: string | null
  evidenceRefs?: string[]
}

export interface RunResultInputs {
  execution?: ExecutionFact | null
  simulation?: SimulationFact | null
  evidence?: EvidenceFact | null
  quality?: QualityFact | null
}

function dimension<T extends string>(
  status: T,
  source: string,
  evidenceRefs: string[] = [],
  limitations: string[] = [],
): RunResultDimension<T> {
  return { status, source, evidenceRefs: evidenceRefs.filter(Boolean), limitations: limitations.filter(Boolean) }
}

function executionStatus(fact: ExecutionFact): ExecutionStatus {
  const outcome = typeof fact.outcome === 'string' ? fact.outcome.trim().toLowerCase() : ''
  if (['completed', 'complete', 'success', 'succeeded', 'ok', 'done'].includes(outcome)) return 'completed'
  if (['failed', 'failure', 'error', 'blocked'].includes(outcome)) return 'failed'
  if (['cancelled', 'canceled', 'aborted', 'timeout', 'timed_out'].includes(outcome)) return 'cancelled'
  if (typeof fact.exitCode === 'number') {
    if (fact.exitCode === 0) return 'completed'
    return 'failed'
  }
  return 'unknown'
}

function qualityStatus(fact: QualityFact): QualityStatus {
  const verdict = typeof fact.verdict === 'string' ? fact.verdict.trim().toLowerCase() : ''
  if (['pass', 'passed', 'ok', 'green'].includes(verdict)) return 'pass'
  if (['fail', 'failed', 'red'].includes(verdict)) return 'fail'
  if (['gap', 'no_data', 'nodata', 'unknown'].includes(verdict)) return 'gap'
  return 'unknown'
}

/** 纯聚合：四维各自独立；任一侧缺席只影响该维。 */
export function deriveRunResult(inputs: RunResultInputs): RunResult {
  const executionFact = inputs.execution
  const executionStatusValue = executionFact ? executionStatus(executionFact) : 'unknown'
  const execution = dimension(
    executionStatusValue,
    executionFact ? 'execution-records' : 'none',
    executionFact?.recordId ? [executionFact.recordId] : [],
    executionStatusValue === 'unknown'
      ? [executionFact ? '执行结果未给出可识别 outcome/exitCode' : '无执行记录']
      : [],
  )

  const simulationFact = inputs.simulation
  const simulation = dimension(
    simulationFact?.validity && simulationFact.validity !== 'unknown' ? simulationFact.validity : 'unknown',
    simulationFact?.source || (simulationFact ? 'simulation' : 'none'),
    simulationFact?.evidenceRefs ?? [],
    simulationFact?.validity && simulationFact.validity !== 'unknown'
      ? (simulationFact.limitations ?? [])
      : ['仿真有效性未提供（本层不推导）', ...(simulationFact?.limitations ?? [])],
  )

  const evidenceFact = inputs.evidence
  const missing = evidenceFact?.missing?.filter(Boolean) ?? []
  let evidenceStatusValue: EvidenceStatus = 'unknown'
  if (evidenceFact?.completeness && evidenceFact.completeness !== 'unknown') {
    evidenceStatusValue = evidenceFact.completeness
  } else if (evidenceFact) {
    evidenceStatusValue = missing.length > 0 ? 'partial' : 'complete'
  }
  const evidence = dimension(
    evidenceStatusValue,
    evidenceFact?.source || (evidenceFact ? 'evidence' : 'none'),
    evidenceFact?.evidenceRefs ?? [],
    evidenceStatusValue === 'unknown'
      ? ['证据完整性未提供']
      : missing.length > 0
        ? [`缺证据：${missing.join(', ')}`]
        : [],
  )

  const qualityFact = inputs.quality
  const qualityStatusValue = qualityFact ? qualityStatus(qualityFact) : 'unknown'
  const quality = dimension(
    qualityStatusValue,
    qualityFact?.source || (qualityFact ? 'quality' : 'none'),
    qualityFact?.evidenceRefs ?? [],
    qualityStatusValue === 'unknown'
      ? [qualityFact ? '质量判词未给出可识别值' : '无质量判词']
      : [],
  )

  return { execution, simulation, evidence, quality }
}
