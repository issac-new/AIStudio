// overlay/custom/client/matrix-teams/__tests__/delivery-protocol-v2.test.ts
// ══ M-A 协议 v2 增量用例（草稿未跑；应用=整文件拷入 __tests__/）══
import { describe, it, expect } from 'vitest'
import {
  DELIVERY_SCHEMA_VERSION, DELIVERY_GATES, HUMAN_GATES, PROJECT_INDEX_ACCOUNT_DATA_TYPE,
  parseCaseContent, parseGateContent, parseProjectIndexContent,
  validateGateSender, aggregateSignoffs,
} from '../delivery-protocol'

const caseV1 = {
  schemaVersion: 1, caseId: 'c-001', title: 'stringops v0.2', repoUrl: 'git@example:ops.git',
  tier: 'standard', stage: 'P3', ownerAccount: '@alice:matrix.test',
  createdAt: 1, updatedAt: 2, updatedBy: '@alice:matrix.test',
}

describe('v2 版本双认（M-A 计划 T3-1）', () => {
  it('v1 与 v2 的 case content 均解析；v3/未知 → null', () => {
    expect(parseCaseContent(caseV1)).toBeTruthy()
    expect(parseCaseContent({ ...caseV1, schemaVersion: 2 })).toBeTruthy()
    expect(parseCaseContent({ ...caseV1, schemaVersion: 3 })).toBeNull()
    expect(parseCaseContent({ ...caseV1, schemaVersion: '2' })).toBeNull()
  })
  it('schemaVersion 常量为 2（写面版本）；回显：v1 进 v1 出', () => {
    expect(DELIVERY_SCHEMA_VERSION).toBe(2)
    expect(parseCaseContent(caseV1)?.schemaVersion).toBe(1)
    expect(parseCaseContent({ ...caseV1, schemaVersion: 2 })?.schemaVersion).toBe(2)
  })
})

describe('projectId（M-A 计划 T3-2）', () => {
  it('合法 projectId 解析；缺省容忍', () => {
    const c = parseCaseContent({ ...caseV1, schemaVersion: 2, projectId: 'proj-pay' })
    expect(c?.projectId).toBe('proj-pay')
    expect(parseCaseContent({ ...caseV1, schemaVersion: 2 })?.projectId).toBeUndefined()
  })
  it('projectId 超 64 → null；非串视为缺省容忍（沿 body/priority 容错约定）', () => {
    expect(parseCaseContent({ ...caseV1, schemaVersion: 2, projectId: 'x'.repeat(65) })).toBeNull()
    expect(parseCaseContent({ ...caseV1, schemaVersion: 2, projectId: 7 })?.projectId).toBeUndefined()
  })
})

describe('R 门与 signoff（M-A 计划 T3-3/4）', () => {
  const r2 = {
    schemaVersion: 2, caseId: 'c-001', gate: 'R2', verdict: 'pass',
    evidence: { kind: 'human' as const, summary: '设计评审通过' },
    decidedBy: '@bob:matrix.test', at: 10,
  } as const
  it('gate 枚举扩 R1-R4；HUMAN_GATES 扩全六门', () => {
    expect([...DELIVERY_GATES]).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'R1', 'R2', 'R3', 'R4'])
    expect([...HUMAN_GATES]).toEqual(['G1', 'G5', 'R1', 'R2', 'R3', 'R4'])
  })
  it('signoff 合法解析；缺省容忍；非法（verdict 非枚举/at 非数）→ null', () => {
    const withSignoff = { ...r2, signoff: { decidedBy: '@bob:matrix.test', verdict: 'pass' as const, at: 9 } }
    expect(parseGateContent(withSignoff)?.signoff).toEqual({ decidedBy: '@bob:matrix.test', verdict: 'pass', at: 9 })
    expect(parseGateContent(r2)?.signoff).toBeUndefined()
    expect(parseGateContent({ ...r2, signoff: { decidedBy: '@bob:matrix.test', verdict: 'maybe', at: 9 } })).toBeNull()
    expect(parseGateContent({ ...r2, signoff: { decidedBy: '@bob:matrix.test', verdict: 'pass', at: 'now' } })).toBeNull()
  })
  it('R 门 sender 是 bot → human 要求错；signoff.decidedBy 参与主体校验', () => {
    expect(validateGateSender(r2, '@bob-agent:matrix.test')).toEqual(['gate R2 requires human sender'])
    const signed = { ...r2, signoff: { decidedBy: '@carol:matrix.test', verdict: 'pass' as const, at: 9 } }
    expect(validateGateSender(signed, '@alice:matrix.test'))
      .toContain('decidedBy is not the sender principal')
  })
})

