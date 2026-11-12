// overlay[expdual] 生命周期引擎测试：计数、操作上限、归因、退役、矛盾、合成、批次快照。
import { describe, expect, it } from 'vitest'
import {
  applyInduce,
  closeChunk,
  commitSynthesis,
  detectContradictions,
  dismissSynthesis,
  digestBanks,
  recordBlame,
  retireRule,
} from '../dual-lifecycle'
import { emptyStore, type DualStoreShape } from '../dual-types'

const T = 1_700_000_000_000

function tip(condition: string, action: string): { store: DualStoreShape } {
  const res = applyInduce(emptyStore(), [{ op: 'ADD', channel: 'tip', text: '', condition, action }], 1, T)
  expect(res.rejected).toEqual([])
  return { store: res.store }
}

describe('归纳计数（论文表 10）', () => {
  it('ADD 计数 2，TIP 文本规范化；FACT 原样', () => {
    const addTip = applyInduce(emptyStore(), [
      { op: 'ADD', channel: 'tip', text: '', condition: '任务需要同类多对象', action: '继续检查其他位置' },
    ], 1, T)
    expect(addTip.rejected).toEqual([])
    expect(addTip.store.rules[0].id).toBe('t-1')
    expect(addTip.store.rules[0].count).toBe(2)
    expect(addTip.store.rules[0].text).toBe('在「任务需要同类多对象」条件下：继续检查其他位置')

    const addFact = applyInduce(emptyStore(), [
      { op: 'ADD', channel: 'fact', text: 'workspace/input 目录是上游素材目录' },
    ], 1, T)
    expect(addFact.store.rules[0].id).toBe('f-1')
    expect(addFact.store.rules[0].count).toBe(2)
  })

  it('两轨独立编号（f-1 与 t-1 并存）', () => {
    let store = tip('条件 A', '动作 A').store
    store = applyInduce(store, [{ op: 'ADD', channel: 'fact', text: '目录是上游素材目录' }], 1, T).store
    expect(store.rules.map((r) => r.id).sort()).toEqual(['f-1', 't-1'])
  })

  it('AGREE +1、EDIT +1 并改写文本', () => {
    let store = tip('条件 A', '动作 A').store
    store = applyInduce(store, [{ op: 'AGREE', ruleId: 't-1' }], 1, T).store
    expect(store.rules[0].count).toBe(3)
    store = applyInduce(store, [{ op: 'EDIT', ruleId: 't-1', text: '', condition: '条件 B', action: '动作 B' }], 1, T).store
    expect(store.rules[0].count).toBe(4)
    expect(store.rules[0].text).toBe('在「条件 B」条件下：动作 B')
  })

  it('REMOVE 冗余 −1 存活；矛盾 −3 越零即删除并留档', () => {
    const one = applyInduce(tip('条件 A', '动作 A').store, [{ op: 'REMOVE', ruleId: 't-1', reason: 'redundant' }], 1, T)
    expect(one.store.rules).toHaveLength(1)
    expect(one.store.rules[0].count).toBe(1)

    const gone = applyInduce(one.store, [{ op: 'REMOVE', ruleId: 't-1', reason: 'contradictory' }], 1, T)
    expect(gone.store.rules).toHaveLength(0)
    expect(gone.store.removed).toHaveLength(1)
    expect(gone.store.removed[0]).toMatchObject({ id: 't-1', count: -2, reason: 'contradictory', chunk: 1 })
  })

  it('每批 ≤4 操作、每规则 ≤1 操作', () => {
    const many = applyInduce(emptyStore(), [
      { op: 'ADD', channel: 'fact', text: '目录是素材目录' },
      { op: 'ADD', channel: 'fact', text: '字段是文本型存储' },
      { op: 'ADD', channel: 'fact', text: '端口是固定端口' },
      { op: 'ADD', channel: 'fact', text: '模板是固定模板' },
      { op: 'ADD', channel: 'fact', text: '配置是默认配置' },
    ], 1, T)
    expect(many.applied).toEqual([])
    expect(many.rejected).toHaveLength(5)

    const twice = applyInduce(tip('条件 A', '动作 A').store, [
      { op: 'AGREE', ruleId: 't-1' },
      { op: 'AGREE', ruleId: 't-1' },
    ], 1, T)
    expect(twice.applied).toEqual(['AGREE t-1（count=3）'])
    expect(twice.rejected).toHaveLength(1)
  })

  it('FACT 含动作动词或 TIP 缺条件 → 拒收（FACT 污染守卫）', () => {
    const badFact = applyInduce(emptyStore(), [{ op: 'ADD', channel: 'fact', text: '使用 openpyxl 读取原始值' }], 1, T)
    expect(badFact.rejected).toHaveLength(1)
    expect(badFact.store.rules).toHaveLength(0)

    const badTip = applyInduce(emptyStore(), [{ op: 'ADD', channel: 'tip', text: '继续检查其他位置' }], 1, T)
    expect(badTip.rejected).toHaveLength(1)
  })
})

