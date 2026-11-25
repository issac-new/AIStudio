/**
 * Ekko UI Surface 协议核心（ekko-ui/v1 + ekko-ui/v2）。
 *
 * 单一事实源：组件目录、可用属性、事件、动作、限制、校验规则都在本文件。
 * 上游规划见 vendor/hermes-studio/packages/ekko-agent/docs/interactive-ui-plan.md；
 * v1 覆盖「一次 createSurface 携带完整组件树」的切片，v2 在其上扩展可计算表达式、
 * 新部件与新动作（spec：docs/superpowers/specs/2026-11-24-ekko-ui-v2-batch1.md）；
 * v2 批二加按稳定节点 id 的补丁、可修复错误、目录投影、回执摘要与续接消息格式
 * （spec：docs/superpowers/specs/2026-11-25-ekko-ui-v2-batch2.md）。
 *
 * 约束：
 * - 纯 TS，无 DOM/Vue/Naive 依赖，可在浏览器、Node 与测试中直接使用。服务端经
 *   custom/server/ekko-ui/protocol-bridge.ts 引用本文件做补丁校验与目录投影，不另抄一份。
 * - Agent 只发声明式 JSON：禁止 HTML、脚本、任意 CSS、事件属性与可执行 URL。
 * - 未知组件/属性/事件/动作一律拒绝；校验失败由宿主显示 fallbackText，不静默降级。
 * - v1 与 v2 双协议并存：v2 独有的表达式/部件/动作在 v1 spec 中一律拒绝。
 */

export const EKKO_UI_PROTOCOL = 'ekko-ui/v1' as const
export const EKKO_UI_PROTOCOL_V2 = 'ekko-ui/v2' as const
export type EkkoUIProtocol = typeof EKKO_UI_PROTOCOL | typeof EKKO_UI_PROTOCOL_V2

/** 传输与结构上限。Agent 工具、服务端、渲染器三处都必须执行（客户端限制只服务体验）。 */
export const EKKO_UI_LIMITS = {
  maxSpecBytes: 64 * 1024,
  maxStateBytes: 32 * 1024,
  maxSubmissionBytes: 32 * 1024,
  maxNodes: 400,
  maxDepth: 12,
  maxChildrenPerNode: 60,
  maxOptionsPerInput: 50,
  maxStringLength: 4000,
  maxSurfaceIdLength: 64,
  maxRevision: 1,
  /** 单表达式求值步数预算（v2）：防 map/concat 嵌套构造的指数求值。 */
  maxExpressionSteps: 256,
  /** 表达式 AST 深度上限（v2）：校验期与求值期共用。 */
  maxExpressionDepth: 32,
  /** map 循环模板的列表长度上限（v2）。 */
  maxMapItems: 200,
  /** 单次更新最多包含的补丁条数（v2 批二）。 */
  maxPatchOperations: 64,
  /** 单个会话可创建的持久界面上限（v2 批二）。 */
  maxSurfacesPerSession: 60,
  /** 续接消息里提交内容的字符上限，超出截断并注明原长（v2 批二）。 */
  maxTurnPayloadChars: 8000,
} as const

export type EkkoUIJsonValue =
  | null
  | boolean
  | number
  | string
  | EkkoUIJsonValue[]
  | { [key: string]: EkkoUIJsonValue }

export type EkkoUIState = Record<string, EkkoUIJsonValue>

