// 评审治理·策略引擎守门：风险分级、glob、审批计数与失效。
import { describe, it, expect } from 'vitest'
import {
  classifyChangeRisk, countEffectiveApprovals, escalateTier, globToRegExp, invalidateApprovals,
} from '../policy'
import { DEFAULT_POLICY, type BreakerState, type ReviewApproval, type ReviewPolicy } from '../types'

const policy: ReviewPolicy = {
  ...DEFAULT_POLICY,
  trustedAuthors: ['alice'],
}

const breaker = (active: boolean): BreakerState => ({
  active,
  windowHours: 24,
  from: 0,
  to: 1,
  reverts: 0,
  merges: 0,
  incidents: 0,
  revertRate: null,
  reasons: active ? ['test'] : [],
  evaluatedAt: 1,
})

const approval = (over: Partial<ReviewApproval>): ReviewApproval => ({
  approvalId: 'a1',
  actor: 'u1',
  actorKind: 'human',
  decision: 'approve',
  commit: 'c1',
  at: 1,
  ...over,
})

describe('glob 匹配', () => {
  it('** 跨目录、* 不跨目录、无斜杠按 basename 匹配', () => {
    expect(globToRegExp('**/*.md').test('docs/readme.md')).toBe(true)
    expect(globToRegExp('docs/*.md').test('docs/a/b.md')).toBe(false)
    expect(globToRegExp('*.md').test('docs/readme.md')).toBe(true)
    expect(globToRegExp('.github/workflows/**').test('.github/workflows/ci.yml')).toBe(true)
    expect(globToRegExp('packages/**/billing/**').test('packages/server/src/billing/x.ts')).toBe(true)
    expect(globToRegExp('package.json').test('packages/client/package.json')).toBe(true)
  })
})

describe('风险分级', () => {
  it('纯文档：受信任作者零人工，非受信任作者 1 人', () => {
    const trusted = classifyChangeRisk({ changedPaths: ['docs/a.md'], author: 'alice', policy })
    const untrusted = classifyChangeRisk({ changedPaths: ['docs/a.md'], author: 'bob', policy })
    expect(trusted.tier).toBe('low')
    expect(trusted.requiredHumanApprovals).toBe(0)
    expect(untrusted.requiredHumanApprovals).toBe(1)
  })

  it('受保护路径永远 high、2 人（CI / 发布脚本 / 依赖清单）', () => {
    for (const path of ['.github/workflows/ci.yml', 'scripts/release/publish.sh', 'package.json']) {
      const r = classifyChangeRisk({ changedPaths: [path], author: 'alice', policy })
      expect(r.tier).toBe('high')
      expect(r.requiredHumanApprovals).toBe(2)
      expect(r.protectedHits.length).toBeGreaterThan(0)
    }
  })

  it('敏感路径 medium、常规产品逻辑 medium、内部工具 low、特性开关后 low', () => {
    expect(classifyChangeRisk({ changedPaths: ['packages/server/src/cache/x.ts'], policy }).tier).toBe('medium')
    expect(classifyChangeRisk({ changedPaths: ['packages/server/src/feature.ts'], policy }).tier).toBe('medium')
    expect(classifyChangeRisk({ changedPaths: ['internal/dev/x.ts'], policy }).tier).toBe('low')
    expect(classifyChangeRisk({ changedPaths: ['packages/client/src/x.ts'], behindFlag: true, policy }).tier).toBe('low')
  })

  it('大 diff 升档、超大 diff 直接 high、无路径保守 medium', () => {
    const large = classifyChangeRisk({ changedPaths: ['packages/server/src/x.ts'], diffLines: 900, policy })
    expect(large.tier).toBe('medium')
    expect(large.reasons.join(' ')).toContain('large_diff')
    const huge = classifyChangeRisk({ changedPaths: ['packages/server/src/x.ts'], diffLines: 2500, policy })
    expect(huge.tier).toBe('high')
    expect(classifyChangeRisk({ changedPaths: [], policy }).tier).toBe('medium')
  })

  it('熔断激活只升不降：low→medium、medium→high、high 不动', () => {
    const low = classifyChangeRisk({ changedPaths: ['docs/a.md'], author: 'alice', policy, breaker: breaker(true) })
    expect(low.tier).toBe('medium')
    expect(low.breakerTightened).toBe(true)
    expect(low.requiredHumanApprovals).toBe(1)
    const medium = classifyChangeRisk({ changedPaths: ['packages/server/src/x.ts'], policy, breaker: breaker(true) })
    expect(medium.tier).toBe('high')
    const high = classifyChangeRisk({ changedPaths: ['.github/workflows/ci.yml'], policy, breaker: breaker(true) })
    expect(high.tier).toBe('high')
  })

  it('作者是 Agent 不改变风险档，但记责任提示', () => {
    const r = classifyChangeRisk({ changedPaths: ['packages/server/src/x.ts'], authorKind: 'agent', policy })
    expect(r.tier).toBe('medium')
    expect(r.reasons.join(' ')).toContain('author_is_agent')
  })

  it('escalateTier 封顶 high', () => {
    expect(escalateTier('low')).toBe('medium')
    expect(escalateTier('medium')).toBe('high')
    expect(escalateTier('high')).toBe('high')
  })
})

describe('审批语义', () => {
  it('只有人类 + approve + 当前提交 + 未失效才计数；Agent 审批不占名额', () => {
    const approvals = [
      approval({ approvalId: 'a1', commit: 'c1' }),
      approval({ approvalId: 'a2', commit: 'old' }),
      approval({ approvalId: 'a3', actorKind: 'agent', actor: 'review-agent', commit: 'c1' }),
      approval({ approvalId: 'a4', decision: 'request_changes', commit: 'c1' }),
    ]
    const counts = countEffectiveApprovals(approvals, 'c1')
    expect(counts.human).toBe(1)
    expect(counts.agent).toBe(1)
    expect(counts.effective.map((a) => a.approvalId)).toEqual(['a1'])
  })

  it('新提交/解冲突使旧审批失效', () => {
    const approvals = [approval({}), approval({ approvalId: 'a2' })]
    const invalidated = invalidateApprovals(approvals, 'new_commit', 99)
    expect(invalidated.every((a) => a.invalidatedAt === 99 && a.invalidatedBy === 'new_commit')).toBe(true)
    expect(countEffectiveApprovals(invalidated, 'c1').human).toBe(0)
    // 不改入参
    expect(approvals[0].invalidatedAt).toBeUndefined()
  })
})
