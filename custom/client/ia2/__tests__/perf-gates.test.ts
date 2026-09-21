// overlay/custom/client/ia2/__tests__/perf-gates.test.ts
// 驾驶舱性能收敛源码级守门（2026-09-21）：
//   ① CockpitRunTraceModal 仅打开时挂载——无条件挂载时其内部
//      watch(needsSessionSelect, immediate) 会在冷启动跨全 profile 扫会话
//      （实测 24 profile ≈ 48 请求），弹窗从未打开也照发。
//   ② useSessionRows unreadOf 走 Map 查表——O(行×房间) 的逐行 find 在
//      矩阵房间多时拖慢 sessionRows 每次重算。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ia2Root = resolve(__dirname, '..')
const clientRoot = resolve(ia2Root, '..')

describe('驾驶舱性能收敛守门（源码级）', () => {
  it('IaShell：RunTraceModal 仅在 runTraceOpen 时挂载', () => {
    const src = readFileSync(resolve(ia2Root, 'views/IaShell.vue'), 'utf8')
    expect(src).toContain('<CockpitRunTraceModal v-if="cockpit.runTraceOpen" />')
    expect(src).not.toMatch(/<CockpitRunTraceModal\s*\/>/)
  })

  it('useSessionRows：unreadOf 用 roomById Map 查表，不逐行 find', () => {
    const src = readFileSync(resolve(ia2Root, 'composables/useSessionRows.ts'), 'utf8')
    expect(src).toContain('roomById.value.get(id)')
    expect(src).not.toContain('sortedRooms ?? []).find((r')
  })

  it('cockpit store：不再开第二条看板聚合 WS（connectOverviewStream 不在 initFleetStream）', () => {
    const src = readFileSync(resolve(clientRoot, 'cockpit/store/cockpit.ts'), 'utf8')
    expect(src).not.toContain('fleetAdapter.connectOverviewStream')
  })
})
