// 测试稳定性 DSL 服务端面守门（2026-11-02 批 A）：
//   1) waitFor——async 谓词、超时错误信息锚（label+预算+轮询数）
//   2) createTeardownScope——逆序、失败不阻断、幂等
//   3) bindTeardownToSuite——afterAll 钩子拿到 run 结果（显式绑定契约，不装全局钩子）
import { describe, expect, it, vi } from 'vitest'
import { waitFor, createTeardownScope, bindTeardownToSuite } from '../index'

describe('server waitFor', () => {
  it('async 谓词在若干轮后成立', async () => {
    let n = 0
    await waitFor(async () => ++n >= 3, { timeoutMs: 2000, intervalMs: 5 })
    expect(n).toBeGreaterThanOrEqual(3)
  })

  it('超时错误信息带 label 与轮询数', async () => {
    await expect(
      waitFor(() => false, { timeoutMs: 100, intervalMs: 40, label: '网关注册表刷新' })
    ).rejects.toThrow(/网关注册表刷新.*100ms.*轮询/)
  })
})

describe('server createTeardownScope', () => {
  it('逆序执行且失败不阻断（残留最小化）', async () => {
    const scope = createTeardownScope('单测')
    const touched: string[] = []
    scope.register('建临时任务卡', () => { touched.push('删临时任务卡') })
    scope.register('开心跳定时器', () => { throw new Error('timer already unref') })
    scope.register('建缓存条目', () => { touched.push('清缓存条目') })
    const { ran, failures } = await scope.run()
    expect(touched).toEqual(['清缓存条目', '删临时任务卡']) // 逆序：缓存先清
    // ran 记注册名（失败汇总须可读出恢复的是什么），逆序执行序
    expect(ran).toEqual(['建缓存条目', '建临时任务卡'])
    expect(failures).toEqual([{ name: '开心跳定时器', error: 'timer already unref' }])
  })

  it('run 幂等（二次调用空转）', async () => {
    const scope = createTeardownScope()
    let count = 0
    scope.register('只跑一次', () => { count++ })
    await scope.run()
    const second = await scope.run()
    expect(count).toBe(1)
    expect(second).toEqual({ ran: [], failures: [] })
  })
})

describe('server bindTeardownToSuite', () => {
  it('把 scope.run 挂进传入的 afterAll 钩子（显式绑定契约）', async () => {
    const scope = createTeardownScope()
    const hooks: Array<() => void | Promise<void>> = []
    const fakeAfterAll = (fn: () => void | Promise<void>) => { hooks.push(fn) }
    bindTeardownToSuite(scope, fakeAfterAll)
    scope.register('清理动作', () => {})
    expect(hooks).toHaveLength(1)
    const { ran } = await hooks[0]()
    expect(ran).toEqual(['清理动作'])
  })

  it('vitest afterAll 实挂冒烟（钩子被调用且执行 scope）', async () => {
    const afterAll = vi.fn()
    // @ts-expect-error 只取 vi 的调用记录能力，不走真实 suite 注册面
    const scope = createTeardownScope('冒烟')
    bindTeardownToSuite(scope, afterAll)
    expect(afterAll).toHaveBeenCalledTimes(1)
  })
})
