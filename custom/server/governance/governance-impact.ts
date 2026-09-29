/**
 * 反向影响查询（4A 治理层第五期 ③）——"改这个会影响谁"的注册表消费图。
 *
 * 两层事实源：
 *   1) 注册表内交叉引用（可计算）：谁的字段引用了目标——从四份注册表实析得出，
 *      与制品零漂移（制品改了引用即变）。
 *   2) 运行时消费面（锚点清单）：代码里谁在读这份注册表——内置清单+锚点符号，
 *      守门断言锚点符号仍在文件里（防清单腐烂成第二事实源）。
 * 查询语义：direct=直接引用方；改目标前须过 direct 清单逐项评估。
 */
import { loadCapabilityLedger, loadMetricsDefs, loadActionContracts, loadStateModel, findUpstreamRoot } from './governance-ledger'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ImpactConsumer {
  kind: 'ledger-unit' | 'capability' | 'contract' | 'transition' | 'runtime-anchor'
  id: string
  detail: string
}

export interface ImpactReport {
  target: string
  found: boolean
  kind: 'unit' | 'capability' | 'metric' | 'verdicts' | 'contract' | 'sloTier' | 'state-model' | 'unknown'
  direct: ImpactConsumer[]
  note?: string
}

/** 运行时消费面锚点（文件相对 overlay 根 + 须存在的符号串；守门 grep 断言）。 */
export const RUNTIME_CONSUMERS: Record<string, Array<{ file: string; symbol: string; how: string }>> = {
  'metrics.verdicts': [
    { file: 'custom/server/kanban/column-dispatch.ts', symbol: '词面相似不构成判定依据', how: '派发负载契约块下发判定词表' },
    { file: 'custom/server/governance/__tests__/governance-ledger.test.ts', symbol: 'CANONICAL', how: '守门六态与 qgate 判定词表双向对齐' },
    { file: 'runtime/governance/action-contracts.yaml', symbol: 'verdictVocabulary', how: '动作契约判定词表归口' },
  ],
  'ledger.units': [
    { file: 'custom/server/governance/governance-budget.ts', symbol: 'unitTier', how: 'SLO 预算闸按单元取 sloTier' },
    { file: 'custom/server/governance/governance-analytics.ts', symbol: 'dispatchUsageFor', how: '消费关系映射（column specialist/mention target）' },
    { file: 'custom/server/governance/governance-analytics.ts', symbol: 'profileToCapability', how: '成本能力维度归集' },
    { file: 'custom/server/governance/governance-ledger.ts', symbol: 'buildDispatchSemanticContext', how: '派单语义上下文（单元→能力/SLO）' },
  ],
  'contracts': [
    { file: 'custom/server/kanban/column-dispatch.ts', symbol: 'contractFooter', how: '派发负载契约块取 column.dispatch 契约' },
    { file: 'custom/server/governance/governance-ledger.ts', symbol: 'validateStateModel', how: '状态本体转移引用契约 id' },
  ],
  'state-model': [
    { file: 'custom/server/governance/governance-ledger.ts', symbol: 'extractKanbanStatusFacts', how: '词表与 upstream 逐字对齐断言' },
  ],
  'metrics.sloTargets': [
    { file: 'custom/server/governance/governance-budget.ts', symbol: 'sloTargets', how: '预算判定目标值来源' },
    { file: 'custom/server/governance/governance-ledger.ts', symbol: 'sloTargets', how: '校验器词表/区间断言' },
  ],
}

function anchorOk(file: string, symbol: string): boolean {
  const root = findUpstreamRoot(resolve(__dirname))
  // __dirname 位于 custom/server/governance → overlay 根 = ../../..
  const overlayRoot = resolve(__dirname, '../../..')
  const p = resolve(overlayRoot, file)
  try {
    return existsSync(p) && readFileSync(p, 'utf8').includes(symbol)
  } catch {
    void root
    return false
  }
}

/** 校验内置消费面锚点全部有效（守门用；腐烂即红，逼清单随代码走）。 */
export function validateRuntimeConsumerAnchors(): string[] {
  const problems: string[] = []
  for (const [aspect, list] of Object.entries(RUNTIME_CONSUMERS)) {
    for (const c of list) {
      if (!anchorOk(c.file, c.symbol)) {
        problems.push(`影响图锚点失效：${aspect} → ${c.file} 不含符号「${c.symbol}」（代码变更后须同步 RUNTIME_CONSUMERS）`)
      }
    }
  }
  return problems
}