export type EkkoUIStyle = {
  display?: 'block' | 'flex' | 'grid' | 'none'
  direction?: 'row' | 'column'
  columns?: number
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  width?: 'auto' | 'full'
  align?: 'start' | 'center' | 'end' | 'stretch'
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

export type EkkoUIExpression =
  | { kind: 'literal'; value: EkkoUIJsonValue }
  | { kind: 'state'; path: string }
  | { kind: 'event'; path: string }
  | { kind: 'equals'; left: EkkoUIExpression; right: EkkoUIExpression }
  | { kind: 'not'; value: EkkoUIExpression }
  | { kind: 'and'; values: EkkoUIExpression[] }
  | { kind: 'or'; values: EkkoUIExpression[] }
  // ---- v2 起新增（v1 spec 中一律拒绝）----
  | { kind: 'var'; name: string; path?: string }
  | { kind: 'arith'; op: '+' | '-' | '*' | '/' | '%'; left: EkkoUIExpression; right: EkkoUIExpression }
  | { kind: 'compare'; op: '>' | '>=' | '<' | '<='; left: EkkoUIExpression; right: EkkoUIExpression }
  | { kind: 'format'; value: EkkoUIExpression; as: 'number' | 'currency' | 'percent' | 'date'; decimals?: number; currency?: string }
  | { kind: 'length'; value: EkkoUIExpression }
  | { kind: 'concat'; values: EkkoUIExpression[] }
  | { kind: 'if'; cond: EkkoUIExpression; then: EkkoUIExpression; else: EkkoUIExpression }
  | { kind: 'coalesce'; values: EkkoUIExpression[] }
  | { kind: 'map'; list: EkkoUIExpression; item: string; index?: string; body: EkkoUIExpression }
  | { kind: 'object'; fields: Record<string, EkkoUIExpression> }
  | { kind: 'array'; values: EkkoUIExpression[] }

export type EkkoUIAction =
  | { type: 'state.set'; path: string; value: EkkoUIExpression }
  | { type: 'state.merge'; path: string; value: EkkoUIExpression }
  | { type: 'state.toggle'; path: string }
  | { type: 'array.append'; path: string; value: EkkoUIExpression }
  | { type: 'array.remove'; path: string; index: EkkoUIExpression }
  | { type: 'surface.submit'; actionId: string; payload: EkkoUIExpression }
  | { type: 'surface.cancel'; actionId: string }
  | { type: 'surface.close' }
  // ---- v2 起新增（v1 spec 中一律拒绝）----
  | { type: 'surface.turn'; text: EkkoUIExpression }
  | { type: 'surface.copy'; text: EkkoUIExpression }
  | { type: 'surface.open_url'; url: EkkoUIExpression }
  | { type: 'tabs.open'; nodeId: string; value: string }

export interface EkkoUINode {
  id: string
  type: string
  props?: Record<string, EkkoUIJsonValue>
  style?: EkkoUIStyle
  /** 仅输入类组件：把控件值写到 state 的该路径（两向绑定）。 */
  bind?: string
  visibleWhen?: EkkoUIExpression
  events?: Record<string, EkkoUIAction | EkkoUIAction[]>
  children?: EkkoUINode[]
}

export interface EkkoUISpec {
  protocol: EkkoUIProtocol
  /** 模型必填的稳定 slug；与服务端会话拼成全局 surface_id。 */
  surfaceId: string
  title?: string
  fallbackText: string
  state?: EkkoUIState
  root: EkkoUINode
  submitSchema?: Record<string, EkkoUIJsonValue>
}

export type EkkoUISubmissionStatus = 'submitted' | 'cancelled' | 'expired' | 'closed'

export interface EkkoUISubmission {
  status: EkkoUISubmissionStatus
  surface_id: string
  revision: number
  action_id?: string
  payload?: EkkoUIJsonValue
  reason?: string
}

export interface EkkoUIValidationError {
  path: string
  code: string
  message: string
}

export interface EkkoUIValidationResult {
  ok: boolean
  spec?: EkkoUISpec
  errors: EkkoUIValidationError[]
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type EkkoUIPropType = 'string' | 'number' | 'boolean' | 'json' | 'enum'

export interface EkkoUIPropRule {
  type: EkkoUIPropType
  required?: boolean
  values?: readonly string[]
  maxLength?: number
  min?: number
  max?: number
}

export interface EkkoUIComponentDefinition {
  type: string
  category: 'layout' | 'content' | 'input' | 'action' | 'data'
  description: string
  acceptsChildren: boolean
  /** 允许的事件名；为空表示不可交互。 */
  events: readonly string[]
  /** 输入类组件绑定的值类型；未定义表示不支持 bind。 */
  bindValueType?: 'string' | 'number' | 'boolean' | 'json'
  props: Record<string, EkkoUIPropRule>
}

const TONES = ['default', 'primary', 'success', 'warning', 'danger'] as const
const SPACES = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const
const SIZE = ['xs', 'sm', 'md', 'lg', 'xl'] as const

const OPTIONS_PROP: EkkoUIPropRule = { type: 'json' }
const LABEL_PROP: EkkoUIPropRule = { type: 'string', maxLength: 200 }

export const EKKO_UI_CATALOG: readonly EkkoUIComponentDefinition[] = [
  // 布局
  { type: 'box', category: 'layout', description: '通用容器', acceptsChildren: true, events: [], props: {} },
  { type: 'stack', category: 'layout', description: '纵向堆叠', acceptsChildren: true, events: [], props: {} },
  { type: 'row', category: 'layout', description: '横向排列', acceptsChildren: true, events: [], props: {} },
  { type: 'grid', category: 'layout', description: '网格', acceptsChildren: true, events: [], props: { columns: { type: 'number', min: 1, max: 6 } } },
  { type: 'scroll', category: 'layout', description: '可滚动容器', acceptsChildren: true, events: [], props: { maxHeight: { type: 'number', min: 60, max: 2000 } } },
  { type: 'card', category: 'layout', description: '卡片', acceptsChildren: true, events: [], props: { title: LABEL_PROP, subtitle: { type: 'string', maxLength: 400 }, tone: { type: 'enum', values: TONES } } },
  { type: 'divider', category: 'layout', description: '分隔线', acceptsChildren: false, events: [], props: {} },
  { type: 'spacer', category: 'layout', description: '留白', acceptsChildren: false, events: [], props: { size: { type: 'enum', values: SIZE } } },

  // 内容
  { type: 'text', category: 'content', description: '正文', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: EKKO_UI_LIMITS.maxStringLength }, tone: { type: 'enum', values: TONES } } },
  { type: 'heading', category: 'content', description: '标题', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: 300 }, level: { type: 'number', min: 1, max: 6 } } },
  { type: 'code', category: 'content', description: '代码块', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: EKKO_UI_LIMITS.maxStringLength }, language: { type: 'string', maxLength: 40 } } },
  { type: 'badge', category: 'content', description: '徽标', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: 80 }, tone: { type: 'enum', values: TONES } } },
  { type: 'alert', category: 'content', description: '提示条', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: 600 }, title: { type: 'string', maxLength: 200 }, tone: { type: 'enum', values: TONES } } },

  // 输入
  { type: 'form', category: 'layout', description: '表单容器', acceptsChildren: true, events: ['submit'], props: {} },
  { type: 'field', category: 'input', description: '字段（标签 + 控件）', acceptsChildren: true, events: [], props: { label: { type: 'string', required: true, maxLength: 200 }, hint: { type: 'string', maxLength: 400 }, required: { type: 'boolean' } } },
  { type: 'input', category: 'input', description: '单行文本', acceptsChildren: false, events: [], bindValueType: 'string', props: { placeholder: { type: 'string', maxLength: 200 }, required: { type: 'boolean' }, maxLength: { type: 'number', min: 1, max: EKKO_UI_LIMITS.maxStringLength }, type: { type: 'enum', values: ['text', 'email', 'url', 'tel'] } } },
  { type: 'textarea', category: 'input', description: '多行文本', acceptsChildren: false, events: [], bindValueType: 'string', props: { placeholder: { type: 'string', maxLength: 200 }, required: { type: 'boolean' }, rows: { type: 'number', min: 2, max: 12 }, maxLength: { type: 'number', min: 1, max: EKKO_UI_LIMITS.maxStringLength } } },
  { type: 'number', category: 'input', description: '数字', acceptsChildren: false, events: [], bindValueType: 'number', props: { placeholder: { type: 'string', maxLength: 200 }, required: { type: 'boolean' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' } } },
  { type: 'select', category: 'input', description: '下拉选择', acceptsChildren: false, events: [], bindValueType: 'json', props: { options: { ...OPTIONS_PROP, required: true }, placeholder: { type: 'string', maxLength: 200 }, required: { type: 'boolean' } } },
  { type: 'radio', category: 'input', description: '单选', acceptsChildren: false, events: [], bindValueType: 'json', props: { options: { ...OPTIONS_PROP, required: true }, required: { type: 'boolean' } } },
  { type: 'checkbox', category: 'input', description: '勾选', acceptsChildren: false, events: [], bindValueType: 'boolean', props: { label: LABEL_PROP } },
  { type: 'switch', category: 'input', description: '开关', acceptsChildren: false, events: [], bindValueType: 'boolean', props: { label: LABEL_PROP } },
  { type: 'range', category: 'input', description: '滑杆', acceptsChildren: false, events: [], bindValueType: 'number', props: { min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' }, required: { type: 'boolean' } } },
  { type: 'date', category: 'input', description: '日期', acceptsChildren: false, events: [], bindValueType: 'string', props: { required: { type: 'boolean' }, min: { type: 'string', maxLength: 40 }, max: { type: 'string', maxLength: 40 } } },
  { type: 'time', category: 'input', description: '时间', acceptsChildren: false, events: [], bindValueType: 'string', props: { required: { type: 'boolean' } } },

  // 动作
  { type: 'button', category: 'action', description: '按钮', acceptsChildren: false, events: ['click'], props: { text: { type: 'string', required: true, maxLength: 120 }, variant: { type: 'enum', values: ['primary', 'default', 'text'] }, tone: { type: 'enum', values: TONES }, disabled: { type: 'boolean' } } },
  { type: 'button-group', category: 'action', description: '按钮组', acceptsChildren: true, events: [], props: {} },

  // 数据
  { type: 'list', category: 'data', description: '列表', acceptsChildren: false, events: [], props: { items: { type: 'json', required: true }, ordered: { type: 'boolean' } } },
  { type: 'progress', category: 'data', description: '进度', acceptsChildren: false, events: [], props: { value: { type: 'number', required: true, min: 0 }, max: { type: 'number', min: 1 }, label: { type: 'string', maxLength: 200 } } },
  { type: 'table', category: 'data', description: '表格', acceptsChildren: false, events: [], props: { columns: { type: 'json', required: true }, rows: { type: 'json', required: true } } },

  // ---- v2 起新增（v1 spec 中一律拒绝）----
  { type: 'chart', category: 'data', description: '图表（原生 SVG：bar/line/pie）', acceptsChildren: false, events: [], props: { kind: { type: 'enum', values: ['bar', 'line', 'pie'], required: true }, data: { type: 'json', required: true }, height: { type: 'number', min: 80, max: 480 }, tone: { type: 'enum', values: TONES } } },
  { type: 'image', category: 'content', description: '图片（https/data:image 白名单）', acceptsChildren: false, events: [], props: { src: { type: 'string', required: true, maxLength: 2048 }, alt: { type: 'string', maxLength: 200 }, maxWidth: { type: 'number', min: 40, max: 1200 }, aspectRatio: { type: 'string', maxLength: 16 } } },
  { type: 'metric', category: 'data', description: '指标卡', acceptsChildren: false, events: [], props: { label: { type: 'string', required: true, maxLength: 120 }, value: { type: 'json', required: true }, unit: { type: 'string', maxLength: 24 }, tone: { type: 'enum', values: TONES }, trend: { type: 'enum', values: ['up', 'down', 'flat'] } } },
  { type: 'tabs', category: 'layout', description: '标签页容器（子节点须为 tab-panel）', acceptsChildren: true, events: [], props: {} },
  { type: 'tab-panel', category: 'layout', description: '标签页面板（须在 tabs 内）', acceptsChildren: true, events: [], props: { label: { type: 'string', required: true, maxLength: 80 } } },
  { type: 'steps', category: 'data', description: '步骤条', acceptsChildren: false, events: [], props: { items: { type: 'json', required: true } } },
  { type: 'empty', category: 'content', description: '空态', acceptsChildren: false, events: [], props: { text: { type: 'string', required: true, maxLength: 300 }, hint: { type: 'string', maxLength: 400 } } },
  { type: 'descriptions', category: 'data', description: '键值描述列表', acceptsChildren: false, events: [], props: { items: { type: 'json', required: true }, columns: { type: 'number', min: 1, max: 3 } } },
]

const CATALOG_BY_TYPE = new Map(EKKO_UI_CATALOG.map(def => [def.type, def]))

export function catalogDefinition(type: string): EkkoUIComponentDefinition | undefined {
  return CATALOG_BY_TYPE.get(type)
}

const STYLE_ENUMS: Record<keyof EkkoUIStyle, readonly string[] | null> = {
  display: ['block', 'flex', 'grid', 'none'],
  direction: ['row', 'column'],
  columns: null,
  gap: SPACES,
  padding: SPACES,
  width: ['auto', 'full'],
  align: ['start', 'center', 'end', 'stretch'],
  tone: TONES,
  radius: ['none', 'sm', 'md', 'lg', 'full'],
}

const ACTION_TYPES = new Set([
  'state.set', 'state.merge', 'state.toggle', 'array.append', 'array.remove',
  'surface.submit', 'surface.cancel', 'surface.close',
  'surface.turn', 'surface.copy', 'surface.open_url', 'tabs.open',
])

/** v2 独有的表达式/动作/部件：v1 spec 中出现一律拒绝（不静默降级）。 */
const V2_EXPRESSION_KINDS = new Set([
  'var', 'arith', 'compare', 'format', 'length', 'concat', 'if', 'coalesce', 'map', 'object', 'array',
])
const V2_ACTION_TYPES = new Set(['surface.turn', 'surface.copy', 'surface.open_url', 'tabs.open'])
const V2_COMPONENT_TYPES = new Set(['chart', 'image', 'metric', 'tabs', 'tab-panel', 'steps', 'empty', 'descriptions'])

const V1_EXPRESSION_KINDS = ['literal', 'state', 'event', 'equals', 'not', 'and', 'or']
const V1_ACTION_TYPES = ['state.set', 'state.merge', 'state.toggle', 'array.append', 'array.remove', 'surface.submit', 'surface.cancel', 'surface.close']

// 校验错误要能被 Agent 直接修复：未知即列出可用值。MCP 只把 error 一句话带回模型，
// 所以清单写进 message 而不是另开字段。顺序＝目录顺序或类型声明顺序。
function catalogTypes(version: 1 | 2): string {
  return EKKO_UI_CATALOG.map(def => def.type).filter(type => version === 2 || !V2_COMPONENT_TYPES.has(type)).join(' ')
}
function expressionKinds(version: 1 | 2): string {
  return (version === 2 ? [...V1_EXPRESSION_KINDS, ...V2_EXPRESSION_KINDS] : V1_EXPRESSION_KINDS).join(' ')
}
function actionTypes(version: 1 | 2): string {
  return (version === 2 ? [...V1_ACTION_TYPES, ...V2_ACTION_TYPES] : V1_ACTION_TYPES).join(' ')
}

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

// ---------------------------------------------------------------------------
// Paths / state
// ---------------------------------------------------------------------------

export function isSafeStatePath(path: string): boolean {
  if (path === '') return true
  const segments = path.split('.')
  if (!segments.length || segments.length > 12) return false
  return segments.every(segment =>
    /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(segment) && !UNSAFE_PATH_SEGMENTS.has(segment),
  )
}

export function getStateValue(state: EkkoUIState, path: string): EkkoUIJsonValue | undefined {
  if (path === '') return state
  if (!isSafeStatePath(path)) return undefined
  let cursor: EkkoUIJsonValue | undefined = state
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, EkkoUIJsonValue>)[segment]
  }
  return cursor
}

export function setStateValue(state: EkkoUIState, path: string, value: EkkoUIJsonValue): void {
  if (!path || !isSafeStatePath(path)) return
  const segments = path.split('.')
  let cursor: Record<string, EkkoUIJsonValue> = state
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const next = cursor[key]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, EkkoUIJsonValue>
  }
  cursor[segments[segments.length - 1]] = value
}

export function cloneJson<T extends EkkoUIJsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface EkkoUIExpressionContext {
  state: EkkoUIState
  event?: EkkoUIJsonValue
  /** map 循环模板绑定的局部变量（v2）。 */
  locals?: Record<string, EkkoUIJsonValue>
}

interface EvalBudget { steps: number }

/** 预算耗尽信号：抛出以立即展开递归（DAG 型输入按路径数爆炸，逐点返回挡不住）。 */
class ExpressionBudgetExceeded extends Error {
  constructor(readonly kind: 'steps' | 'depth') { super(`expression budget exceeded: ${kind}`) }
}

/** 求值入口：带步数预算，超限/异常一律返回 undefined（fail-soft，不抛进渲染）。 */
export function evaluateExpression(expr: EkkoUIExpression, ctx: EkkoUIExpressionContext): EkkoUIJsonValue | undefined {
  try {
    return evalExpr(expr, ctx, { steps: 0 })
  } catch (error) {
    if (error instanceof ExpressionBudgetExceeded) return undefined
    throw error
  }
}

function evalExpr(expr: EkkoUIExpression, ctx: EkkoUIExpressionContext, budget: EvalBudget): EkkoUIJsonValue | undefined {
  if (++budget.steps > EKKO_UI_LIMITS.maxExpressionSteps) throw new ExpressionBudgetExceeded('steps')
  switch (expr.kind) {
    case 'literal': return expr.value
    case 'state': return getStateValue(ctx.state, expr.path)
    case 'event': {
      if (!isSafeStatePath(expr.path)) return undefined
      if (expr.path === '') return ctx.event
      let cursor: EkkoUIJsonValue | undefined = ctx.event ?? undefined
      for (const segment of expr.path.split('.')) {
        if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
        cursor = (cursor as Record<string, EkkoUIJsonValue>)[segment]
      }
      return cursor
    }
    case 'equals': return jsonEqual(evalExpr(expr.left, ctx, budget), evalExpr(expr.right, ctx, budget))
    case 'not': return !truthy(evalExpr(expr.value, ctx, budget))
    case 'and': return expr.values.every(value => truthy(evalExpr(value, ctx, budget)))
    case 'or': return expr.values.some(value => truthy(evalExpr(value, ctx, budget)))
    case 'var': {
      let cursor: EkkoUIJsonValue | undefined = ctx.locals?.[expr.name]
      if (expr.path === undefined || expr.path === '') return cursor
      if (!isSafeStatePath(expr.path)) return undefined
      for (const segment of expr.path.split('.')) {
        if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
        cursor = (cursor as Record<string, EkkoUIJsonValue>)[segment]
      }
      return cursor
    }
    case 'arith': {
      const left = evalExpr(expr.left, ctx, budget)
      const right = evalExpr(expr.right, ctx, budget)
      if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) return undefined
      switch (expr.op) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return right === 0 ? undefined : left / right
        case '%': return right === 0 ? undefined : left % right
        default: return undefined
      }
    }
    case 'compare': {
      const left = evalExpr(expr.left, ctx, budget)
      const right = evalExpr(expr.right, ctx, budget)
      if (typeof left === 'number' && typeof right === 'number') {
        switch (expr.op) {
          case '>': return left > right
          case '>=': return left >= right
          case '<': return left < right
          case '<=': return left <= right
          default: return undefined
        }
      }
      if (typeof left === 'string' && typeof right === 'string') {
        switch (expr.op) {
          case '>': return left > right
          case '>=': return left >= right
          case '<': return left < right
          case '<=': return left <= right
          default: return undefined
        }
      }
      return undefined
    }
    case 'format': {
      const value = evalExpr(expr.value, ctx, budget)
      const decimals = clampDecimals(expr.decimals)
      switch (expr.as) {
        case 'number':
          return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value, decimals) : undefined
        case 'currency':
          return typeof value === 'number' && Number.isFinite(value)
            ? `${typeof expr.currency === 'string' && expr.currency ? expr.currency : '¥'}${formatNumber(value, decimals)}`
            : undefined
        case 'percent':
          return typeof value === 'number' && Number.isFinite(value) ? `${formatNumber(value * 100, expr.decimals === undefined ? 1 : decimals)}%` : undefined
        case 'date': {
          if (typeof value !== 'string' && typeof value !== 'number') return undefined
          const date = new Date(value)
          if (Number.isNaN(date.getTime())) return undefined
          // 用 UTC 取值：纯日期串（'2026-11-24'）在任何时区都渲染同一天
          return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
        }
        default: return undefined
      }
    }
    case 'length': {
      const value = evalExpr(expr.value, ctx, budget)
      if (typeof value === 'string' || Array.isArray(value)) return value.length
      if (value !== null && typeof value === 'object') return Object.keys(value).length
      return undefined
    }
    case 'concat':
      return expr.values.map(value => {
        const resolved = evalExpr(value, ctx, budget)
        return resolved === undefined || resolved === null ? '' : String(resolved)
      }).join('')
    case 'if':
      return truthy(evalExpr(expr.cond, ctx, budget))
        ? evalExpr(expr.then, ctx, budget)
        : evalExpr(expr.else, ctx, budget)
    case 'coalesce': {
      for (const value of expr.values) {
        const resolved = evalExpr(value, ctx, budget)
        if (resolved !== undefined && resolved !== null && resolved !== '') return resolved
      }
      return undefined
    }
    case 'map': {
      const list = evalExpr(expr.list, ctx, budget)
      if (!Array.isArray(list) || list.length > EKKO_UI_LIMITS.maxMapItems) return undefined
      return list.map((item, index) => evalExpr(expr.body, {
        ...ctx,
        locals: { ...ctx.locals, [expr.item]: item, ...(expr.index ? { [expr.index]: index } : {}) },
      }, budget) ?? null)
    }
    case 'object': {
      const out: Record<string, EkkoUIJsonValue> = {}
      for (const [key, field] of Object.entries(expr.fields)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || UNSAFE_PATH_SEGMENTS.has(key)) return undefined
        out[key] = evalExpr(field, ctx, budget) ?? null
      }
      return out
    }
    case 'array':
      return expr.values.map(value => evalExpr(value, ctx, budget) ?? null)
    default: return undefined
  }
}

