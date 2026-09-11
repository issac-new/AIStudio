// overlay/custom/client/loop/orchestrator/adapters/editor.ts
// P4 T6/T7 —— 可视化编排器纯函数层（测试主战场）。
//
// 编辑器文档模型 CanvasDoc = GraphSpec + 画布坐标（spec 本体无位置语义，
// 序列化时剥离）。全部函数纯：不改入参、返回新对象、不触碰网络与 DOM；
// UI 文案 key 留给视图层渲染。
//
// 通道脚手架纪律（addToSpec/removeNode 双向维护）：
//   plan          → planResult(append) / planDecision(overwrite) / planMode(overwrite)
//   bo-n-variant  → config.collectChannel ?? boN.candidates (append)
//   converge      → config.collectChannel ?? boN.candidates (append)
//                 + config.winnerChannel  ?? boN.winner (overwrite)
// 删节点时反向清理：脚手架通道若无剩余使用者则移除（用户自建通道不动）。
//
// 回边自动 guard：任何边变更后 normalizeGuards 重算回边集（collectBackEdges，
// 事实源 graph-spec.ts），无 guard 的回边补 { maxIterations: 3 }——validateGraphSpec
// 对无 guard 回边 throw，编辑器在连线时就把它堵上。
import {
  validateGraphSpec,
  analyzeGraphSpec,
  collectBackEdges,
  PLAN_CHANNELS,
  BO_N_COLLECT_CHANNEL_DEFAULT,
  BO_N_WINNER_CHANNEL_DEFAULT,
  type GraphSpec,
  type GraphSpecMeta,
  type SpecContainer,
  type SpecWarning,
  type PredicateExpr,
  type LoopGuard,
  type EditorNodeType,
} from '../spec'
import { layoutRunGraph } from '../../runcenter/adapters/run-graph'

// ---------------------------------------------------------------------------
// 编辑器文档模型
// ---------------------------------------------------------------------------

/** 画布节点 = NodeSpec + 坐标（序列化时剥离） */
export interface CanvasNode {
  id: string
  type: EditorNodeType
  config: Record<string, unknown>
  x: number
  y: number
}

/** 画布边 = EdgeSpec 结构子集（from/to 唯一定位，guard 由 normalizeGuards 托管） */
export interface CanvasEdge {
  from: string
  to: string
  condition?: PredicateExpr
  guard?: LoopGuard
  label?: string
}

export interface CanvasDoc {
  id: string
  version: number
  description: string
  channels: Record<string, { reducer: string; default?: unknown }>
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  entryNode: string | null
  endCondition?: PredicateExpr
  limits: { maxSteps: number; maxCost?: number; maxDurationMs?: number }
  meta?: GraphSpecMeta
  containers: SpecContainer[]
}

/** 回边 guard 缺省上限（编辑器连线自动补；服务端 validate 只要求 ≥1 整数） */
export const DEFAULT_MAX_ITERATIONS = 3

/** 服务端 REST :id 路由参数词表（graph-rest.ts ID_RE）——编辑器 id 同词表约束 */
export const SPEC_ID_RE = /^[A-Za-z0-9._-]+$/

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function edgeId(from: string, to: string): string {
  return `${from}->${to}`
}

// ---------------------------------------------------------------------------
// 空图 / 节点 id 生成
// ---------------------------------------------------------------------------

/** emptySpec — 新建空白图骨架（limits.maxSteps 取服务端编译模板同量级缺省） */
export function emptySpec(): CanvasDoc {
  return {
    id: '',
    version: 1,
    description: '',
    channels: {},
    nodes: [],
    edges: [],
    entryNode: null,
    limits: { maxSteps: 100 },
    containers: [],
  }
}

/** nextNodeId — `<type>-<n>` 取最小不冲突正整数（确定性，可重放测试） */
export function nextNodeId(nodes: ReadonlyArray<{ id: string }>, type: string): string {
  const used = new Set(nodes.map(n => n.id))
  for (let i = 1; ; i++) {
    const id = `${type}-${i}`
    if (!used.has(id)) return id
  }
}

// ---------------------------------------------------------------------------
// 通道脚手架
// ---------------------------------------------------------------------------

