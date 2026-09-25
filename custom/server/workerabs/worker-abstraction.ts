// overlay/workerabs 域：Worker 抽象（routa §七#12 P2 吸收，矩阵 §3.6 P2）。
//
// routa 语义（worker/types.ts:17-38,63-90：Worker 接口统一 local|docker|remote 三执行
// 环境 + capabilities 标签约束路由 + 健康状态机 REGISTERED→HEALTHY→SUSPECT→UNHEALTHY→DEAD
// 按心跳推进）：执行环境抽象——环境类型无关的任务派发面。本模块=健康状态机+
// capability 路由纯函数（执行环境接线归调度层）。
export type WorkerEnv = 'local' | 'docker' | 'remote'
export type WorkerHealth = 'registered' | 'healthy' | 'suspect' | 'unhealthy' | 'dead'

export interface WorkerFacts {
  workerId: string
  env: WorkerEnv
  capabilities: string[]
  /** 最近心跳距今（ms；null=从未）。 */
  lastHeartbeatAgoMs: number | null
}

const SUSPECT_MS = 30_000
const UNHEALTHY_MS = 90_000
const DEAD_MS = 300_000

/** 心跳→健康状态机（routa 按心跳推进语义）。 */
export function workerHealth(facts: WorkerFacts): WorkerHealth {
  const hb = facts.lastHeartbeatAgoMs
  if (hb === null) return 'registered'
  if (hb <= SUSPECT_MS) return 'healthy'
  if (hb <= UNHEALTHY_MS) return 'suspect'
  if (hb <= DEAD_MS) return 'unhealthy'
  return 'dead'
}

/** capability 路由（routa：任务要求 capability 集，worker 全含才可路由；healthy/suspect 可派）。 */
export function workerRoutable(facts: WorkerFacts, requiredCaps: readonly string[]): boolean {
  const health = workerHealth(facts)
  if (health !== 'healthy' && health !== 'suspect') return false
  return requiredCaps.every((c) => facts.capabilities.includes(c))
}
