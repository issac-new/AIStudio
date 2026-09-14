// overlay/custom/server/services/hermes/__tests__/fleet-ws-whitelist.test.ts
// 守门：上游 http.ts 的 catch-all upgrade 白名单必须包含 overlay 的两个
// command-post WS 端点（/api/hermes/fleet/events、/api/hermes/kanban/overview/events）。
//
// 背景（2026-09-14 实机定性）：上游 catch-all 对非白名单路径同步
// socket.destroy()（bare hang-up，无 401 响应），先于 fleet-events.ts 的异步
// 鉴权执行——舰队流自 2.13 引入起生产从未连通（「舰队流未连接（需服务端
// 2.13+）」空态常显）。修复 = patch 251 把两条路径加入白名单。
//
// 断言对象是注入态上游文件：测试跑在 inject 之后，patch 丢失/上游重构导致
// 白名单漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 6 级到 ncwk 根（__tests__ → hermes → services → server → custom → overlay根 → ncwk），
// 再进 upstream/hermes-studio。
const HTTP_TS = resolve(
  __dirname,
  '../../../../../../upstream/hermes-studio/packages/server/src/bootstrap/http.ts',
)

describe('fleet/kanban-overview WS catch-all 白名单（patch 251 守门）', () => {
  const src = readFileSync(HTTP_TS, 'utf8')

  it('catch-all 升级守卫放行 /api/hermes/fleet/events', () => {
    expect(src).toContain(`url.pathname !== '/api/hermes/fleet/events'`)
  })

  it('catch-all 升级守卫放行 /api/hermes/kanban/overview/events', () => {
    expect(src).toContain(`url.pathname !== '/api/hermes/kanban/overview/events'`)
  })

  it('白名单条目位于 catch-all 销毁分支内（防漂移到他处无效放行）', () => {
    const catchAllIdx = src.indexOf('Catch-all: destroy upgrade requests')
    const destroyIdx = src.indexOf('socket.destroy()', catchAllIdx)
    const fleetIdx = src.indexOf(`url.pathname !== '/api/hermes/fleet/events'`, catchAllIdx)
    const overviewIdx = src.indexOf(`url.pathname !== '/api/hermes/kanban/overview/events'`, catchAllIdx)
    expect(catchAllIdx).toBeGreaterThan(-1)
    expect(fleetIdx).toBeGreaterThan(catchAllIdx)
    expect(overviewIdx).toBeGreaterThan(catchAllIdx)
    expect(fleetIdx).toBeLessThan(destroyIdx)
    expect(overviewIdx).toBeLessThan(destroyIdx)
  })
})
