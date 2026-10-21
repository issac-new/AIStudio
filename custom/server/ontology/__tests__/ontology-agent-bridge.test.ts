// FIBO agent 桥守门（2026-10-21 产品落地）：
//   GET /api/ontology/agent-bridge/fibo 无 q = 覆盖度；有 q = 术语命中；
//   导入 FIBO 包后 applied 翻转；loopback + 可选 token 闸。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

let dir: string
let server: Server | null = null
let base = ''

async function startBridge(env: Record<string, string | undefined> = {}): Promise<void> {
  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { registerOntologyAgentBridgeRoutes } = await import('../ontology-agent-bridge')
  const app = new Koa()
  registerOntologyAgentBridgeRoutes(app as never, env)
  server = createServer(app.callback())
  await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res))
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

async function stopBridge(): Promise<void> {
  if (server) await new Promise<void>((res) => server!.close(() => res()))
  server = null
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ontobridge-'))
  process.env.ONTOLOGY_DIR = dir
})

afterEach(async () => {
  delete process.env.ONTOLOGY_DIR
  await stopBridge()
  rmSync(dir, { recursive: true, force: true })
})

describe('GET /api/ontology/agent-bridge/fibo', () => {
  it('无 q 返回发布版本与覆盖度；有 q 返回真实 IRI 命中', async () => {
    await startBridge()
    const r1 = await fetch(`${base}/api/ontology/agent-bridge/fibo`)
    expect(r1.status).toBe(200)
    const j1 = await r1.json() as any
    expect(j1.ok).toBe(true)
    expect(j1.source.release).toBe('master_2026Q3')
    expect(j1.coverage.concepts).toBe(36)
    expect(j1.coverage.applied).toBe(0)
    expect(j1.coverage.fibo).toBe(32)
    expect(j1.coverage.commons).toBe(2)
    expect(j1.coverage.localExtensions).toBe(2)
    expect(j1.hits).toEqual([])

    const r2 = await fetch(`${base}/api/ontology/agent-bridge/fibo?q=Payment`)
    const j2 = await r2.json() as any
    expect(j2.hits.length).toBeGreaterThan(0)
    const payment = j2.hits.find((h: any) => h.id === 'Payment')
    expect(payment).toBeTruthy()
    expect(payment.iri).toBe('https://spec.edmcouncil.org/fibo/ontology/FND/ProductsAndServices/PaymentsAndSchedules/Payment')
    expect(payment.definitionEn).toContain('delivery of money')
    expect(payment.applied).toBe(false)
  })

  it('导入后 applied 翻转，覆盖度达到 36/36', async () => {
    const { loadSpec, saveSpec } = await import('../ontology-store')
    const { mergeFiboPack } = await import('../ontology-fibo')
    const merged = mergeFiboPack(loadSpec(), 0)
    expect(merged.ok).toBe(true)
    saveSpec(merged.spec!, 'test', 0)

    await startBridge()
    const r = await fetch(`${base}/api/ontology/agent-bridge/fibo?q=Settlement`)
    const j = await r.json() as any
    expect(j.coverage.applied).toBe(36)
    const settlement = j.hits.find((h: any) => h.id === 'Settlement')
    expect(settlement).toBeTruthy()
    expect(settlement.applied).toBe(true)
    expect(settlement.origin).toBe('fibo')
    expect(settlement.module).toBe('FBC/FinancialInstruments/Settlement')
  })

  it('设置令牌后缺令牌 401、带令牌 200（fail-closed）', async () => {
    await startBridge({ ONTOLOGY_BRIDGE_TOKEN: 'secret' })
    const r1 = await fetch(`${base}/api/ontology/agent-bridge/fibo`)
    expect(r1.status).toBe(401)
    const r2 = await fetch(`${base}/api/ontology/agent-bridge/fibo`, { headers: { 'x-ontology-bridge-token': 'secret' } })
    expect(r2.status).toBe(200)
  })
})