describe('归因与退役', () => {
  it('归因必须定位到步骤；τ=1 首次归因即退役并留原因/批次', () => {
    const store = tip('条件 A', '动作 A').store
    const noStep = recordBlame(store, { chunk: 2, taskRef: 'task-1', step: '', ruleId: 't-1', note: '误导' }, T)
    expect(noStep.rejected).toContain('step')

    const res = recordBlame(store, { chunk: 2, taskRef: 'task-1', step: 'step-3', ruleId: 't-1', note: '按规则先读模板导致格式错' }, T)
    expect(res.rejected).toBeUndefined()
    expect(res.store.rules).toHaveLength(0)
    expect(res.retired).toMatchObject({ id: 't-1', reason: 'blame', chunk: 2, blameCount: 1, note: '按规则先读模板导致格式错' })
    expect(res.store.blames[0]).toMatchObject({ chunk: 2, taskRef: 'task-1', step: 'step-3', ruleId: 't-1' })
  })

  it('同一失败轨迹最多归因一条规则（防稀释）', () => {
    let store = tip('条件 A', '动作 A').store
    store = applyInduce(store, [{ op: 'ADD', channel: 'tip', text: '', condition: '条件 B', action: '动作 B' }], 1, T).store
    const first = recordBlame(store, { chunk: 3, taskRef: 'task-9', step: 'step-1', ruleId: 't-1', note: 'x' }, T)
    const second = recordBlame(first.store, { chunk: 3, taskRef: 'task-9', step: 'step-2', ruleId: 't-2', note: 'y' }, T)
    expect(second.rejected).toContain('最多归因一条')
  })

  it('人工退役必须给原因；退役后不再出现在活跃库', () => {
    const store = tip('条件 A', '动作 A').store
    const noReason = retireRule(store, 't-1', { reason: '' as never, chunk: 2 }, T)
    expect(noReason.rejected).toContain('原因')
    const res = retireRule(store, 't-1', { reason: 'manual', chunk: 2, note: '环境已变化' }, T)
    expect(res.store.rules).toHaveLength(0)
    expect(res.store.retired[0]).toMatchObject({ reason: 'manual', chunk: 2, count: 2 })
  })
})

