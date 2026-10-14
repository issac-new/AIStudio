// overlay[expcandidates] 受控注入测试（B2，方案正本纪律 49）：默认关/审核过滤/
// 凭据形态改写/留痕幂等/派单简报集成。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  experienceBriefLine, experienceLinesForDispatch, injectionRunLabel, selectableExperiences,
} from '../exp-inject'
import { _useStoreDirForTests, listCandidates, writeExpStore, readExpStore } from '../exp-store'
import type { ExpCandidate } from '../exp-types'

const dir = mkdtempSync(join(tmpdir(), 'exp-inject-test-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => {
  rmSync(join(dir, 'exp-candidates.json'), { force: true })
  delete process.env.EXPERIENCE_INJECT
  delete process.env.EXPERIENCE_INJECT_RUN
})

function cand(id: string, status: ExpCandidate['status']): ExpCandidate {
  return {
    id, type: 'antipattern', statement: `经验 ${id}：同类拦截先备齐证据再提交`,
    fingerprint: `fp-${id}`, evidence: [{ taskId: 't-old', note: 'n', at: 1 }],
    status, createdAt: 't', updatedAt: `t-${id}`, injectedRuns: [],
  }
}

function seed(cs: ExpCandidate[]): void {
  writeExpStore({ candidates: cs, nextSeq: cs.length + 1 })
}

describe('受控注入', () => {
  it('默认关闭：EXPERIENCE_INJECT 未设即零注入（有 approved 也不出）', () => {
    seed([cand('exp-001', 'approved')])
    expect(experienceLinesForDispatch({ column: 'devimpl' })).toEqual([])
  })

  it('开启后只注入 approved；candidate/rejected 排除；封顶 3', () => {
    process.env.EXPERIENCE_INJECT = '1'
    seed([
      cand('exp-001', 'approved'), cand('exp-002', 'candidate'), cand('exp-003', 'rejected'),
      cand('exp-004', 'approved'), cand('exp-005', 'approved'), cand('exp-006', 'approved'),
    ])
    const lines = experienceLinesForDispatch({ column: 'devimpl' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('exp-002')
    expect(lines[0]).not.toContain('exp-003')
    expect((lines[0].match(/\[exp-\d+\]/g) ?? []).length).toBe(3)
  })

  it('凭据形态改写：行头声明历史经验出处·非本轮实测凭据', () => {
    const line = experienceBriefLine([cand('exp-001', 'approved')])
    expect(line).toContain('历史经验（已审核，历史经验出处·非本轮实测凭据）')
    expect(line).not.toMatch(/[0-9a-f]{40}/) // 无 commit 哈希形态
  })

  it('注入留痕：EXPERIENCE_INJECT_RUN 标签幂等追加；坏存储 fail-soft', () => {
    process.env.EXPERIENCE_INJECT = '1'
    process.env.EXPERIENCE_INJECT_RUN = 'run20'
    seed([cand('exp-001', 'approved')])
    experienceLinesForDispatch({ column: 'devimpl' })
    experienceLinesForDispatch({ column: 'devimpl' })
    expect(listCandidates()[0].injectedRuns).toEqual(['run20'])
    expect(injectionRunLabel()).toBe('run20')
    // 坏存储→空行不阻断
    writeFileSync(join(dir, 'exp-candidates.json'), '{broken', 'utf8')
    expect(experienceLinesForDispatch({ column: 'devimpl' })).toEqual([])
    // 恢复空账
    rmSync(join(dir, 'exp-candidates.json'))
    expect(readExpStore().candidates).toEqual([])
  })

  it('selectableExperiences 按 updatedAt 稳定序', () => {
    const sel = selectableExperiences([
      { ...cand('exp-b', 'approved'), updatedAt: '2026-02-01' },
      { ...cand('exp-a', 'approved'), updatedAt: '2026-01-01' },
    ])
    expect(sel.map((c) => c.id)).toEqual(['exp-a', 'exp-b'])
  })
})
