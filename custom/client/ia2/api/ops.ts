// overlay/custom/client/ia2/api/ops.ts
// 签 3 运行观测数据面（B4 工单，R1/R2——设计正本 §二 推演关注面 S-ops）。
// 消费 X1 端点：GET /api/hermes/sim/topology（四服务 /health 探测代理）、
// GET /api/hermes/sim/dispatcher-health（634 CLI 包一层）、
// GET /api/hermes/sim/sleeping-workers（635 CLI）。纯函数层（行视图整形）
// =单测锚点；fetch 层薄封装。红点如实显示：探测失败=红+原因，不静默。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像）──

export interface ServiceProbe {
  ok: boolean
  status?: number
  latency_ms: number
  error?: string
}

export interface TopologyResponse {
  services: Record<string, ServiceProbe>
  checkedAt: string
}

export interface CliHealthResponse {
  ok: boolean
  data?: unknown
  error?: string
}

export interface ServiceRow {
  name: string
  ok: boolean
  latency_ms: number
  detail: string
}

// ── 纯函数层（测试锚点）──

const SERVICE_ORDER = ['gateway', 'studio', 'synapse', 'hindsight'] as const

/** 拓扑行视图（R1：异常红显不靠翻日志）：按四服务固定位次排，detail=延迟或失败原因。 */
export function topologyRows(services: Record<string, ServiceProbe>): ServiceRow[] {
  const names = [...SERVICE_ORDER, ...Object.keys(services).filter(n => !(SERVICE_ORDER as readonly string[]).includes(n))]
  return names.map(name => {
    const p = services[name]
    if (!p) return { name, ok: false, latency_ms: 0, detail: '未探测到（端点未返回该服务）' }
    return {
      name,
      ok: p.ok,
      latency_ms: p.latency_ms,
      detail: p.ok ? `${p.latency_ms}ms${p.status ? `（HTTP ${p.status}）` : ''}` : String(p.error ?? `HTTP ${p.status ?? '?'}`),
    }
  })
}

/** CLI 健康输出整形：对象→键值行；raw 文本→原文行；失败→错误行。 */
export function cliHealthEntries(res: CliHealthResponse): Array<{ k: string; v: string }> {
  if (!res.ok) return [{ k: '错误', v: String(res.error ?? 'CLI 执行失败') }]
  const data = res.data
  if (data && typeof data === 'object' && !Array.isArray(data) && !('raw' in (data as Record<string, unknown>))) {
    return Object.entries(data as Record<string, unknown>).map(([k, v]) => ({
      k,
      v: typeof v === 'object' ? JSON.stringify(v) : String(v),
    }))
  }
  const raw = data && typeof data === 'object' && 'raw' in (data as Record<string, unknown>)
    ? String((data as Record<string, unknown>).raw)
    : String(data ?? '')
  return raw ? [{ k: '输出', v: raw }] : [{ k: '输出', v: '（空输出）' }]
}

/** 休眠工作者行（635 契约 {idle_sec, sleeping[]}；形状漂移时整表降级为原文行）。 */
export function sleepingRows(res: CliHealthResponse): Array<Record<string, string>> {
  if (!res.ok) return [{ 错误: String(res.error ?? 'CLI 执行失败') }]
  const data = res.data as { sleeping?: unknown; idle_sec?: unknown } | undefined
  if (!data || typeof data !== 'object' || !Array.isArray(data.sleeping)) {
    return [{ 输出: JSON.stringify(data ?? {}) }]
  }
  return data.sleeping.map((w: unknown) => {
    const r = w as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return out
  })
}

// ── fetch 层（薄封装）──

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchTopology(): Promise<TopologyResponse> {
  return getJson('/api/hermes/sim/topology')
}

export function fetchDispatcherHealth(): Promise<CliHealthResponse> {
  return getJson('/api/hermes/sim/dispatcher-health')
}

export function fetchSleepingWorkers(): Promise<CliHealthResponse> {
  return getJson('/api/hermes/sim/sleeping-workers')
}
