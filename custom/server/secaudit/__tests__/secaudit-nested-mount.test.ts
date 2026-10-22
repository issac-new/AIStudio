// 2026-10-22 走查批守门：secaudit 子路由必须能在「生产同款嵌套挂载」下可达。
// 历史盲区：本文件前的 http 测试曾直接 app.use(secAuditRoutes.routes())（绝对前缀
// 独立可用），生产却是 governance 父路由嵌套——绝对前缀写法双前缀整族 404 上线
// 即死，直挂测试永远绿。生产形态=governance(prefix /api/governance) +
// router.use('/secaudit') + 无前缀子路由；secaudit-http.test.ts 也已改为该拓扑。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Koa from 'koa'
import Router from '@koa/router'
import { secAuditRoutes } from '../controller'

describe('secaudit 生产形态挂载守门', () => {
  it('governance 父路由嵌套下 /api/governance/secaudit/catalog 可达（非 404）', async () => {
    const parent = new Router({ prefix: '/api/governance' })
    parent.use('/secaudit', secAuditRoutes.routes(), secAuditRoutes.allowedMethods())
    const app = new Koa()
    app.use(parent.routes())
    app.use(parent.allowedMethods())
    const server = app.listen(0)
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/governance/secaudit/catalog`)
      expect(res.status).toBe(200)
      const body = await res.json() as { ok?: boolean }
      expect(body.ok).toBe(true)
    } finally {
      server.close()
    }
  })

  it('子路由不得自带绝对前缀（嵌套双前缀回归守门，源码锚定）', () => {
    const src = readFileSync(resolve(__dirname, '../controller.ts'), 'utf-8')
    expect(src).toContain('export const secAuditRoutes = new Router()')
    expect(src).not.toContain("prefix: '/api/governance/secaudit'")
    const gov = readFileSync(resolve(__dirname, '../../governance/governance-controller.ts'), 'utf-8')
    expect(gov).toContain("router.use('/secaudit', secAuditRoutes.routes(), secAuditRoutes.allowedMethods())")
  })
})

