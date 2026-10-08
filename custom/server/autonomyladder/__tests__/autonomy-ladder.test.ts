// overlay/custom/server/autonomyladder/__tests__/autonomy-ladder.test.ts
// 自治阶梯（六文调研轮 H2）守门测试：upsert/校验/auto 档语义矛盾拒绝/兼容读取。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  listLadder, getLadder, upsertLadder, removeLadder, validateLadderInput, ladderForProfile,
  _useLadderDirForTests, _resetLadderDirForTests,
} from '../autonomy-ladder'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ladder-'))
  _useLadderDirForTests(dir)
})

afterAll(() => {
  _resetLadderDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('autonomy ladder', () => {
  it('upsert→list→get→remove 全链 + 幂等按 target', () => {
    const e1 = upsertLadder({ target: 'coding-agent', level: 'assist', approvalPoints: ['生产部署', '删除类文件操作'] })
    expect(e1.maxRiskTier).toBe('low')  // 非 auto 档缺省 low
    upsertLadder({ target: 'workflow:build:deploy', level: 'auto' })
    expect(listLadder()).toHaveLength(2)
    upsertLadder({ target: 'coding-agent', level: 'auto' })  // 同 target 覆盖
    expect(listLadder()).toHaveLength(2)
    expect(getLadder('coding-agent')!.level).toBe('auto')
    expect(getLadder('coding-agent')!.maxRiskTier).toBe('medium')  // auto 档缺省 medium
    expect(removeLadder('coding-agent')).toBe(true)
    expect(removeLadder('coding-agent')).toBe(false)
    expect(listLadder()).toHaveLength(1)
  })

  it('校验：auto 档带确认点=语义矛盾拒绝；非法 level/target 拒绝', () => {
    expect(validateLadderInput({ target: 'a', level: 'auto', approvalPoints: ['x'] })).toHaveLength(1)
    expect(validateLadderInput({ target: 'bad target!', level: 'assist' })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'bogus' as never })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'assist', maxRiskTier: 'extreme' as never })).toHaveLength(1)
    expect(validateLadderInput({ target: 'a', level: 'assist' })).toHaveLength(0)
    expect(() => upsertLadder({ target: 'a b', level: 'assist' })).toThrow()
  })

  it('ladderForProfile：profile 精确命中 > workflow: 前缀命中 > null', () => {
    upsertLadder({ target: 'workflow:build:deploy', level: 'auto' })
    expect(ladderForProfile('build')?.target).toBe('workflow:build:deploy')
    upsertLadder({ target: 'build', level: 'insight' })
    expect(ladderForProfile('build')?.level).toBe('insight')
    expect(ladderForProfile('nobody')).toBeNull()
  })
})
