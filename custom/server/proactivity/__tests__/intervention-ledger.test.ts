// 介入台账与三层计分卡测试：落账、反馈、校准读数、坏档隔离、计分卡口径。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'iv-ledger-'))
  process.env.INTERVENTION_LEDGER_PATH = join(dir, 'interventions.json')
})
afterEach(() => {
  delete process.env.INTERVENTION_LEDGER_PATH
  rmSync(dir, { recursive: true, force: true })
})

async function ledger() {
  return await import('../intervention-ledger')
}

const rec = (patch: Record<string, unknown> = {}) => ({
  id: 'iv-1',
  surface: 'suggestion' as const,
  severity: 'attention' as const,
  audience: 'human' as const,
  urgency: 'normal' as const,
  topicKey: 'unblock-blocked:c1',
  summary: '卡点任务',
  benefit: 0.7,
  cost: 0.2,
  decision: 'deliver' as const,
  reasonCode: 'budget_ok' as const,
  reasons: ['放行'],
  score: 0.5,
  decidedAtMs: Date.now(),
  ...patch,
})

describe('介入台账', () => {
  it('决策追加与环形上限；反馈只追加不改写', async () => {
    const L = await ledger()
    L._resetLedgerForTests()
    L.appendIntervention(rec({ id: 'iv-1' }))
    const r = L.appendFeedback({ interventionId: 'iv-1', outcome: 'accepted', at: Date.now() })
    expect(r.recorded).toBe(true)
    const store = L.readLedger()
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].decision).toBe('deliver')
    expect(store.feedback).toHaveLength(1)
    const items = L.historyItems(store)
    expect(items[0].outcome).toBe('accepted')
  })

  it('未知干预反馈被拒绝（不造记录）', async () => {
    const L = await ledger()
    L._resetLedgerForTests()
    const r = L.appendFeedback({ interventionId: 'nope', outcome: 'accepted', at: Date.now() })
    expect(r.recorded).toBe(false)
    expect(r.problems[0]).toContain('未知干预')
  })

  it('坏档隔离：损坏文件改名 .corrupt-* 后按空库继续，不覆写原内容', async () => {
    const L = await ledger()
    const file = process.env.INTERVENTION_LEDGER_PATH as string
    writeFileSync(file, '{not json')
    const store = L.readLedger()
    expect(store.entries).toHaveLength(0)
    expect(existsSync(file)).toBe(false)
    const leftovers = (await import('node:fs')).readdirSync(dir).filter((f) => f.startsWith('interventions.json.corrupt-'))
    expect(leftovers).toHaveLength(1)
  })

  it('校准读数：接受率/忽略率/平均反馈时延/退避建议（样本不足回 null）', async () => {
    const L = await ledger()
    L._resetLedgerForTests()
    const t0 = Date.now() - 3_600_000
    for (let i = 0; i < 4; i += 1) {
      L.appendIntervention(rec({ id: `iv-${i}`, topicKey: `t-${i}`, decidedAtMs: t0 + i * 1000 }))
    }
    L.appendIntervention(rec({ id: 'iv-d', decision: 'defer', reasonCode: 'quiet_hours', topicKey: 't-d', decidedAtMs: t0 }))
    L.appendFeedback({ interventionId: 'iv-0', outcome: 'accepted', at: t0 + 1800_000 })
    L.appendFeedback({ interventionId: 'iv-1', outcome: 'rejected', at: t0 + 3600_000 })
    L.appendFeedback({ interventionId: 'iv-2', outcome: 'rejected', at: t0 + 3600_000 })
    L.appendFeedback({ interventionId: 'iv-3', outcome: 'ignored', at: t0 + 3600_000 })
    const [cal] = L.calibration(L.readLedger())
    expect(cal.surface).toBe('suggestion')
    expect(cal.delivered).toBe(4)
    expect(cal.accepted).toBe(1)
    expect(cal.rejected).toBe(2)
    expect(cal.acceptanceRate).toBeCloseTo(0.25, 4)
    expect(cal.ignoreRate).toBeCloseTo(0.25, 4)
    expect(cal.suggestedBackoffHours).toBeGreaterThan(12)
    // 样本不足 4 → null
    L._resetLedgerForTests()
    L.appendIntervention(rec({ id: 'only' }))
    L.appendFeedback({ interventionId: 'only', outcome: 'rejected', at: Date.now() })
    expect(L.calibration(L.readLedger())[0].suggestedBackoffHours).toBeNull()
  })
})

