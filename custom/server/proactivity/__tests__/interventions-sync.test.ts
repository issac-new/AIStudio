// 介入同步 fail-soft：看板根缺席时不造数（mock 解析器，隔离机器上的真实 sim 根）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../delivery/kanban-home', () => ({
  resolveKanbanHome: () => ({ home: null, tried: ['/nowhere'] }),
  kanbanHomeCandidates: () => ['/nowhere'],
}))

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'iv-sync-'))
  process.env.INTERVENTION_LEDGER_PATH = join(dir, 'interventions.json')
  process.env.ATTENTION_PREFS_PATH = join(dir, 'attention.json')
})
afterEach(() => {
  delete process.env.INTERVENTION_LEDGER_PATH
  delete process.env.ATTENTION_PREFS_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('介入同步 fail-soft', () => {
  it('看板根缺席 → available:false 且不写台账', async () => {
    const { syncInterventions } = await import('../interventions-service')
    const { readLedger } = await import('../intervention-ledger')
    const r = syncInterventions(Date.now(), 'test')
    expect(r.available).toBe(false)
    expect(r.created).toBe(0)
    expect(r.reason).toContain('看板数据根')
    expect(readLedger().entries).toHaveLength(0)
  })
})
