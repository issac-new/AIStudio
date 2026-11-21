// overlay[expcandidates] 受控注入测试（B2，方案正本纪律 49）：默认关/审核过滤/
// 凭据形态改写/留痕幂等/派单简报集成。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  experienceBriefLine, experienceLinesForDispatch, injectionRunLabel, selectableExperiences,
} from '../exp-inject'
import { recordDistill } from '../../eval/flywheel'
import { _useStoreDirForTests, listCandidates, listInjectionLog, recordInjection, writeExpStore, readExpStore } from '../exp-store'
import type { ExpCandidate } from '../exp-types'

const dir = mkdtempSync(join(tmpdir(), 'exp-inject-test-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => {
  rmSync(join(dir, 'exp-candidates.json'), { force: true })
  delete process.env.EXPERIENCE_INJECT
  delete process.env.EXPERIENCE_INJECT_RUN
})

function cand(id: string, status: ExpCandidate['status']): ExpCandidate {
  return {
    id, type: 'antipattern', statement: `经验 ${id}：同类拦截先备齐证据再提交`,
    fingerprint: `fp-${id}`, evidence: [{ taskId: 't-old', note: 'n', at: 1 }],
    status, createdAt: 't', updatedAt: `t-${id}`, injectedRuns: [],
  }
}

function seed(cs: ExpCandidate[]): void {
  writeExpStore({ candidates: cs, nextSeq: cs.length + 1 })
}