describe('三层计分卡', () => {
  it('任务/机制/用户三层投影；agent 面不计注意力；信任校准=接受率−纠正率', async () => {
    const { buildScorecard } = await import('../proactivity-scorecard')
    const entries = [
      { id: 'a', surface: 'suggestion', severity: 'attention', audience: 'human' as const, decision: 'deliver' as const, reasonCode: 'budget_ok' as const, score: 0.5, decidedAtMs: 1 },
      { id: 'b', surface: 'suggestion', severity: 'attention', audience: 'human' as const, decision: 'deliver' as const, reasonCode: 'budget_ok' as const, score: 0.4, decidedAtMs: 2 },
      { id: 'c', surface: 'suggestion', severity: 'info', audience: 'human' as const, decision: 'defer' as const, reasonCode: 'quiet_hours' as const, score: 0.2, decidedAtMs: 3 },
      { id: 'd', surface: 'nudge', severity: 'attention', audience: 'agent' as const, decision: 'deliver' as const, reasonCode: 'budget_ok' as const, score: 0.3, decidedAtMs: 4 },
      { id: 'e', surface: 'suggestion', severity: 'info', audience: 'human' as const, decision: 'suppress' as const, reasonCode: 'cooldown' as const, score: 0.1, decidedAtMs: 5 },
    ]
    const card = buildScorecard({
      entries,
      outcomes: [
        { interventionId: 'a', outcome: 'accepted', at: 10 },
        { interventionId: 'b', outcome: 'modified', at: 11 },
        { interventionId: 'd', outcome: 'accepted', at: 12 },
      ],
      acceptedWithEffect: 1,
    })
    expect(card.user.interruptions).toBe(2)
    expect(card.user.accepted).toBe(1)
    expect(card.user.modified).toBe(1)
    expect(card.user.acceptanceRate).toBeCloseTo(0.5, 4)
    expect(card.user.retractionRate).toBeCloseTo(0.5, 4)
    expect(card.user.trustGap).toBeCloseTo(0, 4)
    expect(card.mechanism.decisions.deliver).toBe(3)
    expect(card.mechanism.quietHoursDefers).toBe(1)
    expect(card.mechanism.suppressed).toBe(1)
    expect(card.task.acceptedWithEffect).toBe(1)
    // 适当依赖四象限（全文版）：有真值才拆，其余 unknown
    expect(card.task.reliance).toEqual({ acceptedWithEffect: 1, acceptedWithoutEffect: 0, rejected: 0, unknown: 0 })
    // 机制层新增：精确率/误介入率/漏助/澄清/优雅不动
    expect(card.mechanism.interventionPrecision).toBeCloseTo(0.5, 4)
    expect(card.mechanism.falseInterventionRate).toBe(0)
    expect(card.mechanism.missedAssistance).toBe(1) // c 延后过且从未投递=疑似漏助（近似口径）
    expect(card.mechanism.clarifications).toBe(0)
    expect(card.mechanism.holds).toBe(0)
    expect(card.note).toContain('不是真人满意度')
  })

  it('漏助与澄清/优雅不动计数：延后但同话题从未投递算漏助', async () => {
    const { buildScorecard } = await import('../proactivity-scorecard')
    const entries = [
      { id: 'd1', topicKey: 't-orphan', surface: 'suggestion', severity: 'info', audience: 'human' as const, decision: 'defer' as const, reasonCode: 'quiet_hours' as const, score: 0.2, decidedAtMs: 1 },
      { id: 'd2', topicKey: 't-later', surface: 'suggestion', severity: 'info', audience: 'human' as const, decision: 'defer' as const, reasonCode: 'hourly_budget' as const, score: 0.2, decidedAtMs: 2 },
      { id: 'd3', topicKey: 't-later', surface: 'suggestion', severity: 'info', audience: 'human' as const, decision: 'deliver' as const, reasonCode: 'budget_ok' as const, score: 0.3, decidedAtMs: 3 },
      { id: 'c1', topicKey: 't-q', surface: 'suggestion', severity: 'attention', audience: 'human' as const, decision: 'clarify' as const, reasonCode: 'clarify_first' as const, score: 0.1, decidedAtMs: 4 },
      { id: 'h1', topicKey: 't-h', surface: 'suggestion', severity: 'attention', audience: 'human' as const, decision: 'hold' as const, reasonCode: 'irreversible_hold' as const, score: 0.1, decidedAtMs: 5 },
    ]
    const card = buildScorecard({ entries, outcomes: [] })
    expect(card.mechanism.missedAssistance).toBe(1)
    expect(card.mechanism.clarifications).toBe(1)
    expect(card.mechanism.holds).toBe(1)
    expect(card.mechanism.decisions.clarify).toBe(1)
  })

  it('空台账读零不造数', async () => {
    const { buildScorecard } = await import('../proactivity-scorecard')
    const card = buildScorecard({ entries: [], outcomes: [] })
    expect(card.user.interruptions).toBe(0)
    expect(card.user.acceptanceRate).toBeNull()
    expect(card.mechanism.decisions.deliver).toBe(0)
  })
})
