// overlay/custom/server/__tests__/fleet-router-mount-order.test.ts
// 路由遮蔽守门（2026-09-21 驾驶舱 refresh-storm 根因一）：
// commandPost.fleetRouter 承载 GET /api/hermes/kanban/overview（全 board 聚合），
// 必须挂载在上游 kanbanRoutes（含 catch-all GET /api/hermes/kanban/:id）之前。
// 否则 /overview 被 :id 抢答 404"Task not found"，聚合端点失效 → 客户端
// refreshAllBoards 全部回落 N+1（13 板 = 14 请求/次），实测空闲 55s 内 65 次
// listTasks（avg ~1s，子进程支撑）形成请求风暴。本测试直读 patch 文件钉死挂载位。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 自本文件 3 级到 overlay 根（custom/server/__tests__）
const overlayRoot = resolve(__dirname, '../../..')
const patch196 = readFileSync(resolve(overlayRoot, 'patches/196-server-routes-command-post.patch'), 'utf8')
const patch202 = readFileSync(resolve(overlayRoot, 'patches/202-loop-graph-assembly.patch'), 'utf8')

describe('fleetRouter 挂载顺序守门（防 /api/hermes/kanban/overview 被 :id 遮蔽）', () => {
  it('196：恰好一处挂载行，且紧邻其后是上游 kanbanRoutes 挂载（先于 :id 路由）', () => {
    const mounts = patch196.split('\n').filter(l => l.startsWith('+') && l.includes('commandPost.fleetRouter.routes()'))
    expect(mounts.length, '挂载行应恰好一处').toBe(1)
    const lines = patch196.split('\n')
    const idx = lines.indexOf(mounts[0])
    expect(idx).toBeGreaterThan(0)
    expect(
      lines[idx + 1],
      '挂载行的下一行上下文应是 kanbanRoutes 挂载（fleetRouter 在前）',
    ).toBe('   app.use(kanbanRoutes.routes())')
  })

  it('196：不得再在尾部（graphRouter/initLoopSubsystem 附近）挂载', () => {
    expect(patch196).not.toMatch(/\+\s+app\.use\(commandPost\.fleetRouter\.routes\(\)\)\s*\/\/ overlay\[command-post\]: 舰队\/看板聚合\/团队\s*$/m)
  })

  it('202：不得以 commandPost.fleetRouter 行作上下文（移位后该行不在尾部区域）', () => {
    expect(patch202).not.toContain('commandPost.fleetRouter.routes()')
  })
})
