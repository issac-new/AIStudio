// 任务证据台账守门（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  appendEvidence, evidenceFile, isEvidenceKind, isVerificationVerdict, latestVerdict,
  listEvidence, loadEvidence, type EvidenceRecord,
} from '../evidence-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'evidence-'))
  process.env.HERMES_EVIDENCE_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_EVIDENCE_DIR
  rmSync(dir, { recursive: true, force: true })
})

const rec = (over: Partial<EvidenceRecord>): EvidenceRecord => ({
  evidenceId: 'e1', taskId: 't1', kind: 'artifact', ref: 'shot.png', at: 1, ...over,
})

describe('五 kind 冻结（routa 证据面 + A1 工件 + 预留泳道）', () => {
  it('kind/verdict 枚举守门', () => {
    for (const k of ['artifact', 'delivery_snapshot', 'verification', 'lane_session', 'lane_handoff']) {
      expect(isEvidenceKind(k)).toBe(true)
    }
    expect(isEvidenceKind('mystery')).toBe(false)
    expect(isVerificationVerdict('pass')).toBe(true)
    expect(isVerificationVerdict('maybe')).toBe(false)
  })
})

describe('台账：只增 + 幂等 + 环形 + fail-soft', () => {
  it('append 幂等（同 evidenceId 跳过）；只增不改', () => {
    expect(appendEvidence(rec({}))).toEqual({ added: true, total: 1 })
    expect(appendEvidence(rec({ note: '重复' }))).toEqual({ added: false, total: 1 })
    const records = listEvidence('t1')
    expect(records).toHaveLength(1)
    expect(records[0].note).toBeUndefined()  // 原条未被改写
  })

  it('环形上限 500；新在前倒序', () => {
    for (let i = 0; i < 503; i++) {
      appendEvidence(rec({ evidenceId: `e${i}`, at: i }))
    }
    // 环形上限断言总数（loadEvidence 全量）；listEvidence 是限量查询默认 50。
    expect(loadEvidence('t1').records).toHaveLength(500)
    const records = listEvidence('t1', undefined, 500)
    expect(records[0].at).toBe(502)  // 最新在前
  })

  it('坏文件回空台账（fail-soft）', () => {
    writeBroken()
    expect(loadEvidence('t1').records).toEqual([])
    expect(appendEvidence(rec({})).added).toBe(true)  // 且可正常续写
  })

  it('kind 过滤 + limit', () => {
    appendEvidence(rec({ evidenceId: 'a1', kind: 'artifact' }))
    appendEvidence(rec({ evidenceId: 'v1', kind: 'verification', verdict: 'pass', basis: 'pytest' }))
    expect(listEvidence('t1', 'artifact')).toHaveLength(1)
    expect(listEvidence('t1', undefined, 1)).toHaveLength(1)
    expect(latestVerdict('t1')?.verdict).toBe('pass')
  })

  it('验证裁决序列取最新；delivery_snapshot 带 revision', () => {
    appendEvidence(rec({ evidenceId: 'd1', kind: 'delivery_snapshot', revision: { base: 'aaa', head: 'bbb' } }))
    appendEvidence(rec({ evidenceId: 'v1', kind: 'verification', verdict: 'fail' }))
    appendEvidence(rec({ evidenceId: 'v2', kind: 'verification', verdict: 'conditional' }))
    expect(latestVerdict('t1')?.evidenceId).toBe('v2')
    const snap = listEvidence('t1', 'delivery_snapshot')[0]
    expect(snap.revision).toEqual({ base: 'aaa', head: 'bbb' })
  })

  it('落盘 JSON 可读（守门：文件本体）', () => {
    appendEvidence(rec({}))
    expect(existsSync(evidenceFile('t1'))).toBe(true)
    const raw = JSON.parse(readFileSync(evidenceFile('t1'), 'utf8'))
    expect(raw.taskId).toBe('t1')
    expect(raw.records[0].evidenceId).toBe('e1')
  })

  function writeBroken() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('fs').writeFileSync(join(dir, 't1.json'), '{{bad', 'utf8')
  }
})

describe('任务结果卡聚合（deepseek-harness 交付卡语义）', () => {
  it('时长+验证 bullet 序列+文件清单+交付冻结+最新裁决', async () => {
    const { buildResultCard } = await import('../result-card')
    appendEvidence(rec({ evidenceId: 'a1', kind: 'artifact', ref: 'src/a.ts', artifactType: 'diff', milestone: 'turn-1', at: 1000 }))
    appendEvidence(rec({ evidenceId: 'a2', kind: 'artifact', ref: 'src/a.ts', artifactType: 'screenshot', milestone: 'turn-2', at: 2000 }))
    appendEvidence(rec({ evidenceId: 'd1', kind: 'delivery_snapshot', revision: { base: 'aaa', head: 'bbb' }, at: 3000 }))
    appendEvidence(rec({ evidenceId: 'v1', kind: 'verification', verdict: 'fail', basis: 'pytest 1/5', at: 4000 }))
    appendEvidence(rec({ evidenceId: 'v2', kind: 'verification', verdict: 'pass', basis: 'pytest 5/5', at: 9000 }))
    const card = buildResultCard('t1')
    expect(card.durationSeconds).toBe(8)  // (9000-1000)/1000
    expect(card.verdict).toBe('pass')     // 最新裁决
    expect(card.verificationBullets.map((b) => b.verdict)).toEqual(['pass', 'fail'])  // 新在前
    expect(card.files).toEqual([{ ref: 'src/a.ts', artifactTypes: ['diff', 'screenshot'], milestones: ['turn-1', 'turn-2'], count: 2 }])
    expect(card.deliverySnapshot).toEqual({ base: 'aaa', head: 'bbb', at: 3000 })
    expect(card.evidenceCount).toBe(5)
  })

  it('per-turn changed-files 按里程碑分组（dsh P0-4）', async () => {
    const { changedFilesByTurn } = await import('../result-card')
    appendEvidence(rec({ evidenceId: 'c1', kind: 'artifact', ref: 'a.ts', artifactType: 'changed-files', milestone: 'turn-1', at: 1 }))
    appendEvidence(rec({ evidenceId: 'c2', kind: 'artifact', ref: 'b.ts', artifactType: 'changed-files', milestone: 'turn-1', at: 2 }))
    appendEvidence(rec({ evidenceId: 'c3', kind: 'artifact', ref: 'c.ts', artifactType: 'changed-files', milestone: 'turn-2', at: 3 }))
    const turns = changedFilesByTurn('t1')
    expect(turns).toHaveLength(2)
    expect(turns.find((t) => t.milestone === 'turn-1')?.files.sort()).toEqual(['a.ts', 'b.ts'])
  })

  it('空台账→空卡（零不炸）', async () => {
    const { buildResultCard } = await import('../result-card')
    const card = buildResultCard('t-none')
    expect(card).toMatchObject({ durationSeconds: 0, verdict: null, evidenceCount: 0 })
    expect(card.verificationBullets).toEqual([])
    expect(card.files).toEqual([])
  })
})
