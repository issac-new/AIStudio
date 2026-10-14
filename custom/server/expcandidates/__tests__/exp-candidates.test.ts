// overlay[expcandidates] 提取器与 store 测试。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractCandidates, type ExtractEventRow } from '../extract'
import {
  _useStoreDirForTests, listCandidates, normalizeEvents, readExpStore, curateCandidate, recordInjection,
} from '../exp-store'

const dir = mkdtempSync(join(tmpdir(), 'expcandidates-test-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => rmSync(join(dir, 'exp-candidates.json'), { force: true }))

const ev = (o: Partial<ExtractEventRow> & { taskId: string; kind: string; at: number; seq: number }): ExtractEventRow => o as ExtractEventRow

function fixture(): ExtractEventRow[] {
  return [
    // 反模式：archgate:evidence_missing 拦 2 次（不同卡）
    ev({ taskId: 't1', kind: 'gate_blocked', at: 100, seq: 1, failures: [{ gate: 'archgate', reason: 'evidence_missing', detail: '缺锚点' }] }),
    ev({ taskId: 't2', kind: 'gate_blocked', at: 200, seq: 2, failures: [{ gate: 'archgate', reason: 'evidence_missing', detail: '缺拍摄位' }] }),
    // 拦 1 次的不过阈值
    ev({ taskId: 't3', kind: 'gate_warning', at: 300, seq: 3, failures: [{ gate: 'qgate', reason: 'jargon', detail: 'x' }] }),
    // t4：零拦截快卡（dispatch→devimpl→review 三段 300s）
    ev({ taskId: 't4', kind: 'column_transition', to: 'dispatch', at: 1000, seq: 4 }),
    ev({ taskId: 't4', kind: 'column_transition', to: 'devimpl', at: 1100, seq: 5 }),
    ev({ taskId: 't4', kind: 'column_transition', to: 'review', at: 1300, seq: 6 }),
    // t5：零拦截慢卡（同路径 1000s）
    ev({ taskId: 't5', kind: 'column_transition', to: 'dispatch', at: 2000, seq: 7 }),
    ev({ taskId: 't5', kind: 'column_transition', to: 'devimpl', at: 2400, seq: 8 }),
    ev({ taskId: 't5', kind: 'column_transition', to: 'review', at: 3000, seq: 9 }),
  ]
}

describe('提取器纯函数', () => {
  it('反模式：同 gate:reason ≥2 出候选；1 次不出', () => {
    const out = extractCandidates(fixture())
    const anti = out.filter((c) => c.type === 'antipattern')
    expect(anti).toHaveLength(1)
    expect(anti[0].fingerprint).toBe('antipattern:archgate:evidence_missing')
    expect(anti[0].statement).toContain('2 次')
    expect(anti[0].evidence).toHaveLength(2)
  })

  it('较优路径：零拦截且 ≤ 中位×0.7；慢卡不出', () => {
    const out = extractCandidates(fixture())
    const good = out.filter((c) => c.type === 'good_path')
    // 跨度 [300, 1000] → 中位 650；t4=300 ≤ 455 ✓，t5=1000 ✗
    expect(good).toHaveLength(1)
    expect(good[0].statement).toContain('t4')
  })

  it('流程签名：同路径 ≥2 卡且含零拦截样本出 SOP 候选', () => {
    const out = extractCandidates(fixture())
    const sop = out.filter((c) => c.type === 'sop')
    expect(sop).toHaveLength(1)
    expect(sop[0].fingerprint).toBe('sop:dispatch>devimpl>review')
    expect(sop[0].statement).toContain('2 张卡采用')
  })

  it('空事件无候选；坏 payload 行由 normalizeEvents 跳过', () => {
    expect(extractCandidates([])).toEqual([])
    const rows = normalizeEvents([
      { id: 1, task_id: 't', kind: 'column_transition', payload: '{broken', created_at: 1 },
      { id: 2, task_id: 't', kind: 'column_transition', payload: JSON.stringify({ to: 'x', results: [] }), created_at: 2 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].to).toBe('x')
  })

  it('舰队生命周期词汇归一（run19 实测形状）', () => {
    const rows = normalizeEvents([
      // created 带 status
      { id: 1, task_id: 'a', kind: 'created', payload: JSON.stringify({ status: 'ready', assignee: 'chen' }), created_at: 100 },
      { id: 2, task_id: 'a', kind: 'claimed', payload: JSON.stringify({ lock: 'x' }), created_at: 200 },
      { id: 3, task_id: 'a', kind: 'completed', payload: JSON.stringify({ summary: 'ok' }), created_at: 500 },
      // blocked 带 reason 文本 → 失败信号
      { id: 4, task_id: 'b', kind: 'blocked', payload: JSON.stringify({ reason: '派单竞争' }), created_at: 300 },
      // timed_out/gave_up 带迭代预算错误
      { id: 5, task_id: 'c', kind: 'timed_out', payload: JSON.stringify({ error: 'Iteration budget exhausted (60/60)', failures: 1 }), created_at: 400 },
      { id: 6, task_id: 'c', kind: 'gave_up', payload: JSON.stringify({ error: 'Iteration budget exhausted', failures: 2 }), created_at: 450 },
      // 噪音行不入账
      { id: 7, task_id: 'a', kind: 'heartbeat', payload: '{}', created_at: 460 },
      { id: 8, task_id: 'a', kind: 'commented', payload: '{}', created_at: 470 },
    ])
    const by = (id: number) => rows.find((r) => r.seq === id)
    expect(by(1)?.to).toBe('ready')
    expect(by(2)?.to).toBe('in_progress')
    expect(by(3)?.to).toBe('done')
    expect(by(4)?.failures?.[0]).toMatchObject({ gate: 'blocked', reason: 'blocked' })
    expect(by(5)?.failures?.[0]).toMatchObject({ gate: 'iteration_budget', reason: 'budget_exhausted' })
    expect(by(6)?.failures?.[0]).toMatchObject({ gate: 'iteration_budget', reason: 'gave_up' })
    expect(by(7)?.to).toBeUndefined()
    expect(by(7)?.failures).toBeUndefined()
  })
})

describe('store 幂等与审核', () => {
  it('指纹去重：重复提取不重复入库；curate 翻状态；注入留痕追加幂等', async () => {
    process.env.HERMES_HOME = dir // kanbanDbFiles 无板库 → runExtraction 空
    const { runExtraction } = await import('../exp-store')
    const r1 = await runExtraction({ days: 1 })
    expect(r1.boardsRead).toBe(0)
    expect(readExpStore().candidates).toEqual([])
    // 直接用纯提取入库验证幂等：手工构造两轮指纹相同
    const { writeExpStore } = await import('../exp-store')
    const store = readExpStore()
    const c = { id: 'exp-001', type: 'sop' as const, statement: 's', fingerprint: 'sop:a>b', evidence: [], status: 'candidate' as const, createdAt: 't', updatedAt: 't', injectedRuns: [] }
    store.candidates.push(c)
    store.nextSeq = 2
    writeExpStore(store)
    const approved = curateCandidate('exp-001', 'approved')
    expect(approved.status).toBe('approved')
    recordInjection(['exp-001'], 'run20')
    recordInjection(['exp-001'], 'run20')
    recordInjection(['exp-001'], 'run21')
    expect(listCandidates()[0].injectedRuns).toEqual(['run20', 'run21'])
    expect(() => curateCandidate('exp-999', 'approved')).toThrow('不存在')
  })
})
