// 任务证据台账守门（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）。
// S-A 文件名哈希/身份校验、S-B 原子写+坏档隔离、S-D 写失败只报 code 与字段上限在此守门。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'fs'
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

describe('台账：只增 + 幂等 + 环形 + 坏档隔离', () => {
  it('append 幂等（同 evidenceId 跳过）；只增不改', () => {
    expect(appendEvidence(rec({}))).toMatchObject({ added: true, total: 1, evicted: 0 })
    expect(appendEvidence(rec({ note: '重复' }))).toMatchObject({ added: false, total: 1, evicted: 0 })
    const records = listEvidence('t1')
    expect(records).toHaveLength(1)
    expect(records[0].note).toBeUndefined()  // 原条未被改写
  })

  it('环形上限 500；新在前倒序；挤出给 evicted 计数', () => {
    for (let i = 0; i < 503; i++) {
      appendEvidence(rec({ evidenceId: `e${i}`, at: i }))
    }
    // 环形上限断言总数（loadEvidence 全量）；listEvidence 是限量查询默认 50。
    expect(loadEvidence('t1').records).toHaveLength(500)
    const records = listEvidence('t1', undefined, 500)
    expect(records[0].at).toBe(502)  // 最新在前
  })

  it('环形挤出条数在结果里可循；幂等键只在环内有效（如实限定）', () => {
    for (let i = 0; i < 500; i++) appendEvidence(rec({ evidenceId: `e${i}`, at: i }))
    expect(appendEvidence(rec({ evidenceId: 'e500' }))).toMatchObject({ added: true, total: 500, evicted: 1 })
    // e0 已被挤出环外：再次 append 不再命中幂等键（环内语义，非全史幂等）。
    expect(appendEvidence(rec({ evidenceId: 'e0' })).added).toBe(true)
  })

  it('坏文件隔离 .corrupt.<ts> 留档（G7 时间戳防二次损坏覆盖）+ 可续写（不再静默当空账续写）', () => {
    writeFileSync(evidenceFile('t1'), '{{bad', 'utf8')
    expect(loadEvidence('t1').records).toEqual([])
    const archives = readdirSync(dir).filter((n) => n.includes('.corrupt.'))  // 坏档留档不销毁
    expect(archives).toHaveLength(1)
    expect(readFileSync(join(dir, archives[0]), 'utf8')).toBe('{{bad')
    expect(appendEvidence(rec({})).added).toBe(true)  // 且可正常续写
    expect(loadEvidence('t1').records).toHaveLength(1)
  })

  it('kind 过滤 + limit；limit 非有限数回默认（slice(-NaN) 不再回全量）', () => {
    appendEvidence(rec({ evidenceId: 'a1', kind: 'artifact' }))
    appendEvidence(rec({ evidenceId: 'v1', kind: 'verification', verdict: 'pass', basis: 'pytest' }))
    expect(listEvidence('t1', 'artifact')).toHaveLength(1)
    expect(listEvidence('t1', undefined, 1)).toHaveLength(1)
    expect(latestVerdict('t1')?.verdict).toBe('pass')
    for (let i = 0; i < 60; i++) appendEvidence(rec({ evidenceId: `m${i}` }))
    expect(listEvidence('t1', undefined, Number.NaN)).toHaveLength(50)
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

  it('字段上限：note/basis 4000、ref 200（超限截断）', () => {
    appendEvidence(rec({ ref: 'r'.repeat(300), note: 'n'.repeat(5000), basis: 'b'.repeat(5000) }))
    const saved = loadEvidence('t1').records[0]
    expect(saved.ref).toHaveLength(200)
    expect(saved.note).toHaveLength(4000)
    expect(saved.basis).toHaveLength(4000)
  })
})

describe('文件名哈希化（S-A：清洗名多对一 = 整账覆写销毁）', () => {
  it('清洗名多对一的 id 各自独立台账（中文/斜杠/大小写）', () => {
    // 缺陷前提：旧清洗名把下面这些折成同一个文件名。
    expect('a/b'.replace(/[^A-Za-z0-9._-]/g, '_')).toBe('a_b')
    expect(evidenceFile('a/b')).not.toBe(evidenceFile('a_b'))
    expect(evidenceFile('张三')).not.toBe(evidenceFile('李四'))
    expect(evidenceFile('T1')).not.toBe(evidenceFile('t1'))
    appendEvidence(rec({ taskId: 'a/b', evidenceId: 'x1' }))
    appendEvidence(rec({ taskId: 'a_b', evidenceId: 'x2' }))
    expect(loadEvidence('a/b').records.map((r) => r.evidenceId)).toEqual(['x1'])
    expect(loadEvidence('a_b').records.map((r) => r.evidenceId)).toEqual(['x2'])
  })

  it('旧清洗命名兼容读取 + 命中即迁移（身份相符才搬）', () => {
    writeFileSync(join(dir, 't1.json'), JSON.stringify({ taskId: 't1', records: [rec({})] }), 'utf8')
    expect(loadEvidence('t1').records.map((r) => r.evidenceId)).toEqual(['e1'])  // 兼容读取
    expect(existsSync(evidenceFile('t1'))).toBe(true)                            // 已迁到哈希名
    expect(existsSync(join(dir, 't1.json'))).toBe(false)
    appendEvidence(rec({ evidenceId: 'e2' }))
    expect(loadEvidence('t1').records.map((r) => r.evidenceId)).toEqual(['e1', 'e2'])
  })

  it('旧清洗名下碰撞对侧的账不认领不覆写（留给对方迁移）', () => {
    // 旧清洗名 'a_b.json' 里是 'a/b' 的账：'a_b' 不认领，写入走自己的哈希名。
    writeFileSync(
      join(dir, 'a_b.json'),
      JSON.stringify({ taskId: 'a/b', records: [rec({ taskId: 'a/b', evidenceId: 'x1' })] }),
      'utf8',
    )
    expect(loadEvidence('a_b').records).toEqual([])
    expect(appendEvidence(rec({ taskId: 'a_b', evidenceId: 'x2' })).added).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'a_b.json'), 'utf8')).records.map((r: { evidenceId: string }) => r.evidenceId)).toEqual(['x1'])
    expect(loadEvidence('a/b').records.map((r) => r.evidenceId)).toEqual(['x1'])  // 对侧仍可认领并迁移
  })

  it('文件内 id 不符拒绝写入并报码（不再当空账续写覆掉他人台账）', () => {
    writeFileSync(
      evidenceFile('t1'),
      JSON.stringify({ taskId: 'other', records: [rec({ taskId: 'other', evidenceId: 'keep' })] }),
      'utf8',
    )
    expect(appendEvidence(rec({}))).toMatchObject({ added: false, code: 'identity_mismatch' })
    const raw = JSON.parse(readFileSync(evidenceFile('t1'), 'utf8'))
    expect(raw.taskId).toBe('other')                                    // 原文件原样
    expect(raw.records.map((r: { evidenceId: string }) => r.evidenceId)).toEqual(['keep'])
  })
})

