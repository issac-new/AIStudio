// overlay/custom/server/loop/graph/event-log-registry.ts
// EventLogStore 共享注册簿（backlog② runs 注册表接入）：run-progress 摄取适配器
// （controllers/sim/run-ingest）与图装配（graph-assembly）必须共用同一事件日志实例，
// 推演 run 才与图 run 在同一注册表可见。装配侧单次注册；未装配（纯测试/宿主无 loop）
// 时取到 null，摄取方 fail-soft 跳过——不自建第二连接，避免同库双连接的序号与锁语义漂移。
import type { EventLogStore } from './event-log-store'

let shared: EventLogStore | null = null

export function registerEventLogStore(store: EventLogStore): void {
  shared = store
}

export function getEventLogStore(): EventLogStore | null {
  return shared
}

/** 测试用：清空注册簿，避免跨用例状态泄漏 */
export function resetEventLogStore(): void {
  shared = null
}
