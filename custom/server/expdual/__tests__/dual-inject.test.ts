// overlay[expdual] 注入测试：默认关、分通道独立编号、封顶、作用域、语境排序、fail-soft。
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { dualTrackLinesForDispatch, renderDualTrackBlock, selectDualRules } from '../dual-inject'
import { writeDualStore } from '../dual-store'
import { applyInduce } from '../dual-lifecycle'
import { emptyStore, type DualStoreShape } from '../dual-types'

const dir = mkdtempSync(join(tmpdir(), 'expdual-inject-'))
const T = 1_700_000_000_000

afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeEach(() => {
  process.env.EXP_DUAL_STORE = dir
  delete process.env.EXP_DUAL_INJECT
  rmSync(join(dir, 'dual-store.json'), { force: true })
})

function seed(): DualStoreShape {
  let store = emptyStore()
  store = applyInduce(store, [
    { op: 'ADD', channel: 'fact', text: 'workspace/input 目录是上游素材目录' },
    { op: 'ADD', channel: 'fact', text: 'CSV 分隔符常见为分号' },
    { op: 'ADD', channel: 'tip', text: '', condition: '用户未说明文件位置', action: '优先检查 workspace/input' },
    { op: 'ADD', channel: 'tip', text: '', condition: '编码未知', action: '先用 chardet 探测编码' },
  ], 1, T).store
  writeDualStore(store)
  return store
}

describe('双轨注入', () => {
  it('默认关闭：即使库里有规则也返回 0 行', () => {
    seed()
    expect(dualTrackLinesForDispatch({})).toEqual([])
  })

  it('开启后 FACT/TIP 分块且通道内独立编号', () => {
    seed()
    process.env.EXP_DUAL_INJECT = '1'
    const lines = dualTrackLinesForDispatch({})
    expect(lines[0]).toContain('【环境事实】')
    expect(lines[1]).toMatch(/^F1\. /)
    expect(lines[2]).toMatch(/^F2\. /)
    expect(lines[3]).toContain('【条件技巧】')
    expect(lines[4]).toMatch(/^T1\. /)
    expect(lines[5]).toMatch(/^T2\. /)
  })

  it('bigram 余弦检索：词序打乱仍命中同主题规则（收尾批升级回归）', () => {
    const store = seed()
    const selection = selectDualRules(store, { query: '识别分隔符与探测 CSV 编码' })
    expect(selection.facts[0].text).toContain('CSV 分隔符')
    expect(selection.tips[0].text).toContain('chardet')
  })

  it('每通道封顶 3 条；渲染不带 id/计数（防被当作本轮实测凭据）', () => {
    let store = emptyStore()
    store = applyInduce(store, [
      { op: 'ADD', channel: 'fact', text: '目录是上游素材目录' },
      { op: 'ADD', channel: 'fact', text: '字段是文本型存储' },
      { op: 'ADD', channel: 'fact', text: '端口是固定端口' },
      { op: 'ADD', channel: 'fact', text: '模板是固定模板' },
    ], 1, T).store
    writeDualStore(store)
    process.env.EXP_DUAL_INJECT = '1'
    const lines = dualTrackLinesForDispatch({})
    expect(lines.filter((l) => /^F\d+\. /.test(l))).toHaveLength(3)
    const joined = lines.join('\n')
    expect(joined).not.toContain('f-1')
    expect(joined).not.toContain('count')
  })

  it('作用域过滤：带列限定的规则只在命中列注入', () => {
    let store = emptyStore()
    store = applyInduce(store, [
      { op: 'ADD', channel: 'fact', text: '完成列要求附验收证据', scope: { columns: ['done'] } },
      { op: 'ADD', channel: 'fact', text: '目录是上游素材目录' },
    ], 1, T).store
    writeDualStore(store)
    process.env.EXP_DUAL_INJECT = '1'

    const ready = dualTrackLinesForDispatch({ column: 'ready' })
    expect(ready.join('\n')).not.toContain('完成列要求附验收证据')
    const done = dualTrackLinesForDispatch({ column: 'done' })
    expect(done.join('\n')).toContain('完成列要求附验收证据')
  })

  it('有语境时按 bigram 余弦排序（命中任务的规则优先）', () => {
    const store = seed()
    const selection = selectDualRules(store, { query: 'CSV 编码探测与分隔符识别' })
    expect(selection.facts[0].text).toContain('CSV 分隔符')
    expect(selection.tips[0].text).toContain('chardet')
  })

  it('存储损坏 fail-soft 返回空块（不阻断派发）', () => {
    writeFileSync(join(dir, 'dual-store.json'), '{not json', 'utf8')
    process.env.EXP_DUAL_INJECT = '1'
    expect(dualTrackLinesForDispatch({})).toEqual([])
  })

  it('空选择不产生空标题', () => {
    expect(renderDualTrackBlock({ facts: [], tips: [] })).toEqual([])
  })
})

