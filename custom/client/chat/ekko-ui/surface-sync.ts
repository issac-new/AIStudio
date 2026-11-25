/**
 * 持久界面的客户端登记表（批二，spec D1/D10）。
 *
 * 三件事：
 * 1. 调服务端接口（读取 / 保存状态 / 记录提交 / 用户关闭）；
 * 2. 订阅会话套接字上的 ui.surface.* 事件，把「规格被续改」「被关闭」分发给订阅者；
 * 3. 提供一个模块级的响应式登记表，同一块界面在页面里只拉取一次。
 *
 * 界面的工具消息是它在时间线上的锚点（spec D2）：卡片从工具参数里拿到界面编号后，
 * 向这里登记，之后规格一律以服务端为准——工具参数里的是第 1 版。
 */
import { reactive, shallowReactive } from 'vue'
import { getChatRunSocket } from '@/api/studio/chat'
import { request } from '@/api/client'
import {
  EKKO_UI_LIMITS,
  formatSurfaceTurnMessage,
  surfaceDigest,
  type EkkoUISpec,
  type EkkoUIState,
} from './protocol'

export type PersistentSurfaceStatus = 'active' | 'closed'

/** 服务端返回的读取视图（available:false 表示不存在或无权访问）。 */
export interface PersistentSurfaceView {
  available: boolean
  surface?: {
    surface_id: string
    session_id: string
    revision: number
    status: PersistentSurfaceStatus
    title: string
    digest: string
    spec: EkkoUISpec
    state: EkkoUIState
    state_revision: number
    last_submission: { action_id: string; payload: unknown; revision: number } | null
    created_at: number
    updated_at: number
    submitted_at: number | null
  }
  reason?: string
}

/** 卡片本地持有的界面状态：规格、版本、用户填过的值。 */
export interface PersistentSurfaceEntry {
  surfaceId: string
  sessionId: string
  profile: string
  /** 加载态：idle（未请求）/ loading / ready / missing / error。 */
  phase: 'idle' | 'loading' | 'ready' | 'missing' | 'error'
  spec: EkkoUISpec | null
  revision: number
  status: PersistentSurfaceStatus
  title: string
  /** 用户在界面上填过的值。 */
  state: EkkoUIState
  /** 用户状态所依据的规格版本号。 */
  stateRevision: number
  /** 最近一次提交；从未提交为 null。 */
  lastSubmission: { action_id: string; payload: unknown; revision: number } | null
  error: string
}

type Listener = (entry: PersistentSurfaceEntry) => void

const BASE = '/api/studio/surfaces'
// 浅层响应式：只追踪「有哪些条目」，条目内部字段的变化靠 emit() 显式通知订阅者
const entries = shallowReactive(new Map<string, PersistentSurfaceEntry>())
const listeners = new Map<string, Set<Listener>>()
/** 已在途的拉取，按「界面编号」去重，避免同一块界面并发拉多次。 */
const inflight = new Set<string>()
let watching: { socket: unknown } | null = null

function emptyEntry(surfaceId: string, sessionId: string, profile: string): PersistentSurfaceEntry {
  // 条目做成响应式：卡片模板直接读它的字段，取回规格或收到续改事件后界面要自动更新
  return reactive({
    surfaceId, sessionId, profile,
    phase: 'idle', spec: null, revision: 0, status: 'active', title: '',
    state: {}, stateRevision: 0, lastSubmission: null, error: '',
  })
}

function emit(surfaceId: string): void {
  const entry = entries.get(surfaceId)
  if (!entry) return
  for (const listener of listeners.get(surfaceId) ?? []) listener(entry)
}

function recordSpec(entry: PersistentSurfaceEntry, spec: EkkoUISpec, revision: number): void {
  entry.spec = spec
  entry.revision = revision
  entry.title = String(spec.title ?? '')
}

/** 规格被续改后，用户已填的值以新规格的初值为底合并；新规格不再绑定的键不再保留。 */
export function mergeUserState(next: EkkoUISpec, previous: EkkoUIState): EkkoUIState {
  // 收集新规格的全部绑定路径。绑定是带点的路径（form.name），而状态里的键也是带点的字符串，
  // 所以二者直接按字面比较，不拆根键——拆根键会把「同一对象下已删除字段」的旧值也放回来。
  const bound = new Set<string>()
  const walk = (node: EkkoUISpec['root']): void => {
    if (node.bind) bound.add(node.bind)
    for (const child of node.children || []) walk(child)
  }
  walk(next.root)
  const merged: EkkoUIState = { ...(next.state ?? {}) }
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) continue
    // 只保留仍被绑定的路径上的用户值
    if (bound.has(key)) merged[key] = value
  }
  return merged
}

function applyView(entry: PersistentSurfaceEntry, view: PersistentSurfaceView): void {
  if (!view.available || !view.surface) {
    entry.phase = 'missing'
    entry.error = view.reason || '界面不存在或无权访问'
    return
  }
  const surface = view.surface
  entry.sessionId = surface.session_id
  entry.status = surface.status
  entry.lastSubmission = surface.last_submission
  entry.state = { ...(surface.state ?? {}) }
  entry.stateRevision = surface.state_revision
  recordSpec(entry, surface.spec, surface.revision)
  entry.phase = 'ready'
  entry.error = ''
}

