// AGT 吸收轮 B（2026-10-21）：执法决策账前向链单测——写入即入链、篡改现形、
// 留存清理断锚如实标注。
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _usePolicyDecisionDirForTests,
  appendPolicyDecision,
  verifyPolicyDecisionChain,
} from '../policy-decisions'

const dir = mkdtempSync(join(tmpdir(), 'policy-chain-'))

afterEach(() => {
  _usePolicyDecisionDirForTests(dir)
})

describe('policy-decisions 前向链', () => {
  it('写入即入链：三条连续裁决账 verify intact', () => {
    _usePolicyDecisionDirForTests(join(dir, 't1'))
    appendPolicyDecision({ tool: 'read_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    appendPolicyDecision({ tool: 'terminal_exec', enforcing: true, allow: false, rule: 'mode-off', reason: 'test' })
    appendPolicyDecision({ tool: 'write_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    const v = verifyPolicyDecisionChain({})
    expect(v.ok ?? true).toBe(true)
    expect(v.intact).toBe(true)
    expect(v.chained).toBe(3)
    expect(v.unchained).toBe(0)
  })

  it('改写历史行：intact=false 且 firstBroken 指向被改条', () => {
    _usePolicyDecisionDirForTests(join(dir, 't2'))
    appendPolicyDecision({ tool: 'read_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    appendPolicyDecision({ tool: 'write_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    const files = readdirSync(join(dir, 't2')).filter((f) => f.endsWith('.jsonl'))
    expect(files.length).toBe(1)
    const file = join(dir, 't2', files[0])
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    const tampered = JSON.parse(lines[0]) as { tool: string }
    tampered.tool = 'terminal_exec' // 改写历史
    lines[0] = JSON.stringify(tampered)
    writeFileSync(file, lines.join('\n') + '\n')
    _usePolicyDecisionDirForTests(join(dir, 't2')) // 清链缓存
    const v = verifyPolicyDecisionChain({})
    expect(v.intact).toBe(false)
    expect(v.firstBroken).toBe(0)
    expect(v.anomalies.some((a) => a.status === 'hash_mismatch')).toBe(true)
  })

  it('跨日连续：不同天的账拼接成一条链；留存清理后断锚如实标不算篡改', () => {
    _usePolicyDecisionDirForTests(join(dir, 't3'))
    const day1 = Date.now() - 2 * 86_400_000
    const day2 = Date.now() - 86_400_000
    appendPolicyDecision({ ts: day1, tool: 'read_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    appendPolicyDecision({ ts: day2, tool: 'write_file', enforcing: true, allow: true, rule: 'ladder-pass' })
    appendPolicyDecision({ tool: 'memory_search', enforcing: true, allow: true, rule: 'ladder-pass' })
    let v = verifyPolicyDecisionChain({ days: 14 })
    expect(v.chained).toBe(3)
    expect(v.intact).toBe(true)
    // 模拟留存清理：删最旧一天
    const files = readdirSync(join(dir, 't3')).filter((f) => f.endsWith('.jsonl')).sort()
    unlinkSync(join(dir, 't3', files[0]))
    _usePolicyDecisionDirForTests(join(dir, 't3'))
    v = verifyPolicyDecisionChain({ days: 14 })
    expect(v.intact).toBe(true)
    expect(v.checks[0].status).toBe('anchor_dangling')
  })
})
