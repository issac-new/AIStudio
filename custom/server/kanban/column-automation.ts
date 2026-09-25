// overlay/kanban 域：列级 automation 编排（routa §七#1 吸收，矩阵 §3.6 P0——P0 最后大件）。
//
// routa 语义映射（models/kanban.ts:92-127 KanbanColumnAutomation + column-transition.ts）：
// - 每列 automation.steps 有序步骤（id/role/specialist/provider，routa 每步 transport 在
//   单机形态收敛为 provider=zcode 引擎）；
// - 触发时机 entry|exit|both：列进入/离开触发（COLUMN_TRANSITION 事件的 from/to 驱动，
//   与 patch 399 column_transition 事件同源）；
// - autoAdvanceOnSuccess：步骤全成自动进列（本层只出配置意图，执行挂钩列后续）；
// - 契约门四件套不在本层——kanban_gates.py（399）流转侧强制，不重复。
//
// 本模块=纯匹配器+配置加载（执行编排 drain 依赖 loop 会话域，列后续）。
// 配置单一事实源：runtime/roster/columns.yaml（HERMES_COLUMNS_FILE 覆盖；坏文件回空）。
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export const AUTOMATION_TIMINGS = ['entry', 'exit', 'both'] as const
export type AutomationTiming = (typeof AUTOMATION_TIMINGS)[number]

export interface AutomationStep {
  id: string
  role: string
  specialist: string
  provider: string
}

export interface ColumnAutomation {
  timing: AutomationTiming
  autoAdvanceOnSuccess: boolean
  steps: AutomationStep[]
}

export interface ColumnTransitionTrigger {
  column: string
  /** 触发时机匹配于本次流转的方向：entry（进入该列）| exit（离开该列）。 */
  matchedTiming: 'entry' | 'exit'
  steps: AutomationStep[]
  autoAdvanceOnSuccess: boolean
}

let cached: Record<string, ColumnAutomation> | null = null

export function columnsFilePath(): string {
  const env = process.env.HERMES_COLUMNS_FILE?.trim()
  if (env) return resolve(env)
  return resolve(__dirname, '../../../runtime/roster/columns.yaml')
}

export function loadColumnAutomations(): Record<string, ColumnAutomation> {
  if (cached) return cached
  try {
    const p = columnsFilePath()
    if (!existsSync(p)) return (cached = {})
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    const raw = parse(readFileSync(p, 'utf8')) || {}
    const out: Record<string, ColumnAutomation> = {}
    for (const [name, def] of Object.entries(raw.columns ?? {})) {
      const d = def as { timing?: unknown; autoAdvanceOnSuccess?: unknown; steps?: unknown }
      const steps: AutomationStep[] = []
      if (Array.isArray(d.steps)) {
        for (const st of d.steps) {
          const s = st as { id?: unknown; role?: unknown; specialist?: unknown; provider?: unknown }
          if (s && typeof s.id === 'string' && typeof s.role === 'string') {
            steps.push({
              id: s.id, role: s.role,
              specialist: typeof s.specialist === 'string' ? s.specialist : '',
              provider: typeof s.provider === 'string' ? s.provider : 'zcode',
            })
          }
        }
      }
      out[name] = {
        timing: d.timing === 'exit' || d.timing === 'both' ? d.timing : 'entry',
        autoAdvanceOnSuccess: d.autoAdvanceOnSuccess === true,
        steps,
      }
    }
    cached = out
  } catch {
    cached = {}
  }
  return cached
}

export function resetColumnAutomationsCacheForTests(): void {
  cached = null
}

/**
 * COLUMN_TRANSITION 匹配器：给定 (from, to)，返回应触发的编排。
 * 时机语义：exit=离开某列时触发该列 automation；entry=进入某列时触发；
 * both=两者皆触发。空 from（首列进入）只匹配 entry 侧。
 */
export function matchColumnTransition(
  from: string | null, to: string | null,
  table: Record<string, ColumnAutomation> = loadColumnAutomations(),
): ColumnTransitionTrigger[] {
  const out: ColumnTransitionTrigger[] = []
  const push = (column: string, matchedTiming: 'entry' | 'exit') => {
    const cfg = table[column]
    if (!cfg || cfg.steps.length === 0) return
    const timing = cfg.timing
    const fires = timing === 'both' || timing === matchedTiming
    if (fires) out.push({ column, matchedTiming, steps: cfg.steps, autoAdvanceOnSuccess: cfg.autoAdvanceOnSuccess })
  }
  if (from && to) {
    push(from, 'exit')
    push(to, 'entry')
  } else if (to) {
    push(to, 'entry')
  }
  return out
}