describe('aggregateSignoffs 会签投影（M-A 计划 T3-3）', () => {
  const mk = (decidedBy: string, verdict: 'pass' | 'reject' | 'conditional', at: number) => ({
    schemaVersion: 2 as const, caseId: 'c-001' as const, gate: 'R2' as const, verdict,
    evidence: { kind: 'human' as const, summary: 's' },
    ...(verdict !== 'pass' ? { reason: 'r' } : {}),
    decidedBy, at,
  })
  it('全员 pass → pass；任一 reject → reject；混合 → conditional', () => {
    const m1 = aggregateSignoffs([mk('@a:x', 'pass', 1), mk('@b:x', 'pass', 2)])
    expect(m1.get('c-001:R2')?.verdict).toBe('pass')
    expect(m1.get('c-001:R2')?.signoffs).toHaveLength(2)
    const m2 = aggregateSignoffs([mk('@a:x', 'pass', 1), mk('@b:x', 'reject', 2)])
    expect(m2.get('c-001:R2')?.verdict).toBe('reject')
    const m3 = aggregateSignoffs([mk('@a:x', 'pass', 1), mk('@b:x', 'conditional', 2)])
    expect(m3.get('c-001:R2')?.verdict).toBe('conditional')
  })
  it('单判定人退化为单 signoff（无 signoff 字段时事件本身即签核）', () => {
    const m = aggregateSignoffs([mk('@a:x', 'pass', 1)])
    expect(m.get('c-001:R2')?.verdict).toBe('pass')
    expect(m.get('c-001:R2')?.signoffs).toEqual([{ decidedBy: '@a:x', verdict: 'pass', at: 1 }])
  })
  it('同人多次签核取 at 最新（改主意覆盖）', () => {
    const m = aggregateSignoffs([mk('@a:x', 'reject', 1), mk('@a:x', 'pass', 5)])
    expect(m.get('c-001:R2')?.verdict).toBe('pass')
    expect(m.get('c-001:R2')?.signoffs).toHaveLength(1)
  })
})

describe('parseProjectIndexContent（M-A 计划 T3-5）', () => {
  const ok = {
    schemaVersion: 2,
    projects: [
      { projectId: 'proj-pay', title: '支付对账', roomIds: ['!r1:x', '!r2:x'] },
    ],
    updatedBy: '@alice:matrix.test', updatedAt: 3,
  }
  it('合法解析；类型常量为 com.swarmstudio.project', () => {
    expect(parseProjectIndexContent(ok)).toEqual(ok)
    expect(PROJECT_INDEX_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.project')
  })
  it('projects 混非对象 / 超上限 / roomIds 混非串 → null', () => {
    expect(parseProjectIndexContent({ ...ok, projects: [{}] })).toBeNull()
    expect(parseProjectIndexContent({
      ...ok,
      projects: Array.from({ length: 51 }, (_, i) => ({ projectId: `p${i}`, title: 't', roomIds: [] })),
    })).toBeNull()
    expect(parseProjectIndexContent({
      ...ok, projects: [{ projectId: 'p', title: 't', roomIds: ['!r:x', 1] }],
    })).toBeNull()
  })
  it('schemaVersion 1 双认（读面）；updatedBy 缺失 → null', () => {
    expect(parseProjectIndexContent({ ...ok, schemaVersion: 1 })).toBeTruthy()
    expect(parseProjectIndexContent({ ...ok, updatedBy: undefined })).toBeNull()
  })
})
