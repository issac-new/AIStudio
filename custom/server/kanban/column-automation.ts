// overlay/kanban 域：列级 automation 编排（routa §七#1 吸收，矩阵 §3.6 P0——P0 最后大件）。
//
// routa 语义映射（models/kanban.ts:92-127 KanbanColumnAutomation + column-transition.ts）：
// - 每列 automation.steps 有序步骤（id/role/specialist/provider，routa 每步 transport 在
//   单机形态收敛为 provider=zcode 引擎）；
// - 触发时机 entry|exit|both：列进入/离开触发（COLUMN_TRANSITION 事件的 from/to 驱动，
//   与 patch 399 column_transition 事件同源）；
// - autoAdvanceOnSuccess：步骤全成后的「进列」意图（本层无自动进列执行面——完成后由
//   人工/编排推进列，与 squad-protocol「done 是人类的动作」同一交付边界）；
// - 同 provider 多步合并进单 run 按序执行（单 pending 槽语义，column-dispatch 派单文本
//   显式列出步骤序）；跨 run 的串行依赖 run 完成信号——投影事件面未暴露该信号（未接），
//   不宣称「步骤逐 run 有序」；
// - 契约门四件套不在本层——kanban_gates.py（399）流转侧强制，不重复。
//
// 本模块=纯匹配器+配置加载（执行编排 drain 依赖 loop 会话域，列后续）。
// 配置单一事实源：runtime/roster/columns.yaml（HERMES_COLUMNS_FILE 覆盖；坏文件回空）。
// 路径多候选探测（P-E）：打包产物下 __dirname 不指向源码树，见 resolveRosterFile。
// 配置校验（P-D(d)）：provider 限词表（zcode）；id/role/specialist 限长 + 限字符集
// （[A-Za-z0-9._-]）——这些字段会拼进派单文本，宽松放行即 mention/指令注入面。
// 违规 step 拼文本前由 column-dispatch 硬拦（REST 400 配置错误），加载时 warn 不静默。
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'
import { resolveRosterFile } from '../zcode/squad-protocol'

export const AUTOMATION_TIMINGS = ['entry', 'exit', 'both'] as const
export type AutomationTiming = (typeof AUTOMATION_TIMINGS)[number]

/** provider 词表（单机形态仅 zcode 引擎族）：派单目标只从这里出，防注入额外 mention。 */
export const AUTOMATION_PROVIDERS = ['zcode'] as const
export type AutomationProvider = (typeof AUTOMATION_PROVIDERS)[number]

/** step 文本字段（id/role/specialist）安全上限：限长 + 限字符集后再拼进派单文本。 */
export const STEP_LABEL_MAX = 64

export function isSafeStepLabel(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= STEP_LABEL_MAX && /^[A-Za-z0-9._-]+$/.test(v)
}

export function isAutomationProvider(v: unknown): v is AutomationProvider {
  return typeof v === 'string' && (AUTOMATION_PROVIDERS as readonly string[]).includes(v)
}

/** autonomy 上限（一句话）；constraints 每条上限与条数上限——授权要素（甲3）注入面限幅。 */
export const STEP_AUTONOMY_MAX = 200
export const STEP_CONSTRAINT_MAX = 120
export const STEP_CONSTRAINT_COUNT_MAX = 5

/** step 全字段校验（load 侧跳过坏条目 / 派单侧拼文本前复验共用）。 */
export function isSafeStep(step: AutomationStep): boolean {
  const autonomyOk = step.autonomy === undefined
    || (typeof step.autonomy === 'string' && step.autonomy.length > 0 && step.autonomy.length <= STEP_AUTONOMY_MAX)
  const constraintsOk = step.constraints === undefined
    || (Array.isArray(step.constraints) && step.constraints.length <= STEP_CONSTRAINT_COUNT_MAX
      && step.constraints.every((c) => typeof c === 'string' && c.length > 0 && c.length <= STEP_CONSTRAINT_MAX))
  return isSafeStepLabel(step.id) && isSafeStepLabel(step.role)
    && (step.specialist === '' || isSafeStepLabel(step.specialist))
    && isAutomationProvider(step.provider)
    && autonomyOk && constraintsOk
}

