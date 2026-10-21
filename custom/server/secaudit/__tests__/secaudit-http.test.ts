// overlay/secaudit 域：REST 集成测试（真 Koa 起服，按挂到 /api/governance/secaudit 的契约测）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { secAuditRoutes } from '../controller'
import { _useSecAuditStoreForTests } from '../store'

let app: Koa
let base: string
let storeDir: string

beforeAll(async () => {
  storeDir = mkdtempSync(join(tmpdir(), 'secaudit-http-'))
  _useSecAuditStoreForTests(join(storeDir, 'store.json'))
  app = new Koa()
  app.use(bodyParser())
  app.use(secAuditRoutes.routes())
  app.use(secAuditRoutes.allowedMethods())
  const server = await new Promise<ReturnType<Koa['listen']>>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const addr = server.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
  delete process.env.SECAUDIT_STORE
})

async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/governance/secaudit${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}

async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/governance/secaudit${path}`)
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}

describe('secaudit REST（/api/governance/secaudit）', () => {
  it('目录与项目 CRUD', async () => {
    const catalog = await get('/catalog')
    expect(catalog.status).toBe(200)
    expect((catalog.json.catalog as unknown[]).length).toBe(12)

    const bad = await post('/projects', { name: '', target: { kind: 'agent-deployment' } })
    expect(bad.status).toBe(400)

    const created = await post('/projects', {
      name: 'HTTP 审计', target: { kind: 'agent-deployment', hermesHome: '/tmp/h' }, createdBy: 'tester',
    })
    expect(created.status).toBe(201)
    const project = created.json.project as { projectId: string; fingerprint: string }
    expect(project.projectId).toMatch(/^proj-/)

    const got = await get(`/projects/${project.projectId}`)
    expect(got.status).toBe(200)
  })

  it('自证拒绝 → 409；三态门槛 → 400', async () => {
    const created = await post('/projects', { name: 'REST 纪律', target: { kind: 'agent-deployment' } })
    const project = created.json.project as { projectId: string }

    const cand = await post(`/projects/${project.projectId}/candidates`, {
      surfaceClass: 'tool_exec', title: 'x', detail: 'd', author: 'hunter',
      traceChain: 'a.ts:1', observation: '复现',
    })
    expect(cand.status).toBe(201)
    const finding = cand.json.finding as { findingId: string }

    const self = await post(`/projects/${project.projectId}/findings/${finding.findingId}/verify`, {
      verifier: 'hunter', status: 'confirmed',
    })
    expect(self.status).toBe(409)
    expect((self.json.problems as Array<{ code: string }>)[0].code).toBe('self_verification_forbidden')

    const noChain = await post(`/projects/${project.projectId}/candidates`, {
      surfaceClass: 'skills', title: 'y', detail: 'd', author: 'hunter',
    })
    const finding2 = (noChain.json.finding as { findingId: string }).findingId
    const badConfirm = await post(`/projects/${project.projectId}/findings/${finding2}/verify`, {
      verifier: 'v1', status: 'confirmed',
    })
    expect(badConfirm.status).toBe(400)
    const codes = (badConfirm.json.problems as Array<{ code: string }>).map((p) => p.code)
    expect(codes).toEqual(expect.arrayContaining(['missing_trace_chain', 'missing_observation']))

    const sevOnNv = await post(`/projects/${project.projectId}/findings/${finding2}/verify`, {
      verifier: 'v1', status: 'needs_validation', unknownFact: '事实 X 未解', severity: 'high',
    })
    expect(sevOnNv.status).toBe(400)

    const okConfirm = await post(`/projects/${project.projectId}/findings/${finding.findingId}/verify`, {
      verifier: 'v1', status: 'confirmed', severity: 'high',
    })
    expect(okConfirm.status).toBe(200)
  })

  it('报告期复核门禁：未复核 409，复核后放行', async () => {
    const created = await post('/projects', { name: '报告门禁', target: { kind: 'agent-deployment' } })
    const project = created.json.project as { projectId: string }
    const run = await post(`/projects/${project.projectId}/runs`, {})
    expect(run.status).toBe(201)
    const runId = (run.json.run as { runId: string }).runId

    const cand = await post(`/projects/${project.projectId}/candidates`, {
      surfaceClass: 'mcp', title: 'm', detail: 'd', author: 'h',
      traceChain: 'x', observation: 'y',
    })
    const finding = (cand.json.finding as { findingId: string }).findingId
    await post(`/projects/${project.projectId}/findings/${finding}/verify`, {
      verifier: 'v1', status: 'confirmed',
    })

    const blocked = await post(`/projects/${project.projectId}/runs/${runId}/finalize`, {})
    expect(blocked.status).toBe(409)

    await post(`/projects/${project.projectId}/findings/${finding}/record-review`, {
      reviewer: 'rr', outcome: 'verified',
    })
    const finalized = await post(`/projects/${project.projectId}/runs/${runId}/finalize`, {})
    expect(finalized.status).toBe(200)
    expect((finalized.json.report as { schema: string }).schema).toBe('secaudit-report/v1')

    const report = await get(`/projects/${project.projectId}/runs/${runId}/report`)
    expect(report.status).toBe(200)
  })
})
