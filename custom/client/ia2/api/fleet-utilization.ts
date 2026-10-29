// overlay/custom/client/ia2/api/fleet-utilization.ts
// 舰队利用率遥测数据面（自我觉察 spec §4 舰队层）：消费 GET /api/sim/fleet-utilization
// （controllers/sim/fleet-utilization.ts 镜像类型）。fetch 薄封装照 api/overview.ts 模式：
// 失败抛错由调用方决定呈现——本端点消费面是 fail-soft 隐藏条，捕获即整条不渲染（N1）。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像，锚 controllers/sim/fleet-utilization.ts） ──

export interface FleetDomainStat {
  domain: string
  label: string
  staffed: number
  active: number
  recent: number
  /** 域内最近一次 API 调用距扫描时刻的秒数；无活动数据=null 如实缺席 */
  lastActivityAgoSec: number | null
  /** 饱和度=active/staffed 百分比（四舍五入）；staffed=0 记 0 */
  saturationPct: number
}

export interface FleetSummary {
  staffed: number
  active: number
  saturationPct: number
  /** 闲置容量=staffed-active（阶段切换时的可派发余量，非考核口径） */
  idleCapacity: number
}

export interface FleetUtilizationResponse {
  /** K19 统一出口：ok=true（unavailable 降级也是 ok:true+available:false） */
  ok?: boolean
  available: boolean
  domains?: FleetDomainStat[]
  fleet?: FleetSummary
  windows?: { activeMin: number; recentMin: number }
  fetchedAt?: number
  cached?: boolean
  note?: string
}

export function fetchFleetUtilization(): Promise<FleetUtilizationResponse> {
  return (async () => {
    const res = await authFetch('/api/sim/fleet-utilization')
    if (!res.ok) throw new Error(`/api/sim/fleet-utilization → ${res.status}`)
    return res.json() as Promise<FleetUtilizationResponse>
  })()
}