describe('两路留痕（批一 b 变更 4：dual 路 recordInjection，kind 区分）', () => {
  it('taskId 到场：注入即落 kind=dual 回执（规则 ids＋作用域）；ruleIds 与行内容一致', async () => {
    seed()
    process.env.EXP_DUAL_INJECT = '1'
    const expStoreDir = mkdtempSync(join(tmpdir(), 'expdual-recall-exp-'))
    const { _useStoreDirForTests, listInjectionLog } = await import('../../expcandidates/exp-store')
    _useStoreDirForTests(expStoreDir)
    try {
      const { dualTrackInjectionForDispatch } = await import('../dual-inject')
      const { lines, ruleIds } = dualTrackInjectionForDispatch({ column: 'devimpl', specialist: 'refiner', taskId: 'T-401' })
      expect(lines.length).toBeGreaterThan(0)
      expect(ruleIds.every((id) => /^([ft]-\d+)$/.test(id))).toBe(true)
      const log = listInjectionLog()
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({
        taskId: 'T-401', kind: 'dual', column: 'devimpl', specialist: 'refiner', ids: ruleIds,
      })
    } finally {
      rmSync(expStoreDir, { recursive: true, force: true })
    }
  })

  it('taskId 缺席零留痕（向后兼容）；旧 dualTrackLinesForDispatch 是薄包装（行为不变）', async () => {
    seed()
    process.env.EXP_DUAL_INJECT = '1'
    const expStoreDir = mkdtempSync(join(tmpdir(), 'expdual-recall-exp2-'))
    const { _useStoreDirForTests, listInjectionLog } = await import('../../expcandidates/exp-store')
    _useStoreDirForTests(expStoreDir)
    try {
      const lines = dualTrackLinesForDispatch({ column: 'devimpl' })
      expect(lines.length).toBeGreaterThan(0)
      expect(listInjectionLog()).toEqual([]) // 无 taskId 不落回执
    } finally {
      rmSync(expStoreDir, { recursive: true, force: true })
    }
  })

  it('留痕 fail-soft：留痕账写坏不阻断注入行产出', async () => {
    seed()
    process.env.EXP_DUAL_INJECT = '1'
    const expStoreDir = mkdtempSync(join(tmpdir(), 'expdual-recall-exp3-'))
    const { _useStoreDirForTests } = await import('../../expcandidates/exp-store')
    _useStoreDirForTests(expStoreDir)
    try {
      writeFileSync(join(expStoreDir, 'exp-candidates.json'), '{broken', 'utf8')
      const { dualTrackInjectionForDispatch } = await import('../dual-inject')
      const { lines } = dualTrackInjectionForDispatch({ column: 'devimpl', taskId: 'T-402' })
      expect(lines.length).toBeGreaterThan(0) // 注入行照常，留痕失败不阻断
    } finally {
      rmSync(expStoreDir, { recursive: true, force: true })
    }
  })
})
