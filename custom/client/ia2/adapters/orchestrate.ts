// overlay/custom/client/ia2/adapters/orchestrate.ts
// P3 Task 6 — 编排区纯函数投影层（组件薄壳化，同 overview/inbox-center 纪律）：
//   projectSpecCard           GraphSpec → 模板卡片（名称派生/版本/节点数/模板种类）
//   layoutFromSpec            GraphSpec → RunGraphCanvas 画布拓扑——喂 runcenter
//                             buildRunGraph 同一布局器（空事件流 = 全 idle 只读投影），
//                             画布内部 layoutRunGraph 分层与 RunDetail 完全同源
//   isCoarseCron              cron 粗校（域数 + 记号词表；完整语法交服务端 cron-parser）
//   validateInstantiateForm   实例化表单粗校（name/goal 必填 + cron 粗校）
//   slugifyLoopName / buildCreatePayload
//                             POST /api/loop/loops 白名单体构造（对齐
//                             controllers/loop.ts create 白名单与 LoopCreateWizard id 惯例）
//
// 全部纯函数：不改入参、不触碰网络与 DOM；文案 key 留给视图层渲染。
import { buildRunGraph, type RunGraphData, type RunGraphTopologyLike } from '@/custom/loop/runcenter/adapters/run-graph'

// ---------------------------------------------------------------------------
// 模板卡片投影
// ---------------------------------------------------------------------------

/** GraphSpec 结构化最小形状（服务端 /api/graph/specs 列表项；graph-spec.ts 同构子集） */
export interface GraphSpecLike {
  id?: string
  version?: number
  nodes?: Array<{ id: string; type: string; config?: Record<string, unknown> }>
  edges?: Array<{ from: string; to: string; label?: string; guard?: { maxIterations: number } | null }>
  entryNode?: string
  limits?: { maxSteps?: number; maxCost?: number }
  /** P4：人类可读描述（模板卡副题；编辑器保存的 spec 有值） */
  description?: string
  /** P4：spec 来源——'editor'=画布编辑器自建（可编辑/可删），'template'/缺省=编译模板（只读） */
  origin?: 'editor' | 'template'
  /** P4：模板语义元数据（实例化弹层预填 goal/cron） */
  meta?: { goal?: string; cron?: string; permissionLevel?: string; sensitivePaths?: string[]; worktreePolicy?: string; gateCommands?: string[] }
  /** P4：loop 容器可视化元数据（RunGraphCanvas 包围框） */
  containers?: Array<{ id: string; label?: string; nodeIds: string[] }>
}

/** 模板种类（卡片描述文案的 i18n 选择依据，视图层映射 ia2.orchestrate.kind.*） */
export type SpecTemplateKind = 'five-phase' | 'daily-brief' | 'generic'

/** 模板种类判定：loop-<loopId> = 五阶段编译模板；daily-brief* = 每日 Brief；其余 generic */
export function specKind(id: string): SpecTemplateKind {
  if (id === 'daily-brief' || id.startsWith('daily-brief-')) return 'daily-brief'
  if (id.startsWith('loop-')) return 'five-phase'
  return 'generic'
}

export interface SpecCard {
  id: string
  /** 展示名：loop-<loopId> 剥前缀，其余原样（id 本身即可读） */
  name: string
  kind: SpecTemplateKind
  version: number
  nodeCount: number
  edgeCount: number
  entryNode: string
  /** limits.maxSteps；limits 缺失落 null（卡片不显示误导性 0） */
  maxSteps: number | null
  /** P4：spec.description（有则显示为卡片副题，覆盖种类描述） */
  description?: string
  /** P4：'editor'=编辑器自建（编辑/删除/试跑口），'template'/缺省=只读模板 */
  origin?: 'editor' | 'template'
  /** P4：实例化弹层预填来源（goal/cron） */
  meta?: { goal?: string; cron?: string }
}

