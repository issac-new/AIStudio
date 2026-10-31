/**
 * 架构规则 004 并发配额（2026-10-31 全功能回归）。
 *
 * 此前 executor 把 currentRunning 硬编码为 0：规则在 assign 链真实调用，
 * 但「同一负责人 running ≤3」永不生效；且配额对象取 task.assignee（派发前旧值），
 * 不是本次派发目标 profile。本测试锁定：目标负责人优先、有通道才执行、
 * 超配额 BLOCK、查询缺失/失败 fail-soft 不误拦。
 */
import { describe, expect, it } from 'vitest'
import { BlockPolicyCategory, RULE_CONCURRENT_QUOTA, evaluateRules } from '../architecture-engine'

const baseTask = {
  id: 't_quota_1',
  title: '配额测试任务',
  body: null,
  assignee: 'old-owner',
  status: 'ready',
}

describe('arch-rule-004 并发配额', () => {
  it('目标负责人 running 数达上限 → BLOCKED_BY_POLICY(QUOTA)', async () => {
    const action = await evaluateRules(baseTask, {
      targetAssignee: 'new-owner',
      getRunningTaskCount: async () => 3,
    })
    expect(action?.type).toBe('BLOCKED_BY_POLICY')
    expect(action?.policy).toBe(BlockPolicyCategory.QUOTA)
    expect(action?.ruleId).toBe('arch-rule-004')
    expect(action?.message).toContain('new-owner')
    expect(action?.message).toContain('3')
  })

  it('未达上限 → 放行（evaluateRules 返回 null）', async () => {
    const action = await evaluateRules(baseTask, {
      targetAssignee: 'new-owner',
      getRunningTaskCount: async () => 2,
    })
    expect(action).toBeNull()
  })

  it('配额对象优先取 targetAssignee，不取任务旧 assignee', async () => {
    const queried: string[] = []
    await evaluateRules(baseTask, {
      targetAssignee: 'new-owner',
      getRunningTaskCount: async (assignee) => {
        queried.push(assignee)
        return 0
      },
    })
    expect(queried).toEqual(['new-owner'])
  })

  it('无 getRunningTaskCount 通道 → 如实跳过，不假装执行也不误拦', async () => {
    const direct = await RULE_CONCURRENT_QUOTA.executor(baseTask, { targetAssignee: 'new-owner' })
    expect(direct.type).toBe('CONTINUE')
    expect(direct.message).toContain('跳过')
    expect(await evaluateRules(baseTask, { targetAssignee: 'new-owner' })).toBeNull()
  })

  it('查询抛错/返回 null → fail-soft 放行（治理约束不误拦派发）', async () => {
    expect(await evaluateRules(baseTask, {
      targetAssignee: 'new-owner',
      getRunningTaskCount: async () => { throw new Error('db down') },
    })).toBeNull()
    expect(await evaluateRules(baseTask, {
      targetAssignee: 'new-owner',
      getRunningTaskCount: async () => null,
    })).toBeNull()
  })

  it('无任何负责人 → 跳过（不把空 assignee 当配额对象）', async () => {
    const action = await evaluateRules({ ...baseTask, assignee: null }, {
      getRunningTaskCount: async () => 99,
    })
    expect(action).toBeNull()
  })
})
