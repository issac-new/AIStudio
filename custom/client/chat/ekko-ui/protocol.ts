/**
 * Ekko UI Surface 协议核心（ekko-ui/v1 子集）。
 *
 * 单一事实源：组件目录、可用属性、事件、动作、限制、校验规则都在本文件。
 * 上游规划见 vendor/hermes-studio/packages/ekko-agent/docs/interactive-ui-plan.md；
 * 本实现只覆盖「一次 createSurface 携带完整组件树」的切片，增量 patch/Canvas 未实现。
 *
 * 约束：
 * - 纯 TS，无 DOM/Vue/Naive 依赖，可在浏览器、Node 与测试中直接使用。
 * - Agent 只发声明式 JSON：禁止 HTML、脚本、任意 CSS、事件属性与可执行 URL。
 * - 未知组件/属性/事件/动作一律拒绝；校验失败由宿主显示 fallbackText，不静默降级。
 */

export const EKKO_UI_PROTOCOL = 'ekko-ui/v1' as const

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

export type EkkoUIAction =
  | { type: 'state.set'; path: string; value: EkkoUIExpression }
  | { type: 'state.merge'; path: string; value: EkkoUIExpression }
  | { type: 'state.toggle'; path: string }
  | { type: 'array.append'; path: string; value: EkkoUIExpression }
  | { type: 'array.remove'; path: string; index: EkkoUIExpression }
  | { type: 'surface.submit'; actionId: string; payload: EkkoUIExpression }
  | { type: 'surface.cancel'; actionId: string }
  | { type: 'surface.close' }

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
  protocol: typeof EKKO_UI_PROTOCOL
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
])

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
}

export function evaluateExpression(expr: EkkoUIExpression, ctx: EkkoUIExpressionContext): EkkoUIJsonValue | undefined {
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
    case 'equals': return jsonEqual(evaluateExpression(expr.left, ctx), evaluateExpression(expr.right, ctx))
    case 'not': return !truthy(evaluateExpression(expr.value, ctx))
    case 'and': return expr.values.every(value => truthy(evaluateExpression(value, ctx)))
    case 'or': return expr.values.some(value => truthy(evaluateExpression(value, ctx)))
    default: return undefined
  }
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
}

export function applyActions(
  actions: EkkoUIAction | EkkoUIAction[],
  state: EkkoUIState,
  event?: EkkoUIJsonValue,
): EkkoUIActionOutcome {
  const list = Array.isArray(actions) ? actions : [actions]
  const outcome: EkkoUIActionOutcome = {}
  for (const action of list) {
    const ctx: EkkoUIExpressionContext = { state, event }
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
      default:
        break
    }
  }
  return outcome
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
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

function validateExpression(expr: unknown, path: string, sink: ValidationSink): void {
  if (!isPlainObject(expr)) return fail(sink, path, 'expression.invalid', '表达式必须是对象')
  const kind = (expr as Record<string, unknown>).kind
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
      validateExpression((expr as Record<string, unknown>).left, `${path}.left`, sink)
      validateExpression((expr as Record<string, unknown>).right, `${path}.right`, sink)
      return
    case 'not':
      validateExpression((expr as Record<string, unknown>).value, `${path}.value`, sink)
      return
    case 'and':
    case 'or': {
      const values = (expr as Record<string, unknown>).values
      if (!Array.isArray(values) || values.length > 32) {
        return fail(sink, path, 'expression.values', '逻辑表达式需要 1-32 个子表达式')
      }
      values.forEach((value, index) => validateExpression(value, `${path}.values[${index}]`, sink))
      return
    }
    default:
      return fail(sink, path, 'expression.unknown', `未知表达式类型：${String(kind)}`)
  }
}

