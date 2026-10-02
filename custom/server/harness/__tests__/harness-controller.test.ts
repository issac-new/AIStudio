// 驾驭工程治理面 HTTP 投影守门：四子路由 200 + 结构断言（真 koa + fetch），
// fixture 全 tmpdir 隔离（不触真 home/真仓）。与 board-graph.test.ts 同款范式。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'harness-http-'))
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
  process.env.HARNESS_STUDIO_DB = join(dir, 'no-studio.db') // 缺席 → token 账如实降级
  process.env.HERMES_MCP_CONFIG_DIR = join(dir, 'mcp')
  process.env.HERMES_SKILLS_DIR = join(dir, 'no-skills')
  process.env.GOVERNANCE_REPO = join(dir, 'no-repo')
  process.env.HERMES_TRACES_DIR = join(dir, 'no-traces')
  process.env.CHANGE_GOV_DB = join(dir, 'change-gov.db')
  process.env.HERMES_APPROVAL_RULES_FILE = join(dir, 'no-rules.json')
  process.env.GOVERNANCE_QGATE_GATE_PACKS = join(dir, 'no-packs')
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'no-ledger.jsonl')
  // mcp 假配置：一个 authorized server
  mkdirSync(join(dir, 'mcp'), { recursive: true })
  writeFileSync(join(dir, 'mcp', 'demo.json'), JSON.stringify({ name: 'demo', scope: 'global', timeoutMs: 1000, authState: 'authorized', updatedAt: 1 }))

  const store = await import('../../governance/change-governance-store')
  store.resetChangeGovDbForTest()

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { harnessRoutes } = await import('../harness-controller')
  const app = new Koa()
  app.use(harnessRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
})

afterEach(async () => {
  server.close()
  for (const k of ['HERMES_HOME', 'HARNESS_STUDIO_DB', 'HERMES_MCP_CONFIG_DIR', 'HERMES_SKILLS_DIR', 'GOVERNANCE_REPO', 'HERMES_TRACES_DIR', 'CHANGE_GOV_DB', 'HERMES_APPROVAL_RULES_FILE', 'GOVERNANCE_QGATE_GATE_PACKS', 'GOVERNANCE_DISPATCH_LEDGER']) {
    delete process.env[k]
  }
  const store = await import('../../governance/change-governance-store')
  store.resetChangeGovDbForTest()
  rmSync(dir, { recursive: true, force: true })
})

const get = async (path: string): Promise<{ status: number; body: any }> => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() }
}

describe('四子路由 HTTP 投影', () => {
  it('GET /api/harness/capability-catalog：200 + entries/gapSummary/meta；source 过滤生效', async () => {
    const { status, body } = await get('/api/harness/capability-catalog')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body.entries.some((e: any) => e.id === 'demo' && e.source === 'mcpcatalog')).toBe(true)
    expect(typeof body.gapSummary.overall.gapRate).toBe('number')
    expect(body.meta.notDoing).toContain('不在本轮')
    const filtered = await get('/api/harness/capability-catalog?source=mcpcatalog')
    expect(filtered.body.entries.every((e: any) => e.source === 'mcpcatalog')).toBe(true)
  })

  it('GET /api/harness/cost-accounts：200 + 恒六账 + _defs 六键 + days 回显', async () => {
    const { status, body } = await get('/api/harness/cost-accounts?days=7')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.days).toBe(7)
    expect(body.accounts.map((a: any) => a.key)).toEqual([
      'token', 'humanIntervention', 'toolExecution', 'waitLatency', 'rework', 'securityGovernance',
    ])
    expect(Object.keys(body._defs)).toHaveLength(6)
    // 隔离环境：token 账缺席如实 available=false，不猜数
    const token = body.accounts.find((a: any) => a.key === 'token')
    expect(token.available).toBe(false)
    expect(token.data.totalTokens).toBeNull()
    // 非法 days 回落 7
    const fallback = await get('/api/harness/cost-accounts?days=abc')
    expect(fallback.body.days).toBe(7)
  })

  it('GET /api/harness/maturity：200 + L1-L5 + mttr unavailable + meta 自检清单非认证', async () => {
    const { status, body } = await get('/api/harness/maturity?days=7')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.levels.map((l: any) => l.key)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5'])
    for (const lv of body.levels) {
      for (const it of lv.items) expect(typeof it.evidence).toBe('string')
    }
    const mttr = body.metrics.find((m: any) => m.key === 'mttr')
    expect(mttr.value).toBeNull()
    expect(mttr.note).toBeTruthy()
    expect(body.meta.note).toContain('自检清单非认证')
  })

  it('GET /api/harness/primitives：200 + 八原语 + 覆盖矩阵三态和=8', async () => {
    const { status, body } = await get('/api/harness/primitives')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.primitives).toHaveLength(8)
    const idAttr = body.matrix.byAttribute.identity
    expect(idAttr['有'] + idAttr['部分'] + idAttr['缺']).toBe(8)
    expect(typeof body.matrix.fullyCovered).toBe('number')
    const task = body.primitives.find((p: any) => p.key === 'task')
    expect(task.liveCountNote ?? 'counted').toBeTruthy()
  })
})
