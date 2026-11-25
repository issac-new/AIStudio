/**
 * Ekko UI Surface 的服务端传输契约（阻塞式 show_surface 使用的部分）。
 *
 * 分层：本文件只做传输级校验（JSON 形状、字节/深度/节点数、危险键、提交大小），
 * 供阻塞式界面使用。部件目录与属性白名单的事实源在协议模块
 * （custom/client/chat/ekko-ui/protocol.ts）。批二起持久式界面在服务端经
 * protocol-bridge.ts 引用协议模块做语义校验（补丁要能被模型当场修复），
 * 不在本文件复制第二份目录。
 */

export const SURFACE_MAX_SPEC_BYTES = 64 * 1024
export const SURFACE_MAX_STATE_BYTES = 32 * 1024
export const SURFACE_MAX_SUBMISSION_BYTES = 32 * 1024
export const SURFACE_MAX_DEPTH = 12
export const SURFACE_MAX_NODES = 400
export const SURFACE_MAX_STRING = 4000
export const SURFACE_REVISION = 1
export const SURFACE_TIMEOUT_MS = 300_000
export const SURFACE_PROTOCOL = 'ekko-ui/v1'
export const SURFACE_PROTOCOL_V2 = 'ekko-ui/v2'
/** 服务端受理的协议版本（传输级；语义校验在渲染器，v2 独有节点由渲染器按版本拒绝）。 */
export const SURFACE_SUPPORTED_PROTOCOLS: ReadonlySet<string> = new Set([SURFACE_PROTOCOL, SURFACE_PROTOCOL_V2])

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const SURFACE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const ACTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export class SurfaceError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}

export interface SurfaceSpecEnvelope {
  protocol: string
  surfaceId: string
  title?: string
  fallbackText: string
  root: Record<string, unknown>
  state?: Record<string, unknown>
  submitSchema?: Record<string, unknown>
}

export interface SurfaceRequestInput {
  spec: SurfaceSpecEnvelope
  title?: string
  fallbackText?: string
  timeoutMs: number
}

export interface SurfaceSubmission {
  status: 'submitted' | 'cancelled' | 'expired' | 'closed'
  surface_id: string
  revision: number
  action_id?: string
  payload?: unknown
  reason?: string
}

function byteLength(value: unknown): number {
  // 预算化估算：DAG 型输入（共享子树）经 JSON.stringify 会按引用路径数展开，
  // 40 层共享 if 即 2^40 节点，stringify 会把请求处理挂死（2026-11-24 实测）。
  // 共享子树按出现次数重复计（与序列化语义一致），访问超上限视为超限。
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
  try { return estimate(value) } catch { return Number.MAX_SAFE_INTEGER }
}

/** 递归检查深度、节点数、危险键与字符串长度。 */
function scan(value: unknown, depth: number, state: { nodes: number }): void {
  if (depth > SURFACE_MAX_DEPTH) throw new SurfaceError(`spec nesting exceeds ${SURFACE_MAX_DEPTH}`)
  if (typeof value === 'string') {
    if (value.length > SURFACE_MAX_STRING) throw new SurfaceError(`string exceeds ${SURFACE_MAX_STRING} characters`)
    return
  }
  if (value === null || typeof value !== 'object') return
  state.nodes += 1
  if (state.nodes > SURFACE_MAX_NODES * 4) throw new SurfaceError('spec contains too many objects')
  if (Array.isArray(value)) {
    for (const item of value) scan(item, depth + 1, state)
    return
  }
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new SurfaceError(`spec contains forbidden key: ${key}`)
    scan(item, depth + 1, state)
  }
}

/** 递归检查深度、节点数、危险键与字符串长度，并施加规格字节上限。
 *  阻塞式与持久式界面共用：先在本函数完成传输级拦截，再做各自的语义校验。 */
