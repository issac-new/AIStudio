// 跨实例只读检索推演会话 API（2026-10-27 立项批）。
// 服务端 simcenter /observer/sessions：只读扫 SIM 根各 profile state.db 的
// sessions 表；SIM 根缺席返回 available:false（fail-soft——弹窗不显示推演组，
// 日常检索不受影响）。request 走动态 import 同 roster 先例不适用于本文件——
// 本文件自身被动态引入，静态 request 依赖可接受（与 sim-observer.ts 同形态）。
import { request } from '@/api/client'

export interface ObserverSessionHit {
  id: string
  profile: string
  chatType: string
  displayName: string
}

export interface ObserverSessionsResult {
  available: boolean
  reason?: string
  results?: ObserverSessionHit[]
  fetchedAt?: number
}

export function fetchObserverSessions(q: string, limit = 50): Promise<ObserverSessionsResult> {
  return request(`/api/hermes/sim/observer/sessions?q=${encodeURIComponent(q)}&limit=${limit}`)
}
