// overlay/executioncontract：earned autonomy 建议器单测（2026-11-14 Proactive AI 二轮 P4）。
// 覆盖：track record 聚合分布、建议矩阵（冷启动 hold/高人介入收紧/审批积压收紧/
// 大样本零介入放宽/常规 hold）、REST 契约（profile 必填、advisory-only 声明）。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import {
  aggregateTrackRecord, applyTighten, permissionModeFor, recommendMode, MODE_TO_PERMISSION, TIGHTEN_ORDER, type TrackRecord,
} from '../earned-autonomy'
import { sessionModeOf, setSessionMode } from '../../permmodes/session-mode-store'
import type { ApprovalLedgerRecord } from '../../approval-ledger/ledger-store'

function rec(over: Partial<ApprovalLedgerRecord>): ApprovalLedgerRecord {
  return {
    recordType: 'approval.resolved', tool: 'Bash', riskClass: 'shell', mode: 'guarded',
    policyId: 'p1', policyVersion: '1.0.0', sessionId: 's1', profile: 'pf1', entryPoint: 'test',
    decidedBy: 'policy:risk-evaluated', ts: '2026-11-14T00:00:00Z', recordId: `r-${Math.random().toString(36).slice(2, 8)}`,
    ...over,
  }
}

describe('P4 track record 聚合', () => {
  it('按 profile 过滤；三态与人/策略决议分布正确', () => {
    const rows = [
      rec({}), rec({}),  // policy resolved ×2
      rec({ decidedBy: 'user' }),  // user resolved ×1
      rec({ recordType: 'approval.pending' }),
      rec({ recordType: 'approval.exempted' }),
      rec({ profile: 'other' }),  // 别家 profile
    ]
    const t = aggregateTrackRecord('pf1', rows)
    expect(t.sampleSize).toBe(5)
    expect(t.resolvedTotal).toBe(3)
    expect(t.userResolved).toBe(1)
    expect(t.pending).toBe(1)
    expect(t.exempted).toBe(1)
    expect(t.userResolvedShare).toBeCloseTo(1 / 3, 5)
    expect(t.autoShare).toBeCloseTo(3 / 5, 5) // policy resolved 2 + exempted 1
  })

  it('空记录全零（fail-soft 不猜数）', () => {
    const t = aggregateTrackRecord('nobody', [])
    expect(t.sampleSize).toBe(0)
    expect(t.userResolvedShare).toBe(0)
  })
})

describe('P4 建议矩阵', () => {
  const base: TrackRecord = {
    profile: 'pf1', sampleSize: 100, resolvedTotal: 90, userResolved: 2, policyResolved: 80,
    pending: 10, exempted: 8, userResolvedShare: 2 / 90, pendingShare: 0.1, autoShare: 0.88,
  }

  it('冷启动（<20）hold 且证据明说', () => {
    const r = recommendMode('guarded', { ...base, sampleSize: 10, userResolvedShare: 0.9 })
    expect(r.direction).toBe('hold')
    expect(r.evidence).toContain('冷启动')
  })

  it('高人介入率→收紧一挡（yolo→guarded→build→plan 方向）', () => {
    const r = recommendMode('yolo', { ...base, userResolvedShare: 0.5, userResolved: 20, resolvedTotal: 40 })
    expect(r.direction).toBe('tighten')
    expect(r.target).toBe('guarded')
    expect(r.evidence).toContain('人介入率')
  })

  it('审批积压（pending>10 且 >50%）→收紧', () => {
    const r = recommendMode('guarded', { ...base, pending: 60, pendingShare: 0.6 })
    expect(r.direction).toBe('tighten')
    expect(r.target).toBe('build')
  })

  it('大样本零介入高自动→放宽建议（永不自动执行，evidence 明说须人确认）', () => {
    const r = recommendMode('build', { ...base, userResolved: 0, userResolvedShare: 0, autoShare: 0.95 })
    expect(r.direction).toBe('loosen')
    expect(r.target).toBe('guarded')
    expect(r.evidence).toContain('须人确认')
  })

  it('常规中间态→hold；TIGHTEN_ORDER 全序可走', () => {
    expect(recommendMode('build', base).direction).toBe('hold')
    // 边界：plan 是最严挡，收紧目标仍是 plan（max(0, idx-1) 钳制）
    const r = recommendMode('plan', { ...base, userResolvedShare: 0.9 })
    expect(r.target).toBe('plan')
    expect(TIGHTEN_ORDER.indexOf('plan')).toBe(0)
  })
})