export function scanSurfaceValue(value: unknown): void {
  scan(value, 0, { nodes: 0 })
  if (byteLength(value) > SURFACE_MAX_SPEC_BYTES) {
    throw new SurfaceError(`spec exceeds ${SURFACE_MAX_SPEC_BYTES} bytes`)
  }
}

/** 持久式界面的状态与提交内容也走同一套传输级检查，但用各自的大小上限。 */
export function scanSurfacePayload(value: unknown, maxBytes: number, label: string): void {
  scan(value, 0, { nodes: 0 })
  if (byteLength(value) > maxBytes) throw new SurfaceError(`${label} exceeds ${maxBytes} bytes`, 413)
}

export function parseSurfaceRequest(input: Record<string, unknown>): SurfaceRequestInput {
  const raw = input.spec
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfaceError('spec must be an object')
  const spec = raw as Record<string, unknown>
  if (typeof spec.protocol !== 'string' || !SURFACE_SUPPORTED_PROTOCOLS.has(spec.protocol)) {
    throw new SurfaceError(`spec.protocol must be ${SURFACE_PROTOCOL} or ${SURFACE_PROTOCOL_V2}`)
  }
  if (typeof spec.surfaceId !== 'string' || !SURFACE_ID_RE.test(spec.surfaceId)) {
    throw new SurfaceError('spec.surfaceId must be 1-64 letters, digits, underscores or dashes')
  }
  if (typeof spec.fallbackText !== 'string' || !spec.fallbackText.trim()) {
    throw new SurfaceError('spec.fallbackText is required')
  }
  if (!spec.root || typeof spec.root !== 'object' || Array.isArray(spec.root)) {
    throw new SurfaceError('spec.root must be an object')
  }
  if (byteLength(spec) > SURFACE_MAX_SPEC_BYTES) throw new SurfaceError(`spec exceeds ${SURFACE_MAX_SPEC_BYTES} bytes`)
  if (spec.state !== undefined) {
    if (!spec.state || typeof spec.state !== 'object' || Array.isArray(spec.state)) throw new SurfaceError('spec.state must be an object')
    if (byteLength(spec.state) > SURFACE_MAX_STATE_BYTES) throw new SurfaceError(`spec.state exceeds ${SURFACE_MAX_STATE_BYTES} bytes`)
  }
  scan(spec, 0, { nodes: 0 })

  let timeoutMs = SURFACE_TIMEOUT_MS
  if (input.timeout_ms !== undefined) {
    const requested = Number(input.timeout_ms)
    if (!Number.isFinite(requested) || requested < 1000 || requested > SURFACE_TIMEOUT_MS) {
      throw new SurfaceError(`timeout_ms must be 1000-${SURFACE_TIMEOUT_MS}`)
    }
    timeoutMs = Math.floor(requested)
  }
  return {
    spec: spec as unknown as SurfaceSpecEnvelope,
    title: typeof input.title === 'string' ? input.title.slice(0, 200) : undefined,
    fallbackText: spec.fallbackText as string,
    timeoutMs,
  }
}

export function parseSurfaceSubmission(actionId: unknown, payload: unknown): { actionId: string; payload?: unknown } {
  if (typeof actionId !== 'string' || !ACTION_ID_RE.test(actionId)) {
    throw new SurfaceError('action_id must be 1-64 letters, digits, underscores or dashes')
  }
  if (payload === undefined) return { actionId }
  const size = byteLength(payload)
  if (size > SURFACE_MAX_SUBMISSION_BYTES) throw new SurfaceError(`payload exceeds ${SURFACE_MAX_SUBMISSION_BYTES} bytes`)
  if (payload !== null && typeof payload !== 'object') {
    if (typeof payload === 'string' && payload.length > SURFACE_MAX_STRING) throw new SurfaceError('payload string is too long')
  } else {
    scan(payload, 0, { nodes: 0 })
  }
  return { actionId, payload }
}

export function surfaceIdFor(sessionId: string, specSurfaceId: string): string {
  return `srf:${sessionId}:${specSurfaceId}`
}
