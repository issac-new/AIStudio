import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canRefute, checkScope, checkStatement, dueQueue, expireOverdue, impactOf, inferAnchorShape,
  refute, reviseStatement, type Premise,
} from '../premise-log'
import {
  _usePremiseLogDirForTests, createPremise, getPremise, listPremises, listReeval, pushReeval,
  putPremise, resolveReeval,
} from '../store'

const DAY = 86_400_000
const NOW = 1_760_000_000_000

function premise(patch: Partial<Premise> = {}): Premise {
  return {
    id: 'pr-20261105-0001',
    statement: '客户续费率在 2027 年 Q1 低于 80%',
    kind: 'market',
    scope: ['2026-11-05-org-governance-autonomy-scale.md'],
    reviewAt: NOW + 30 * DAY,
    status: 'hold',
    confidence: 'medium',
    createdAt: NOW,
    createdBy: 'tester',
    updatedAt: NOW,
    ...patch,
  }
}

describe('checkStatement：只做可证伪性形式校验', () => {
  it('带数字与比较的陈述通过', () => {
    expect(checkStatement('客户续费率在 2027 年 Q1 低于 80%')).toEqual([])
  })

  it('口号被拒并点明「口号不是假设」', () => {
    const problems = checkStatement('我们要加强组织能力建设')
    expect(problems.join()).toContain('口号')
  })

  it('无可观测标记被拒', () => {
    const problems = checkStatement('未来的组织应该是更灵活的样子')
    expect(problems.join()).toContain('可观测')
  })

  it('过短与过长各自报错', () => {
    expect(checkStatement('会跌').join()).toContain('过短')
    expect(checkStatement('x'.repeat(401)).join()).toContain('过长')
  })

  it('非字符串不抛异常', () => {
    expect(checkStatement(null).join()).toContain('字符串')
  })
})

describe('checkScope：影响面必填', () => {
  it('空数组被拒并解释「不承重」', () => {
    expect(checkScope([]).join()).toContain('不承重')
  })

  it('含空条目被拒', () => {
    expect(checkScope(['a.md', '  ']).join()).toContain('非空')
  })

  it('超过 40 条被拒（提示拆分）', () => {
    expect(checkScope(Array.from({ length: 41 }, (_, i) => `a${i}.md`)).join()).toContain('拆分')
  })

  it('正常范围通过', () => {
    expect(checkScope(['a.md', 'autonomygov'])).toEqual([])
  })
})

describe('dueQueue：到期与逾期', () => {
  it('未到期不进队列', () => {
    expect(dueQueue([premise()], NOW)).toEqual([])
  })

  it('到期进队列并算逾期天数', () => {
    const rows = dueQueue([premise({ reviewAt: NOW - 3 * DAY })], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0].overdueDays).toBe(3)
  })

  it('已被推翻/已过期的不再进队列', () => {
    expect(dueQueue([premise({ status: 'refuted', reviewAt: NOW - DAY })], NOW)).toEqual([])
    expect(dueQueue([premise({ status: 'expired', reviewAt: NOW - DAY })], NOW)).toEqual([])
  })

  it('pending 也进队列（被标记待复核）', () => {
    expect(dueQueue([premise({ status: 'pending', reviewAt: NOW - DAY })], NOW)).toHaveLength(1)
  })

  it('按逾期天数降序', () => {
    const rows = dueQueue([
      premise({ id: 'a', reviewAt: NOW - DAY }),
      premise({ id: 'b', reviewAt: NOW - 5 * DAY }),
    ], NOW)
    expect(rows.map((r) => r.premise.id)).toEqual(['b', 'a'])
  })
})

describe('expireOverdue：宽限期后升级', () => {
  it('宽限期内不升级', () => {
    const r = expireOverdue([premise({ reviewAt: NOW - 3 * DAY })], NOW, 14)
    expect(r.expired).toEqual([])
  })

  it('超宽限期升级为 expired 并返回 id', () => {
    const r = expireOverdue([premise({ reviewAt: NOW - 20 * DAY })], NOW, 14)
    expect(r.expired).toEqual(['pr-20261105-0001'])
    expect(r.premises[0].status).toBe('expired')
  })

  it('已推翻的不被改状态', () => {
    const r = expireOverdue([premise({ status: 'refuted', reviewAt: NOW - 90 * DAY })], NOW, 14)
    expect(r.expired).toEqual([])
  })
})