/** 调接口：统一带上界面所属的 profile。 */
async function call<T>(path: string, init: { method?: string; body?: unknown } & Record<string, unknown> = {}, profile: string): Promise<T> {
  const url = `${path}${path.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile)}`
  return request<T>(url, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}

function idPath(surfaceId: string, suffix = ''): string {
  // 冒号在路径段里合法，浏览器与路由器都不需要转义；只转义真正会破坏路径的字符
  return `${BASE}/${surfaceId}${suffix}`
}

/** 确保会话套接字上的界面事件有人接：套接字实例可能被替换（重连、切 profile），每次登记时重查。 */
function ensureWatching(): void {
  const socket = getChatRunSocket() as unknown as { on(event: string, handler: (payload: unknown) => void): unknown } | null
  if (!socket || watching?.socket === socket) return
  watching = { socket }
  socket.on('ui.surface.updated', (raw) => {
    const payload = raw as { surface_id?: string; session_id?: string; revision?: number; spec?: EkkoUISpec }
    const entry = payload?.surface_id ? entries.get(payload.surface_id) : undefined
    if (!entry || !payload.spec) return
    // 事件可能在「读取」响应之前到达：先到的事件不丢，直接并入
    entry.state = mergeUserState(payload.spec, entry.state)
    recordSpec(entry, payload.spec, Number(payload.revision ?? entry.revision + 1))
    entry.phase = 'ready'
    emit(entry.surfaceId)
  })
  socket.on('ui.surface.closed', (raw) => {
    const payload = raw as { surface_id?: string }
    const entry = payload?.surface_id ? entries.get(payload.surface_id) : undefined
    if (!entry) return
    entry.status = 'closed'
    emit(entry.surfaceId)
  })
}

export function usePersistentSurface(surfaceId: string, sessionId: string, profile: string) {
  ensureWatching()
  if (!entries.has(surfaceId)) entries.set(surfaceId, emptyEntry(surfaceId, sessionId, profile))
  const entry = entries.get(surfaceId)!
  if (entry.profile !== profile && profile) entry.profile = profile

  async function refresh(): Promise<void> {
    if (inflight.has(surfaceId)) return
    inflight.add(surfaceId)
    entry.phase = entry.phase === 'ready' ? 'ready' : 'loading'
    try {
      const view = await call<PersistentSurfaceView>(idPath(surfaceId), {}, profile)
      applyView(entry, view)
    } catch (error) {
      entry.phase = entry.spec ? 'ready' : 'error'
      entry.error = error instanceof Error ? error.message : String(error)
    } finally {
      inflight.delete(surfaceId)
      emit(surfaceId)
    }
  }

  function onEvent(listener: Listener): () => void {
    const set = listeners.get(surfaceId) ?? new Set<Listener>()
    set.add(listener)
    listeners.set(surfaceId, set)
    return () => { set.delete(listener) }
  }

  return { entry, refresh, onEvent }
}

/** 保存用户状态：带渲染所依据的版本号（spec D10）。 */
export async function saveSurfaceState(surfaceId: string, profile: string, revision: number, state: EkkoUIState): Promise<void> {
  await call(idPath(surfaceId, '/state'), { method: 'PUT', body: { revision, state } }, profile)
}

/** 状态回存的合并写入：拖动滑杆会连续触发，按窗口合并成一次写，卸载时把未写出的立即落盘。 */
export function createStateFlush(
  write: (revision: number, state: EkkoUIState) => Promise<void>,
  options: { delayMs?: number; setTimer?: (fn: () => void, ms: number) => () => void } = {},
): { schedule(revision: number, state: EkkoUIState): void; flush(): Promise<void>; dispose(): void } {
  const delayMs = options.delayMs ?? 500
  const setTimer = options.setTimer ?? ((fn, ms) => {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  })
  let pending: { revision: number; state: EkkoUIState } | null = null
  let cancel: (() => void) | null = null
  let inFlight: Promise<void> | null = null

  async function drain(): Promise<void> {
    if (cancel) { cancel(); cancel = null }
    while (pending) {
      const next = pending
      pending = null
      try {
        await write(next.revision, next.state)
      } catch {
        // 写失败不丢用户已填的值：值仍在界面上，下一次写入会把最新状态整体带出去
      }
    }
  }

  return {
    schedule(revision, state) {
      pending = { revision, state: { ...state } }
      if (cancel) return
      cancel = setTimer(() => {
        cancel = null
        inFlight = drain().finally(() => { inFlight = null })
      }, delayMs)
    },
    async flush() {
      if (cancel) { cancel(); cancel = null }
      await drain()
      if (inFlight) await inFlight
    },
    dispose() {
      if (cancel) { cancel(); cancel = null }
      // 卸载时不再等待网络：尽力触发一次写入
      if (pending) void drain()
    },
  }
}

/** 记录一次提交（服务端只存档，不起轮）；续接轮由调用方发起。 */
export async function recordSurfaceSubmission(
  surfaceId: string,
  profile: string,
  revision: number,
  actionId: string,
  payload: unknown,
): Promise<void> {
  await call(idPath(surfaceId, '/actions'), { method: 'POST', body: { revision, action_id: actionId, payload } }, profile)
}

/** 用户在卡片上点关闭。 */
export async function closeSurface(surfaceId: string, profile: string): Promise<void> {
  await call(idPath(surfaceId, '/actions'), { method: 'POST', body: { action_id: 'close' } }, profile)
}

/** 拼出提交后的续接消息（spec D1）：编号、版本、动作与提交内容都在一条普通用户消息里。 */
export function buildSurfaceTurnMessage(entry: PersistentSurfaceEntry, actionId: string, payload: unknown): string {
  return formatSurfaceTurnMessage({
    title: entry.title,
    surfaceId: entry.surfaceId,
    revision: entry.revision,
    actionId,
    payload: payload as EkkoUIState,
  })
}

/** 测试用：清空模块级登记表与套接字订阅，使各用例互不影响。 */
export function _resetSurfaceSyncForTests(): void {
  entries.clear()
  listeners.clear()
  inflight.clear()
  watching = null
}

export const persistentSurfaceLimits = EKKO_UI_LIMITS
export { surfaceDigest }
