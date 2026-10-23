// overlay[delivery/precedent/expertise]: 挂账批测试面（2026-10-23 D17-D19）。
// 纯函数正反例 + tmpdir 夹具（活跃 run + 归档 tar）端到端。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'

import { MATURITY_LEVELS, assessMaturity, maturityReading } from '../../delivery/maturity'
import { countIssues, precedentOfActiveRun, precedentRouter } from '../precedent-controller'
import { detectTermConflicts, type EvidenceEntry } from '../../expertise/evidence'
import { interventionStats, type InterventionEntry } from '../../delivery/interventions'

function entry(partial: Partial<InterventionEntry>): InterventionEntry {
  return { ts: 0, actor: 'a', layer: 'collab', type: 'context', source: 'compensation-ledger', run: 'r', snippet: '', anchor: 'x', ...partial }
}

describe('D17 协作成熟度（纯函数）', () => {
  it('三级定义齐全（L1/L2/L3 名与扳机）', () => {
    expect(MATURITY_LEVELS.map(l => l.key)).toEqual(['L1', 'L2', 'L3'])
    expect(MATURITY_LEVELS.every(l => l.thesis && l.nextTrigger)).toBe(true)
  })

  it('读数：协作占比/系统代行率/催办/返工', () => {
    const entries = [
      ...Array.from({ length: 7 }, (_, i) => entry({ layer: 'collab', type: 'context', ts: i })),
      entry({ layer: 'delivery', type: 'confirm' }),
      entry({ layer: 'delivery', type: 'nudge' }),
      entry({ layer: 'delivery', type: 'rework' }),
    ]
    const stats = interventionStats(entries)
    const r = maturityReading(stats, 3)
    expect(r.collabSharePct).toBe(70) // 7/10
    expect(r.autoApproveSharePct).toBe(75) // 3/(3+1 confirm)
    expect(r.nudges).toBe(1)
    expect(r.reworks).toBe(1)
  })

  it('档位判定：协作占比大头=L1；执行链自走=L2 迹象；gapNote 给最短板', () => {
    const collabHeavy = [...Array.from({ length: 8 }, () => entry({ layer: 'collab' })), entry({ layer: 'delivery', type: 'confirm' })]
    const a1 = assessMaturity(collabHeavy, 0)
    expect(a1.level.key).toBe('L1')
    expect(a1.gapNote).toContain('排活沟通')

    const selfDriven = [...Array.from({ length: 3 }, () => entry({ layer: 'collab' })), ...Array.from({ length: 7 }, () => entry({ layer: 'delivery', type: 'confirm' }))]
    const a2 = assessMaturity(selfDriven, 10)
    expect(a2.level.key).toBe('L2')
    // 有返工 → 理解偏差最短板；零返工 → 资产厚度
    expect(a2.gapNote).toContain('家底')
    const withRework = [...selfDriven, entry({ layer: 'delivery', type: 'rework' })]
    expect(assessMaturity(withRework, 10).gapNote).toContain('干错重来')
    expect(a2.note).toContain('按数据猜')
  })
})