describe('矛盾检测与合成', () => {
  function retiredPair(): DualStoreShape {
    let store = tip('任务需要多个同类对象', '继续检查其他可能位置').store
    store = applyInduce(store, [
      { op: 'ADD', channel: 'tip', text: '', condition: '任务需要多个同类对象', action: '只检查第一个位置' },
    ], 1, T).store
    store = retireRule(store, 't-1', { reason: 'manual', chunk: 2 }, T).store
    store = retireRule(store, 't-2', { reason: 'manual', chunk: 2 }, T).store
    return store
  }

  it('同条件不同动作 → 候选对；重复检测不重复登记', () => {
    const detected = detectContradictions(retiredPair(), T)
    expect(detected.candidates).toHaveLength(1)
    expect(detected.candidates[0].reason).toContain('同条件不同动作')
    const again = detectContradictions(detected.store, T)
    expect(again.candidates).toHaveLength(0)
    expect(again.store.synthesis).toHaveLength(1)
  })

  it('同动作相反极性 → 候选对', () => {
    let store = tip('缓存已预热', '检查缓存目录').store
    store = applyInduce(store, [
      { op: 'ADD', channel: 'tip', text: '', condition: '缓存未预热', action: '不检查缓存目录' },
    ], 1, T).store
    store = retireRule(store, 't-1', { reason: 'manual', chunk: 2 }, T).store
    store = retireRule(store, 't-2', { reason: 'manual', chunk: 2 }, T).store
    const detected = detectContradictions(store, T)
    expect(detected.candidates).toHaveLength(1)
    expect(detected.candidates[0].reason).toContain('相反极性')
  })

  it('无关经验不误报', () => {
    let store = tip('任务需要多个同类对象', '继续检查其他可能位置').store
    store = applyInduce(store, [
      { op: 'ADD', channel: 'tip', text: '', condition: 'CSV 编码未知', action: '先用 chardet 探测编码' },
    ], 1, T).store
    store = retireRule(store, 't-1', { reason: 'manual', chunk: 2 }, T).store
    store = retireRule(store, 't-2', { reason: 'manual', chunk: 2 }, T).store
    expect(detectContradictions(store, T).candidates).toHaveLength(0)
  })

  it('合成必须给合法条件-动作；落库为 TIP 并回指退役规则', () => {
    const store = retiredPair()
    const detected = detectContradictions(store, T)
    const id = detected.candidates[0].id

    const bad = commitSynthesis(detected.store, { candidateId: id, condition: '', action: '看情况', chunk: 3 }, T)
    expect(bad.rejected).toContain('条件')

    const okRes = commitSynthesis(detected.store, {
      candidateId: id,
      condition: '对象类型有多个实例',
      action: '放下第一个后继续搜索其他位置',
      chunk: 3,
    }, T)
    expect(okRes.rejected).toBeUndefined()
    expect(okRes.tipId).toBe('t-3')
    const rule = okRes.store.rules.find((r) => r.id === 't-3')
    expect(rule?.count).toBe(2)
    expect(rule?.evidence.some((e) => e.kind === 'synthesis')).toBe(true)
    const candidate = okRes.store.synthesis.find((c) => c.id === id)
    expect(candidate?.status).toBe('committed')
    expect(candidate?.tipId).toBe('t-3')
    for (const retired of okRes.store.retired) {
      expect(retired.synthesizedInto).toBe('t-3')
      expect(retired.reason).toBe('contradiction')
    }
  })

  it('驳回必须写理由', () => {
    const store = retiredPair()
    const detected = detectContradictions(store, T)
    const id = detected.candidates[0].id
    expect(dismissSynthesis(detected.store, id, '').rejected).toContain('理由')
    const okRes = dismissSynthesis(detected.store, id, '两条都不成立')
    expect(okRes.store.synthesis[0].status).toBe('dismissed')
    expect(okRes.store.synthesis[0].note).toBe('两条都不成立')
  })
})

describe('批次快照', () => {
  it('关闭批次落快照并把批次号 +1；摘要稳定可复算', () => {
    const store = tip('条件 A', '动作 A').store
    const first = closeChunk(store, T)
    expect(first.snapshot).toMatchObject({ chunk: 1, facts: 0, tips: 1, retired: 0, removed: 0 })
    expect(first.snapshot.digest).toBe(digestBanks(store))
    expect(first.store.chunk).toBe(2)
    expect(first.store.snapshots).toHaveLength(1)
  })
})
