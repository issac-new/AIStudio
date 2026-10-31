import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  checkDecisionGrant,
  computeTaskRevision,
  decisionTierForTask,
  grantAllows,
  serializeTaskRevision,
  type DecisionGrant,
  type DecisionTask,
} from '../decision-grant'

const vector = JSON.parse(readFileSync(
  resolve(__dirname, 'fixtures/decision-grant-revision.json'), 'utf8',
)) as { task: DecisionTask; canonical: string; sha256: string }
const task = vector.task
const NOW = 1_760_000_100_000

function makeGrant(patch: Partial<DecisionGrant> = {}, forTask: DecisionTask = task): DecisionGrant {
  return {
    taskId: forTask.id,
    board: forTask.board,
    tier: 'T2',
    decision: 'approved',
    actor: 'human-director',
    taskRevision: computeTaskRevision(forTask),
    issuedAt: NOW - 1_000,
    decidedAt: NOW - 1_000,
    choice: '方案 B',
    ...patch,
  }
}

describe('decision-grant 修订单一序列化契约', () => {
  it('与 Python 共用同一 canonical JSON 和 SHA-256 测试向量', () => {
    expect(serializeTaskRevision(task)).toBe(vector.canonical)
    expect(computeTaskRevision(task)).toBe(vector.sha256)
  })

  it('只从卡面前两行读取 tier 标记；APPROVED 正文不是 grant', () => {
    expect(decisionTierForTask(task)).toBe('T2')
    expect(decisionTierForTask({ ...task, body: '普通任务\n\n第三行 tier=T3 不算标记' })).toBe('T1')
    expect(checkDecisionGrant(null, { ...task, body: `${task.body}\nAPPROVED` }, 'T2', NOW))
      .toEqual({ ok: false, reason: 'missing_grant' })
  })
})

describe('decision-grant T1/T2/T3 执行判定', () => {
  it('T1 无需 grant；T2 需要批准和人工非空选择；T3 需要批准但不要求选择', () => {
    expect(grantAllows(null, task, 'T1', NOW)).toBe(true)

    expect(grantAllows(makeGrant(), task, 'T2', NOW)).toBe(true)
    expect(checkDecisionGrant(makeGrant({ choice: '   ' }), task, 'T2', NOW))
      .toEqual({ ok: false, reason: 'choice_required' })
    expect(checkDecisionGrant(makeGrant({ decision: 'rejected' }), task, 'T2', NOW))
      .toEqual({ ok: false, reason: 'not_approved' })

    const t3Task = { ...task, body: task.body.replace('tier=T2', 'tier=T3') }
    const t3Grant = makeGrant({ tier: 'T3', choice: undefined }, t3Task)
    expect(grantAllows(t3Grant, t3Task, 'T3', NOW)).toBe(true)
  })

  it('grant 绑定任务、板、层级和认证 actor；缺任一边界即拒绝', () => {
    expect(checkDecisionGrant(makeGrant({ taskId: 'other' }), task, 'T2', NOW).reason).toBe('task_mismatch')
    expect(checkDecisionGrant(makeGrant({ board: 'other' }), task, 'T2', NOW).reason).toBe('board_mismatch')
    expect(checkDecisionGrant(makeGrant({ tier: 'T3' }), task, 'T2', NOW).reason).toBe('tier_mismatch')
    expect(checkDecisionGrant(makeGrant({ actor: '  ' }), task, 'T2', NOW).reason).toBe('invalid_actor')
    expect(checkDecisionGrant(makeGrant({ decidedAt: Number.NaN }), task, 'T2', NOW).reason).toBe('invalid_time')
  })

  it('正文、workspace、assignee 后续变化都使旧 grant 失效', () => {
    const grant = makeGrant()
    for (const changed of [
      { ...task, body: `${task.body}\n执行范围已改变` },
      { ...task, workspace_path: '/tmp/other-workspace' },
      { ...task, assignee: 'bob' },
    ]) {
      expect(checkDecisionGrant(grant, changed, 'T2', NOW))
        .toEqual({ ok: false, reason: 'revision_mismatch' })
    }
  })

  it('过期 grant 拒绝，期限边界按 now >= expiresAt 失效', () => {
    const grant = makeGrant({ expiresAt: NOW })
    expect(grantAllows(grant, task, 'T2', NOW - 1)).toBe(true)
    expect(checkDecisionGrant(grant, task, 'T2', NOW))
      .toEqual({ ok: false, reason: 'expired' })
  })
})

describe('decision-grant 策略版本与授权强度（2026-10-31 A+B 批）', () => {
  it('旧 grant 无新增字段：按缺省兼容，不拒绝', () => {
    const grant = makeGrant()
    expect(grant.strength).toBeUndefined()
    expect(grant.policyVersion).toBeUndefined()
    expect(checkDecisionGrant(grant, task, 'T2', NOW).ok).toBe(true)
  })

  it('版本落后：默认放行并给 warning', () => {
    const grant = makeGrant({ policyVersion: 0 })
    const r = checkDecisionGrant(grant, task, 'T2', NOW, { currentPolicyVersion: 3, strict: false })
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual(['policy_version_stale:0<3'])
  })

  it('版本落后 + 严格模式：拒绝', () => {
    const grant = makeGrant({ policyVersion: 0 })
    expect(checkDecisionGrant(grant, task, 'T2', NOW, { currentPolicyVersion: 3, strict: true }))
      .toMatchObject({ ok: false, reason: 'policy_version_stale' })
  })

  it('版本已跟上：不产生 warning', () => {
    const grant = makeGrant({ policyVersion: 3 })
    const r = checkDecisionGrant(grant, task, 'T2', NOW, { currentPolicyVersion: 3 })
    expect(r.warnings).toBeUndefined()
  })

  it('强度字段随 grant 原样保留（delegated 可审计）', () => {
    const grant = makeGrant({ strength: 'delegated', issuerRole: 'local_operator' })
    expect(checkDecisionGrant(grant, task, 'T2', NOW).ok).toBe(true)
    expect(grant.strength).toBe('delegated')
  })
})