/** 节点类型（含 config 覆盖）要求的通道 → reducer 映射（脚手架单一事实源） */
export function requiredChannels(
  type: EditorNodeType,
  config: Record<string, unknown> = {},
): Record<string, string> {
  switch (type) {
    case 'plan':
      return {
        planResult: 'append',
        planDecision: 'overwrite',
        planMode: 'overwrite',
      }
    case 'bo-n-variant':
      return { [(config.collectChannel as string) ?? BO_N_COLLECT_CHANNEL_DEFAULT]: 'append' }
    case 'converge': {
      const collect = (config.collectChannel as string) ?? BO_N_COLLECT_CHANNEL_DEFAULT
      const winner = (config.winnerChannel as string) ?? BO_N_WINNER_CHANNEL_DEFAULT
      return { [collect]: 'append', [winner]: 'overwrite' }
    }
    default:
      return {}
  }
}

/** 把节点要求的通道并入 channels（已有同名通道不覆盖——用户可能改过 reducer） */
function withNodeChannels(
  channels: CanvasDoc['channels'],
  type: EditorNodeType,
  config: Record<string, unknown>,
): CanvasDoc['channels'] {
  const next = { ...channels }
  for (const [name, reducer] of Object.entries(requiredChannels(type, config))) {
    if (!next[name]) next[name] = { reducer }
  }
  return next
}

/**
 * pruneScaffoldChannels — 删节点后的反向清理：脚手架域（plan 三通道 +
 * boN 两默认通道）内无剩余使用者的通道移除；其余（用户自建/模板派生）不动。
 * 使用者判定与 requiredChannels 同一事实源。
 */
function pruneScaffoldChannels(
  channels: CanvasDoc['channels'],
  nodes: ReadonlyArray<{ type: EditorNodeType; config: Record<string, unknown> }>,
): CanvasDoc['channels'] {
  const inUse = new Set<string>()
  for (const n of nodes) {
    for (const name of Object.keys(requiredChannels(n.type, n.config))) inUse.add(name)
  }
  const scaffold = new Set<string>([
    ...PLAN_CHANNELS,
    BO_N_COLLECT_CHANNEL_DEFAULT,
    BO_N_WINNER_CHANNEL_DEFAULT,
  ])
  const next: CanvasDoc['channels'] = {}
  for (const [name, def] of Object.entries(channels)) {
    if (scaffold.has(name) && !inUse.has(name)) continue
    next[name] = def
  }
  return next
}

// ---------------------------------------------------------------------------
// 节点 / 边变更
// ---------------------------------------------------------------------------

/** 自动落位：首个无占用网格单元（列距 200 / 行距 110；容差半格吸收导入布局的 96 行距） */
export function autoPosition(nodes: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
  const occupied = (col: number, row: number): boolean =>
    nodes.some(n => Math.abs(n.x - col * 200) < 100 && Math.abs(n.y - row * 110) < 55)
  for (let row = 0; row < 100; row++) {
    for (let col = 0; col < 8; col++) {
      if (!occupied(col, row)) return { x: col * 200, y: row * 110 }
    }
  }
  return { x: 0, y: 0 }
}

/** 新节点的 config 缺省（对齐 spec-runtime.ts 工厂读取的 config 形状） */
export function defaultConfig(type: EditorNodeType): Record<string, unknown> {
  switch (type) {
    case 'function': return { set: {} }
    case 'human': return { prompt: '' }
    case 'plan': return { planText: '', todo: [], onReject: 'fail' }
    case 'fanout': return {}
    case 'bo-n-variant': return {}
    case 'converge': return { expect: 2 }
    case 'gate': return {}
    case 'agent': return {}
  }
}

/** addToSpec — 加节点（自动唯一 id + 通道脚手架 + 自动落位）；首节点兼做入口候选 */
export function addToSpec(doc: CanvasDoc, nodeType: EditorNodeType, at?: { x: number; y: number }): CanvasDoc {
  const id = nextNodeId(doc.nodes, nodeType)
  const pos = at ?? autoPosition(doc.nodes)
  const config = defaultConfig(nodeType)
  return {
    ...doc,
    channels: withNodeChannels(doc.channels, nodeType, config),
    nodes: [...doc.nodes, { id, type: nodeType, config, x: pos.x, y: pos.y }],
    entryNode: doc.entryNode ?? id,
  }
}

/** removeNode — 删节点：级联清理入/出边、容器成员、entryNode（退回首节点）、脚手架通道 */
export function removeNode(doc: CanvasDoc, nodeId: string): CanvasDoc {
  const nodes = doc.nodes.filter(n => n.id !== nodeId)
  const edges = doc.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
  const containers = doc.containers
    .map(c => ({ ...c, nodeIds: c.nodeIds.filter(id => id !== nodeId) }))
    .filter(c => c.nodeIds.length > 0)
  return {
    ...doc,
    nodes,
    edges,
    containers,
    entryNode: doc.entryNode === nodeId ? nodes[0]?.id ?? null : doc.entryNode,
    channels: pruneScaffoldChannels(doc.channels, nodes),
  }
}

