// 日常侧推演观察 API（2026-10-21 挂账实施轮）。
// 服务端 simcenter /observer/overview：只读聚合当前 SIM run 的房间键与跨板任务；
// fail-soft——SIM 根缺席返回 available:false，不抛错（日常数据面不受影响）。
// request 走动态 import：store 静态依赖链不拉 @/api/client（node 环境测试面
// 不经 router 初始化，与 workspace store 动态引 kanban store 同一先例）。
export interface SimObserverRoom {
  key: string
  roomId: string
}

export interface SimObserverBoard {
  slug: string
  name?: string
  total?: number
  archived?: boolean
}

export interface SimObserverOverview {
  available: boolean
  reason?: string
  runId?: string | null
  posture?: string
  startedAt?: number | null
  rooms?: SimObserverRoom[]
  boards?: SimObserverBoard[]
  tasks?: Array<{ board?: string; task?: Record<string, unknown> & { id?: string } }>
  fetchedAt?: number
}

export async function fetchSimObserverOverview(): Promise<SimObserverOverview> {
  const { request } = await import('@/api/client')
  return request<SimObserverOverview>('/api/hermes/sim/observer/overview')
}
