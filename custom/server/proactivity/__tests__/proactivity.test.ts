// overlay/proactivity 守门测试：两轴模型纯函数 + 目标对齐台账（新鲜度边界 + 存储行为）。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { existsSync, mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ACTION_TIERS,
  PROBLEM_DEFINER_LEVELS,
  assess,
  failureCostCap,
  failureCostTier,
  maxActionTierForLevel,
  upgradeAdvice,
  type FailureCostFacts,
} from '../proactivity-model'
import {
  DEFAULT_ALIGNMENT_POLICY,
  _resetAlignmentDirForTests,
  _useAlignmentDirForTests,
  alignmentStatus,
  confirmAlignment,
  getAlignment,
  listAlignments,
  removeAlignment,
  upsertAlignment,
  validateGoalInput,
} from '../goal-alignment'

const DAY = 86_400_000
const LOW: FailureCostFacts = { reversible: true, impactScope: 'self', verifiable: true }
const MEDIUM: FailureCostFacts = { reversible: true, impactScope: 'team', verifiable: true }
const HIGH_EXTERNAL: FailureCostFacts = { reversible: false, impactScope: 'external', verifiable: true }
const HIGH_UNVERIFIABLE: FailureCostFacts = { reversible: false, impactScope: 'self', verifiable: false }

describe('失败代价三要素', () => {
  it('low=可撤回∧仅本人∧可验证；high=不可撤回∧(对外∨不可验证)；其余 medium', () => {
    expect(failureCostTier(LOW)).toBe('low')
    expect(failureCostTier(HIGH_EXTERNAL)).toBe('high')
    expect(failureCostTier(HIGH_UNVERIFIABLE)).toBe('high')
    expect(failureCostTier({ reversible: false, impactScope: 'team', verifiable: false })).toBe('high')
    expect(failureCostTier(MEDIUM)).toBe('medium')
    expect(failureCostTier({ reversible: false, impactScope: 'self', verifiable: true })).toBe('medium')
    expect(failureCostTier({ reversible: true, impactScope: 'external', verifiable: true })).toBe('medium')
  })

  it('代价档→上限：low 不降档 / medium 可逆执行 / high 起草', () => {
    expect(failureCostCap('low')).toBe('irreversible_exec')
    expect(failureCostCap('medium')).toBe('reversible_exec')
    expect(failureCostCap('high')).toBe('draft')
  })
})

describe('横轴档位上限（含升仓通道）', () => {
  it('L5 恒只告知（契约不改变——目标靠猜本身就是风险源）', () => {
    expect(maxActionTierForLevel('L5')).toBe('inform')
    expect(maxActionTierForLevel('L5', { goalExplicit: true, acceptanceCriteria: true })).toBe('inform')
  })

  it('L4 无契约=起草；有契约（目标明确+验收规则）=升仓放开', () => {
    expect(maxActionTierForLevel('L4')).toBe('draft')
    expect(maxActionTierForLevel('L4', { goalExplicit: true, acceptanceCriteria: false })).toBe('draft')
    expect(maxActionTierForLevel('L4', { goalExplicit: false, acceptanceCriteria: true })).toBe('draft')
    expect(maxActionTierForLevel('L4', { goalExplicit: true, acceptanceCriteria: true })).toBe('irreversible_exec')
  })

  it('L1-L3 全档可及（问题与边界皆用户定义）', () => {
    for (const level of ['L1', 'L2', 'L3'] as const) {
      expect(maxActionTierForLevel(level)).toBe('irreversible_exec')
    }
  })
})