/** moveNode — 拖拽落位（纯替换坐标） */
export function moveNode(doc: CanvasDoc, nodeId: string, x: number, y: number): CanvasDoc {
  return {
    ...doc,
    nodes: doc.nodes.map(n => (n.id === nodeId ? { ...n, x, y } : n)),
  }
}

/** updateNodeConfig — 配置面板提交（config 整体替换）后重算通道脚手架
 *  （通道名被改写时，旧脚手架通道若无剩余使用者同步清理） */
export function updateNodeConfig(doc: CanvasDoc, nodeId: string, config: Record<string, unknown>): CanvasDoc {
  const target = doc.nodes.find(n => n.id === nodeId)
  if (!target) return doc
  const nodes = doc.nodes.map(n => (n.id === nodeId ? { ...n, config: clone(config) } : n))
  return {
    ...doc,
    nodes,
    channels: pruneScaffoldChannels(withNodeChannels(doc.channels, target.type, config), nodes),
  }
}

// ---------------------------------------------------------------------------
// 回边 guard 托管
// ---------------------------------------------------------------------------

/** doc 级回边集合（entry 缺省取首节点，与 canvasToSpec 兜底口径一致） */
function backEdgeSet(doc: CanvasDoc): Set<number> {
  const entry = doc.entryNode ?? doc.nodes[0]?.id ?? ''
  return collectBackEdges(doc.edges, doc.nodes.map(n => n.id), entry)
}

/**
 * normalizeGuards — 任何边变更后调用：新成环的回边若无 guard 自动补
 * { maxIterations: DEFAULT_MAX_ITERATIONS }（已带 guard 的保留用户值）。
 * 只增不删：前向边上的遗留 guard 视作用户元数据，不静默剥离。
 */
export function normalizeGuards(doc: CanvasDoc): CanvasDoc {
  const back = backEdgeSet(doc)
  let changed = false
  const edges = doc.edges.map((e, i) => {
    if (back.has(i) && !e.guard) {
      changed = true
      return { ...e, guard: { maxIterations: DEFAULT_MAX_ITERATIONS } }
    }
    return e
  })
  return changed ? { ...doc, edges } : doc
}

/** addEdge — 连线（去重：同 from→to 已存在则原样返回），随后托管回边 guard */
export function addEdge(doc: CanvasDoc, from: string, to: string): CanvasDoc {
  if (doc.nodes.every(n => n.id !== from) || doc.nodes.every(n => n.id !== to)) return doc
  if (doc.edges.some(e => e.from === from && e.to === to)) return doc
  return normalizeGuards({ ...doc, edges: [...doc.edges, { from, to }] })
}

/** removeEdge — 删边（from→to 唯一定位） */
export function removeEdge(doc: CanvasDoc, from: string, to: string): CanvasDoc {
  return { ...doc, edges: doc.edges.filter(e => !(e.from === from && e.to === to)) }
}

// ---------------------------------------------------------------------------
// 容器（loop 可视化元数据）
// ---------------------------------------------------------------------------

/** nextContainerId — `loop-container-<n>` 最小不冲突正整数 */
export function nextContainerId(containers: ReadonlyArray<{ id: string }>): string {
  const used = new Set(containers.map(c => c.id))
  for (let i = 1; ; i++) {
    const id = `loop-container-${i}`
    if (!used.has(id)) return id
  }
}

/**
 * wrapNodesInContainer — 选中多节点合并为 loop 容器（元数据；环本身仍由守卫
 * 回边表达）。已在其他容器的成员移动过来（服务端 validate 禁止一节点多容器）。
 */
export function wrapNodesInContainer(doc: CanvasDoc, nodeIds: string[], label?: string): CanvasDoc {
  const members = nodeIds.filter(id => doc.nodes.some(n => n.id === id))
  if (members.length < 2) return doc
  const memberSet = new Set(members)
  const rest = doc.containers
    .map(c => ({ ...c, nodeIds: c.nodeIds.filter(id => !memberSet.has(id)) }))
    .filter(c => c.nodeIds.length > 0)
  return {
    ...doc,
    containers: [...rest, { id: nextContainerId(doc.containers), label: label?.trim() || undefined, nodeIds: members }],
  }
}

/** unwrapContainer — 解散容器（只删元数据，节点与边不动） */
export function unwrapContainer(doc: CanvasDoc, containerId: string): CanvasDoc {
  return { ...doc, containers: doc.containers.filter(c => c.id !== containerId) }
}

// ---------------------------------------------------------------------------
// 画布 ↔ spec 双向序列化
// ---------------------------------------------------------------------------