export interface AutomationStep {
  id: string
  role: string
  specialist: string
  provider: string
  /**
   * 授权五要素之「空间」（甲3，2026-09-30 调研落地）：允许 agent 自主决策的范围
   * （一句话，≤200 字符）。缺省=未声明（完备性检查 warn，不拦截）。
   */
  autonomy?: string
  /**
   * 授权五要素之「约束」（甲3）：禁改路径/预算上限/时间盒等硬边界（每条 ≤120 字符，
   * 至多 5 条）。「给资源，也给约束；允许不同路径，同时守住结果标准」。
   */
  constraints?: string[]
}

export interface ColumnAutomation {
  timing: AutomationTiming
  autoAdvanceOnSuccess: boolean
  steps: AutomationStep[]
  /**
   * 列证据契约（2026-10-01 吸收批 #16：routa requiredArtifacts 模型吸收）：
   * 卡片过该列时应挂的工件类型清单（如 freeze.md/testlog/report.md）。
   * 声明后 /match 与配置读取返回该清单，供门禁侧核「缺件不过列」；
   * 本层不拦截（证据核验属闸门域——与六闸 G1-G6 判词真值化同构）。
   * 缺省=该列无证据契约（现状语义不变）。
   */
  requiredArtifacts?: string[]
}

export interface ColumnTransitionTrigger {
  column: string
  /** 触发时机匹配于本次流转的方向：entry（进入该列）| exit（离开该列）。 */
  matchedTiming: 'entry' | 'exit'
  steps: AutomationStep[]
  autoAdvanceOnSuccess: boolean
  /** 列证据契约透传（见 ColumnAutomation.requiredArtifacts）。 */
  requiredArtifacts?: string[]
}

let cached: Record<string, ColumnAutomation> | null = null
// mtime 失效：模块级永久缓存曾让运行期改 columns.yaml 永不生效（须重启 server）
let cachedMtimeMs = -1

export function columnsFilePath(): string {
  const env = process.env.HERMES_COLUMNS_FILE?.trim()
  if (env) return resolve(env)
  return resolveRosterFile('roster/columns.yaml') ?? resolve(__dirname, '../../../runtime/roster/columns.yaml')
}