describe('写失败只报 code（S-D：不泄漏 syscall/errno/服务器路径）', () => {
  it('落盘失败回 write_failed，结果不带 err 展开字段', () => {
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'x', 'utf8')          // 拿同名文件占住目录位 → 建目录/落盘必失败
    process.env.HERMES_EVIDENCE_DIR = blocker
    const res = appendEvidence(rec({}))
    expect(res).toMatchObject({ added: false, code: 'write_failed' })
    expect(Object.keys(res).sort()).toEqual(['added', 'code', 'evicted', 'total'])
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])  // 无 tmp 残骸
  })
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

  it('缺裁决残条不渲染字面量 "undefined"、不遮蔽真实裁决（S-C 读侧防御）', async () => {
    const { buildResultCard } = await import('../result-card')
    appendEvidence(rec({ evidenceId: 'v1', kind: 'verification', verdict: 'pass', basis: 'ok', at: 1 }))
    appendEvidence(rec({ evidenceId: 'v2', kind: 'verification', at: 2 }))  // 残条：verification 无 verdict
    const card = buildResultCard('t1')
    expect(card.verificationBullets.map((b) => b.verdict)).toEqual(['pass'])
    expect(JSON.stringify(card)).not.toContain('undefined')
    expect(card.verdict).toBe('pass')  // 残条不顶掉真实裁决
  })
})
