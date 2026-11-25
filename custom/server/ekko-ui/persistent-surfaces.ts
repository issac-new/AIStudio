/**
 * 持久界面的非阻塞宿主（批二，spec D1-D11）。
 *
 * 与阻塞式 SurfaceRuns 的区别：这里的每个操作都是一次请求往返即返回，不挂起工具调用。
 * 依赖全部从外部注入——存储、把当前轮上下文解析成会话、向会话推事件——本类不直接
 * 碰数据库或套接字，接线在 patches/820 里完成。
 *
 * 信任边界：入参（规格、补丁、状态、提交内容）一律当不可信输入，先按协议校验再落库；
 * 归属不符与不存在返回同一个 404。语义校验经 protocol-bridge 调协议模块（spec D3）。
 */
import {
  SURFACE_MAX_STRING,
  SurfaceError,
  scanSurfacePayload,
  scanSurfaceValue,
} from './contract'
import {
  EKKO_UI_LIMITS,
  applySurfacePatches,
  catalogProjection,
  formatValidationErrors,
  surfaceDigest,
  validateSpec,
  type EkkoUISpec,
} from './protocol-bridge'
import { SurfaceStore, type CreateSurfaceInput, type SurfaceOwner, type StoredSurface } from './surface-store'

export interface PersistentSurfaceDeps {
  store: Pick<SurfaceStore, 'create' | 'get' | 'update' | 'saveState' | 'recordSubmission' | 'close' | 'listBySession' | 'countActive'>
  /** 把当前轮的上下文解析成会话；没有活动轮时抛 SurfaceError(409)。 */
  resolveTurn(contextId: string, profile: string): { sessionId: string; runId: string }
  /** 向会话的套接字房间推事件。 */
  publish(sessionId: string, event: string, payload: Record<string, unknown>): void
  /** 运行开关；缺省视为开启。关闭时创建与更新返回 503，可不发版回退（spec D11）。 */
  isEnabled?(): boolean
}

/** 精简结构：只含 id、类型、绑定、属性与直接子节点 id，供模型续改时定位。 */
export interface SurfaceNodeBrief {
  id: string
  type: string
  bind?: string
  props?: Record<string, unknown>
  children?: string[]
}

export interface SurfaceInspect {
  surface_id: string
  revision: number
  status: 'active' | 'closed'
  title: string
  digest: string
  nodes: SurfaceNodeBrief[]
  state?: Record<string, unknown>
  node?: unknown
  last_submission?: StoredSurface['result_json']
}

/** 给客户端卡片的读取视图。源缺席或归属不符都返回 available:false（fail-soft，不猜）。 */
export interface SurfaceView {
  available: boolean
  surface?: {
    surface_id: string
    session_id: string
    revision: number
    status: 'active' | 'closed'
    title: string
    digest: string
    spec: EkkoUISpec
    state: Record<string, unknown>
    state_revision: number
    last_submission: StoredSurface['result_json']
    created_at: number
    updated_at: number
    submitted_at: number | null
  }
  reason?: string
}

export interface CatalogQuery { q?: string; category?: string }

const ACTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const SAFE_STATE_KEY = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/
const UNSAFE_SEGMENTS = /(^|\.)(__proto__|prototype|constructor)(\.|$)/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function byteLength(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') } catch { return Number.MAX_SAFE_INTEGER }
}

function needString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) throw new SurfaceError(`${key} is required`, 400)
  return value
}

/** 校验失败统一 422：message 是一句话（MCP 只带回这一句），问题清单附在 problems。 */
function invalid(prefix: string, problems: ReadonlyArray<{ path: string; code: string; message: string }>): SurfaceError & { problems: unknown } {
  return Object.assign(new SurfaceError(`${prefix}: ${formatValidationErrors(problems)}`, 422), { problems: problems.slice(0, 8) })
}

/** 入参形状：先过阻塞式契约的传输级扫描（危险键、深度、字符串长度），再做语义校验。 */
function validatedSpec(input: unknown): EkkoUISpec {
  if (!isPlainObject(input)) throw new SurfaceError('spec must be an object', 400)
  scanSurfaceValue(input)
  const validation = validateSpec(input)
  if (!validation.ok) throw invalid('Invalid surface spec', validation.errors)
  // ok 为真时 spec 必有值；类型联合上仍含 undefined，这里收窄
  if (!validation.spec) throw new SurfaceError('Invalid surface spec', 422)
  return validation.spec
}

function briefs(spec: EkkoUISpec): SurfaceNodeBrief[] {
  const out: SurfaceNodeBrief[] = []
  const walk = (node: EkkoUISpec['root']): void => {
    out.push({
      id: node.id,
      type: node.type,
      ...(node.bind ? { bind: node.bind } : {}),
      ...(node.props && Object.keys(node.props).length ? { props: node.props } : {}),
      ...(node.children?.length ? { children: node.children.map(child => child.id) } : {}),
    })
    for (const child of node.children || []) walk(child)
  }
  walk(spec.root)
  return out
}

