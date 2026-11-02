// 测试稳定性 DSL 三件套守门（2026-11-02 批 A）：
//   1) waitFor——首轮立即判（不白等 interval）、async 谓词、超时错误信息带 label 与轮询数
//   2) Teardown——逆序执行、单条失败不阻断后续、run 幂等（二次空转）
//   3) pick——where 过滤、random=false 确定性取首、空结果/非数组抛错带规模锚
// 只测 dsl.mjs 纯逻辑（零依赖），不 import harness.mjs（会拉 @playwright/test 浏览器链）。
import { describe, expect, it } from 'vitest'
import { waitFor, Teardown, pick } from '../regression/dsl.mjs'

describe('waitFor 谓词轮询', () => {
  it('谓词首查即真时立即返回（零间隔等待）', async () => {
    const t0 = Date.now()
    await waitFor(() => true, { timeoutMs: 5000, intervalMs: 5000 })
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('async 谓词在若干轮后成立即 resolve', async () => {
    let n = 0
    await waitFor(async () => ++n >= 3, { timeoutMs: 2000, intervalMs: 10 })
    expect(n).toBeGreaterThanOrEqual(3)
  })

  it('超时抛错信息带 label 与轮询次数（多步走查定位用）', async () => {
    await expect(
      waitFor(() => false, { timeoutMs: 150, intervalMs: 50, label: '任务卡状态=done' })
    ).rejects.toThrow(/任务卡状态=done.*150ms.*轮询/)
  })
})

describe('Teardown 状态恢复', () => {
  it('run 逆序执行（后注册先释放）', async () => {
    const td = new Teardown('测试')
    const order = []
    td.register('第一步', () => { order.push('第一步') })
    td.register('第二步', () => { order.push('第二步') })
    td.register('第三步', () => { order.push('第三步') })
    const { ran, failures } = await td.run()
    expect(order).toEqual(['第三步', '第二步', '第一步'])
    expect(ran).toHaveLength(3)
    expect(failures).toHaveLength(0)
  })

  it('单条抛错不阻断后续动作，失败清单带动作名与错误', async () => {
    const td = new Teardown('测试')
    const touched = []
    td.register('外层', () => { touched.push('外层') })
    td.register('会失败的', () => { throw new Error('连接已断') })
    td.register('内层', () => { touched.push('内层') })
    const { ran, failures } = await td.run()
    // 逆序：内层先跑（成功）→ 会失败的（捕获）→ 外层（仍执行）
    expect(touched).toEqual(['内层', '外层'])
    expect(ran).toEqual(['内层', '外层'])
    expect(failures).toEqual([{ name: '会失败的', error: '连接已断' }])
  })

  it('run 幂等：二次调用空转不重复执行', async () => {
    const td = new Teardown('测试')
    let count = 0
    td.register('只跑一次', () => { count++ })
    await td.run()
    const second = await td.run()
    expect(count).toBe(1)
    expect(second.ran).toHaveLength(0)
    expect(second.failures).toHaveLength(0)
  })
})

describe('pick 数据选型', () => {
  const items = [
    { id: 'a', status: 'NORMAL' },
    { id: 'b', status: 'LOCKED' },
    { id: 'c', status: 'NORMAL' },
  ]

  it('where 过滤后命中且结果满足条件', () => {
    const hit = pick(items, { where: (i) => i.status === 'NORMAL', label: '可用货位' })
    expect(['a', 'c']).toContain(hit.id)
  })

  it('random=false 确定性取过滤后首条（可复现断言用）', () => {
    const hit = pick(items, { where: (i) => i.status === 'NORMAL', random: false })
    expect(hit.id).toBe('a')
  })

  it('过滤后为空抛错带输入规模与条件语义（禁静默 undefined）', () => {
    expect(() => pick(items, { where: (i) => i.status === 'GONE', label: '可用货位' }))
      .toThrow(/可用货位.*无匹配候选.*3 条/)
  })

  it('非数组输入抛错带实参类型', () => {
    expect(() => pick(null, { label: '清单' })).toThrow(/非数组.*object/)
  })
})
