import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'pr-test-')) })
afterAll(() => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* noop */ } })
import { ParallelReviewOrchestrator, g5LegsTemplate } from '../parallel-review'

describe('ParallelReviewOrchestrator（V8.35 并行评审编排）', () => {
  it('start：派发 N 路子核+预告终判人；幂等（进行中再 start 返回当前态）', async () => {
    const sent: string[] = []
    const o = new ParallelReviewOrchestrator({ room: '!r', stateFile: join(dir, 'a.json'), send: async (b, m) => { sent.push(`${m[0]}:${b.slice(0, 12)}`); return 'e' }, now: () => 1 })
    const legs = g5LegsTemplate().map((l) => ({ ...l })) as never[]
    const r1 = await o.start('G5-RFD-001', 'fanfan', 'READY-GATE', legs)
    expect(sent.length).toBe(4) // 3 子核 + 1 终判预告
    const r2 = await o.start('G5-RFD-001', 'fanfan', 'READY-GATE', legs)
    expect(r2).toStrictEqual(r1) // 幂等（load 读回新对象，内容等价）
  })
  it('collect：子核回执逐条收集→全齐 collecting→终判行 done', async () => {
    const o = new ParallelReviewOrchestrator({ room: '!r', stateFile: join(dir, 'b.json'), send: async () => 'e', now: () => 1 })
    const legs = g5LegsTemplate().map((l) => ({ ...l })) as never[]
    ;(o as unknown as { active: unknown }).active = { id: 'G5', finalJudge: 'fanfan', verdictPrefix: 'READY-GATE', legs, createdAt: 1, status: 'dispatched' }
    let st = o.collect([{ body: 'G5-SUB-INT OK 六分支齐', ts: 2 }])
    expect(st!.legs.find((l) => l.receiptPrefix === 'G5-SUB-INT')!.receipt).toBeTruthy()
    st = o.collect([{ body: 'G5-SUB-INT OK', ts: 2 }, { body: 'G5-SUB-DEF OK 3 缺陷闭环', ts: 3 }, { body: 'G5-SUB-SEC 2/1', ts: 4 }])
    expect(st!.status).toBe('collecting') // 全取证、终判未出
    st = o.collect([{ body: 'READY-GATE-PASS 六分支+缺陷闭环+安全条件齐', ts: 9 }])
    expect(st!.status).toBe('done'); expect(st!.finalVerdict).toContain('PASS')
  })
})