function registryEdges(target: string): { report: ImpactReport | null } {
  // 解析 target：前缀式（contract./unit./metric. 的 id 可含点，不用 split 拆）
  const ledger = loadCapabilityLedger()
  const metrics = loadMetricsDefs()
  const contracts = loadActionContracts()
  const stateModel = loadStateModel()

  const asId = (prefix: string): string | null => (target.startsWith(prefix + '.') ? target.slice(prefix.length + 1) : null)

  const unitId = asId('unit')
  if (unitId) {
    const unit = ledger.doc?.units.find((u) => u.id === unitId)
    if (!unit) return { report: { target, found: false, kind: 'unit', direct: [], note: '台账无此单元' } }
    const cap = ledger.doc?.capabilities.find((c) => c.id === unit.capability)
    const direct: ImpactConsumer[] = [
      { kind: 'capability', id: unit.capability, detail: `承载能力 ${cap?.name ?? unit.capability}${unit.primary ? '（主承载）' : ''}` },
      { kind: 'runtime-anchor', id: 'governance-budget', detail: 'SLO 预算闸按本单元 sloTier 判定派发' },
      { kind: 'runtime-anchor', id: 'dispatch-ledger', detail: '派发台账按 specialist/target 归因消费实耗' },
    ]
    // columns.yaml 引用面（specialist=unit.id）
    try {
      const overlayRoot = resolve(__dirname, '../../..')
      const columnsPath = resolve(overlayRoot, 'runtime/roster/columns.yaml')
      if (existsSync(columnsPath)) {
        const text = readFileSync(columnsPath, 'utf8')
        if (text.includes(`specialist: ${unitId}`)) direct.push({ kind: 'runtime-anchor', id: 'columns.yaml', detail: '列编排步骤引用本单元为 specialist' })
      }
    } catch { /* 读失败不虚报 */ }
    return { report: { target, found: true, kind: 'unit', direct } }
  }
  if (target === 'verdicts' || target === 'metrics.verdicts') {
    return {
      report: {
        target: 'metrics.verdicts', found: (metrics.doc?.verdicts?.length ?? 0) > 0, kind: 'verdicts',
        direct: RUNTIME_CONSUMERS['metrics.verdicts'].map((c) => ({ kind: 'runtime-anchor' as const, id: c.file, detail: c.how })),
      },
    }
  }
  if (target === 'sloTargets' || target === 'metrics.sloTargets') {
    return {
      report: {
        target: 'metrics.sloTargets', found: true, kind: 'sloTier',
        direct: RUNTIME_CONSUMERS['metrics.sloTargets'].map((c) => ({ kind: 'runtime-anchor' as const, id: c.file, detail: c.how })),
      },
    }
  }
  const contractId = asId('contract')
  if (contractId) {
    const c = contracts.doc?.contracts.find((x) => x.id === contractId)
    if (!c) return { report: { target, found: false, kind: 'contract', direct: [], note: '契约注册表无此 id' } }
    const direct: ImpactConsumer[] = RUNTIME_CONSUMERS['contracts'].map((x) => ({ kind: 'runtime-anchor' as const, id: x.file, detail: x.how }))
    for (const t of stateModel.doc?.transitions ?? []) {
      if (t.actions.includes(contractId)) direct.push({ kind: 'transition', id: t.id, detail: `状态转移 ${t.from}→${t.to} 挂本契约` })
    }
    return { report: { target, found: true, kind: 'contract', direct } }
  }
  if (target === 'state-model') {
    return {
      report: {
        target, found: stateModel.exists, kind: 'state-model',
        direct: RUNTIME_CONSUMERS['state-model'].map((x) => ({ kind: 'runtime-anchor' as const, id: x.file, detail: x.how })),
        note: stateModel.exists ? `状态 ${(stateModel.doc?.states ?? []).length} 态 / 转移 ${(stateModel.doc?.transitions ?? []).length} 条 / 词表问题 ${stateModel.problems.length}` : undefined,
      },
    }
  }
  const metricId = asId('metric')
  if (metricId) {
    const m = metrics.doc?.metrics.find((x) => x.id === metricId)
    return { report: { target, found: !!m, kind: 'metric', direct: m ? [{ kind: 'runtime-anchor', id: 'governance-analytics', detail: '实况计算按 metrics 权威源取数' }] : [], note: m ? undefined : '指标层无此 id' } }
  }
  return { report: null }
}

export function queryImpact(target: string): ImpactReport {
  const { report } = registryEdges(target.trim())
  if (report) return report
  return { target, found: false, kind: 'unknown', direct: [], note: '未识别的目标形如 unit.<id> / contract.<id> / metric.<id> / verdicts / sloTargets / state-model' }
}
