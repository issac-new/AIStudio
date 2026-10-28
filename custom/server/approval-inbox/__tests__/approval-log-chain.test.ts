// AGT 吸收轮 B（2026-10-21）：审批决策日志前向链单测——写入即入链、篡改现形、
// 前链时代记录如实标注。
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendApprovalLog, verifyApprovalChain } from '../approval-log'

const dir = mkdtempSync(join(tmpdir(), 'approval-chain-'))

function useCase(name: string): string {
  const file = join(dir, name, 'history.json')
  mkdirSync(join(dir, name), { recursive: true })
  process.env.HERMES_APPROVALS_LOG_FILE = file
  return file
}

afterEach(() => {
  delete process.env.HERMES_APPROVALS_LOG_FILE
})

describe('approval-log 前向链', () => {
  it('写入即入链：两条裁决 verify intact', () => {
    const file = useCase('t1')
    appendApprovalLog({ id: 'a1', ts: 1, actor: 'op', targetKind: 'command', targetId: 'c1', targetTitle: 'rm', decision: 'approve' })
    appendApprovalLog({ id: 'a2', ts: 2, actor: 'op', targetKind: 'command', targetId: 'c2', targetTitle: 'ls', decision: 'reject' })
    const v = verifyApprovalChain()
    expect(v.intact).toBe(true)
    expect(v.chained).toBe(2)
    const lines = readFileSync(file, 'utf8')
    expect(lines).toMatch(/"prevHash":\s*"GENESIS"/)
  })

  it('改写历史（手改 decision）：intact=false，hash_mismatch 现形', () => {
    const file = useCase('t2')
    appendApprovalLog({ id: 'b1', ts: 1, actor: 'op', targetKind: 'command', targetId: 'c1', targetTitle: 'x', decision: 'reject' })
    appendApprovalLog({ id: 'b2', ts: 2, actor: 'op', targetKind: 'command', targetId: 'c2', targetTitle: 'y', decision: 'approve' })
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string; decision: string }>
    doc[0].decision = 'approve' // 篡改：把否决改成批准
    writeFileSync(file, JSON.stringify(doc, null, 1))
    const v = verifyApprovalChain()
    expect(v.intact).toBe(false)
    expect(v.anomalies.some((a) => a.status === 'hash_mismatch')).toBe(true)
  })

  it('前链时代记录（无 hash 字段）与新链共存：unchained 如实标注，intact 保持', () => {
    const file = useCase('t3')
    // 手造一份升级前的旧账（无链字段）
    writeFileSync(file, JSON.stringify([
      { id: 'old1', ts: 1, actor: 'op', targetKind: 'command', targetId: 'c1', targetTitle: '旧', decision: 'approve' },
    ], null, 1))
    appendApprovalLog({ id: 'n1', ts: 2, actor: 'op', targetKind: 'command', targetId: 'c2', targetTitle: '新', decision: 'approve' })
    const v = verifyApprovalChain()
    expect(v.unchained).toBe(1)
    expect(v.chained).toBe(1)
    expect(v.intact).toBe(true)
  })
})
