// overlay：在场两维徽标（multica §六 2.1 吸收，矩阵 §3.5 P2）。
//
// multica 语义（agents/presence.ts：availability 与 workload 拆成两个独立维度）：
// - **availability**（连通性）：online / unstable / offline 圆点；
// - **workload**（负载）：working / queued / idle 芯片。
// 两维分离的目的（multica 原文）："在线但闲着"与"离线但队里有活"一眼可分——合并成
// 单状态就丢了这个信息。本模块=两维投影纯函数（徽标数据面，渲染层分画圆点+芯片）。
export type Availability = 'online' | 'unstable' | 'offline'
export type Workload = 'working' | 'queued' | 'idle'

export interface PresenceFacts {
  /** 最近心跳距今（ms；null=无心跳记录）。 */
  lastHeartbeatAgoMs: number | null
  /** 正在跑的 run 数。 */
  running: number
  /** 排队中 run 数。 */
  queued: number
}

export interface PresenceTwoAxis {
  availability: Availability
  workload: Workload
  /** 两维分离语义备注（UI tooltip：在线但闲/离线但忙等组合自明）。 */
  combo: string
}

const STALE_MS = 90_000
const UNSTABLE_MS = 30_000

/** 事实→两维（多 agent 在场视图：圆点+芯片分画）。 */
export function presenceTwoAxis(facts: PresenceFacts): PresenceTwoAxis {
  const hb = facts.lastHeartbeatAgoMs
  const availability: Availability =
    hb === null ? 'offline'
    : hb <= UNSTABLE_MS ? 'online'
    : hb <= STALE_MS ? 'unstable'
    : 'offline'
  const workload: Workload =
    facts.running > 0 ? 'working'
    : facts.queued > 0 ? 'queued'
    : 'idle'
  return { availability, workload, combo: `${availability}-${workload}` }
}