describe('P4 REST（/api/hermes/execution/earned-autonomy）', () => {
  let dir: string
  let server: import('node:http').Server | undefined
  let base: string

  beforeEach(async () => {
    server?.close()
    dir = mkdtempSync(join(tmpdir(), 'earned-'))
    process.env.HERMES_APPROVAL_LEDGER_DIR = dir
    const bodyParser = (await import('@koa/bodyparser')).default
    const Koa = (await import('koa')).default
    const { earnedAutonomyRouter } = await import('../earned-autonomy')
    const app = new Koa()
    app.use(bodyParser())
    app.use(earnedAutonomyRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/execution/earned-autonomy`
  })

  afterAll(() => {
    delete process.env.HERMES_APPROVAL_LEDGER_DIR
    server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('profile 必填 400；账本缺席＝冷启动 hold＋advisory-only 声明', async () => {
    const bad = await fetch(`${base}/`)
    expect(bad.status).toBe(400)
    const res = await fetch(`${base}/?profile=pf1&mode=guarded`)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      currentMode: string; trackRecord: { sampleSize: number }
      recommendation: { direction: string }; enforcement: string
    }
    expect(body.currentMode).toBe('guarded')
    expect(body.trackRecord.sampleSize).toBe(0)
    expect(body.recommendation.direction).toBe('hold')
    expect(body.enforcement).toBe('advisory-only')
  })

  it('POST /apply：hold 建议 409（无可收紧）；tighten 但 env 未开 409；env 开后写档', async () => {
    // 账本空 → 冷启动 hold
    const hold = await fetch(`${base}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'pf-apply', mode: 'guarded' }),
    })
    expect(hold.status).toBe(409)
    const holdBody = (await hold.json()) as { code?: string }
    expect(holdBody.code).toBe('no_tighten')

    // 造高人介入率 → tighten
    const ledger = await import('../../approval-ledger/ledger-store')
    for (let i = 0; i < 25; i += 1) {
      ledger.appendApprovalRecord(ledger.buildApprovalRecord({
        recordType: 'approval.resolved', tool: 'Bash', riskClass: 'shell', mode: 'guarded',
        policyId: 'p', policyVersion: '1', sessionId: 's1', profile: 'pf-apply', entryPoint: 'test',
        decidedBy: 'user', ts: '2026-11-15T00:00:00Z',
      }) as never)
    }
    const off = await fetch(`${base}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile: 'pf-apply', mode: 'guarded' }),
    })
    expect(off.status).toBe(409)
    expect(((await off.json()) as { code?: string }).code).toBe('auto_tighten_disabled')

    const modeDir = join(dir, 'modes')
    process.env.HERMES_SESSION_MODES_DIR = modeDir
    process.env.EARNED_AUTONOMY_AUTO_TIGHTEN = '1'
    try {
      const applied = await fetch(`${base}/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile: 'pf-apply', mode: 'guarded' }),
      })
      expect(applied.status).toBe(200)
      const ab = (await applied.json()) as { applied: boolean; next?: string; direction: string }
      expect(ab.applied).toBe(true)
      expect(ab.direction).toBe('tighten')
      expect(ab.next).toBe('default')
    } finally {
      delete process.env.EARNED_AUTONOMY_AUTO_TIGHTEN
      delete process.env.HERMES_SESSION_MODES_DIR
    }
  })

  it('真账本（临时目录）→ 高人介入收紧建议可读', async () => {
    const rows = Array.from({ length: 30 }, () => rec({ recordType: 'approval.resolved', decidedBy: 'user', profile: 'pf-tighten' }))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'approval-ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
    const res = await fetch(`${base}/?profile=pf-tighten&mode=yolo`)
    const body = await res.json() as { recommendation: { direction: string; target: string } }
    expect(body.recommendation.direction).toBe('tighten')
    expect(body.recommendation.target).toBe('guarded')
  })
})

// ── 自动收紧（2026-11-15 挂账清偿）：映射单点＋只收紧＋env 闸＋原档回滚 ──
describe('applyTighten（自动收紧写档）', () => {
  it('四挡→七档映射表锁死（权限强度单调）', () => {
    expect(MODE_TO_PERMISSION).toEqual({
      plan: 'plan', build: 'default', guarded: 'acceptEdits', yolo: 'bypassPermissions',
    })
    expect(permissionModeFor('yolo')).toBe('bypassPermissions')
  })

  it('env 未开 → 不写档，建议照常；reason 说明', () => {
    const r = applyTighten('p1', { direction: 'tighten', target: 'build', evidence: 'x' }, { autoTightenEnabled: false })
    expect(r.applied).toBe(false)
    expect(r.next).toBeUndefined()
    expect(r.reason).toContain('未启用')
  })

  it('loosen/hold 一律不写档（放宽须人确认）', () => {
    for (const dir of ['loosen', 'hold'] as const) {
      const r = applyTighten('p1', { direction: dir, target: 'guarded', evidence: 'x' }, { autoTightenEnabled: true })
      expect(r.applied).toBe(false)
      expect(r.reason).toContain('只收紧不放宽')
    }
  })

  it('tighten + env 开 → 写会话档，返回原档可回滚', () => {
    const dir = mkdtempSync(join(tmpdir(), 'earned-modes-'))
    const prev = process.env.HERMES_SESSION_MODES_DIR
    process.env.HERMES_SESSION_MODES_DIR = dir
    try {
      setSessionMode('p1', 'acceptEdits')
      const r = applyTighten('p1', { direction: 'tighten', target: 'build', evidence: 'x' }, { autoTightenEnabled: true })
      expect(r.applied).toBe(true)
      expect(r.next).toBe('default')
      expect(r.previous).toBe('acceptEdits')
      expect(sessionModeOf('p1')).toBe('default')
    } finally {
      if (prev === undefined) delete process.env.HERMES_SESSION_MODES_DIR
      else process.env.HERMES_SESSION_MODES_DIR = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