function validateAction(action: unknown, path: string, sink: ValidationSink): void {
  if (!isPlainObject(action)) return fail(sink, path, 'action.invalid', '动作必须是对象')
  const type = (action as Record<string, unknown>).type
  if (typeof type !== 'string' || !ACTION_TYPES.has(type)) {
    return fail(sink, path, 'action.unknown', `未知动作类型：${String(type)}`)
  }
  const record = action as Record<string, unknown>
  switch (type) {
    case 'state.set':
    case 'state.merge':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      validateExpression(record.value, `${path}.value`, sink)
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
      validateExpression(record.value, `${path}.value`, sink)
      return
    case 'array.remove':
      if (typeof record.path !== 'string' || !isSafeStatePath(record.path)) {
        fail(sink, `${path}.path`, 'action.path', '状态路径不合法或为空')
      }
      validateExpression(record.index, `${path}.index`, sink)
      return
    case 'surface.submit':
      if (typeof record.actionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.actionId)) {
        fail(sink, `${path}.actionId`, 'action.actionId', 'actionId 必须是 1-64 位安全标识符')
      }
      validateExpression(record.payload, `${path}.payload`, sink)
      return
    case 'surface.cancel':
      if (typeof record.actionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(record.actionId)) {
        fail(sink, `${path}.actionId`, 'action.actionId', 'actionId 必须是 1-64 位安全标识符')
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

function validateProps(def: EkkoUIComponentDefinition, props: unknown, path: string, sink: ValidationSink): void {
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
      fail(sink, `${path}.${key}`, 'prop.unknown', `组件 ${def.type} 不支持属性：${key}`)
      continue
    }
    if (!checkPropValue(rule, value)) {
      fail(sink, `${path}.${key}`, 'prop.type', `属性 ${key} 类型或取值不合法`)
    }
    if (rule.type === 'json' && key === 'options') validateOptions(value, `${path}.${key}`, sink)
  }
  for (const [key, rule] of Object.entries(def.props)) {
    if (rule.required && !(key in props)) fail(sink, `${path}.${key}`, 'prop.required', `缺少必填属性：${key}`)
  }
}

function checkPropValue(rule: EkkoUIPropRule, value: EkkoUIJsonValue): boolean {
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
  if (input.protocol !== EKKO_UI_PROTOCOL) {
    fail(sink, 'protocol', 'spec.protocol', `protocol 必须是 ${EKKO_UI_PROTOCOL}`)
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

  const walk = (node: unknown, path: string, depth: number): void => {
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
    const def = typeof node.type === 'string' ? catalogDefinition(node.type) : undefined
    if (!def) {
      return fail(sink, `${path}.type`, 'node.type.unknown', `未知组件：${String(node.type)}`)
    }
    validateProps(def, node.props, `${path}.props`, sink)
    if (node.style !== undefined) validateStyle(node.style, `${path}.style`, sink)
    if (node.bind !== undefined) {
      if (typeof node.bind !== 'string' || !isSafeStatePath(node.bind) || !def.bindValueType) {
        fail(sink, `${path}.bind`, 'node.bind', `组件 ${def.type} 不支持 bind 或路径不合法`)
      }
    }
    if (node.visibleWhen !== undefined) validateExpression(node.visibleWhen, `${path}.visibleWhen`, sink)
    if (node.events !== undefined) {
      if (!isPlainObject(node.events)) {
        fail(sink, `${path}.events`, 'node.events', 'events 必须是对象')
      } else {
        for (const [eventName, actions] of Object.entries(node.events)) {
          if (!def.events.includes(eventName)) {
            fail(sink, `${path}.events.${eventName}`, 'node.event.unknown', `组件 ${def.type} 不支持事件：${eventName}`)
            continue
          }
          const list = Array.isArray(actions) ? actions : [actions]
          if (list.length > 16) fail(sink, `${path}.events.${eventName}`, 'node.events.length', '单个事件最多 16 个动作')
          list.forEach((action, index) => validateAction(action, `${path}.events.${eventName}[${index}]`, sink))
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
      node.children.forEach((child, index) => walk(child, `${path}.children[${index}]`, depth + 1))
    } else if (def.acceptsChildren === true && node.type !== 'button-group') {
      // 容器允许无子节点（渲染空容器），不强制。
    }
  }

  if (!isPlainObject(input.root)) {
    fail(sink, 'root', 'spec.root', 'root 必须是对象')
  } else {
    walk(input.root, 'root', 0)
  }

  if (sink.errors.length) return { ok: false, errors: sink.errors }
  return { ok: true, spec: input as unknown as EkkoUISpec, errors: [] }
}

// ---------------------------------------------------------------------------
// Tool message bridge
// ---------------------------------------------------------------------------

export const SURFACE_TOOL_BASENAME = 'show_surface'

/** MCP 工具名可能带 mcp__server__ 前缀，也可能被客户端改名；按末段匹配。 */
export function isSurfaceToolName(name: unknown): boolean {
  if (typeof name !== 'string') return false
  const base = name.split('__').pop() || name
  const normalized = base.replace(/^ekko_studio_/, '').replace(/^ekko-/, '').replace(/-/g, '_')
  return normalized === SURFACE_TOOL_BASENAME || normalized === 'ui_surface'
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