/** projectSpecCard — 模板卡片投影（畸形输入零值兜底，不炸列表） */
export function projectSpecCard(spec: GraphSpecLike | null | undefined): SpecCard {
  const id = typeof spec?.id === 'string' ? spec.id : ''
  const nodes = Array.isArray(spec?.nodes) ? spec!.nodes! : []
  const edges = Array.isArray(spec?.edges) ? spec!.edges! : []
  const version = typeof spec?.version === 'number' && Number.isFinite(spec.version) ? spec.version : 0
  const maxSteps = typeof spec?.limits?.maxSteps === 'number' && Number.isFinite(spec.limits.maxSteps)
    ? spec.limits.maxSteps
    : null
  return {
    id,
    name: id.startsWith('loop-') ? id.slice('loop-'.length) : id,
    kind: specKind(id),
    version,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    entryNode: typeof spec?.entryNode === 'string' ? spec.entryNode : '',
    maxSteps,
    ...(typeof spec?.description === 'string' && spec.description.trim()
      ? { description: spec.description }
      : {}),
    ...(spec?.origin === 'editor' ? { origin: 'editor' as const } : {}),
    ...(spec?.meta && (typeof spec.meta.goal === 'string' || typeof spec.meta.cron === 'string')
      ? { meta: { goal: spec.meta.goal, cron: spec.meta.cron } }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// spec → 画布拓扑（复用 runcenter 同一布局器）
// ---------------------------------------------------------------------------

/**
 * layoutFromSpec — GraphSpec → RunGraphData（RunGraphCanvas 的输入契约）。
 * 复用 runcenter buildRunGraph（RunDetailView 同源）：空事件流投影 = 全 idle 只读
 * 拓扑，guard/label/taken 语义与运行图一致；分层布局由画布内部 layoutRunGraph 完成
 * （与运行详情同一布局器，模板图与运行图形状可对照）。
 */
export function layoutFromSpec(spec: GraphSpecLike | null | undefined): RunGraphData {
  if (!spec || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) {
    return { nodes: [], edges: [] }
  }
  return buildRunGraph(spec as RunGraphTopologyLike, [])
}

// ---------------------------------------------------------------------------
// 实例化表单粗校 + POST 体构造
// ---------------------------------------------------------------------------

export interface InstantiateForm {
  name: string
  goal: string
  cron: string
  /** 可选租户（服务端白名单显式拷贝，空白归 null） */
  tenant?: string
}

/** 表单错误词表（视图层映射 ia2.orchestrate.err.*） */
export type InstantiateError = 'nameRequired' | 'goalRequired' | 'cronInvalid'

/** cron 单域记号：星号、步进（星号加斜杠 n）、数字、区间 a-b、区间步进 a-b/n，逗号列表组合 */
const CRON_FIELD = /^(?:\*(?:\/\d+)?|\d+(?:-\d+)?(?:\/\d+)?)(?:,(?:\*(?:\/\d+)?|\d+(?:-\d+)?(?:\/\d+)?))*$/

/**
 * isCoarseCron — cron 粗校：5 域（标准）或 6 域（带秒，cron-parser 亦支持），
 * 每域过记号词表。粗校定位是拦手滑（空串/自然语言/域数错），完整语法交服务端
 * cron-parser（不可解析时调度器自身有 FALLBACK 兜底，不炸）。
 */
export function isCoarseCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/).filter(f => f.length > 0)
  if (fields.length !== 5 && fields.length !== 6) return false
  return fields.every(f => CRON_FIELD.test(f))
}

/** validateInstantiateForm — 错误按 name→goal→cron 稳定排序（视图逐字段展示） */
export function validateInstantiateForm(form: InstantiateForm): InstantiateError[] {
  const errors: InstantiateError[] = []
  if (!form.name || !form.name.trim()) errors.push('nameRequired')
  if (!form.goal || !form.goal.trim()) errors.push('goalRequired')
  if (!isCoarseCron(form.cron ?? '')) errors.push('cronInvalid')
  return errors
}

/**
 * slugifyLoopName — 展示名 → loop id 安全段（服务端 validateLoopId 词表
 * `[A-Za-z0-9._-]+`；连缀惯例与 LoopCreateWizard 一致，另做首尾连字符收敛）。
 */
export function slugifyLoopName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface CreateLoopPayload {
  id: string
  name: string
  goal: string
  schedule: { mode: 'cron'; cron: string; timezone: string }
  tenant: string | null
  /** P4：来源模板卡 id（实例化溯源；服务端白名单外字段，透传不落库） */
  template?: string
}

/**
 * buildCreatePayload — 实例化 POST 体（controllers/loop.ts create 白名单字段的
 * 前端同语义构造）：id = `loop-<slug>-<ts>`；schedule 固定 cron 模式（时区与
 * LoopCreateWizard 同款）；tenant 裁剪透传、空白归 null；template = 来源卡片 id。
 */
export function buildCreatePayload(form: InstantiateForm, now: number, template?: string): CreateLoopPayload {
  return {
    id: `loop-${slugifyLoopName(form.name)}-${now}`,
    name: form.name.trim(),
    goal: form.goal.trim(),
    schedule: { mode: 'cron', cron: form.cron.trim(), timezone: 'Asia/Shanghai' },
    tenant: form.tenant && form.tenant.trim() ? form.tenant.trim() : null,
    ...(template ? { template } : {}),
  }
}
