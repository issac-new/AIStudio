// callgate 执法接线测试（wx 挂账 #14 清偿批）：总闸默认零行为、准入三态拒绝、
// settle 回执闭环、mcp 资源映射、fail-open、REST 规则体校验。
import { describe, expect, it } from 'vitest'
import { CallgateRegistry, type CallgateRule } from '../callgate'
import { callgateHook, denyErrorFor, resourceOfTool } from '../callgate-hook'
import { parseCallgateRule } from '../registry'

const TIGHT_RULE: CallgateRule = {
  resource: { kind: 'tool', key: 'web_search' },
  quota: { maxConcurrent: 1, maxPerMinute: 2 },
  breaker: { failureThreshold: 1, windowMs: 60_000, openMs: 30_000, halfOpenProbes: 1 },
}

function freshRegistry(): CallgateRegistry {
  const r = new CallgateRegistry()
  r.setRule(TIGHT_RULE)
  return r
}

describe('resourceOfTool（mcp 连接器分键）', () => {
  it('mcp__{server}__{tool} → mcp:server（server 段小写）', () => {
    expect(resourceOfTool('mcp__GitHub__create_issue')).toEqual({ kind: 'mcp', key: 'github' })
  })
  it('普通工具 → tool:{name}', () => {
    expect(resourceOfTool('web_search')).toEqual({ kind: 'tool', key: 'web_search' })
  })
  it('残缺 mcp 名不抛（key 回落 unknown）', () => {
    expect(resourceOfTool('mcp__')).toEqual({ kind: 'mcp', key: 'unknown' })
  })
})

describe('callgateHook 执法语义', () => {
  it('总闸默认关＝零行为：preExecute 放行、postExecute 不记账', async () => {
    const registry = freshRegistry()
    const hook = callgateHook({ registry, enforceOn: false })
    await expect(hook.preExecute('web_search', {})).resolves.toBeUndefined()
    await hook.postExecute('web_search', {}, { ok: false })
    // 未执法时 settle 被对称跳过：熔断器不应因 postExecute 入失败账
    expect(registry.status({ kind: 'tool', key: 'web_search' }).breaker.state).toBe('closed')
  })

  it('限流拒绝：quota.maxPerMinute 耗尽 → rate_limited 拒并带降级建议', async () => {
    const registry = freshRegistry()
    const hook = callgateHook({ registry, enforceOn: true })
    await expect(hook.preExecute('web_search', {})).resolves.toBeUndefined() // 第 1 次放行
    await hook.postExecute('web_search', {}, { ok: true })
    const second = await hook.preExecute('web_search', {}) // 第 2 次占用
    await hook.postExecute('web_search', {}, { ok: true })
    const third = await hook.preExecute('web_search', {}) // 第 3 次超 2/min 窗
    expect(second).toBeUndefined()
    expect(third).toMatchObject({ allow: false })
    expect((third as { error: string }).error).toContain('rate_limited')
    expect((third as { error: string }).error).toContain('降级建议')
  })

  it('熔断拒绝：失败达阈值 → breaker_open；成功 settle 释放并发位', async () => {
    const registry = freshRegistry()
    const hook = callgateHook({ registry, enforceOn: true })
    await hook.preExecute('web_search', {})
    await hook.postExecute('web_search', {}, { ok: false }) // failureThreshold=1 → OPEN
    const denied = await hook.preExecute('web_search', {})
    expect(denied).toMatchObject({ allow: false })
    expect((denied as { error: string }).error).toContain('breaker_open')
    // 并发位释放回执：status.inFlight 归零（settle 的另一半语义）
    expect(registry.status({ kind: 'tool', key: 'web_search' }).inFlight).toBe(0)
  })

  it('mcp 工具按连接器分键执法', async () => {
    const registry = new CallgateRegistry()
    registry.setRule({ ...TIGHT_RULE, resource: { kind: 'mcp', key: 'github' } })
    const hook = callgateHook({ registry, enforceOn: true })
    await expect(hook.preExecute('mcp__github__create_issue', {})).resolves.toBeUndefined()
    await hook.postExecute('mcp__github__create_issue', {}, { ok: false })
    const denied = await hook.preExecute('mcp__github__list_issues', {})
    expect(denied).toMatchObject({ allow: false })
  })

  it('fail-open：registry 异常不拦截', async () => {
    const boom = { check: () => { throw new Error('boom') }, settle: () => { throw new Error('boom') } } as unknown as CallgateRegistry
    const hook = callgateHook({ registry: boom, enforceOn: true })
    await expect(hook.preExecute('web_search', {})).resolves.toBeUndefined()
    await expect(hook.postExecute('web_search', {}, { ok: true })).resolves.toBeUndefined()
  })
})

describe('denyErrorFor 文案', () => {
  it('rate_limited 带重试等待提示；breaker_open 无等待提示不编数字', () => {
    const rate = denyErrorFor({ kind: 'tool', key: 'x' }, 'rate_limited', 1500, 'closed')
    expect(rate).toContain('建议 2s 后重试')
    const breaker = denyErrorFor({ kind: 'llm', key: 'glm' }, 'breaker_open', 0, 'open')
    expect(breaker).toContain('breaker_open')
    expect(breaker).toContain('降级建议 degrade_model')
  })
})

describe('parseCallgateRule（REST 规则体 fail-closed 校验）', () => {
  const validBody = {
    resource: { kind: 'mcp', key: 'github' },
    quota: { maxConcurrent: 4, maxPerMinute: 60 },
    breaker: { failureThreshold: 5, windowMs: 60_000, openMs: 30_000, halfOpenProbes: 1 },
  }
  it('合法体过审并归一 halfOpenProbes 缺省', () => {
    const { halfOpenProbes, ...rest } = validBody.breaker
    const parsed = parseCallgateRule({ ...validBody, breaker: rest })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.rule.breaker.halfOpenProbes).toBe(1)
  })
  it('kind 越界/空 key/非正整数全数拒绝（不猜默认）', () => {
    const parsed = parseCallgateRule({ ...validBody, resource: { kind: 'gpu', key: '' }, quota: { maxConcurrent: 0, maxPerMinute: -1 } })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.problems.some((p) => p.includes('resource.kind'))).toBe(true)
      expect(parsed.problems.some((p) => p.includes('resource.key'))).toBe(true)
      expect(parsed.problems.some((p) => p.includes('maxConcurrent'))).toBe(true)
    }
  })
})