function clampDecimals(decimals: number | undefined): number {
  if (decimals === undefined || !Number.isInteger(decimals)) return 2
  return Math.min(6, Math.max(0, decimals))
}

function formatNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals)
  const dot = fixed.indexOf('.')
  const int = dot === -1 ? fixed : fixed.slice(0, dot)
  const frac = dot === -1 ? '' : fixed.slice(dot)
  const sign = int.startsWith('-') ? '-' : ''
  const digits = sign ? int.slice(1) : int
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`
}

export function truthy(value: EkkoUIJsonValue | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  return Object.keys(value).length > 0
}

function jsonEqual(a: EkkoUIJsonValue | undefined, b: EkkoUIJsonValue | undefined): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

// ---------------------------------------------------------------------------
// Actions (local reducer)
// ---------------------------------------------------------------------------

export interface EkkoUIActionOutcome {
  submit?: { actionId: string; payload: EkkoUIJsonValue }
  cancel?: { actionId: string }
  close?: boolean
  /** v2：发起新一轮对话（文本已由状态模板拼好）。 */
  turn?: { text: string }
  /** v2：写剪贴板。 */
  copy?: { text: string }
  /** v2：打开外部链接（scheme 已复验）。 */
  openUrl?: { url: string }
}

/** open_url 动作出口的 scheme 白名单（动态值在校验期无法预知，必须在出口复验）。 */
export function isSafeExternalUrl(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url) || /^mailto:\S+$/i.test(url)
}

export function applyActions(
  actions: EkkoUIAction | EkkoUIAction[],
  state: EkkoUIState,
  event?: EkkoUIJsonValue,
): EkkoUIActionOutcome {
  const list = Array.isArray(actions) ? actions : [actions]
  const outcome: EkkoUIActionOutcome = {}
  const budget: EvalBudget = { steps: 0 }
  for (const action of list) {
    const ctx: EkkoUIExpressionContext = { state, event }
    try {
      switch (action.type) {
      case 'state.set': {
        if (!isSafeStatePath(action.path)) break
        setStateValue(state, action.path, evaluateExpression(action.value, ctx) ?? null)
        break
      }
      case 'state.merge': {
        if (!isSafeStatePath(action.path)) break
        const current = getStateValue(state, action.path)
        const patch = evaluateExpression(action.value, ctx)
        if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
          const base = current && typeof current === 'object' && !Array.isArray(current)
            ? current as Record<string, EkkoUIJsonValue>
            : {}
          setStateValue(state, action.path, { ...base, ...patch })
        }
        break
      }
      case 'state.toggle': {
        if (!isSafeStatePath(action.path)) break
        setStateValue(state, action.path, !truthy(getStateValue(state, action.path)))
        break
      }
      case 'array.append': {
        if (!isSafeStatePath(action.path)) break
        const current = getStateValue(state, action.path)
        const list = Array.isArray(current) ? current.slice() : []
        list.push(evaluateExpression(action.value, ctx) ?? null)
        setStateValue(state, action.path, list)
        break
      }
      case 'array.remove': {
        if (!isSafeStatePath(action.path)) break
        const current = getStateValue(state, action.path)
        const index = Number(evaluateExpression(action.index, ctx))
        if (Array.isArray(current) && Number.isInteger(index) && index >= 0 && index < current.length) {
          const list = current.slice()
          list.splice(index, 1)
          setStateValue(state, action.path, list)
        }
        break
      }
      case 'surface.submit': {
        const payload = evaluateExpression(action.payload, ctx)
        outcome.submit = { actionId: action.actionId, payload: payload === undefined ? cloneJson(state) : payload }
        break
      }
      case 'surface.cancel':
        outcome.cancel = { actionId: action.actionId }
        break
      case 'surface.close':
        outcome.close = true
        break
      case 'surface.turn': {
        const text = evalExpr(action.text, ctx, budget)
        if (typeof text === 'string' && text.trim()) outcome.turn = { text }
        break
      }
      case 'surface.copy': {
        const text = evalExpr(action.text, ctx, budget)
        // 标量 stringify（复制数字/布尔是合法场景）；null/undefined/对象不复制
        if (typeof text === 'string') outcome.copy = { text }
        else if (typeof text === 'number' || typeof text === 'boolean') outcome.copy = { text: String(text) }
        break
      }
      case 'surface.open_url': {
        const url = evalExpr(action.url, ctx, budget)
        if (typeof url === 'string' && isSafeExternalUrl(url)) outcome.openUrl = { url }
        break
      }
      case 'tabs.open':
        setStateValue(state, `__tabs.${action.nodeId}`, action.value)
        break
      default:
        break
      }
    } catch (error) {
      // 预算耗尽：保留已产生的 outcome，放弃本动作及后续动作（fail-soft）
      if (error instanceof ExpressionBudgetExceeded) break
      throw error
    }
  }
  return outcome
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function byteLength(value: unknown): number {
  // 预算化估算：DAG 型输入（共享子树）经 JSON.stringify 会按引用路径数展开——
  // 40 层共享 if 就是 2^40 个节点，stringify 直接把校验挂死（2026-11-24 实测）。
  // 改为带访问上限的递归估算：共享子树按出现次数重复计（与序列化语义一致），
  // 访问超上限直接视为超限（fail 方向与安全一致）。
  let visits = 0
  const MAX_VISITS = 100_000
  const estimate = (v: unknown): number => {
    if (++visits > MAX_VISITS) return Number.MAX_SAFE_INTEGER
    if (v === null || v === undefined) return 4
    switch (typeof v) {
      case 'string': return v.length + 2
      case 'number':
      case 'boolean': return 8
      case 'object': {
        if (Array.isArray(v)) {
          let sum = 2
          for (const item of v) sum += estimate(item) + 1
          return sum
        }
        let sum = 2
        for (const [key, item] of Object.entries(v as Record<string, unknown>)) {
          sum += key.length + 4 + estimate(item)
        }
        return sum
      }
      default: return 8
    }
  }
  try {
    return estimate(value)
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

function isPlainObject(value: unknown): value is Record<string, EkkoUIJsonValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

interface ValidationSink {
  errors: EkkoUIValidationError[]
}

function fail(sink: ValidationSink, path: string, code: string, message: string): void {
  if (sink.errors.length < 50) sink.errors.push({ path, code, message })
}

function validateExpression(expr: unknown, path: string, sink: ValidationSink, version: 1 | 2, depth = 0, visits?: { count: number }): void {
  // 访问预算：深度限制挡不住 DAG 型输入（同一对象经 then/else 多路径重复访问，
  // 2^32 条路径会把校验拖死）——按访问次数收口，耗尽即抛出立即展开递归。
  const budget = visits ?? { count: 0 }
  if (++budget.count > EKKO_UI_LIMITS.maxExpressionSteps) throw new ExpressionBudgetExceeded('steps')
  if (depth > EKKO_UI_LIMITS.maxExpressionDepth) throw new ExpressionBudgetExceeded('depth')
  if (!isPlainObject(expr)) return fail(sink, path, 'expression.invalid', '表达式必须是对象')
  const kind = (expr as Record<string, unknown>).kind
  if (version === 1 && typeof kind === 'string' && V2_EXPRESSION_KINDS.has(kind)) {
    return fail(sink, path, 'expression.unknown', `未知表达式类型：${kind}（v1 不支持，需 ekko-ui/v2；v1 可用：${expressionKinds(1)}）`)
  }
  switch (kind) {
    case 'literal':
      return
    case 'state':
    case 'event': {
      const p = (expr as Record<string, unknown>).path
      if (typeof p !== 'string' || !isSafeStatePath(p)) {
        fail(sink, path, 'expression.path', '表达式路径不合法（禁止原型污染片段）')
      }
      return
    }
    case 'equals':
      validateExpression((expr as Record<string, unknown>).left, `${path}.left`, sink, version, depth + 1, budget)
      validateExpression((expr as Record<string, unknown>).right, `${path}.right`, sink, version, depth + 1, budget)
      return
    case 'not':
      validateExpression((expr as Record<string, unknown>).value, `${path}.value`, sink, version, depth + 1, budget)
      return
    case 'and':
    case 'or': {
      const values = (expr as Record<string, unknown>).values
      if (!Array.isArray(values) || values.length > 32) {
        return fail(sink, path, 'expression.values', '逻辑表达式需要 1-32 个子表达式')
      }
      values.forEach((value, index) => validateExpression(value, `${path}.values[${index}]`, sink, version, depth + 1, budget))
      return
    }
    case 'var': {
      const name = (expr as Record<string, unknown>).name
      if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(name)) {
        fail(sink, `${path}.name`, 'expression.var', 'var 变量名必须是 1-32 位标识符')
      }
      const p = (expr as Record<string, unknown>).path
      if (p !== undefined && (typeof p !== 'string' || !isSafeStatePath(p))) {
        fail(sink, `${path}.path`, 'expression.path', 'var 路径不合法')
      }
      return
    }
    case 'arith': {
      const op = (expr as Record<string, unknown>).op
      if (typeof op !== 'string' || !['+', '-', '*', '/', '%'].includes(op)) {
        fail(sink, `${path}.op`, 'expression.op', 'arith 运算符必须是 + - * / %')
      }
      validateExpression((expr as Record<string, unknown>).left, `${path}.left`, sink, version, depth + 1, budget)
      validateExpression((expr as Record<string, unknown>).right, `${path}.right`, sink, version, depth + 1, budget)
      return
    }
    case 'compare': {
      const op = (expr as Record<string, unknown>).op
      if (typeof op !== 'string' || !['>', '>=', '<', '<='].includes(op)) {
        fail(sink, `${path}.op`, 'expression.op', 'compare 运算符必须是 > >= < <=')
      }
      validateExpression((expr as Record<string, unknown>).left, `${path}.left`, sink, version, depth + 1, budget)
      validateExpression((expr as Record<string, unknown>).right, `${path}.right`, sink, version, depth + 1, budget)
      return
    }
    case 'format': {
      validateExpression((expr as Record<string, unknown>).value, `${path}.value`, sink, version, depth + 1, budget)
      const as = (expr as Record<string, unknown>).as
      if (typeof as !== 'string' || !['number', 'currency', 'percent', 'date'].includes(as)) {
        fail(sink, `${path}.as`, 'expression.format', 'format.as 必须是 number/currency/percent/date')
      }
      const decimals = (expr as Record<string, unknown>).decimals
      if (decimals !== undefined && (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 6)) {
        fail(sink, `${path}.decimals`, 'expression.format', 'decimals 必须是 0-6 的整数')
      }
      const currency = (expr as Record<string, unknown>).currency
      if (currency !== undefined && (typeof currency !== 'string' || currency.length > 8)) {
        fail(sink, `${path}.currency`, 'expression.format', 'currency 必须是不超过 8 字符的字符串')
      }
      return
    }
    case 'length':
      validateExpression((expr as Record<string, unknown>).value, `${path}.value`, sink, version, depth + 1, budget)
      return
    case 'concat':
    case 'coalesce':
    case 'array': {
      const values = (expr as Record<string, unknown>).values
      if (!Array.isArray(values) || values.length > 32 || (kind !== 'array' && values.length === 0)) {
        return fail(sink, path, 'expression.values', `${kind} 需要 ${kind === 'array' ? '0' : '1'}-32 个子表达式`)
      }
      values.forEach((value, index) => validateExpression(value, `${path}.values[${index}]`, sink, version, depth + 1, budget))
      return
    }
    case 'if':
      validateExpression((expr as Record<string, unknown>).cond, `${path}.cond`, sink, version, depth + 1, budget)
      validateExpression((expr as Record<string, unknown>).then, `${path}.then`, sink, version, depth + 1, budget)
      validateExpression((expr as Record<string, unknown>).else, `${path}.else`, sink, version, depth + 1, budget)
      return
    case 'map': {
      validateExpression((expr as Record<string, unknown>).list, `${path}.list`, sink, version, depth + 1, budget)
      const item = (expr as Record<string, unknown>).item
      if (typeof item !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(item)) {
        fail(sink, `${path}.item`, 'expression.map', 'map.item 必须是 1-32 位标识符')
      }
      const index = (expr as Record<string, unknown>).index
      if (index !== undefined && (typeof index !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(index) || index === item)) {
        fail(sink, `${path}.index`, 'expression.map', 'map.index 必须是与 item 不同的标识符')
      }
      validateExpression((expr as Record<string, unknown>).body, `${path}.body`, sink, version, depth + 1, budget)
      return
    }
    case 'object': {
      const fields = (expr as Record<string, unknown>).fields
      if (!isPlainObject(fields)) return fail(sink, `${path}.fields`, 'expression.object', 'object.fields 必须是对象')
      const entries = Object.entries(fields)
      if (entries.length > 32) return fail(sink, `${path}.fields`, 'expression.object', 'object.fields 最多 32 个字段')
      for (const [key, field] of entries) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || UNSAFE_PATH_SEGMENTS.has(key)) {
          fail(sink, `${path}.fields.${key}`, 'expression.object', `字段名不合法：${key}`)
          continue
        }
        validateExpression(field, `${path}.fields.${key}`, sink, version, depth + 1, budget)
      }
      return
    }
    default:
      return fail(sink, path, 'expression.unknown', `未知表达式类型：${String(kind)}（可用：${expressionKinds(version)}）`)
  }
}

function validateAction(action: unknown, path: string, sink: ValidationSink, version: 1 | 2): void {
  if (!isPlainObject(action)) return fail(sink, path, 'action.invalid', '动作必须是对象')
  const type = (action as Record<string, unknown>).type
  if (typeof type !== 'string' || !ACTION_TYPES.has(type)) {
    return fail(sink, path, 'action.unknown', `未知动作类型：${String(type)}（可用：${actionTypes(version)}）`)
  }
  if (version === 1 && V2_ACTION_TYPES.has(type)) {
    return fail(sink, path, 'action.unknown', `未知动作类型：${type}（v1 不支持，需 ekko-ui/v2；v1 可用：${actionTypes(1)}）`)
  }
  const record = action as Record<string, unknown>
  switch (type) {
    case 'state.set':
    case 'state.merge':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      validateExpression(record.value, `${path}.value`, sink, version)
      return
    case 'state.toggle':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      return
    case 'array.append':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      validateExpression(record.value, `${path}.value`, sink, version)
      return
    case 'array.remove':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      validateExpression(record.index, `${path}.index`, sink, version)
      return
    case 'surface.submit':
      if (typeof record.actionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.actionId)) {
        fail(sink, `${path}.actionId`, 'action.actionId', 'actionId 必须是 1-64 位安全标识符')
      }
      validateExpression(record.payload, `${path}.payload`, sink, version)
      return
    case 'surface.cancel':
      if (typeof record.actionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.actionId)) {
        fail(sink, `${path}.actionId`, 'action.actionId', 'actionId 必须是 1-64 位安全标识符')
      }
      return
    case 'surface.turn':
    case 'surface.copy':
      validateExpression(record.text, `${path}.text`, sink, version)
      return
    case 'surface.open_url':
      validateExpression(record.url, `${path}.url`, sink, version)
      return
    case 'tabs.open':
      if (typeof record.nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.nodeId)) {
        fail(sink, `${path}.nodeId`, 'action.nodeId', 'nodeId 必须是 1-64 位安全标识符')
      }
      if (typeof record.value !== 'string' || !record.value || record.value.length > 80) {
        fail(sink, `${path}.value`, 'action.value', 'value 必须是 1-80 字符的字符串')
      }
      return
    default:
      return
  }
}

function validateStyle(style: unknown, path: string, sink: ValidationSink): void {
  if (!isPlainObject(style)) return fail(sink, path, 'style.invalid', 'style 必须是对象')
  for (const [key, value] of Object.entries(style)) {
    if (!(key in STYLE_ENUMS)) {
      fail(sink, `${path}.${key}`, 'style.unknown', `未知样式字段：${key}`)
      continue
    }
    if (key === 'columns') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 6) {
        fail(sink, `${path}.${key}`, 'style.range', 'columns 必须是 1-6 的数字')
      }
      continue
    }
    const allowed = STYLE_ENUMS[key as keyof EkkoUIStyle]
    if (typeof value !== 'string' || !allowed?.includes(value)) {
      fail(sink, `${path}.${key}`, 'style.enum', `${key} 取值不合法`)
    }
  }
}

function validateProps(def: EkkoUIComponentDefinition, props: unknown, path: string, sink: ValidationSink, version: 1 | 2): void {
  if (props === undefined) {
    for (const [key, rule] of Object.entries(def.props)) {
      if (rule.required) fail(sink, `${path}.${key}`, 'prop.required', `缺少必填属性：${key}`)
    }
    return
  }
  if (!isPlainObject(props)) return fail(sink, path, 'props.invalid', 'props 必须是对象')
  for (const [key, value] of Object.entries(props)) {
    const rule = def.props[key]
    if (!rule) {
      const available = Object.keys(def.props)
      fail(sink, `${path}.${key}`, 'prop.unknown', `组件 ${def.type} 不支持属性：${key}（可用：${available.length ? available.join(' ') : '无'}）`)
      continue
    }
    if (!checkPropValue(rule, value, `${path}.${key}`, sink, version)) {
      fail(sink, `${path}.${key}`, 'prop.type', `属性 ${key} 类型或取值不合法`)
    }
    if (def.type === 'image' && key === 'src' && typeof value === 'string' && !isSafeImageSrc(value)) {
      fail(sink, `${path}.${key}`, 'prop.scheme', 'image.src 只允许 https: 或 data:image/*;base64,')
    }
    if (rule.type === 'json' && key === 'options') validateOptions(value, `${path}.${key}`, sink)
  }
  for (const [key, rule] of Object.entries(def.props)) {
    if (rule.required && !(key in props)) fail(sink, `${path}.${key}`, 'prop.required', `缺少必填属性：${key}`)
  }
}

/** image.src 静态值白名单；动态绑定（$state/$template/$expr）在渲染出口复验。 */
export function isSafeImageSrc(src: string): boolean {
  return /^https:\/\/\S+$/i.test(src) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]*$/i.test(src)
}

/** 绑定包装：{$state: path} / {$template: 文本} / {$expr: 表达式（v2）}。 */
function bindingWrapper(value: unknown): '$state' | '$template' | '$expr' | null {
  if (!isPlainObject(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 1) return null
  return keys[0] === '$state' || keys[0] === '$template' || keys[0] === '$expr' ? keys[0] : null
}

function checkPropValue(rule: EkkoUIPropRule, value: EkkoUIJsonValue, path: string, sink: ValidationSink, version: 1 | 2): boolean {
  const wrapper = bindingWrapper(value)
  if (wrapper === '$state') {
    const p = (value as Record<string, unknown>).$state
    return typeof p === 'string' && isSafeStatePath(p)
  }
  if (wrapper === '$template') {
    const template = (value as Record<string, unknown>).$template
    if (typeof template !== 'string' || template.length > EKKO_UI_LIMITS.maxStringLength) return false
    return [...template.matchAll(/\{([A-Za-z_][A-Za-z0-9_.]{0,63})\}/g)].every(match => isSafeStatePath(match[1]))
  }
  if (wrapper === '$expr') {
    if (version !== 2) return false
    validateExpression((value as Record<string, unknown>).$expr, `${path}.$expr`, sink, version)
    return true
  }
  switch (rule.type) {
    case 'string':
      return typeof value === 'string' && value.length <= (rule.maxLength ?? EKKO_UI_LIMITS.maxStringLength)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        && (rule.min === undefined || value >= rule.min)
        && (rule.max === undefined || value <= rule.max)
    case 'boolean':
      return typeof value === 'boolean'
    case 'enum':
      return typeof value === 'string' && !!rule.values?.includes(value)
    case 'json':
      return isPlainObject(value) || Array.isArray(value) || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    default:
      return false
  }
}

function validateOptions(value: EkkoUIJsonValue, path: string, sink: ValidationSink): void {
  if (bindingWrapper(value)) return // 动态绑定：形状在运行期由渲染器容错
  if (!Array.isArray(value)) return fail(sink, path, 'options.invalid', 'options 必须是数组')
  if (value.length === 0 || value.length > EKKO_UI_LIMITS.maxOptionsPerInput) {
    fail(sink, path, 'options.length', `options 需要 1-${EKKO_UI_LIMITS.maxOptionsPerInput} 项`)
  }
  value.forEach((option, index) => {
    if (typeof option === 'string') return
    if (!isPlainObject(option) || typeof option.label !== 'string' || option.label.length === 0) {
      fail(sink, `${path}[${index}]`, 'options.item', '选项必须是字符串或 {label, value}')
    }
  })
}

export function validateSpec(input: unknown): EkkoUIValidationResult {
  const sink: ValidationSink = { errors: [] }
  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: '', code: 'spec.invalid', message: 'spec 必须是对象' }] }
  }
  const version: 1 | 2 = input.protocol === EKKO_UI_PROTOCOL_V2 ? 2 : 1
  if (input.protocol !== EKKO_UI_PROTOCOL && input.protocol !== EKKO_UI_PROTOCOL_V2) {
    fail(sink, 'protocol', 'spec.protocol', `protocol 必须是 ${EKKO_UI_PROTOCOL} 或 ${EKKO_UI_PROTOCOL_V2}`)
  }
  if (typeof input.surfaceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.surfaceId)) {
    fail(sink, 'surfaceId', 'spec.surfaceId', 'surfaceId 必须是 1-64 位字母/数字/下划线/短横线')
  }
  if (typeof input.fallbackText !== 'string' || !input.fallbackText.trim() || input.fallbackText.length > EKKO_UI_LIMITS.maxStringLength) {
    fail(sink, 'fallbackText', 'spec.fallbackText', 'fallbackText 必填且不超过长度上限')
  }
  if (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 200)) {
    fail(sink, 'title', 'spec.title', 'title 必须是不超过 200 字的字符串')
  }
  if (byteLength(input) > EKKO_UI_LIMITS.maxSpecBytes) {
    fail(sink, '', 'spec.bytes', `spec 超过 ${EKKO_UI_LIMITS.maxSpecBytes} 字节上限`)
  }
  if (input.state !== undefined) {
    if (!isPlainObject(input.state)) {
      fail(sink, 'state', 'spec.state', 'state 必须是对象')
    } else if (byteLength(input.state) > EKKO_UI_LIMITS.maxStateBytes) {
      fail(sink, 'state', 'state.bytes', `state 超过 ${EKKO_UI_LIMITS.maxStateBytes} 字节上限`)
    }
  }
  if (input.submitSchema !== undefined && !isPlainObject(input.submitSchema)) {
    fail(sink, 'submitSchema', 'spec.submitSchema', 'submitSchema 必须是对象')
  }

  const ids = new Set<string>()
  let nodeCount = 0
  const seen = new Set<unknown>()

  const walk = (node: unknown, path: string, depth: number, parentType?: string): void => {
    if (nodeCount >= EKKO_UI_LIMITS.maxNodes) {
      fail(sink, path, 'nodes.limit', `节点数超过 ${EKKO_UI_LIMITS.maxNodes}`)
      return
    }
    if (depth > EKKO_UI_LIMITS.maxDepth) {
      fail(sink, path, 'depth.limit', `嵌套深度超过 ${EKKO_UI_LIMITS.maxDepth}`)
      return
    }
    if (!isPlainObject(node)) return fail(sink, path, 'node.invalid', '节点必须是对象')
    if (seen.has(node)) return fail(sink, path, 'node.cycle', '节点树不能包含循环引用')
    seen.add(node)
    nodeCount++

    if (typeof node.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(node.id)) {
      fail(sink, `${path}.id`, 'node.id', '节点 id 必须是 1-64 位安全标识符')
    } else if (ids.has(node.id)) {
      fail(sink, `${path}.id`, 'node.id.duplicate', `节点 id 重复：${node.id}`)
    } else {
      ids.add(node.id)
    }
    const nodeType = typeof node.type === 'string' ? node.type : ''
    if (version === 1 && V2_COMPONENT_TYPES.has(nodeType)) {
      return fail(sink, `${path}.type`, 'node.type.unknown', `未知组件：${nodeType}（v1 不支持，需 ekko-ui/v2；v1 可用：${catalogTypes(1)}）`)
    }
    const def = catalogDefinition(nodeType)
    if (!def) {
      return fail(sink, `${path}.type`, 'node.type.unknown', `未知组件：${String(node.type)}（可用：${catalogTypes(version)}）`)
    }
    if (nodeType === 'tab-panel' && parentType !== 'tabs') {
      fail(sink, `${path}.type`, 'node.parent', 'tab-panel 必须位于 tabs 内')
    }
    if (nodeType === 'tabs' && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (isPlainObject(child) && child.type !== 'tab-panel') {
          fail(sink, `${path}.children`, 'node.parent', 'tabs 只接受 tab-panel 子节点')
          break
        }
      }
    }
    validateProps(def, node.props, `${path}.props`, sink, version)
    if (node.style !== undefined) validateStyle(node.style, `${path}.style`, sink)
    if (node.bind !== undefined) {
      if (typeof node.bind !== 'string' || !isSafeStatePath(node.bind) || !def.bindValueType) {
        fail(sink, `${path}.bind`, 'node.bind', `组件 ${def.type} 不支持 bind 或路径不合法`)
      }
    }
    if (node.visibleWhen !== undefined) validateExpression(node.visibleWhen, `${path}.visibleWhen`, sink, version)
    if (node.events !== undefined) {
      if (!isPlainObject(node.events)) {
        fail(sink, `${path}.events`, 'node.events', 'events 必须是对象')
      } else {
        for (const [eventName, actions] of Object.entries(node.events)) {
          if (!def.events.includes(eventName)) {
            fail(sink, `${path}.events.${eventName}`, 'node.event.unknown',
              `组件 ${def.type} 不支持事件：${eventName}（${def.events.length ? `可用：${def.events.join(' ')}` : '该组件不可交互，可用事件：无'}）`)
            continue
          }
          const list = Array.isArray(actions) ? actions : [actions]
          if (list.length > 16) fail(sink, `${path}.events.${eventName}`, 'node.events.length', '单个事件最多 16 个动作')
          list.forEach((action, index) => validateAction(action, `${path}.events.${eventName}[${index}]`, sink, version))
        }
      }
    }
    if (node.children !== undefined) {
      if (!def.acceptsChildren) {
        fail(sink, `${path}.children`, 'node.children', `组件 ${def.type} 不接受子节点`)
        return
      }
      if (!Array.isArray(node.children)) {
        fail(sink, `${path}.children`, 'node.children', 'children 必须是数组')
        return
      }
      if (node.children.length > EKKO_UI_LIMITS.maxChildrenPerNode) {
        fail(sink, `${path}.children`, 'node.children.limit', `子节点数超过 ${EKKO_UI_LIMITS.maxChildrenPerNode}`)
      }
      node.children.forEach((child, index) => walk(child, `${path}.children[${index}]`, depth + 1, nodeType))
    } else if (def.acceptsChildren === true && node.type !== 'button-group') {
      // 容器允许无子节点（渲染空容器），不强制。
    }
  }

  if (!isPlainObject(input.root)) {
    fail(sink, 'root', 'spec.root', 'root 必须是对象')
  } else {
    try {
      walk(input.root, 'root', 0)
    } catch (error) {
      if (error instanceof ExpressionBudgetExceeded) {
        fail(sink, '', error.kind === 'depth' ? 'expression.depth' : 'expression.steps',
          error.kind === 'depth'
            ? `表达式嵌套超过 ${EKKO_UI_LIMITS.maxExpressionDepth} 层`
            : `表达式访问数超过 ${EKKO_UI_LIMITS.maxExpressionSteps}（疑似共享子树构造）`)
      } else {
        throw error
      }
    }
  }

  if (sink.errors.length) return { ok: false, errors: sink.errors }
  return { ok: true, spec: input as unknown as EkkoUISpec, errors: [] }
}

// ---------------------------------------------------------------------------
// Tool message bridge
// ---------------------------------------------------------------------------

export const SURFACE_TOOL_BASENAME = 'show_surface'
/** 批二：非阻塞创建工具——它的工具消息是持久界面在时间线上的锚点。 */
export const PERSISTENT_SURFACE_TOOL_BASENAME = 'surface_create'

/** MCP 工具名可能带 mcp__server__ 前缀，也可能被客户端改名；归一到去掉服务前缀的末段。 */
function surfaceToolBasename(name: unknown): string {
  if (typeof name !== 'string') return ''
  const base = name.split('__').pop() || name
  return base.replace(/^ekko_studio_/, '').replace(/^ekko-/, '').replace(/-/g, '_')
}

/** 工具消息是否渲染为界面卡片：阻塞式 show_surface 与持久式 surface_create。
 *  surface_update / surface_inspect / surface_close / surface_catalog 是普通工具轨迹。 */
export function isSurfaceToolName(name: unknown): boolean {
  const base = surfaceToolBasename(name)
  return base === SURFACE_TOOL_BASENAME || base === 'ui_surface' || base === PERSISTENT_SURFACE_TOOL_BASENAME
}

export function isPersistentSurfaceToolName(name: unknown): boolean {
  return surfaceToolBasename(name) === PERSISTENT_SURFACE_TOOL_BASENAME
}

export function isBlockingSurfaceToolName(name: unknown): boolean {
  const base = surfaceToolBasename(name)
  return base === SURFACE_TOOL_BASENAME || base === 'ui_surface'
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value
  try { return JSON.parse(trimmed) } catch { return value }
}

/** 从工具调用参数中提取 spec；容忍字符串化参数与嵌套 arguments。 */
export function extractSurfaceSpec(args: unknown): { spec?: unknown; title?: string; fallbackText?: string } {
  const parsed = parseMaybeJson(args)
  if (!isPlainObject(parsed)) return {}
  const nested = parseMaybeJson(parsed.arguments)
  const source: Record<string, unknown> = isPlainObject(nested) ? { ...parsed, ...nested } : parsed
  const spec = parseMaybeJson(source.spec)
  return {
    spec,
    title: typeof source.title === 'string' ? source.title : undefined,
    fallbackText: typeof source.fallback_text === 'string' ? source.fallback_text : undefined,
  }
}

export interface SurfaceToolResult {
  status: EkkoUISubmissionStatus | 'pending'
  surfaceId?: string
  revision?: number
  actionId?: string
  payload?: EkkoUIJsonValue
  reason?: string
  error?: string
}

/** 解析 show_surface 工具结果；无法识别时返回 null（调用方显示 fallback）。 */
export function parseSurfaceToolResult(output: unknown): SurfaceToolResult | null {
  const parsed = parseMaybeJson(output)
  if (!isPlainObject(parsed)) return null
  const nested = parseMaybeJson(parsed.result)
  const source: Record<string, unknown> = isPlainObject(nested) ? { ...parsed, ...nested } : parsed
  const status = source.status
  const allowed: SurfaceToolResult['status'][] = ['submitted', 'cancelled', 'expired', 'closed', 'pending']
  if (typeof status === 'string' && (allowed as string[]).includes(status)) {
    return {
      status: status as SurfaceToolResult['status'],
      surfaceId: typeof source.surface_id === 'string' ? source.surface_id : undefined,
      revision: typeof source.revision === 'number' ? source.revision : undefined,
      actionId: typeof source.action_id === 'string' ? source.action_id : undefined,
      payload: source.payload as EkkoUIJsonValue | undefined,
      reason: typeof source.reason === 'string' ? source.reason : undefined,
      error: typeof source.error === 'string' ? source.error : undefined,
    }
  }
  if (typeof source.error === 'string') return { status: 'closed', error: source.error }
  return null
}

/** 服务端与客户端共用的 surface_id 公式（v1 单挂起约束下可预测）。 */
export function surfaceIdFor(sessionId: string, specSurfaceId: string): string {
  return `srf:${sessionId}:${specSurfaceId}`
}

// ---------------------------------------------------------------------------
// 可修复错误（v2 批二）
// ---------------------------------------------------------------------------

/** 把校验错误压成一句话。MCP 脚本只把响应体的 error 一句话带回模型，
 *  所以修复所需的路径与原因要全部落在这句里。 */
export function formatValidationErrors(errors: readonly EkkoUIValidationError[], max = 5): string {
  const shown = errors.slice(0, max).map(error => `${error.path || 'spec'}：${error.message}`)
  const rest = errors.length - shown.length
  return `${errors.length} 处问题——${shown.join('；')}${rest > 0 ? `；另有 ${rest} 处` : ''}`
}

// ---------------------------------------------------------------------------
// Patches（v2 批二：按稳定节点 id 续改；spec D4）
// ---------------------------------------------------------------------------

export const EKKO_UI_PATCH_OPS = ['set-props', 'set-style', 'replace-node', 'insert-child', 'remove-node', 'set-state'] as const
export type EkkoUIPatchOp = (typeof EKKO_UI_PATCH_OPS)[number]

export type EkkoUIPatch =
  /** 合并写入指定属性，未给出的属性保留。 */
  | { op: 'set-props'; nodeId: string; props: Record<string, EkkoUIJsonValue> }
  /** 整体替换样式。 */
  | { op: 'set-style'; nodeId: string; style: EkkoUIStyle }
  /** 整节点替换；node.id 必须等于 nodeId，保持 id 稳定。 */
  | { op: 'replace-node'; nodeId: string; node: EkkoUINode }
  /** 插入子节点：有 afterId 时插在它之后，否则追加到末尾。 */
  | { op: 'insert-child'; parentId: string; afterId?: string; node: EkkoUINode }
  /** 删除节点；根节点不可删。 */
  | { op: 'remove-node'; nodeId: string }
  /** 改状态初值。 */
  | { op: 'set-state'; path: string; value: EkkoUIJsonValue }

export interface EkkoUIPatchResult {
  ok: boolean
  spec?: EkkoUISpec
  errors: EkkoUIValidationError[]
  /** 受影响的节点 id，去重，按首次出现排序；状态改动记作 state:<路径>。 */
  changed: string[]
}

const NODE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_PATCH_ERRORS = 50

function isJsonValue(value: unknown, depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (depth > EKKO_UI_LIMITS.maxDepth) return false
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1))
  if (isPlainObject(value)) return Object.values(value).every(item => isJsonValue(item, depth + 1))
  return false
}

/** 补丁的形状校验：操作名、必填字段、标识符格式、取值是否为合法 JSON。 */
export function validateSurfacePatches(patches: unknown): EkkoUIValidationError[] {
  const sink: ValidationSink = { errors: [] }
  if (!Array.isArray(patches) || patches.length === 0) {
    return [{ path: 'patches', code: 'patches.invalid', message: `patches 必须是 1-${EKKO_UI_LIMITS.maxPatchOperations} 条补丁的数组` }]
  }
  if (patches.length > EKKO_UI_LIMITS.maxPatchOperations) {
    return [{ path: 'patches', code: 'patches.limit', message: `补丁条数超过上限 ${EKKO_UI_LIMITS.maxPatchOperations}` }]
  }
  // 体积估算自带访问上限：共享子树型输入在深入遍历之前就被挡下
  if (byteLength(patches) > EKKO_UI_LIMITS.maxSpecBytes) {
    return [{ path: 'patches', code: 'patches.bytes', message: `补丁总体积超过 ${EKKO_UI_LIMITS.maxSpecBytes} 字节上限` }]
  }
  const needId = (value: unknown, path: string, code: string): boolean => {
    if (typeof value !== 'string' || !NODE_ID_RE.test(value)) {
      fail(sink, path, code, '必须是 1-64 位字母、数字、下划线或短横线')
      return false
    }
    return true
  }
  patches.forEach((patch, index) => {
    if (sink.errors.length >= MAX_PATCH_ERRORS) return
    const at = `patches[${index}]`
    if (!isPlainObject(patch)) return fail(sink, at, 'patch.invalid', '补丁必须是对象')
    const op = patch.op
    if (typeof op !== 'string' || !(EKKO_UI_PATCH_OPS as readonly string[]).includes(op)) {
      return fail(sink, `${at}.op`, 'patch.op.unknown', `未知补丁操作：${String(op)}（可用：${EKKO_UI_PATCH_OPS.join(' ')}）`)
    }
    switch (op) {
      case 'set-props':
        needId(patch.nodeId, `${at}.nodeId`, 'patch.nodeId')
        if (!isPlainObject(patch.props) || Object.keys(patch.props).some(key => !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key))) {
          fail(sink, `${at}.props`, 'patch.props', 'props 必须是属性名到取值的对象')
        }
        return
      case 'set-style':
        needId(patch.nodeId, `${at}.nodeId`, 'patch.nodeId')
        if (!isPlainObject(patch.style)) fail(sink, `${at}.style`, 'patch.style', 'style 必须是对象')
        return
      case 'replace-node':
        needId(patch.nodeId, `${at}.nodeId`, 'patch.nodeId')
        if (!isPlainObject(patch.node) || typeof patch.node.id !== 'string') fail(sink, `${at}.node`, 'patch.node', 'node 必须是带字符串 id 的节点对象')
        return
      case 'insert-child': {
        needId(patch.parentId, `${at}.parentId`, 'patch.parentId')
        if (patch.afterId !== undefined) needId(patch.afterId, `${at}.afterId`, 'patch.afterId')
        if (!isPlainObject(patch.node) || typeof patch.node.id !== 'string') fail(sink, `${at}.node`, 'patch.node', 'node 必须是带字符串 id 的节点对象')
        return
      }
      case 'remove-node':
        needId(patch.nodeId, `${at}.nodeId`, 'patch.nodeId')
        return
      case 'set-state':
        if (typeof patch.path !== 'string' || !isSafeStatePath(patch.path) || patch.path === '') {
          fail(sink, `${at}.path`, 'patch.state_path', '状态路径不合法或为空')
        }
        if (patch.value === undefined || !isJsonValue(patch.value)) fail(sink, `${at}.value`, 'patch.value', 'value 必须是合法的 JSON 值')
        return
      default:
    }
  })
  return sink.errors
}

interface FoundNode { node: EkkoUINode; parent: EkkoUINode | null }

function findNode(root: EkkoUINode, id: string): FoundNode | null {
  const queue: FoundNode[] = [{ node: root, parent: null }]
  while (queue.length) {
    const current = queue.shift()!
    if (current.node.id === id) return current
    for (const child of current.node.children || []) queue.push({ node: child, parent: current.node })
  }
  return null
}

function collectIds(root: EkkoUINode): string[] {
  const ids: string[] = []
  const walk = (node: EkkoUINode): void => {
    ids.push(node.id)
    for (const child of node.children || []) walk(child)
  }
  walk(root)
  return ids
}

/** 保留类型的深拷贝：只用于纯 JSON 数据（节点、样式、规格）。入参已经过形状校验，
 *  JSON 往返不会丢字段；与 cloneJson 的区别是返回值沿用入参的类型而不是通用 JSON 类型。 */
function cloneTyped<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 把补丁应用到规格上，再对结果整体重校验。不修改入参。
 * 补丁本身不合法、目标不存在、或打完后规格不合法，都返回 ok=false 与可修复的错误。
 */
export function applySurfacePatches(spec: EkkoUISpec, patches: unknown): EkkoUIPatchResult {
  const shapeErrors = validateSurfacePatches(patches)
  if (shapeErrors.length) return { ok: false, errors: shapeErrors, changed: [] }

  const state: EkkoUIState = spec.state ? cloneTyped(spec.state) : {}
  const next: EkkoUISpec = { ...spec, root: cloneTyped(spec.root), state }
  const changed: string[] = []
  const errors: EkkoUIValidationError[] = []
  const mark = (id: string): void => { if (!changed.includes(id)) changed.push(id) }
  const reject = (path: string, code: string, message: string): void => {
    if (errors.length < MAX_PATCH_ERRORS) errors.push({ path, code, message })
  }
  const missing = (at: string, id: string): void =>
    reject(at, 'patch.target_missing', `节点不存在：${id}（可用 id：${collectIds(next.root).join(' ')}）`)

  for (const [index, patch] of (patches as EkkoUIPatch[]).entries()) {
    if (errors.length >= MAX_PATCH_ERRORS) break
    const at = `patches[${index}]`
    switch (patch.op) {
      case 'set-props': {
        const found = findNode(next.root, patch.nodeId)
        if (!found) { missing(`${at}.nodeId`, patch.nodeId); break }
        found.node.props = { ...(found.node.props || {}), ...patch.props }
        mark(patch.nodeId)
        break
      }
      case 'set-style': {
        const found = findNode(next.root, patch.nodeId)
        if (!found) { missing(`${at}.nodeId`, patch.nodeId); break }
        found.node.style = { ...patch.style }
        mark(patch.nodeId)
        break
      }
      case 'replace-node': {
        if (patch.node.id !== patch.nodeId) {
          reject(`${at}.node.id`, 'patch.id_mismatch', `replace-node 的 node.id（${patch.node.id}）必须与 nodeId（${patch.nodeId}）一致`)
          break
        }
        const found = findNode(next.root, patch.nodeId)
        if (!found) { missing(`${at}.nodeId`, patch.nodeId); break }
        const replacement = cloneTyped(patch.node)
        if (!found.parent) next.root = replacement
        else found.parent.children = (found.parent.children || []).map(child => child.id === patch.nodeId ? replacement : child)
        mark(patch.nodeId)
        break
      }
      case 'insert-child': {
        const found = findNode(next.root, patch.parentId)
        if (!found) { missing(`${at}.parentId`, patch.parentId); break }
        if (!found.node.children) {
          if (!catalogDefinition(found.node.type)?.acceptsChildren) {
            reject(`${at}.parentId`, 'patch.parent_no_children', `组件 ${found.node.type} 不接受子节点，不能作为 parentId`)
            break
          }
          found.node.children = []
        }
        const children = found.node.children
        const inserted = cloneTyped(patch.node)
        if (patch.afterId !== undefined) {
          const position = children.findIndex(child => child.id === patch.afterId)
          if (position < 0) {
            reject(`${at}.afterId`, 'patch.after_id', `afterId 不是 ${patch.parentId} 的直接子节点：${patch.afterId}（可用：${children.map(child => child.id).join(' ') || '无'}）`)
            break
          }
          children.splice(position + 1, 0, inserted)
        } else {
          children.push(inserted)
        }
        mark(patch.parentId)
        mark(inserted.id)
        break
      }
      case 'remove-node': {
        const found = findNode(next.root, patch.nodeId)
        if (!found) { missing(`${at}.nodeId`, patch.nodeId); break }
        if (!found.parent) {
          reject(`${at}.nodeId`, 'patch.root_removed', '不能删除根节点')
          break
        }
        found.parent.children = (found.parent.children || []).filter(child => child.id !== patch.nodeId)
        mark(patch.nodeId)
        break
      }
      case 'set-state':
        setStateValue(state, patch.path, cloneTyped(patch.value))
        mark(`state:${patch.path}`)
        break
      default:
    }
  }
  if (errors.length) return { ok: false, errors, changed: [] }

  // 打完后整体重校验：补丁可能引入重复 id、非法父子关系、未知部件或超限
  const validation = validateSpec(next)
  if (!validation.ok) return { ok: false, errors: validation.errors, changed: [] }
  return { ok: true, spec: validation.spec, errors: [], changed }
}

// ---------------------------------------------------------------------------
// 回执摘要与续接消息（v2 批二）
// ---------------------------------------------------------------------------

function canonicalJson(value: EkkoUIJsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

/** 规格与状态初值的 32 位散列（FNV-1a），只用于识别版本，不作安全用途。
 *  标题与兜底文本不参与：它们不改变界面结构。 */
export function surfaceDigest(spec: EkkoUISpec): string {
  // 入参应是已通过校验的规格；体积估算自带访问上限，异常输入只会得到 overflow
  if (byteLength(spec) > EKKO_UI_LIMITS.maxSpecBytes * 4) return 'overflow'
  const text = canonicalJson(JSON.parse(JSON.stringify({ root: spec.root, state: spec.state ?? null })) as EkkoUIJsonValue)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** 持久界面提交后，客户端用它拼出新一轮的用户消息（spec D1）：
 *  模型需要的编号、版本、动作与提交内容都在一条普通消息里。 */
export function formatSurfaceTurnMessage(input: {
  title?: string
  surfaceId: string
  revision: number
  actionId: string
  payload?: EkkoUIJsonValue
}): string {
  const head = `【界面提交】${input.title ? `「${input.title}」` : '界面'}（surface_id=${input.surfaceId}，revision=${input.revision}，action=${input.actionId}）`
  if (input.payload === undefined) return head
  let body = JSON.stringify(input.payload, null, 1) ?? ''
  if (body.length > EKKO_UI_LIMITS.maxTurnPayloadChars) {
    const original = body.length
    body = `${body.slice(0, EKKO_UI_LIMITS.maxTurnPayloadChars)}…（已截断，原长 ${original}）`
  }
  return `${head}\n提交内容：\n${body}`
}

// ---------------------------------------------------------------------------
// 目录投影（v2 批二：目录工具的数据面，spec D8）
// ---------------------------------------------------------------------------

export interface EkkoUICatalogComponent {
  type: string
  category: string
  description: string
  acceptsChildren: boolean
  events: string[]
  bindValueType?: string
  /** 属性名到类型说明，形如 "number"、"enum(bar|line|pie)"；必填以 * 结尾。 */
  props: Record<string, string>
}

export interface EkkoUICatalog {
  protocols: string[]
  features: EkkoUICapabilities['features']
  limits: Record<string, number>
  specShape: string
  components: EkkoUICatalogComponent[]
  expressions: Array<{ kind: string; syntax: string }>
  actions: string[]
  notes: string[]
}

const EXPRESSION_SYNTAX: Array<{ kind: string; syntax: string }> = [
  { kind: 'literal', syntax: '{kind:"literal", value:<JSON 值>}' },
  { kind: 'state', syntax: '{kind:"state", path:"a.b"} —— 读状态路径' },
  { kind: 'event', syntax: '{kind:"event", path:"value"} —— 读事件参数' },
  { kind: 'equals', syntax: '{kind:"equals", left:<表达式>, right:<表达式>}' },
  { kind: 'not', syntax: '{kind:"not", value:<表达式>}' },
  { kind: 'and', syntax: '{kind:"and", values:[<表达式>, …]}' },
  { kind: 'or', syntax: '{kind:"or", values:[<表达式>, …]}' },
  { kind: 'var', syntax: '{kind:"var", name:"it", path:"qty"} —— 读 map 绑定的局部变量（v2）' },
  { kind: 'arith', syntax: '{kind:"arith", op:"+", left:<表达式>, right:<表达式>} —— op: + - * / %（v2）' },
  { kind: 'compare', syntax: '{kind:"compare", op:">", left:<表达式>, right:<表达式>} —— op: > >= < <=（v2）' },
  { kind: 'format', syntax: '{kind:"format", as:"currency", value:<表达式>, decimals?:2, currency?:"¥"} —— as: number currency percent date（v2）' },
  { kind: 'length', syntax: '{kind:"length", value:<表达式>}（v2）' },
  { kind: 'concat', syntax: '{kind:"concat", values:[<表达式>, …]} —— 拼成文本（v2）' },
  { kind: 'if', syntax: '{kind:"if", cond:<表达式>, then:<表达式>, else:<表达式>}（v2）' },
  { kind: 'coalesce', syntax: '{kind:"coalesce", values:[<表达式>, …]} —— 取第一个非空（v2）' },
  { kind: 'map', syntax: '{kind:"map", list:<表达式>, item:"it", index?:"i", body:<表达式>} —— 列表循环（v2）' },
  { kind: 'object', syntax: '{kind:"object", fields:{label:<表达式>, value:<表达式>}}（v2）' },
  { kind: 'array', syntax: '{kind:"array", values:[<表达式>, …]}（v2）' },
]

function propTypeText(rule: EkkoUIPropRule): string {
  let text: string = rule.type
  if (rule.type === 'enum' && rule.values?.length) text = `enum(${rule.values.join('|')})`
  else if (rule.type === 'number') {
    const bounds = [rule.min !== undefined ? `>=${rule.min}` : '', rule.max !== undefined ? `<=${rule.max}` : ''].filter(Boolean)
    if (bounds.length) text = `number(${bounds.join(' ')})`
  } else if (rule.type === 'string' && rule.maxLength !== undefined) text = `string(<=${rule.maxLength})`
  return rule.required ? `${text}*` : text
}

/** 目录投影：部件、表达式写法、动作、上限与能力位，从本文件的目录与常量直接生成。
 *  query 按部件类型、类别、说明与属性名做不区分大小写的包含匹配；category 精确匹配。 */
export function catalogProjection(options: { query?: string; category?: string } = {}): EkkoUICatalog {
  const query = options.query?.trim().toLowerCase() || ''
  const category = options.category?.trim() || ''
  const components = EKKO_UI_CATALOG.filter(def => {
    if (category && def.category !== category) return false
    if (!query) return true
    const haystack = [def.type, def.category, def.description, ...Object.keys(def.props)].join(' ').toLowerCase()
    return haystack.includes(query)
  }).map(def => ({
    type: def.type,
    category: def.category,
    description: def.description,
    acceptsChildren: def.acceptsChildren,
    events: [...def.events],
    ...(def.bindValueType ? { bindValueType: def.bindValueType } : {}),
    props: Object.fromEntries(Object.entries(def.props).map(([name, rule]) => [name, propTypeText(rule)])),
  }))
  const caps = clientCapabilities()
  return {
    protocols: caps.protocolVersions,
    features: caps.features,
    limits: Object.fromEntries(Object.entries(EKKO_UI_LIMITS)),
    specShape: '{protocol:"ekko-ui/v2", surfaceId:"稳定 slug", title?, fallbackText:"无法渲染时的兜底文本", state?:{…}, root:<节点>}',
    components,
    expressions: EXPRESSION_SYNTAX,
    actions: actionTypes(2).split(' '),
    notes: [
      '节点形状：{id, type, props?, style?, bind?, visibleWhen?, events?, children?}；id 在界面内唯一且稳定，补丁按 id 寻址。',
      '输入类部件用 bind 绑定状态路径（如 bind:"form.name"）；属性取值可以写 {$state:"路径"}、{$template:"共 {count} 项"} 或（v2）{$expr:<表达式>}。',
      'events 里写本地动作（state.set 等）；只有 surface.submit / surface.cancel / surface.turn / surface.copy / surface.open_url 会离开界面。',
      '未知部件、属性、事件、动作、表达式一律拒绝，校验错误会列出可用值。',
      'style 只接受枚举字段（display direction columns gap padding width align tone radius），不能写任意 CSS；不能发送 HTML、脚本或可执行地址。',
      'image.src 只允许 https: 或 data:image/*;base64；surface.open_url 只允许 https: 与 mailto:。',
      '上限：' + Object.entries(EKKO_UI_LIMITS).map(([key, value]) => `${key}=${value}`).join(' ') + '。',
      '规格保持紧凑；续改优先用补丁而不是整版重发。',
    ],
  }
}

// ---------------------------------------------------------------------------
// Capability negotiation
// ---------------------------------------------------------------------------

export interface EkkoUICapabilities {
  protocolVersions: string[]
  components: readonly EkkoUIComponentDefinition[]
  limits: typeof EKKO_UI_LIMITS
  features: {
    blocking: boolean
    persistent: boolean
    updates: boolean
    logicRuntime: boolean
    appBlock: boolean
  }
}

/**
 * 当前客户端的能力集。features 按批启用：批二已翻 persistent/updates，
 * 批三翻 logicRuntime，批四翻 appBlock——本函数是唯一的读取点。
 */
export function clientCapabilities(): EkkoUICapabilities {
  return {
    protocolVersions: [EKKO_UI_PROTOCOL, EKKO_UI_PROTOCOL_V2],
    components: EKKO_UI_CATALOG,
    limits: EKKO_UI_LIMITS,
    features: {
      blocking: true,
      persistent: true,
      updates: true,
      logicRuntime: false,
      appBlock: false,
    },
  }
}