function findNode(spec: EkkoUISpec, id: string): EkkoUISpec['root'] | null {
  const queue: EkkoUISpec['root'][] = [spec.root]
  while (queue.length) {
    const current = queue.shift()!
    if (current.id === id) return current
    for (const child of current.children || []) queue.push(child)
  }
  return null
}

/** 用户状态是扁平键值：键即状态路径（如 form.name），值是 JSON 值。 */
function validatedState(state: unknown): Record<string, unknown> {
  if (!isPlainObject(state)) throw new SurfaceError('state must be an object', 400)
  for (const key of Object.keys(state)) {
    if (!SAFE_STATE_KEY.test(key) || UNSAFE_SEGMENTS.test(key)) throw new SurfaceError(`state key is not a safe path: ${key}`, 400)
    if (state[key] !== null && typeof state[key] === 'object') {
      // 嵌套值只允许一层对象或数组，深度交给体积上限与序列化
      for (const inner of Array.isArray(state[key]) ? state[key] : Object.values(state[key] as Record<string, unknown>)) {
        if (inner !== null && typeof inner === 'object') throw new SurfaceError(`state value nests deeper than 2 levels at: ${key}`, 400)
      }
    }
  }
  scanSurfacePayload(state, EKKO_UI_LIMITS.maxStateBytes, 'state')
  return state
}

/** 客户端上报的版本号：必须是正整数（否则 400），且不能超过界面当前版本（否则 409）。 */
function revisionParam(value: unknown, current: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new SurfaceError('revision must be a positive integer', 400)
  }
  if (value > current) {
    throw new SurfaceError(`revision ${value} is newer than the surface revision ${current}; reload the surface and retry`, 409)
  }
  return value
}

export class PersistentSurfaces {
  constructor(private readonly deps: PersistentSurfaceDeps) {}

  private assertEnabled(): void {
    if (this.deps.isEnabled && !this.deps.isEnabled()) {
      throw new SurfaceError('Persistent surfaces are disabled on this server (EKKO_UI_PERSISTENT=0)', 503)
    }
  }

  private owned(surfaceId: string, owner: SurfaceOwner): StoredSurface {
    const row = this.deps.store.get(surfaceId, owner)
    if (!row) throw new SurfaceError(`Surface not found: ${surfaceId}`, 404)
    return row
  }

  // ---- MCP 侧 ----

  async create(input: unknown, owner: SurfaceOwner): Promise<Record<string, unknown>> {
    this.assertEnabled()
    if (!isPlainObject(input)) throw new SurfaceError('body must be an object', 400)
    const contextId = needString(input, 'context_id')
    const spec = validatedSpec(input.spec)
    const title = String(spec.title ?? '').slice(0, SURFACE_MAX_STRING)
    // 解析会话放在规格校验之后：规格不合法时不必碰活动轮状态
    const { sessionId, runId } = this.deps.resolveTurn(contextId, owner.profile)
    const receipt = this.deps.store.create({
      sessionId, profile: owner.profile, userId: owner.userId, runId, spec, digest: surfaceDigest(spec), title,
    } satisfies CreateSurfaceInput)
    this.deps.publish(sessionId, 'ui.surface.presented', {
      event: 'ui.surface.presented',
      session_id: sessionId,
      surface_id: receipt.surface_id,
      revision: receipt.revision,
      status: receipt.status,
      title,
      digest: receipt.digest,
      spec,
    })
    return { ...receipt }
  }

  async update(input: unknown, owner: SurfaceOwner): Promise<Record<string, unknown>> {
    this.assertEnabled()
    if (!isPlainObject(input)) throw new SurfaceError('body must be an object', 400)
    const surfaceId = needString(input, 'surface_id')
    const baseRevision = input.base_revision
    if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 1) {
      throw new SurfaceError('base_revision must be a positive integer', 400)
    }
    const hasPatches = input.patches !== undefined
    const hasSpec = input.spec !== undefined
    if (hasPatches === hasSpec) throw new SurfaceError('send either patches or spec, not both', 400)

    // 先取当前行做语义校验，再带基准版本写库；写库那一步仍由存储层做并发判定
    const current = this.owned(surfaceId, owner)
    if (current.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    let next: EkkoUISpec
    let changed: string[] = []
    if (hasPatches) {
      const applied = applySurfacePatches(current.spec_json, input.patches)
      if (!applied.ok || !applied.spec) throw invalid('Patch rejected', applied.errors)
      next = applied.spec
      changed = applied.changed
    } else {
      next = validatedSpec(input.spec)
      // 整版替换必须沿用同一个 surfaceId，否则时间线锚点与编号会对不上
      if (next.surfaceId !== current.spec_surface_id) {
        throw new SurfaceError(`spec.surfaceId must stay "${current.spec_surface_id}" when replacing a surface`, 422)
      }
    }
    const digest = surfaceDigest(next)
    const result = this.deps.store.update(surfaceId, baseRevision, next, digest, owner)
    const sessionId = current.session_id
    this.deps.publish(sessionId, 'ui.surface.updated', {
      event: 'ui.surface.updated',
      session_id: sessionId,
      surface_id: surfaceId,
      revision: result.revision,
      base_revision: baseRevision,
      digest,
      changed,
      spec: next,
    })
    return { surface_id: surfaceId, revision: result.revision, digest, changed }
  }