export function loadColumnAutomations(): Record<string, ColumnAutomation> {
  try {
    const p = columnsFilePath()
    const mtime = existsSync(p) ? statSync(p).mtimeMs : -1
    if (cached && mtime === cachedMtimeMs) return cached
    cachedMtimeMs = mtime
    if (mtime < 0) {
      // P-E：全 miss 不再无声回空——打一条 warn 让部署形态问题可见。
      console.warn(`[columns] 列编排配置不存在（候选探测全 miss）：${p}，回空配置`)
      return (cached = Object.create(null) as Record<string, ColumnAutomation>)
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    const raw = parse(readFileSync(p, 'utf8')) || {}
    // 空原型表（P-A(a)）：'toString'/'constructor' 不再沿原型链命中 Object.prototype。
    const out: Record<string, ColumnAutomation> = Object.create(null)
    const columns = (raw as { columns?: unknown }).columns
    if (columns !== undefined && (typeof columns !== 'object' || columns === null || Array.isArray(columns))) {
      console.warn('[columns] 配置顶层 columns 非映射，回空配置')
    } else {
      // 逐条 try/判空（P-A(a)）：坏条目（YAML 空条目 null 等）跳过 + warn，不牵连整表。
      for (const [name, def] of Object.entries((columns ?? {}) as Record<string, unknown>)) {
        try {
          const d = def as { timing?: unknown; autoAdvanceOnSuccess?: unknown; steps?: unknown } | null
          if (d === null || typeof d !== 'object') {
            console.warn(`[columns] 列条目 ${name} 非对象（空条目？），跳过`)
            continue
          }
          const steps: AutomationStep[] = []
          if (Array.isArray(d.steps)) {
            for (const st of d.steps) {
              const s = st as { id?: unknown; role?: unknown; specialist?: unknown; provider?: unknown; autonomy?: unknown; constraints?: unknown } | null
              if (!s || typeof s !== 'object') {
                console.warn(`[columns] 列 ${name} 含空 step 条目，跳过`)
                continue
              }
              const step: AutomationStep = {
                id: typeof s.id === 'string' ? s.id : '',
                role: typeof s.role === 'string' ? s.role : '',
                specialist: typeof s.specialist === 'string' ? s.specialist : '',
                provider: typeof s.provider === 'string' ? s.provider : 'zcode',
                ...(typeof s.autonomy === 'string' && s.autonomy ? { autonomy: s.autonomy } : {}),
                ...(Array.isArray(s.constraints)
                  ? { constraints: (s.constraints as unknown[]).filter((c): c is string => typeof c === 'string' && c.length > 0) }
                  : {}),
              }
              // 词表/字符集校验（P-D(d)）：违规 step 如实进表并 warn（配置面能看到原样），
              // 拼文本前由 column-dispatch isSafeStep 硬拦（配置错误≠引擎不可达）。
              if (!isSafeStep(step)) {
                console.warn(`[columns] 列 ${name} step ${step.id || '?'} 校验失败（provider 须在 ${AUTOMATION_PROVIDERS.join('/')} 词表，id/role/specialist 限 [A-Za-z0-9._-] 且 ≤${STEP_LABEL_MAX} 字符）——派发时将拒绝执行`)
              }
              steps.push(step)
            }
          }
          out[name] = {
            timing: d.timing === 'exit' || d.timing === 'both' ? d.timing : 'entry',
            autoAdvanceOnSuccess: d.autoAdvanceOnSuccess === true,
            steps,
            // 列证据契约（#16 routa 吸收）：字符串数组白名单（≤8 条、每条 ≤64 字符）
            ...(Array.isArray((def as { requiredArtifacts?: unknown }).requiredArtifacts)
              ? {
                  requiredArtifacts: ((def as { requiredArtifacts?: unknown[] }).requiredArtifacts ?? [])
                    .filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 64)
                    .slice(0, 8),
                }
              : {}),
          }
        } catch (err) {
          console.warn(`[columns] 列条目 ${name} 解析失败，跳过：${err instanceof Error ? err.message : err}`)
        }
      }
    }
    cached = out
  } catch {
    cached = Object.create(null) as Record<string, ColumnAutomation>
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
 * to 为空（卡片离开看板的纯离场）不触发任何编排——含 from 侧 exit；缺 to 的纯
 * 离场没有目标列可推进，此语义在 /match 文档注明，不静默按 exit 派单。
 */
export function matchColumnTransition(
  from: string | null, to: string | null,
  table: Record<string, ColumnAutomation> = loadColumnAutomations(),
): ColumnTransitionTrigger[] {
  const out: ColumnTransitionTrigger[] = []
  const push = (column: string, matchedTiming: 'entry' | 'exit') => {
    // hasOwnProperty 校验（P-A(a)）：调用方传入的普通对象表不得命中原型链成员。
    if (!Object.prototype.hasOwnProperty.call(table, column)) return
    const cfg = table[column]
    if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.steps) || cfg.steps.length === 0) return
    const timing = cfg.timing
    const fires = timing === 'both' || timing === matchedTiming
    if (fires) out.push({
      column,
      matchedTiming,
      steps: cfg.steps,
      autoAdvanceOnSuccess: cfg.autoAdvanceOnSuccess,
      ...(cfg.requiredArtifacts?.length ? { requiredArtifacts: cfg.requiredArtifacts } : {}),
    })
  }
  if (from && to) {
    if (from === to) {
      // 同列流转（未真正换列）：只按 entry 触发一次——exit+entry 各派一单会让
      // timing=both 的列对同一次流转重复派单（24h 审查 P3）
      push(to, 'entry')
    } else {
      push(from, 'exit')
      push(to, 'entry')
    }
  } else if (to) {
    push(to, 'entry')
  }
  return out
}