describe('受控注入', () => {
  it('storeDir 随 HERMES_WEB_UI_HOME 走（SIM 隔离不写宿主 home；env 覆盖仍最高）', async () => {
    const { storeDir } = await import('../exp-store')
    const savedStore = process.env.EXP_STORE
    const savedHome = process.env.HERMES_WEB_UI_HOME
    try {
      delete process.env.EXP_STORE
      process.env.HERMES_WEB_UI_HOME = '/tmp/sim-webui'
      expect(storeDir()).toBe('/tmp/sim-webui/expcandidates')
      process.env.EXP_STORE = dir
      expect(storeDir()).toBe(dir)
    } finally {
      if (savedStore) process.env.EXP_STORE = savedStore; else delete process.env.EXP_STORE
      if (savedHome) process.env.HERMES_WEB_UI_HOME = savedHome; else delete process.env.HERMES_WEB_UI_HOME
    }
  })

  it('默认关闭：EXPERIENCE_INJECT 未设即零注入（有 approved 也不出）', () => {
    seed([cand('exp-001', 'approved')])
    expect(experienceLinesForDispatch({ column: 'devimpl' })).toEqual([])
  })

  it('开启后只注入 approved；candidate/rejected 排除；封顶 3', () => {
    process.env.EXPERIENCE_INJECT = '1'
    seed([
      cand('exp-001', 'approved'), cand('exp-002', 'candidate'), cand('exp-003', 'rejected'),
      cand('exp-004', 'approved'), cand('exp-005', 'approved'), cand('exp-006', 'approved'),
    ])
    const lines = experienceLinesForDispatch({ column: 'devimpl' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('exp-002')
    expect(lines[0]).not.toContain('exp-003')
    expect((lines[0].match(/\[exp-\d+\]/g) ?? []).length).toBe(3)
  })

  it('凭据形态改写：行头声明历史经验出处·非本轮实测凭据', () => {
    const line = experienceBriefLine([cand('exp-001', 'approved')])
    expect(line).toContain('历史经验（已审核，历史经验出处·非本轮实测凭据）')
    expect(line).not.toMatch(/[0-9a-f]{40}/) // 无 commit 哈希形态
  })

  it('注入留痕：EXPERIENCE_INJECT_RUN 标签幂等追加；坏存储 fail-soft', () => {
    process.env.EXPERIENCE_INJECT = '1'
    process.env.EXPERIENCE_INJECT_RUN = 'run20'
    seed([cand('exp-001', 'approved')])
    experienceLinesForDispatch({ column: 'devimpl' })
    experienceLinesForDispatch({ column: 'devimpl' })
    expect(listCandidates()[0].injectedRuns).toEqual(['run20'])
    expect(injectionRunLabel()).toBe('run20')
    // 坏存储→空行不阻断
    writeFileSync(join(dir, 'exp-candidates.json'), '{broken', 'utf8')
    expect(experienceLinesForDispatch({ column: 'devimpl' })).toEqual([])
    // 恢复空账
    rmSync(join(dir, 'exp-candidates.json'))
    expect(readExpStore().candidates).toEqual([])
  })

  it('selectableExperiences 按 updatedAt 稳定序', () => {
    const sel = selectableExperiences([
      { ...cand('exp-b', 'approved'), updatedAt: '2026-02-01' },
      { ...cand('exp-a', 'approved'), updatedAt: '2026-01-01' },
    ])
    expect(sel.map((c) => c.id)).toEqual(['exp-a', 'exp-b'])
  })
})

describe('注入回执补键（批一 b 变更 1：taskId/kind/作用域透传）', () => {
  it('recordInjection 带 taskId 无 snapshotId 也落留痕行（join 键到场即留痕）；同键重放幂等不重复追加', () => {
    seed([cand('exp-001', 'approved')])
    recordInjection(['exp-001'], 'run21', undefined, 'T-101', { kind: 'exp', column: 'devimpl', specialist: 'refiner' })
    recordInjection(['exp-001'], 'run21', undefined, 'T-101', { kind: 'exp', column: 'devimpl', specialist: 'refiner' })
    const log = listInjectionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ runLabel: 'run21', ids: ['exp-001'], taskId: 'T-101', kind: 'exp', column: 'devimpl', specialist: 'refiner' })
    expect(log[0].snapshotId).toBeUndefined()
  })

  it('recordInjection 无 taskId 且无 snapshotId（旧调用面）不落留痕行——向后兼容', () => {
    seed([cand('exp-001', 'approved')])
    recordInjection(['exp-001'], 'run22')
    expect(listInjectionLog()).toEqual([])
    expect(listCandidates()[0].injectedRuns).toEqual(['run22'])
  })

  it('派单注入透传 taskId＋作用域：experienceLinesForDispatch 第三参落到回执（spec 验收 1 前置）', () => {
    process.env.EXPERIENCE_INJECT = '1'
    process.env.EXPERIENCE_INJECT_RUN = 'run23'
    seed([cand('exp-001', 'approved')])
    const lines = experienceLinesForDispatch({ column: 'devimpl', specialist: 'refiner' }, undefined, 'T-202')
    expect(lines).toHaveLength(1)
    const log = listInjectionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ runLabel: 'run23', taskId: 'T-202', kind: 'exp', column: 'devimpl', specialist: 'refiner' })
  })

  it('无 taskId 场景向后兼容：派单注入照旧只记 injectedRuns，不落 taskId 留痕', () => {
    process.env.EXPERIENCE_INJECT = '1'
    process.env.EXPERIENCE_INJECT_RUN = 'run24'
    seed([cand('exp-001', 'approved')])
    experienceLinesForDispatch({ column: 'devimpl' })
    expect(listInjectionLog()).toEqual([])
    expect(listCandidates()[0].injectedRuns).toEqual(['run24'])
  })

  it('fewshot 路 recordInjection（批一 b 变更 4）：召回即落 kind=fewshot 回执（台账 id＋作用域）', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    process.env.EXPERIENCE_INJECT_RUN = 'run25'
    const evalDir = join(dir, 'eval-ledger-fewshot')
    process.env.EVAL_STORE = evalDir
    recordDistill({
      taskId: 'bd-f1', sourceRunId: 'erun-1', sourceTaskId: 't1', sampleIdx: 1,
      rootCause: 'result_defect', tabooActions: ['禁止重复失败结果'], failedSteps: 5, stepRedline: 7,
      targetSetId: 'eset-009', problem: '查北京到上海的机票', expectedBehavior: '返回正确航班与价格',
    })
    const lines = experienceLinesForDispatch({ column: 'devimpl', specialist: 'refiner' }, '帮我查一下北京到上海的机票哈', 'T-501')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('历史教训')
    const log = listInjectionLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      runLabel: 'run25', taskId: 'T-501', kind: 'fewshot', column: 'devimpl', specialist: 'refiner',
    })
    expect(log[0].ids).toHaveLength(1) // 台账提炼 id（ledgerId）
    delete process.env.FLYWHEEL_FEWSHOT_INJECT
    delete process.env.EVAL_STORE
    rmSync(evalDir, { recursive: true, force: true })
  })

  it('fewshot 无 taskId：行照常追加，零留痕（向后兼容）', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    const evalDir = join(dir, 'eval-ledger-fewshot2')
    process.env.EVAL_STORE = evalDir
    recordDistill({
      taskId: 'bd-f2', sourceRunId: 'erun-1', sourceTaskId: 't1', sampleIdx: 1,
      rootCause: 'result_defect', tabooActions: ['禁止重复失败结果'], failedSteps: 5, stepRedline: 7,
      targetSetId: 'eset-009', problem: '查北京到上海的机票', expectedBehavior: '返回正确航班与价格',
    })
    const lines = experienceLinesForDispatch({ column: 'devimpl' }, '帮我查一下北京到上海的机票哈')
    expect(lines).toHaveLength(1)
    expect(listInjectionLog()).toEqual([])
    delete process.env.FLYWHEEL_FEWSHOT_INJECT
    delete process.env.EVAL_STORE
    rmSync(evalDir, { recursive: true, force: true })
  })
})