describe('两轴组合裁决 assess', () => {
  it('L5：inform 放行、suggest 拒（cappedAt=inform）', () => {
    expect(assess({ level: 'L5', action: 'inform' }).allowed).toBe(true)
    const r = assess({ level: 'L5', action: 'suggest', failureCost: LOW })
    expect(r.allowed).toBe(false)
    expect(r.cappedAt).toBe('inform')
    expect(r.reasons.join()).toContain('L5')
  })

  it('L4 无契约上限起草（Daisy 实证：Agent 定义问题、责任在人）', () => {
    const r = assess({ level: 'L4', action: 'reversible_exec', failureCost: LOW })
    expect(r.allowed).toBe(false)
    expect(r.cappedAt).toBe('draft')
    expect(r.reasons.join()).toContain('无契约')
  })

  it('L4 有契约升仓：low 不降档 / medium 上限可逆 / high 压回起草（授权跟子任务走）', () => {
    const contract = { goalExplicit: true, acceptanceCriteria: true }
    expect(assess({ level: 'L4', action: 'irreversible_exec', contract, failureCost: LOW }).allowed).toBe(true)
    const m = assess({ level: 'L4', action: 'irreversible_exec', contract, failureCost: MEDIUM })
    expect(m.allowed).toBe(false)
    expect(m.cappedAt).toBe('reversible_exec')
    const h = assess({ level: 'L4', action: 'reversible_exec', contract, failureCost: HIGH_EXTERNAL })
    expect(h.allowed).toBe(false)
    expect(h.cappedAt).toBe('draft')
  })

  it('漂移防线：L4 目标 stale/never-confirmed 一律压回起草，契约不豁免', () => {
    const contract = { goalExplicit: true, acceptanceCriteria: true }
    const stale = assess({ level: 'L4', action: 'irreversible_exec', contract, failureCost: LOW, goalStatus: 'stale' })
    expect(stale.allowed).toBe(false)
    expect(stale.cappedAt).toBe('draft')
    expect(stale.reasons.join()).toContain('重新确认')
    const never = assess({ level: 'L4', action: 'reversible_exec', contract, failureCost: LOW, goalStatus: 'never-confirmed' })
    expect(never.cappedAt).toBe('draft')
    expect(never.reasons.join()).toContain('从未与人确认')
    // 对齐新鲜则不额外降档
    expect(assess({ level: 'L4', action: 'irreversible_exec', contract, failureCost: LOW, goalStatus: 'fresh' }).allowed).toBe(true)
  })

  it('L1-L3 同受失败代价约束（纵轴独立于横轴）', () => {
    expect(assess({ level: 'L1', action: 'irreversible_exec', failureCost: LOW }).allowed).toBe(true)
    expect(assess({ level: 'L1', action: 'irreversible_exec', failureCost: HIGH_EXTERNAL }).cappedAt).toBe('draft')
    expect(assess({ level: 'L2', action: 'reversible_exec', failureCost: MEDIUM }).allowed).toBe(true)
    // 对齐状态不约束 L1-L3（规则本身即对齐）
    expect(assess({ level: 'L3', action: 'irreversible_exec', failureCost: LOW, goalStatus: 'stale' }).allowed).toBe(true)
  })
})

describe('升仓通道提示 upgradeAdvice', () => {
  it('L5：目标说清→可降 L4；未说清→卡在目标靠猜', () => {
    expect(upgradeAdvice('L5', { goalExplicit: true, acceptanceCriteria: false }).note).toContain('降为 L4')
    expect(upgradeAdvice('L5').note).toContain('猜')
  })

  it('L4：先目标后验收规则，齐备→按规则自动执行（授权跟子任务走）', () => {
    expect(upgradeAdvice('L4').note).toContain('目标')
    expect(upgradeAdvice('L4', { goalExplicit: true, acceptanceCriteria: false }).note).toContain('验收规则')
    expect(upgradeAdvice('L4', { goalExplicit: true, acceptanceCriteria: true }).note).toContain('按规则自动执行')
  })

  it('L1-L3 指向自治阶梯配置面', () => {
    expect(upgradeAdvice('L1').note).toContain('autonomyladder')
  })
})

describe('模型常量完整性', () => {
  it('横轴 5 档、纵轴 5 档，语义表全覆盖', () => {
    expect(PROBLEM_DEFINER_LEVELS).toHaveLength(5)
    expect(ACTION_TIERS).toHaveLength(5)
  })
})

// ── 目标对齐台账 ─────────────────────────────────────────────────────

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proactivity-'))
  _useAlignmentDirForTests(dir)
})

