// overlay/statusline 域：状态栏可定制（kimi/minimax/codex/dsh 四源合并，矩阵 §3.3/3.4/3.8 P2）。
//
// 四源语义合并（kimi 7 槽位排序+command 整行替换 / minimax custom-command stdin JSON
// stdout 上屏 / codex StatusLineItem 枚举面 / dsh 状态行组件）：
// - **槽位**：状态栏 N 槽位（默认 6），每槽一个 item 类型（可排序）；
// - **custom-command**：外部探针脚本（stdin JSON 上下文→stdout 文本上屏——minimax
//   stdin JSON/stdout 上屏语义）；
// - **整行替换**：custom-command 占满整行（kimi command 整行替换语义）。
export type StatusItemKind = 'workspace' | 'model' | 'context' | 'tps' | 'cost' | 'custom'

export interface StatusSlot {
  kind: StatusItemKind
  /** custom 槽的命令（stdin JSON→stdout 文本）；其余忽略。 */
  command?: string
}

export interface StatuslineConfig {
  slots: StatusSlot[]
  /** custom-command 整行替换（kimi 语义）。 */
  replaceWholeLine: boolean
}

const DEFAULT_SLOTS: StatusSlot[] = [
  { kind: 'workspace' }, { kind: 'model' }, { kind: 'context' },
  { kind: 'tps' }, { kind: 'cost' }, { kind: 'custom' },
]

/** 配置归一（槽位缺省 6 个默认项；custom 无 command 降级 context 占位）。 */
export function normalizeStatusline(raw: unknown): StatuslineConfig {
  const r = (raw ?? {}) as Record<string, unknown>
  const slotsRaw = Array.isArray(r.slots) ? r.slots : null
  const slots: StatusSlot[] = slotsRaw
    ? slotsRaw.map((s) => {
        const x = s as Record<string, unknown>
        const kind = x.kind
        return {
          kind: (typeof kind === 'string' && ['workspace', 'model', 'context', 'tps', 'cost', 'custom'].includes(kind))
            ? (kind as StatusItemKind) : 'context',
          command: typeof x.command === 'string' ? x.command : undefined,
        }
      })
    : [...DEFAULT_SLOTS]
  return { slots, replaceWholeLine: r.replaceWholeLine === true }
}

/** custom-command 执行计划（minimax stdin JSON 语义：上下文进 stdin，文本出 stdout）。 */
export interface ProbePlan {
  command: string
  stdinJson: Record<string, unknown>
}

export function planProbe(config: StatuslineConfig, context: Record<string, unknown>): ProbePlan | null {
  const custom = config.slots.find((s) => s.kind === 'custom' && s.command)
  if (!custom) return null
  return { command: custom.command as string, stdinJson: context }
}