describe('Few-shot 记忆通道（数据飞轮 round 2 挂账 1）', () => {
  it('默认关：带 query 也零行为；选通且无 query 不召回（Prompt 保持干净）', () => {
    delete process.env.FLYWHEEL_FEWSHOT_INJECT
    expect(experienceLinesForDispatch({ column: 'devimpl' }, '查北京到上海的机票')).toEqual([])
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    expect(experienceLinesForDispatch({ column: 'devimpl' })).toEqual([])
  })

  it('选通+query+台账有相似教训：追加「历史教训」行；EXPERIENCE_INJECT 同开时两路并存', () => {
    process.env.FLYWHEEL_FEWSHOT_INJECT = '1'
    const evalDir = join(dir, 'eval-ledger')
    process.env.EVAL_STORE = evalDir
    recordDistill({
      taskId: 'bd-x1', sourceRunId: 'erun-1', sourceTaskId: 't1', sampleIdx: 1,
      rootCause: 'result_defect', tabooActions: ['禁止重复失败结果'], failedSteps: 5, stepRedline: 7,
      targetSetId: 'eset-009', problem: '查北京到上海的机票', expectedBehavior: '返回正确航班与价格',
    })
    seed([cand('exp-1', 'approved')])

    const withoutExp = experienceLinesForDispatch({ column: 'devimpl' }, '帮我查一下北京到上海的机票哈')
    expect(withoutExp).toHaveLength(1)
    expect(withoutExp[0]).toContain('历史教训')
    expect(withoutExp[0]).toContain('正确做法')

    process.env.EXPERIENCE_INJECT = '1'
    const both = experienceLinesForDispatch({ column: 'devimpl' }, '帮我查一下北京到上海的机票哈')
    expect(both).toHaveLength(2)
    expect(both[0]).toContain('历史经验')
    expect(both[1]).toContain('历史教训')
    delete process.env.EXPERIENCE_INJECT

    // 异题零召回：只有经验行（fewshot 空）
    const unrelated = experienceLinesForDispatch({ column: 'devimpl' }, '完全无关的另一个话题关于股市行情')
    expect(unrelated).toEqual([])

    delete process.env.FLYWHEEL_FEWSHOT_INJECT
    delete process.env.EVAL_STORE
    rmSync(evalDir, { recursive: true, force: true })
  })
})