  async inspect(input: unknown, owner: SurfaceOwner): Promise<SurfaceInspect> {
    if (!isPlainObject(input)) throw new SurfaceError('body must be an object', 400)
    const surfaceId = needString(input, 'surface_id')
    const row = this.owned(surfaceId, owner)
    const result: SurfaceInspect = {
      surface_id: surfaceId,
      revision: row.revision,
      status: row.status,
      title: row.title,
      digest: row.digest,
      nodes: briefs(row.spec_json),
    }
    if (input.include_state === true) result.state = row.state_json
    if (input.node_id !== undefined) {
      const node = findNode(row.spec_json, String(input.node_id))
      if (!node) {
        throw new SurfaceError(`Node not found: ${String(input.node_id)}（可用 id：${briefs(row.spec_json).map(item => item.id).join(' ')}）`, 404)
      }
      result.node = node
    }
    if (row.result_json) result.last_submission = row.result_json
    return result
  }

  async close(input: unknown, owner: SurfaceOwner): Promise<Record<string, unknown>> {
    if (!isPlainObject(input)) throw new SurfaceError('body must be an object', 400)
    const surfaceId = needString(input, 'surface_id')
    const row = this.owned(surfaceId, owner)
    return this.closeRow(row, 'agent')
  }

  /** 用户在卡片上点关闭：与智能体关闭走同一条落库与通知路径，只差来源标记。 */
  async closeByUser(surfaceId: string, owner: SurfaceOwner): Promise<Record<string, unknown>> {
    return this.closeRow(this.owned(surfaceId, owner), 'user')
  }

  private closeRow(row: StoredSurface, reason: 'agent' | 'user'): Record<string, unknown> {
    const wasClosed = row.status === 'closed'
    const result = this.deps.store.close(row.surface_id)
    if (!wasClosed) {
      this.deps.publish(row.session_id, 'ui.surface.closed', {
        event: 'ui.surface.closed',
        session_id: row.session_id,
        surface_id: row.surface_id,
        status: 'closed',
        reason,
      })
    }
    return result
  }

  async catalog(query: CatalogQuery): Promise<Record<string, unknown>> {
    return catalogProjection({
      ...(typeof query?.q === 'string' && query.q.trim() ? { query: query.q } : {}),
      ...(typeof query?.category === 'string' && query.category.trim() ? { category: query.category } : {}),
    }) as unknown as Record<string, unknown>
  }

  // ---- 客户端侧 ----

  /** 读取视图：源缺席或归属不符返回 available:false，不抛错（读模型 fail-soft）。 */
  async view(surfaceId: string, owner: SurfaceOwner): Promise<SurfaceView> {
    if (!/^srf:[A-Za-z0-9_-]{1,128}:[A-Za-z0-9_-]{1,64}$/.test(surfaceId)) return { available: false, reason: 'malformed surface id' }
    const row = this.deps.store.get(surfaceId, owner)
    if (!row) return { available: false }
    return {
      available: true,
      surface: {
        surface_id: row.surface_id,
        session_id: row.session_id,
        revision: row.revision,
        status: row.status,
        title: row.title,
        digest: row.digest,
        spec: row.spec_json,
        state: row.state_json,
        state_revision: row.state_revision,
        last_submission: row.result_json,
        created_at: row.created_at,
        updated_at: row.updated_at,
        submitted_at: row.submitted_at,
      },
    }
  }

  async saveState(surfaceId: string, state: unknown, revision: unknown, owner: SurfaceOwner): Promise<{ state_updated_at: number }> {
    const row = this.owned(surfaceId, owner)
    if (row.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    const valid = validatedState(state)
    return this.deps.store.saveState(surfaceId, valid, revisionParam(revision, row.revision), owner)
  }

  async recordSubmission(
    surfaceId: string,
    actionId: unknown,
    payload: unknown,
    revision: unknown,
    owner: SurfaceOwner,
  ): Promise<{ surface_id: string; revision: number; action_id: string }> {
    const row = this.owned(surfaceId, owner)
    if (row.status === 'closed') throw new SurfaceError(`Surface is closed: ${surfaceId}`, 409)
    if (typeof actionId !== 'string' || !ACTION_ID_RE.test(actionId)) {
      throw new SurfaceError('action_id must be 1-64 letters, digits, underscores or dashes', 400)
    }
    const atRevision = revisionParam(revision, row.revision)
    scanSurfacePayload(payload, EKKO_UI_LIMITS.maxSubmissionBytes, 'payload')
    this.deps.store.recordSubmission(surfaceId, actionId, payload ?? null, atRevision, owner)
    return { surface_id: surfaceId, revision: atRevision, action_id: actionId }
  }
}
