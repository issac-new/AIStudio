// overlay/custom/server/evidence/__tests__/evidence-chain.test.ts
// 防篡改 hash 链守门测试（六文调研轮 C）：改写历史/删除中插/前链时代兼容/断锚预期。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendEvidence, evidenceFile, loadEvidence, verifyEvidenceChain, hashEvidenceRecord,
  resetEvidenceDirForTests, type EvidenceRecord,
} from '../evidence-store'

let dir: string

function rec(i: number): EvidenceRecord {
  return { evidenceId: `ev-${i}`, taskId: 'task-chain-test', kind: 'artifact', at: 1000 + i, ref: `./shot-${i}.png` }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ev-chain-'))
  process.env.HERMES_EVIDENCE_DIR = dir
})

afterAll(() => {
  resetEvidenceDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('evidence hash chain', () => {
  it('追加即挂链：3 条记录链完整、intact=true', () => {
    for (let i = 1; i <= 3; i++) appendEvidence(rec(i))
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(true)
    expect(v.chained).toBe(3)
    expect(v.unchained).toBe(0)
    const records = loadEvidence('task-chain-test').records
    expect(records[0].prevHash).toBe('GENESIS')
    expect(records[1].prevHash).toBe(records[0].hash)
    expect(records[2].prevHash).toBe(records[1].hash)
  })

  it('改写历史内容（不重算哈希）→ 改写条 hash_mismatch 现形；后续条链接指向旧哈希仍通（缺陷已在改写条暴露）', () => {
    for (let i = 1; i <= 3; i++) appendEvidence(rec(i))
    const file = evidenceFile('task-chain-test')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { records: EvidenceRecord[] }
    doc.records[1].ref = './tampered.png'  // 攻击者改写第 2 条内容但没重算哈希
    writeFileSync(file, JSON.stringify(doc, null, 2))
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(false)
    expect(v.firstBroken).toBe(1)
    expect(v.checks.find((c) => c.index === 1)?.status).toBe('hash_mismatch')
    expect(v.checks.find((c) => c.index === 2)?.status).toBe('chained_ok')
  })

  it('改写内容且重算本条哈希（高能力攻击者）→ 下一条 link_broken 现形', () => {
    for (let i = 1; i <= 3; i++) appendEvidence(rec(i))
    const file = evidenceFile('task-chain-test')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { records: EvidenceRecord[] }
    doc.records[1].ref = './tampered.png'
    doc.records[1].hash = hashEvidenceRecord(doc.records[1])  // 攻击者重算本条哈希掩蔽自己
    writeFileSync(file, JSON.stringify(doc, null, 2))
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(false)
    // 第 2 条自身验过（重算后自洽），但第 3 条 prevHash 存的是旧哈希 → 断链暴露
    expect(v.checks.find((c) => c.index === 1)?.status).toBe('chained_ok')
    expect(v.checks.find((c) => c.index === 2)?.status).toBe('link_broken')
  })

  it('删除中插记录 → link_broken 现形', () => {
    for (let i = 1; i <= 3; i++) appendEvidence(rec(i))
    const file = evidenceFile('task-chain-test')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { records: EvidenceRecord[] }
    doc.records.splice(1, 1)  // 攻击者抽走第 2 条
    writeFileSync(file, JSON.stringify(doc, null, 2))
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(false)
    expect(v.checks.find((c) => c.index === 1)?.status).toBe('link_broken')
  })

  it('前链时代兼容：旧记录无哈希字段 + 新记录挂链 → intact 保持 true、unchained 如实计数', () => {
    // 手工落一份"升级前"台账（无 hash 字段）
    const old1 = rec(1)
    const old2 = rec(2)
    writeFileSync(evidenceFile('task-chain-test'), JSON.stringify({ taskId: 'task-chain-test', records: [old1, old2] }, null, 2))
    appendEvidence(rec(3))  // 升级后第一条：从 GENESIS 起链
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(true)
    expect(v.unchained).toBe(2)
    expect(v.chained).toBe(1)
    expect(v.checks.find((c) => c.index === 2)?.status).toBe('chained_ok')
  })

  it('伪造追加（手搓 hash 字段）→ hash_mismatch', () => {
    appendEvidence(rec(1))
    const file = evidenceFile('task-chain-test')
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { records: EvidenceRecord[] }
    const forged = rec(2)
    forged.prevHash = doc.records[0].hash
    forged.hash = 'deadbeef'.repeat(8)  // 攻击者随便填的假哈希
    doc.records.push(forged)
    writeFileSync(file, JSON.stringify(doc, null, 2))
    const v = verifyEvidenceChain('task-chain-test')
    expect(v.intact).toBe(false)
    expect(v.checks.find((c) => c.index === 1)?.status).toBe('hash_mismatch')
  })

  it('hashEvidenceRecord 确定性：同记录两次计算一致，字段顺序无关', () => {
    const a = rec(9)
    const b = { ref: a.ref, at: a.at, kind: a.kind, taskId: a.taskId, evidenceId: a.evidenceId } as EvidenceRecord
    expect(hashEvidenceRecord({ ...a, prevHash: 'GENESIS' })).toBe(hashEvidenceRecord({ ...b, prevHash: 'GENESIS' }))
  })
})
