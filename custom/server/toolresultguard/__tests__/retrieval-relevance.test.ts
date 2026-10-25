// 检索生成后相关性断言守门（数据飞轮 round 2 挂账 4）：适用面 / 覆盖率 / 软标记 /
// 默认关选通 / 钩子留痕不阻断。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  queryOfInput, retrievalFlagCounts, retrievalGuardEnabled, retrievalMinCoverage,
  retrievalRelevanceCheck, retrievalRelevanceHook, retrievalToolPattern, tokenize,
} from '../retrieval-relevance'
import { readAudit, _useAuditDirForTests } from '../audit'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'retrieval-guard-'))
  _useAuditDirForTests(dir)
  process.env.FLYWHEEL_RETRIEVAL_GUARD = '1'
})

afterEach(() => {
  for (const k of ['FLYWHEEL_RETRIEVAL_GUARD', 'FLYWHEEL_RETRIEVAL_MIN_COVERAGE', 'FLYWHEEL_RETRIEVAL_TOOL_PATTERN']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

describe('适用面与分词', () => {
  it('检索类工具按名字模式命中；env 可覆盖模式', () => {
    expect(retrievalToolPattern().test('knowledge_search')).toBe(true)
    expect(retrievalToolPattern().test('web_fetch')).toBe(true)
    expect(retrievalToolPattern().test('write_file')).toBe(false)
    process.env.FLYWHEEL_RETRIEVAL_TOOL_PATTERN = '^my_search$'
    expect(retrievalToolPattern().test('knowledge_search')).toBe(false)
    expect(retrievalToolPattern().test('my_search')).toBe(true)
  })

  it('查询词提取：query/q/question/keywords/search/text 首个字符串；无则不适用', () => {
    expect(queryOfInput({ query: '机票' })).toBe('机票')
    expect(queryOfInput({ q: 'flight' })).toBe('flight')
    expect(queryOfInput({ other: 'x', text: 't' })).toBe('t')
    expect(queryOfInput({ nested: { query: '深' } })).toBeNull()
    expect(queryOfInput(undefined)).toBeNull()
  })

  it('分词：ASCII 词 + CJK 二元组', () => {
    const tokens = tokenize('查北京到上海的机票 flight')
    expect(tokens).toContain('flight')
    expect(tokens).toContain('北京')
    expect(tokens).toContain('机票')
    expect(tokens).not.toContain('北')
  })
})

describe('相关性判定（软标记 D15）', () => {
  it('相关结果不标记；疑似噪声低覆盖标记 CONFIRM 理由', () => {
    const good = retrievalRelevanceCheck('knowledge_search', { query: '查北京到上海的机票' }, '北京到上海的机票航班信息：MU5101 08:00 起飞……')
    expect(good.applicable).toBe(true)
    expect(good.flagged).toBe(false)
    expect(good.coverage).toBeGreaterThan(0.5)

    const noise = retrievalRelevanceCheck('knowledge_search', { query: '查北京到上海的机票' }, '今日股市大涨，新能源板块领涨，白酒板块回调……')
    expect(noise.applicable).toBe(true)
    expect(noise.flagged).toBe(true)
    expect(noise.reason).toContain('疑似噪声')
  })

  it('非检索工具/无查询/无结果文本/空分词：不适用跳过（fail-soft）', () => {
    expect(retrievalRelevanceCheck('write_file', { query: 'x' }, '内容').applicable).toBe(false)
    expect(retrievalRelevanceCheck('knowledge_search', {}, '内容').applicable).toBe(false)
    expect(retrievalRelevanceCheck('knowledge_search', { query: 'x' }, '').applicable).toBe(false)
    expect(retrievalRelevanceCheck('knowledge_search', { query: '·' }, '内容').applicable).toBe(false)
  })

  it('覆盖率下限 env 可覆盖', () => {
    process.env.FLYWHEEL_RETRIEVAL_MIN_COVERAGE = '0.9'
    expect(retrievalMinCoverage()).toBe(0.9)
    // 覆盖率 0.5（四词命中两词）在 0.9 下限下标记；默认 0.15 下不标记
    const strict = retrievalRelevanceCheck('web_search', { query: '机票 价格 时刻 航班' }, '机票 价格 一览')
    expect(strict.coverage).toBeCloseTo(0.5)
    expect(strict.flagged).toBe(true)
    delete process.env.FLYWHEEL_RETRIEVAL_MIN_COVERAGE
    expect(retrievalRelevanceCheck('web_search', { query: '机票 价格 时刻 航班' }, '机票 价格 一览').flagged).toBe(false)
  })
})

describe('ekko 钩子（默认关、选通留痕不阻断）', () => {
  it('默认关：零行为；选通后命中写 audit CONFIRM 且不改结果', async () => {
    delete process.env.FLYWHEEL_RETRIEVAL_GUARD
    expect(retrievalGuardEnabled()).toBe(false)
    const hook = retrievalRelevanceHook()
    const untouched = await hook.postExecute('knowledge_search', { query: '机票' }, { ok: true, content: '完全无关内容' })
    expect(untouched).toBeUndefined()

    process.env.FLYWHEEL_RETRIEVAL_GUARD = '1'
    const result = { ok: true, content: '今日股市大涨与查询无关的很长一段文字内容' }
    const ret = await retrievalRelevanceHook().postExecute('knowledge_search', { query: '查北京到上海的机票时刻表' }, result)
    // 不阻断：钩子返回 undefined（不改写 content），只留痕
    expect(ret).toBeUndefined()
    const audit = readAudit(5)
    expect(audit.length).toBeGreaterThanOrEqual(1)
    expect(audit[audit.length - 1]).toMatchObject({ verdict: 'CONFIRM', via: 'retrieval-relevance', tool: 'knowledge_search' })
    expect(audit[audit.length - 1].warningLine).toContain('检索相关性断言')
    expect(retrievalFlagCounts().flagged).toBeGreaterThanOrEqual(1)

    // 相关结果：不留痕不计数
    const before = retrievalFlagCounts().checked
    await retrievalRelevanceHook().postExecute('knowledge_search', { query: '股市' }, result)
    expect(retrievalFlagCounts().checked).toBe(before + 1)
    expect(readAudit(1)[0]?.via).toBe('retrieval-relevance') // 无新增条目（仍只有先前那条）
  })

  it('失败结果（ok:false）不判定', async () => {
    process.env.FLYWHEEL_RETRIEVAL_GUARD = '1'
    const before = retrievalFlagCounts().checked
    await retrievalRelevanceHook().postExecute('knowledge_search', { query: 'x' }, { ok: false, content: '错误' })
    expect(retrievalFlagCounts().checked).toBe(before)
  })
})
