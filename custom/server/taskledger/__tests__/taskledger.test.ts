// taskledger 守门：源状态映射 / 终态锁定 / 账本 upsert 与原子写盘。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LIFECYCLE_ORDER, isTerminal, mapA2aState, mapExternalStatus, mapKanbanColumn,
  mapMatrixPhase, mapPipelineStage, summarizeLedger,
} from '../taskledger'
import { getEntry, listEntries, registerEntry, setStorePathForTests } from '../taskledger-store'

let dir: string | null = null
afterEach(() => {
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null }
  setStorePathForTests(undefined)
})

function freshStore(): string {
  dir = mkdtempSync(join(tmpdir(), 'taskledger-'))
  const p = join(dir, 'taskledger.json')
  setStorePathForTests(p)
  return p
}

describe('源状态映射（纯函数）', () => {
  it('kanban 列：③段→pending、④段→executing、review→verifying、done/failed/cancelled 终态', () => {
    expect(mapKanbanColumn('triage')).toBe('pending')
    expect(mapKanbanColumn('todo')).toBe('pending')
    expect(mapKanbanColumn('scheduled')).toBe('pending')
    expect(mapKanbanColumn('ready')).toBe('pending')
    expect(mapKanbanColumn('in_progress')).toBe('executing')
    expect(mapKanbanColumn('running')).toBe('executing')
    expect(mapKanbanColumn('blocked')).toBe('executing')
    expect(mapKanbanColumn('review')).toBe('verifying')
    expect(mapKanbanColumn('done')).toBe('done')
    expect(mapKanbanColumn('failed')).toBe('rejected')
    expect(mapKanbanColumn('cancelled')).toBe('cancelled')
    expect(mapKanbanColumn('奇奇怪怪')).toBeNull()
  })

  it('A2A/pipeline/matrix 三源映射 + 未登记值不猜', () => {
    expect(mapA2aState('submitted')).toBe('pending')
    expect(mapA2aState('working')).toBe('executing')
    expect(mapA2aState('input-required')).toBe('verifying')
    expect(mapA2aState('completed')).toBe('done')
    expect(mapA2aState('failed')).toBe('rejected')
    expect(mapA2aState('canceled')).toBe('cancelled')
    expect(mapPipelineStage('dev')).toBe('executing')
    expect(mapPipelineStage('pushed')).toBe('executing')
    expect(mapPipelineStage('staged')).toBe('verifying')
    expect(mapPipelineStage('released')).toBe('done')
    expect(mapMatrixPhase('in_progress')).toBe('executing')
    expect(mapMatrixPhase('神秘阶段')).toBeNull()
    expect(mapExternalStatus('mention', 'anything')).toBeNull() // mention 无状态面：如实 null
  })

  it('isTerminal 与生命周期枚举完整', () => {
    for (const t of ['done', 'rejected', 'cancelled'] as const) expect(isTerminal(t)).toBe(true)
    for (const t of ['pending', 'planning', 'executing', 'verifying'] as const) expect(isTerminal(t)).toBe(false)
    expect(LIFECYCLE_ORDER).toHaveLength(7)
  })
})

describe('账本（upsert / 终态锁定 / 落盘）', () => {
  it('created → updated → 终态锁定不再跃迁；映射不上拒绝登记', () => {
    freshStore()
    const r1 = registerEntry({ source: 'kanban', sourceKey: 'DEV-101', externalStatus: 'todo' })
    expect(r1.ok && r1.transition).toBe('created')
    expect(r1.ok && r1.entry.lifecycle).toBe('pending')

    const r2 = registerEntry({ source: 'kanban', sourceKey: 'DEV-101', externalStatus: 'in_progress' })
    expect(r2.ok && r2.transition).toBe('updated')
    expect(r2.ok && r2.entry.lifecycle).toBe('executing')

    const r3 = registerEntry({ source: 'kanban', sourceKey: 'DEV-101', externalStatus: 'done' })
    expect(r3.ok && r3.entry.lifecycle).toBe('done')
    // 终态后源系统又来一条 running：账本锁定不动（事实以终态为准）
    const r4 = registerEntry({ source: 'kanban', sourceKey: 'DEV-101', externalStatus: 'running' })
    expect(r4.ok && r4.transition).toBe('terminal-locked')
    expect(r4.ok && r4.entry.lifecycle).toBe('done')

    const bad = registerEntry({ source: 'kanban', sourceKey: 'DEV-102', externalStatus: '???' })
    expect(bad.ok).toBe(false)

    const entries = listEntries()
    expect(entries).toHaveLength(1)
    expect(getEntry('kanban:DEV-101')?.externalStatus).toBe('done')
  })

  it('同态重复登记 no-op 不写盘；跨源并列登记互不干扰；summarize 聚合', () => {
    const path = freshStore()
    registerEntry({ source: 'a2a', sourceKey: 'task-7', externalStatus: 'working', assignee: 'fanfan' })
    const before = readFileSync(path, 'utf8')
    const noop = registerEntry({ source: 'a2a', sourceKey: 'task-7', externalStatus: 'working' })
    expect(noop.ok && noop.transition).toBe('no-op')
    expect(readFileSync(path, 'utf8')).toBe(before) // no-op 不触发写盘
    registerEntry({ source: 'pipeline', sourceKey: 'feat/DEV-9', externalStatus: 'staged', parentInstructionId: 'a2a:task-7' })
    const all = listEntries()
    expect(all).toHaveLength(2)
    expect(summarizeLedger(all).byLifecycle.executing).toBe(1)
    expect(summarizeLedger(all).byLifecycle.verifying).toBe(1)
    expect(listEntries({ lifecycle: 'verifying' })[0]?.source).toBe('pipeline')
  })
})