/** canvasToSpec — 序列化（converge 补 joinMode:'all'；origin 恒 'editor'；
 *  entryNode 缺失兜底取首节点并回执 entryFallback 供视图警告）。 */
export function canvasToSpec(doc: CanvasDoc): { spec: GraphSpec; entryFallback: boolean } {
  const liveEntry = doc.entryNode && doc.nodes.some(n => n.id === doc.entryNode)
    ? doc.entryNode
    : null
  const entryFallback = doc.nodes.length > 0 && !liveEntry
  const spec: GraphSpec = {
    id: doc.id,
    version: doc.version,
    channels: clone(doc.channels),
    nodes: doc.nodes.map(n => ({
      id: n.id,
      type: n.type,
      config: clone(n.config),
      // Best-of-N 收敛语义：joinMode 'all' 屏障（spec-runtime converge 工厂约定）
      ...(n.type === 'converge' ? { joinMode: 'all' as const } : {}),
    })),
    edges: doc.edges.map(e => ({
      from: e.from,
      to: e.to,
      ...(e.condition !== undefined ? { condition: clone(e.condition) } : {}),
      ...(e.guard !== undefined ? { guard: clone(e.guard) } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
    })),
    entryNode: liveEntry ?? doc.nodes[0]?.id ?? '',
    limits: clone(doc.limits),
    origin: 'editor',
    ...(doc.description.trim() ? { description: doc.description.trim() } : {}),
    ...(doc.meta ? { meta: clone(doc.meta) } : {}),
    ...(doc.containers.length > 0 ? { containers: clone(doc.containers) } : {}),
    ...(doc.endCondition !== undefined ? { endCondition: clone(doc.endCondition) } : {}),
  }
  return { spec, entryFallback }
}

/**
 * specToCanvas — 反序列化进画布（GraphSpec 无坐标，导入图用 runcenter
 * layoutRunGraph 同一布局器落位——编辑图与运行图形状可对照）。
 */
export function specToCanvas(spec: GraphSpec): CanvasDoc {
  const topology = {
    nodes: spec.nodes.map(n => ({ id: n.id, type: n.type, config: n.config })),
    edges: spec.edges.map(e => ({ from: e.from, to: e.to })),
    entryNode: spec.entryNode,
  }
  const pos = layoutRunGraph(
    {
      nodes: topology.nodes.map(n => ({ id: n.id, label: n.id, type: n.type, status: 'idle' as const, iteration: 0, durationMs: 0 })),
      edges: topology.edges.map(e => ({ id: edgeId(e.from, e.to), from: e.from, to: e.to, taken: false })),
    },
    spec.entryNode,
  )
  return {
    id: spec.id,
    version: spec.version,
    description: spec.description ?? '',
    channels: clone(spec.channels ?? {}),
    nodes: spec.nodes.map(n => {
      const p = pos.get(n.id) ?? { x: 0, y: 0 }
      return { id: n.id, type: n.type as EditorNodeType, config: clone(n.config ?? {}), x: p.x, y: p.y }
    }),
    edges: spec.edges.map(e => ({
      from: e.from,
      to: e.to,
      ...(e.condition !== undefined ? { condition: clone(e.condition) } : {}),
      ...(e.guard !== undefined ? { guard: clone(e.guard) } : {}),
      ...(e.label !== undefined ? { label: e.label } : {}),
    })),
    entryNode: spec.nodes.some(n => n.id === spec.entryNode) ? spec.entryNode : null,
    ...(spec.endCondition !== undefined ? { endCondition: clone(spec.endCondition) } : {}),
    limits: clone(spec.limits),
    ...(spec.meta ? { meta: clone(spec.meta) } : {}),
    containers: clone(spec.containers ?? []),
  }
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

/** parseSpecJson — 导入文本 → GraphSpec（结构最小校验，失败 throw Error 可直显） */
export function parseSpecJson(text: string): GraphSpec {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON')
  }
  const spec = raw as GraphSpec
  if (!spec || typeof spec.id !== 'string' || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
    throw new Error('Invalid GraphSpec (need id/nodes/edges)')
  }
  return spec
}

/**
 * importSpec — 导入落画布：id 已存在则 version 取同 id 最大版本 +1
 * （服务端 POST /specs 不做版本仲裁，编辑器侧避免静默覆盖）。
 */
export function importSpec(spec: GraphSpec, existing: ReadonlyArray<{ id: string; version?: number }>): CanvasDoc {
  const sameId = existing.filter(s => s.id === spec.id)
  const version = sameId.length > 0
    ? Math.max(spec.version ?? 1, ...sameId.map(s => s.version ?? 0)) + 1
    : spec.version ?? 1
  const doc = specToCanvas({ ...spec, version })
  return { ...doc, id: spec.id, version }
}

// ---------------------------------------------------------------------------
// 编辑守卫（实时校验）
// ---------------------------------------------------------------------------

export type EditorIssue =
  | { kind: 'idInvalid' }                       // 视图映射 ia2.orchestrate.editor.err.idInvalid
  | { kind: 'empty' }                           // 视图映射 ia2.orchestrate.editor.err.empty
  | { kind: 'validate'; message: string }       // validateGraphSpec throw（原始 message 直显）
  | { kind: 'structure'; message: string }      // 客户端结构镜像（原始 message 直显）

export interface EditorValidation {
  issue: EditorIssue | null
  /** 死图检测警告（analyzeGraphSpec 原样；message 已是中文可直显） */
  warnings: SpecWarning[]
  /** entryNode 缺失、序列化兜底取首节点（视图黄条提示） */
  entryFallback: boolean
  spec: GraphSpec
}

/**
 * checkNodeStructures — 服务端 validateEditorSpec（spec-runtime.ts）的客户端
 * 镜像：plan 三通道 / fanout ≥2 无条件出边 / bo-n-variant 与 converge 通道声明。
 * 事实源在服务端；镜像让编辑器在保存前给出一针见血的结构错误。规则漂移由
 * editor.test.ts 的结构用例锚定。
 */
export function checkNodeStructures(spec: GraphSpec): string | null {
  const channels = new Set(Object.keys(spec.channels ?? {}))
  const unconditionalOut = new Map<string, number>()
  for (const e of spec.edges) {
    if (!e.condition && !e.guard) {
      unconditionalOut.set(e.from, (unconditionalOut.get(e.from) ?? 0) + 1)
    }
  }
  for (const n of spec.nodes) {
    switch (n.type) {
      case 'plan': {
        const missing = PLAN_CHANNELS.filter(c => !channels.has(c))
        if (missing.length > 0) {
          return `plan node '${n.id}' requires channels: ${missing.join(', ')} (append planResult + overwrite planDecision/planMode)`
        }
        if (n.config?.onReject !== undefined && n.config.onReject !== 'fail' &&
            !spec.nodes.some(m => m.id === n.config.onReject)) {
          return `plan node '${n.id}': onReject target "${String(n.config.onReject)}" not found`
        }
        break
      }
      case 'fanout': {
        if ((unconditionalOut.get(n.id) ?? 0) < 2) {
          return `fanout node '${n.id}' needs >= 2 unconditional out-edges (Best-of-N 分叉)，got ${unconditionalOut.get(n.id) ?? 0}`
        }
        break
      }
      case 'bo-n-variant': {
        const ch = (n.config?.collectChannel as string) ?? BO_N_COLLECT_CHANNEL_DEFAULT
        if (!channels.has(ch)) {
          return `bo-n-variant node '${n.id}': channel "${ch}" not declared (append reducer)`
        }
        break
      }
      case 'converge': {
        const collect = (n.config?.collectChannel as string) ?? BO_N_COLLECT_CHANNEL_DEFAULT
        const winner = (n.config?.winnerChannel as string) ?? BO_N_WINNER_CHANNEL_DEFAULT
        const missing = [collect, winner].filter(c => !channels.has(c))
        if (missing.length > 0) {
          return `converge node '${n.id}' requires channels: ${missing.join(', ')}`
        }
        break
      }
      default:
        break
    }
  }
  return null
}

/** validateEditorDoc — 编辑守卫总入口：id 词表 → 结构镜像 → validateGraphSpec → analyzeGraphSpec */
export function validateEditorDoc(doc: CanvasDoc): EditorValidation {
  const { spec, entryFallback } = canvasToSpec(doc)
  if (!doc.id || !SPEC_ID_RE.test(doc.id)) {
    return { issue: { kind: 'idInvalid' }, warnings: [], entryFallback: false, spec }
  }
  if (doc.nodes.length === 0) {
    return { issue: { kind: 'empty' }, warnings: [], entryFallback: false, spec }
  }
  const structure = checkNodeStructures(spec)
  if (structure) {
    return { issue: { kind: 'structure', message: structure }, warnings: [], entryFallback, spec }
  }
  try {
    validateGraphSpec(spec)
  } catch (err) {
    return { issue: { kind: 'validate', message: err instanceof Error ? err.message : String(err) }, warnings: [], entryFallback, spec }
  }
  return { issue: null, warnings: analyzeGraphSpec(spec), entryFallback, spec }
}