afterAll(() => {
  _resetAlignmentDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('alignmentStatus 新鲜度边界', () => {
  const entry = (confirmations: number[]): ReturnType<typeof upsertAlignment> => ({
    goalId: 'milestone:m1', goalSummary: '把里程碑推到上线', createdAt: 0, confirmations: confirmations.map((at) => ({ at })),
  })

  it('确认 6.9 天=fresh；7.1 天=stale（默认 7 天再确认周期）', () => {
    expect(alignmentStatus(entry([100 * DAY]), 106.9 * DAY).status).toBe('fresh')
    const st = alignmentStatus(entry([100 * DAY]), 107.1 * DAY)
    expect(st.status).toBe('stale')
    expect(st.lastConfirmedAt).toBe(100 * DAY)
    expect(st.reason).toContain('重新确认')
  })

  it('从未确认：宽限期（1 天）内=fresh；超宽限=never-confirmed', () => {
    expect(alignmentStatus(entry([]), 0.5 * DAY).status).toBe('fresh')
    const nv = alignmentStatus(entry([]), 2 * DAY)
    expect(nv.status).toBe('never-confirmed')
    expect(nv.reason).toContain('从未与人确认')
  })

  it('policy 可调（maxConfirmAgeDays 生效）', () => {
    expect(alignmentStatus(entry([0]), 20 * DAY, { ...DEFAULT_ALIGNMENT_POLICY, maxConfirmAgeDays: 30 }).status).toBe('fresh')
  })
})

describe('对齐台账存储行为', () => {
  it('upsert→confirm（append-only 不覆盖）→list→remove 全链', () => {
    const e1 = upsertAlignment({ goalId: 'profile:goal-learn', goalSummary: '成为某领域专家' })
    expect(e1.confirmations).toHaveLength(0)
    confirmAlignment('profile:goal-learn', { by: 'alice', note: '方向没变' })
    confirmAlignment('profile:goal-learn', {})
    const e2 = getAlignment('profile:goal-learn')!
    expect(e2.confirmations).toHaveLength(2)
    expect(e2.confirmations[0]!.by).toBe('alice')
    expect(e2.createdAt).toBe(e1.createdAt)  // 确认不动 createdAt
    // 改摘要保留确认台账
    upsertAlignment({ goalId: 'profile:goal-learn', goalSummary: '成为某领域专家（修订）' })
    expect(getAlignment('profile:goal-learn')!.confirmations).toHaveLength(2)
    expect(getAlignment('profile:goal-learn')!.goalSummary).toContain('修订')
    expect(listAlignments()).toHaveLength(1)
    expect(removeAlignment('profile:goal-learn')).toBe(true)
    expect(removeAlignment('profile:goal-learn')).toBe(false)
    expect(confirmAlignment('profile:goal-learn')).toBeNull()
  })

  it('校验：非法 goalId / 空 Summary / 超长 Summary 拒绝', () => {
    expect(validateGoalInput({ goalId: 'a b', goalSummary: 'x' })).toHaveLength(1)
    expect(validateGoalInput({ goalId: 'ok:1', goalSummary: '  ' })).toHaveLength(1)
    expect(validateGoalInput({ goalId: 'ok:1', goalSummary: 'x'.repeat(201) })).toHaveLength(1)
    expect(validateGoalInput({ goalId: 'ok:1', goalSummary: 'x' })).toHaveLength(0)
    expect(() => upsertAlignment({ goalId: 'bad id', goalSummary: 'x' })).toThrow()
  })

  it('坏档隔离：垃圾 JSON→从空起步并留 .corrupt-* 档', () => {
    writeFileSync(join(dir, 'alignment.json'), '{not-json')
    expect(listAlignments()).toEqual([])
    expect(readdirSync(dir).some((f) => f.startsWith('alignment.json.corrupt-'))).toBe(true)
  })

  it('entries 缺字段的行被容忍读取（normalize 过滤）', () => {
    writeFileSync(join(dir, 'alignment.json'), JSON.stringify({ entries: [{ goalId: 42 }, { goalId: 'ok:1', goalSummary: 's', createdAt: 1, confirmations: [{ at: 2 }] }] }))
    const list = listAlignments()
    expect(list).toHaveLength(1)
    expect(list[0]!.goalId).toBe('ok:1')
    expect(list[0]!.confirmations).toHaveLength(1)
    // 读取面容忍不回写原档（惰性 normalize，坏行下次 save 才被清出）
    expect(existsSync(join(dir, 'alignment.json'))).toBe(true)
  })
})