describe('D18 判例库（纯函数+夹具端到端）', () => {
  it('countIssues：ISSUE|/DISP| 行计数', () => {
    expect(countIssues('ISSUE|BE-01|x\nDISP|BE-01|done\nnoise\n')).toEqual({ issues: 1, disposals: 1 })
    expect(countIssues(null)).toEqual({ issues: 0, disposals: 0 })
  })

  let dir: string
  let server: ReturnType<typeof createServer>
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tmall-precedent-'))
    // 活跃 run
    const ev = join(dir, 'runs', '20261023-live', 'evidence')
    mkdirSync(ev, { recursive: true })
    writeFileSync(join(ev, 'compensation-ledger.tsv'), [
      'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
      'p1\t2026-10-23 10:00:00\tdispatch-preset\tPR-1\tfrom=qi text=支付渠道 pay 收银台\topen\t',
      'p2\t2026-10-23 11:00:00\tdispatch-preset\tPR-2\tfrom=chen text=回调验签\topen\t',
      'p3\t2026-10-23 12:00:00\tauto-approve\tPR-3\tauto\topen\t',
    ].join('\n'))
    writeFileSync(join(ev, 'issues.log'), 'ISSUE|BE-01|x\nDISP|BE-01|done\n')
    // 归档 tar（真实 tar 造夹具）
    const arc = join(dir, 'archive', 'batch-a')
    mkdirSync(arc, { recursive: true })
    const staged = join(dir, 'stage', '20261020-archived', 'evidence')
    mkdirSync(staged, { recursive: true })
    writeFileSync(join(staged, 'compensation-ledger.tsv'), [
      'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
      'a1\t2026-10-20 10:00:00\tdispatch-preset\tPR-9\tfrom=lin text=支付宝 alipay 渠道\topen\t',
    ].join('\n'))
    execFileSync('tar', ['-cf', join(arc, 'runs.tar'), '-C', join(dir, 'stage'), '20261020-archived'])

    // 纯函数直测（活跃）
    const hit = precedentOfActiveRun(dir, '20261023-live', '支付')
    expect(hit?.dispatches).toBe(2)
    expect(hit?.issues).toBe(1)
    expect(hit?.matches.map(m => m.anchor)).toEqual(['p1'])

    process.env.SIM_OBSERVER_ROOT = dir
    const app = new Koa()
    app.use(precedentRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(() => {
    server?.close()
    delete process.env.SIM_OBSERVER_ROOT
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /search?q=alipay：命中归档 run（tar 按需抽）', async () => {
    const res = await fetch(`${base}/api/hermes/precedent/search?q=alipay`)
    const body = await res.json() as { available: boolean; hits: Array<{ run: string; origin: string; matches: unknown[] }> }
    expect(body.available).toBe(true)
    const arch = body.hits.find(h => h.run === '20261020-archived')
    expect(arch?.origin).toBe('archive/batch-a')
    expect(arch?.matches.length).toBe(1)
  })

  it('GET /search 无 q：run 索引（活跃+归档都列）', async () => {
    const res = await fetch(`${base}/api/hermes/precedent/search`)
    const body = await res.json() as { hits: Array<{ run: string }> }
    expect(body.hits.map(h => h.run)).toContain('20261023-live')
    expect(body.hits.map(h => h.run)).toContain('20261020-archived')
  })
})

describe('D19 概念跨域冲突（纯函数）', () => {
  it('同概念≥2 域才报；台账源不入域冲突面', () => {
    const ev: EvidenceEntry[] = [
      { person: 'chen', term: 'pay', source: 'kanban-board', snippet: '', anchor: 'chen-pay-core', tsMs: 1 },
      { person: 'wei', term: 'pay', source: 'kanban-board', snippet: '', anchor: 'wei-pay-review', tsMs: 1 },
      { person: 'lin', term: 'channel', source: 'kanban-board', snippet: '', anchor: 'lin-channel-alipay', tsMs: 1 },
      { person: 'hu', term: 'channel', source: 'kanban-task', snippet: '', anchor: 'hu-channel-wechat', tsMs: 1 },
      { person: 'qi', term: 'pay', source: 'compensation-ledger', snippet: '', anchor: 'r#1', tsMs: 1 },
    ]
    const conflicts = detectTermConflicts(ev)
    const terms = conflicts.map(c => c.term)
    expect(terms).toContain('pay')   // pay-core vs pay-review 两域
    expect(terms).toContain('channel') // alipay vs wechat 两域
    const pay = conflicts.find(c => c.term === 'pay')!
    expect(pay.domains.sort()).toEqual(['pay-core', 'pay-review'])
    expect(pay.persons.sort()).toEqual(['chen', 'wei'])
    expect(pay.anchors.length).toBeGreaterThanOrEqual(2)
  })

  it('单域概念不报', () => {
    const ev: EvidenceEntry[] = [
      { person: 'a', term: 'x', source: 'kanban-board', snippet: '', anchor: 'b-one', tsMs: 1 },
    ]
    expect(detectTermConflicts(ev)).toEqual([])
  })
})
