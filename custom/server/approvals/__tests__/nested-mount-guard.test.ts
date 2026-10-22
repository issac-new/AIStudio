// 2026-10-22 走查批守门：human-gate / pipeline 两簇嵌套挂载可达性。
// 同 secaudit-nested-mount.test.ts 的根因——@koa/router 15.x 绝对前缀子路由被父
// 路由嵌套 use 会拼双前缀整族 404（上线即死，端点对账审计实锚）。生产形态探活。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Koa from 'koa'
import Router from '@koa/router'
import { humanGateRouter } from '../human-gate'

describe('human-gate / pipeline 生产形态挂载守门', () => {
  it('approvals 父路由嵌套下 GET /api/approvals/human-gate 非 404', async () => {
    const parent = new Router({ prefix: '/api/approvals' })
    parent.use('/human-gate', humanGateRouter.routes(), humanGateRouter.allowedMethods())
    const app = new Koa()
    app.use(parent.routes())
    app.use(parent.allowedMethods())
    const server = app.listen(0)
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/approvals/human-gate`)
      expect(res.status).not.toBe(404)
    } finally {
      server.close()
    }
  })

  it('两簇源码锚定：子路由无绝对前缀＋父路由按路径挂载', () => {
    const hg = readFileSync(resolve(__dirname, '../human-gate.ts'), 'utf-8')
    expect(hg).toContain('export const humanGateRouter = new Router()')
    expect(hg).not.toContain("prefix: '/api/approvals/human-gate'")
    const pc = readFileSync(resolve(__dirname, '../../pipeline/pipeline-controller.ts'), 'utf-8')
    expect(pc).toContain('const router = new Router()')
    const ci = readFileSync(resolve(__dirname, '../../clusterinspector/cluster-inspector-controller.ts'), 'utf-8')
    expect(ci).toContain("router.use('/pipeline', createPipelineRouter(pipelineEngine).routes())")
  })
})
