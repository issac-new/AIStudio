// 信号问题记录路由守门（B6，2026-11-28）：创建校验、来源键幂等、锚点缺席如实、
// 关闭须登录（AISTUDIO_LOCAL_OPERATOR 显式单机面）、重复关闭拒绝。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import { listSignalIssues } from '../issue-store'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'obs-issues-routes-'))
  process.env.OBS_ISSUES_STORE = join(dir, 'issues.json')
  process.env.RUN_MANIFEST_DIR = join(dir, 'run-manifests') // 空目录：锚点查不到走如实缺席
  delete process.env.AISTUDIO_LOCAL_OPERATOR

  const app = new Koa()
  app.use(bodyParser())
  app.use(async (ctx, next) => {
    // 与 requireAuthenticatedActor 无关：显式单机面由 env 承担；这里只挂 body 解析
    await next()
  })
  const { harnessRoutes } = await import('../../harness/harness-controller')
  app.use(harnessRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  server.close()
  for (const k of ['OBS_ISSUES_STORE', 'RUN_MANIFEST_DIR', 'AISTUDIO_LOCAL_OPERATOR']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const post = async (path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const get = async (path: string): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('POST /api/harness/obs-issues（建单）', () => {
  it('sourceKind 非法 400；sourceKey 缺失 400（告警稳定键约定 kind@窗口起点）', async () => {
    const badKind = await post('/api/harness/obs-issues', { sourceKind: 'other', sourceKey: 'k@1', title: 't' })
    expect(badKind.status).toBe(400)
    const noKey = await post('/api/harness/obs-issues', { sourceKind: 'obs-alert', title: 't' })
    expect(noKey.status).toBe(400)
    expect(listSignalIssues()).toHaveLength(0)
  })

  it('告警建单：created=true；重复来源键幂等（created=false 同 issueId，不重复留痕）', async () => {
    const payload = { sourceKind: 'obs-alert', sourceKey: 'quality_drop@1790000000', title: '评测通过率较基线下降', severity: 'warn', detail: '0.82 vs 0.90' }
    const first = await post('/api/harness/obs-issues', payload)
    expect(first.status).toBe(200)
    expect(first.body.created).toBe(true)
    const again = await post('/api/harness/obs-issues', payload)
    expect(again.status).toBe(200)
    expect(again.body.created).toBe(false)
    expect((again.body.record as Record<string, unknown>).issueId).toBe((first.body.record as Record<string, unknown>).issueId)
    expect(listSignalIssues()).toHaveLength(1)
  })

  it('runId 给了但清单查不到：锚点为 null 且说明写明「查不到」，不猜版本', async () => {
    const { body } = await post('/api/harness/obs-issues', { sourceKind: 'incident', sourceKey: 'incident:sess-x', title: '事故', severity: 'high', detail: 'd', runId: 'run-gone' })
    const record = body.record as Record<string, unknown>
    expect(record.anchors).toBeNull()
    expect(record.anchorNote as string).toContain('查不到')
  })

  it('GET /obs-issues 列出已建记录', async () => {
    await post('/api/harness/obs-issues', { sourceKind: 'obs-alert', sourceKey: 'k@7', title: '延迟尖峰', severity: 'warn', detail: 'd' })
    const { body } = await get('/api/harness/obs-issues')
    expect(body.ok).toBe(true)
    expect(body.issues as unknown[]).toHaveLength(1)
  })
})

describe('POST /api/harness/obs-issues/:id/close（关闭）', () => {
  it('未登录且未设 AISTUDIO_LOCAL_OPERATOR：401', async () => {
    const created = await post('/api/harness/obs-issues', { sourceKind: 'obs-alert', sourceKey: 'k@8', title: 't', severity: 'warn', detail: 'd' })
    const id = (created.body.record as Record<string, unknown>).issueId as string
    const { status, body } = await post(`/api/harness/obs-issues/${id}/close`, { closureNote: '回归已过' })
    expect(status).toBe(401)
    expect((body as { code?: string }).code).toBe('authenticated_actor_required')
    expect(listSignalIssues()[0]!.status).toBe('open')
  })

  it('登录（显式单机操作者）：关闭写 closedBy；重复关闭 409；不存在 404', async () => {
    process.env.AISTUDIO_LOCAL_OPERATOR = 'p-1'
    const created = await post('/api/harness/obs-issues', { sourceKind: 'obs-alert', sourceKey: 'k@9', title: 't', severity: 'warn', detail: 'd' })
    const id = (created.body.record as Record<string, unknown>).issueId as string
    const okClose = await post(`/api/harness/obs-issues/${id}/close`, { closureNote: '回归评测已通过，关闭' })
    expect(okClose.status).toBe(200)
    expect((okClose.body.record as Record<string, unknown>).status).toBe('closed')
    expect((okClose.body.record as Record<string, unknown>).closedBy).toBe('p-1')
    const again = await post(`/api/harness/obs-issues/${id}/close`, { closureNote: '再关一次' })
    expect(again.status).toBe(409)
    const missing = await post('/api/harness/obs-issues/sig-none/close', { closureNote: 'x' })
    expect(missing.status).toBe(404)
  })

  it('关闭说明为空：409 拒绝（不落账）', async () => {
    process.env.AISTUDIO_LOCAL_OPERATOR = 'p-1'
    const created = await post('/api/harness/obs-issues', { sourceKind: 'obs-alert', sourceKey: 'k@10', title: 't', severity: 'warn', detail: 'd' })
    const id = (created.body.record as Record<string, unknown>).issueId as string
    const { status } = await post(`/api/harness/obs-issues/${id}/close`, { closureNote: '   ' })
    expect(status).toBe(409)
    expect(listSignalIssues()[0]!.status).toBe('open')
  })
})
