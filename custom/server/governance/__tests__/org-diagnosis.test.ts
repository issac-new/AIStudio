// 五流断点诊断守门（甲1，2026-09-30 调研落地）：信号结构/断点判定/诚实降级/复发候选/HTTP 200。
// fixture 全 tmp 隔离（GOVERNANCE_DIR/GOVERNANCE_DISPATCH_LEDGER/HERMES_ESCALATION_DIR/
// GOVERNANCE_QGATE_RUNS/HERMES_HOME 五 env 指向 tmp，不碰主机真数据）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
let escDir: string
let govDir: string
let qgateDir: string
let homeDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orgdiag-'))
  escDir = join(dir, 'esc')
  govDir = join(dir, 'gov')
  qgateDir = join(dir, 'qgate-runs')
  homeDir = join(dir, 'home')
  mkdirSync(escDir); mkdirSync(govDir); mkdirSync(qgateDir); mkdirSync(homeDir)
  // 空白能力台账（语义缺册信号的分母来自派发台账，分子=不在册 specialist）
  writeFileSync(join(govDir, 'capability-ledger.yaml'),
    'version: 1\nreviewedAt: "2026-09-30"\ndomains: []\ncapabilities: []\nunits: []\n')
  process.env.HERMES_ESCALATION_DIR = escDir
  process.env.GOVERNANCE_DIR = govDir
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'dispatch.jsonl')
  process.env.GOVERNANCE_QGATE_RUNS = qgateDir
  process.env.HERMES_HOME = homeDir
})

afterEach(() => {
  for (const k of ['HERMES_ESCALATION_DIR', 'GOVERNANCE_DIR', 'GOVERNANCE_DISPATCH_LEDGER', 'GOVERNANCE_QGATE_RUNS', 'HERMES_HOME']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function esc(id: string, tool: string, at: number, opts: {
  state?: 'pending' | 'approved' | 'denied'
  attributionGap?: string
  decidedAt?: number
} = {}): void {
  const doc: Record<string, unknown> = {
    escalationId: id, fromAgent: 'zcode', scope: { tool }, urgency: 'normal',
    reason: 'r', at, state: opts.state ?? 'pending',
  }
  if (doc.state !== 'pending') {
    doc.decision = { by: 'c', at: opts.decidedAt ?? at + 1000 }
    if (opts.attributionGap) doc.attribution = { gap: opts.attributionGap, by: 'c', at: at + 2000 }
  }
  writeFileSync(join(escDir, `${id}.json`), JSON.stringify(doc))
}

describe('五流断点诊断（甲1）', () => {
  it('五流全在、每流带 essence 与信号；空数据源诚实 unknown 不编造', async () => {
    const { orgDiagnosis } = await import('../org-diagnosis')
    const r = await orgDiagnosis({ now: 1_800_000_000_000 })
    expect(r.flows.map((f) => f.flow)).toEqual(
      ['information', 'decision', 'responsibility', 'resource', 'feedback'])
    for (const f of r.flows) {
      expect(f.essence.length).toBeGreaterThan(5)
      expect(f.signals.length).toBeGreaterThanOrEqual(2)
      for (const s of f.signals) {
        expect(['ok', 'warn', 'alert', 'unknown']).toContain(s.severity)
        expect(s.evidence.length).toBeGreaterThan(3)
      }
    }
    // 空源：升级域 0 条 → 决策流两个信号 unknown；无派发台账 → 送达率 unknown
    const decision = r.flows.find((f) => f.flow === 'decision')!
    expect(decision.signals.find((s) => s.id === 'escalation.pendingAging')!.severity).toBe('unknown')
    expect(decision.signals.find((s) => s.id === 'dispatch.undelivered')!.severity).toBe('unknown')
  })

  it('断点判定：pending 超 72h=alert；未归因=warn 且入 unattributed 列表', async () => {
    const now = 1_800_000_000_000
    esc('old-pending', 'terminal', now - 80 * 3600 * 1000) // 80h 未裁决
    esc('fresh-decided', 'terminal', now - 3600 * 1000, { state: 'approved' }) // 裁决未归因
    const { orgDiagnosis } = await import('../org-diagnosis')
    const r = await orgDiagnosis({ now })
    const decision = r.flows.find((f) => f.flow === 'decision')!
    expect(decision.signals.find((s) => s.id === 'escalation.pendingAging')!.severity).toBe('alert')
    const unattr = decision.signals.find((s) => s.id === 'escalation.unattributed')!
    expect(unattr.severity).toBe('warn')
    expect(unattr.value).toBe('1/1')
    expect(r.unattributed).toHaveLength(1)
    expect(r.unattributed[0].escalationId).toBe('fresh-decided')
  })

  it('语义缺册：column 派单 specialist 不在台账 → information 流断点', async () => {
    const now = 1_800_000_000_000
    writeFileSync(process.env.GOVERNANCE_DISPATCH_LEDGER!,
      JSON.stringify({ ts: now, kind: 'column', target: 'zcode', specialist: 'ghost-unit', column: 'doing', reason: 'queued', commandId: 'c1' }) + '\n')
    const { orgDiagnosis } = await import('../org-diagnosis')
    const r = await orgDiagnosis({ now })
    const info = r.flows.find((f) => f.flow === 'information')!
    const sig = info.signals.find((s) => s.id === 'dispatch.semanticMissing')!
    expect(sig.value).toBe('1/1')
    expect(sig.severity).toBe('alert') // 100% > 50% 断点阈值
  })

  it('未送达：deferred 派发占比 100% → decision 流 alert', async () => {
    const now = 1_800_000_000_000
    writeFileSync(process.env.GOVERNANCE_DISPATCH_LEDGER!,
      JSON.stringify({ ts: now, kind: 'mention', target: 'zcode', reason: 'deferred', commandId: 'c2' }) + '\n')
    const { orgDiagnosis } = await import('../org-diagnosis')
    const r = await orgDiagnosis({ now })
    const sig = r.flows.find((f) => f.flow === 'decision')!.signals.find((s) => s.id === 'dispatch.undelivered')!
    expect(sig.value).toBe('100%')
    expect(sig.severity).toBe('alert')
  })

  it('复发分析：同 tool 两起且归因机制断点 → 改进候选带方向', async () => {
    const now = 1_800_000_000_000
    esc('x1', 'terminal', now - 9000 * 1000, { state: 'denied', attributionGap: 'authority' })
    esc('x2', 'terminal', now - 8000 * 1000, { state: 'approved', attributionGap: 'authority' })
    const { orgDiagnosis } = await import('../org-diagnosis')
    const r = await orgDiagnosis({ now })
    const feedback = r.flows.find((f) => f.flow === 'feedback')!
    expect(feedback.signals.find((s) => s.id === 'attribution.recurrence')!.severity).toBe('alert')
    expect(r.improvementCandidates).toHaveLength(1)
    expect(r.improvementCandidates[0].tool).toBe('terminal')
    expect(r.improvementCandidates[0].incidents).toBe(2)
    expect(r.improvementCandidates[0].direction).toContain('402')
    expect(r.manualIntervention.totalDecided).toBe(2)
  })

  it('REST 投影 HTTP 200（/api/governance/org-diagnosis）', async () => {
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/governance/org-diagnosis`)
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; flows: unknown[] }
      expect(body.ok).toBe(true)
      expect(body.flows).toHaveLength(5)
    } finally {
      server.close()
    }
  })
})