describe('impactOf：影响面探测', () => {
  it('存在锚不报 stale，失联锚计数', () => {
    const r = impactOf(premise({ scope: ['a.md', 'b.md'] }), (a) => a === 'a.md')
    expect(r.stale).toBe(1)
    expect(r.anchors.find((x) => x.anchor === 'b.md')!.exists).toBe(false)
  })

  it('锚形态可推断', () => {
    expect(inferAnchorShape('2026-11-05-x.md')).toBe('spec')
    expect(inferAnchorShape('/api/autonomygov/scale')).toBe('endpoint')
    expect(inferAnchorShape('autonomygov')).toBe('domain')
  })
})

describe('refute：推翻须带证据', () => {
  it('无证据拒绝', () => {
    expect(() => refute(premise(), { evidence: '  ', by: 'x', now: NOW })).toThrow(/证据/)
  })

  it('成功推翻并生成 queued 重评项', () => {
    const r = refute(premise(), { evidence: '2026-11 复盘：续费率 76%', by: 'alice', now: NOW })
    expect(r.premise.status).toBe('refuted')
    expect(r.premise.refutedBy?.evidence).toContain('76%')
    expect(r.reeval.state).toBe('queued')
    expect(r.reeval.anchors).toEqual(premise().scope)
  })

  it('已推翻的不可重复推翻', () => {
    expect(canRefute(premise({ status: 'refuted' })).join()).toContain('重复推翻')
  })

  it('已过期不可直接推翻（须先复核）', () => {
    expect(canRefute(premise({ status: 'expired' })).join()).toContain('过期')
  })
})

describe('reviseStatement：改写留历史', () => {
  it('改写追加 history 而不覆盖原句', () => {
    const next = reviseStatement(premise(), '客户续费率在 2027 年 Q1 低于 70%', 'bob', NOW + 1)
    expect(next.history).toHaveLength(1)
    expect(next.history![0].statement).toContain('80%')
    expect(next.statement).toContain('70%')
  })

  it('改写不过形式校验即抛错', () => {
    expect(() => reviseStatement(premise(), '我们要加强', 'bob', NOW)).toThrow()
  })

  it('同句改写不产生历史条目', () => {
    expect(reviseStatement(premise(), premise().statement, 'bob', NOW).history).toBeUndefined()
  })
})

describe('存储链路：新建 → 推翻 → 重评 → 处置', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'premiselog-'))
    _usePremiseLogDirForTests(dir)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.HERMES_PREMISE_LOG_DIR
  })

  it('新建落盘、可按 id 读回、id 带日期前缀且递增', () => {
    const a = createPremise({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: NOW, createdBy: 't', now: NOW })
    const b = createPremise({ statement: 'B 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: NOW, createdBy: 't', now: NOW })
    expect(a.id).toMatch(/^pr-\d{8}-\d{4}$/)
    expect(a.id).not.toBe(b.id)
    expect(getPremise(a.id)?.statement).toContain('A 渠道')
  })

  it('推翻后落盘 + 重评项入队，store 可读出', () => {
    const p = createPremise({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: NOW, createdBy: 't', now: NOW })
    const r = refute(p, { evidence: '季度复盘见 +23%', by: 'alice', now: NOW })
    putPremise(r.premise)
    pushReeval(r.reeval)
    expect(getPremise(p.id)?.status).toBe('refuted')
    expect(listReeval()).toHaveLength(1)
  })

  it('dismissed 无理由被拒（闭环不可静默切断）', () => {
    const item = { id: 're-1', premiseId: 'p', anchors: [], reason: 'r', queuedAt: NOW, state: 'queued' as const }
    pushReeval(item)
    expect(resolveReeval('re-1', 'dismissed', { by: 'x', note: '  ' }).problems).toBeTruthy()
    expect(resolveReeval('re-1', 'dismissed', { by: 'x', note: '该影响面已随架构重构消失' }).item).toBeTruthy()
  })

  it('done 不需要理由；重复处置被拒', () => {
    pushReeval({ id: 're-2', premiseId: 'p', anchors: [], reason: 'r', queuedAt: NOW, state: 'queued' })
    expect(resolveReeval('re-2', 'done', { by: 'x', note: '' }).item).toBeTruthy()
    expect(resolveReeval('re-2', 'done', { by: 'x', note: '' }).problems).toBeTruthy()
  })

  it('按状态过滤列表', () => {
    const p = createPremise({ statement: 'A 渠道获客成本在 2027 年上涨超过 20%', kind: 'cost', scope: ['x.md'], reviewAt: NOW, createdBy: 't', now: NOW })
    putPremise({ ...p, status: 'refuted' })
    expect(listPremises({ status: 'refuted' })).toHaveLength(1)
    expect(listPremises({ status: 'hold' })).toHaveLength(0)
  })
})
