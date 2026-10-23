// overlay[eval] 京东评测体系吸收轮单测（2026-10-23）。
//
// 锁定四件事：
//   1. 难度分桶（byDifficultyOf）：显式标注才分桶、untagged 如实呈现、全未标注缺省；
//   2. 责任角色分桶（byRoleOf）：按标注角色归因失败、全未标注缺省；
//   3. 输出稳定性复测（stabilityRetest）：缓存键加盐绕开 TTL 缓存、flip 统计、
//      聚合层 outputStability 汇总（rounds 取最大轮数）；
//   4. 出题校验：difficulty 限 P0-P3、role 限 1-32 字符（宁缺毋滥，可不填）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _resetJudgeDefaultsForTests,
  _useStoreDirForTests,
  aggregateRun,
  byDifficultyOf,
  byRoleOf,
  createSet,
  judgeAttempt,
  loadEvalConfig,
  type AskFn,
  type EvalRun,
  type EvalSet,
} from '../index'

const baseConfig = loadEvalConfig()

let storeDir: string

beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'eval-jd-store-'))
  _useStoreDirForTests(storeDir)
})

beforeEach(() => {
  _resetJudgeDefaultsForTests()
})

afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
})

// ---------- 1. 难度分桶 ----------

function setOf(tasks: Partial<EvalSet['tasks'][number]>[]): EvalSet {
  return {
    id: 'eset-t',
    name: 't',
    track: 'e2e',
    sealed: false,
    contentHash: 'h',
    revision: 1,
    createdAt: 0,
    tasks: tasks.map((t, i) => ({
      id: `t${i + 1}`,
      problem: 'p',
      expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: 'r', expect: 'yes' as const, kind: 'result' as const }],
      ...t,
    })) as EvalSet['tasks'],
  }
}

function runOf(passedTaskIds: string[], outputStability?: { rounds: number; checked: number; flips: number }): EvalRun {
  return {
    id: 'erun-t',
    setId: 'eset-t',
    target: {},
    k: 1,
    status: 'done',
    attempts: passedTaskIds.map((taskId) => ({
      taskId,
      sampleIdx: 1,
      verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' as const }],
      passed: true,
      ...(outputStability
        ? { judgeMeta: { backend: 'b', latencyMs: 1, cached: false, online: true, outputStability } }
        : {}),
    })),
    aggregates: {} as EvalRun['aggregates'],
    createdAt: 0,
  }
}

describe('byDifficultyOf（难度分桶·宁缺毋滥）', () => {
  it('显式标注分桶 + 未标注进 untagged 桶', () => {
    const set = setOf([{ difficulty: 'P0' }, { difficulty: 'P0' }, { difficulty: 'P2' }, {}])
    const run = runOf(['t1', 't4']) // P0 一过一挂、P2 未跑（无样本不计通过）、untagged 过
    const rows = byDifficultyOf(set, run)
    expect(rows).toEqual([
      { tier: 'P0', taskCount: 2, passAtK: 0.5 },
      { tier: 'P2', taskCount: 1, passAtK: 0 },
      { tier: 'untagged', taskCount: 1, passAtK: 1 },
    ])
  })

  it('全未标注 → undefined 不产噪', () => {
    expect(byDifficultyOf(setOf([{}, {}]), runOf([]))).toBeUndefined()
  })
})

// ---------- 2. 责任角色分桶 ----------

describe('byRoleOf（归因按角色切）', () => {
  it('按标注角色分桶失败，责任方直达；未标注任务不入桶', () => {
    const set = setOf([{ role: 'implementer' }, { role: 'implementer' }, { role: 'reviewer' }, {}])
    const run = runOf(['t3']) // implementer 全挂、reviewer 过、未标注不计
    const rows = byRoleOf(set, run)
    expect(rows).toEqual([
      { role: 'implementer', taskCount: 2, passed: 0, passAtK: 0 },
      { role: 'reviewer', taskCount: 1, passed: 1, passAtK: 1 },
    ])
  })

  it('全未标注 → undefined', () => {
    expect(byRoleOf(setOf([{}, {}]), runOf([]))).toBeUndefined()
  })

  it('role 空白串视同未标注（不产生空桶）', () => {
    const set = setOf([{ role: '   ' }, { role: 'sre' }])
    const rows = byRoleOf(set, runOf([]))
    expect(rows).toEqual([{ role: 'sre', taskCount: 1, passed: 0, passAtK: 0 }])
  })
})

// ---------- 3. 输出稳定性复测 ----------

const TASK = {
  id: 't1',
  problem: '按需求完成修复',
  expectedBehavior: '修复完成且测试通过',
  rubric: [{ id: 'a1', text: '修复是否完成', expect: 'yes' as const, kind: 'result' as const }],
}

function jitterAsk(sequence: number[]): { ask: AskFn; calls: { p: number }[] } {
  const calls: { p: number }[] = []
  let i = 0
  const ask: AskFn = async (_req, _cfg) => {
    const p = sequence[Math.min(i, sequence.length - 1)]
    i += 1
    calls.push({ p })
    return { a1: p }
  }
  return { ask, calls }
}

describe('judgeAttempt stabilityRetest（同输入重复判定）', () => {
  it('首轮 yes、retest 轮 no → flip 计 1；读数不改判词', async () => {
    const { ask } = jitterAsk([0.95, 0.05])
    const r = await judgeAttempt(TASK, { transcript: '修复完成，测试通过' }, {
      config: { ...baseConfig, judgeModels: ['m'], cacheTtlMs: 0 },
      ask,
    }, { stabilityRetest: 2 })
    expect(r.verdicts[0].value).toBe('yes') // 判词仍取首轮（观测读数不改判）
    expect(r.judgeMeta.outputStability).toEqual({ rounds: 2, checked: 1, flips: 1 })
  })

  it('缓存键加盐绕开 TTL 缓存：retest 轮真实调用（3 轮 = 3 次 ask）', async () => {
    const { ask, calls } = jitterAsk([0.9, 0.9, 0.9])
    // TTL 开 5 分钟：无盐时同输入第二次必命中缓存。retest 轮带盐 → 每轮真实调用。
    await judgeAttempt(TASK, { transcript: '修复完成' }, {
      config: { ...baseConfig, judgeModels: ['m'], cacheTtlMs: 5 * 60_000 },
      ask,
    }, { stabilityRetest: 3 })
    expect(calls.length).toBe(3)
  })

  it('未开启 retest → judgeMeta 无 outputStability，且同输入两次判定第二次命中缓存（1 次 ask）', async () => {
    const { ask, calls } = jitterAsk([0.9])
    const deps = { config: { ...baseConfig, judgeModels: ['m'], cacheTtlMs: 5 * 60_000 }, ask }
    await judgeAttempt(TASK, { transcript: '修复完成' }, deps)
    await judgeAttempt(TASK, { transcript: '修复完成' }, deps)
    expect(calls.length).toBe(1)
  })

  it('各轮结论一致 → flips=0', async () => {
    const { ask } = jitterAsk([0.9, 0.92, 0.88])
    const r = await judgeAttempt(TASK, { transcript: '修复完成' }, {
      config: { ...baseConfig, judgeModels: ['m'], cacheTtlMs: 0 },
      ask,
    }, { stabilityRetest: 3 })
    expect(r.judgeMeta.outputStability).toEqual({ rounds: 3, checked: 1, flips: 0 })
  })
})

describe('aggregateRun：outputStability 汇总', () => {
  it('多 attempt 汇总 checked/flips 求和，rounds 取最大', () => {
    const set = setOf([{}, {}])
    const run = runOf(['t1', 't2'], { rounds: 3, checked: 2, flips: 1 })
    run.attempts[1].judgeMeta = { backend: 'b', latencyMs: 1, cached: false, online: true, outputStability: { rounds: 2, checked: 1, flips: 1 } }
    aggregateRun(set, run, baseConfig)
    expect(run.aggregates.outputStability).toEqual({ rounds: 3, checked: 3, flips: 2, flipRate: 2 / 3 })
  })

  it('无 retest 读数 → aggregates 无 outputStability（缺省不产噪）', () => {
    const run = runOf(['t1'])
    aggregateRun(setOf([{}]), run, baseConfig)
    expect(run.aggregates.outputStability).toBeUndefined()
  })

  it('难度/角色标注进集后聚合面产出（端到端接线）', () => {
    const set = setOf([{ difficulty: 'P1', role: 'tester' }])
    const run = runOf([])
    aggregateRun(set, run, baseConfig)
    expect(run.aggregates.byDifficulty).toEqual([{ tier: 'P1', taskCount: 1, passAtK: 0 }])
    expect(run.aggregates.byRole).toEqual([{ role: 'tester', taskCount: 1, passed: 0, passAtK: 0 }])
  })
})

// ---------- 4. 出题校验 ----------

describe('createSet 校验：difficulty / role', () => {
  const base = (extra: Record<string, unknown>) => ({
    name: `jd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    track: 'e2e',
    tasks: [{
      id: 't1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: 'r', expect: 'yes', kind: 'result' }],
      ...extra,
    }],
  })

  it('difficulty 非 P0-P3 拒绝；合法值通过', () => {
    const bad = createSet(base({ difficulty: 'P9' }) as never)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems[0]).toContain('difficulty')
    const good = createSet(base({ difficulty: 'P2' }) as never)
    expect(good.ok).toBe(true)
  })

  it('role 空串/超长拒绝；合法值通过', () => {
    expect(createSet(base({ role: '  ' }) as never).ok).toBe(false)
    expect(createSet(base({ role: 'x'.repeat(33) }) as never).ok).toBe(false)
    expect(createSet(base({ role: 'implementer' }) as never).ok).toBe(true)
  })
})

// ---------- 5. 部署面密钥扫描（secrets 采集器补缺） ----------

describe('scanDeploySecrets（secaudit secrets 面自动兜底）', () => {
  it('配置文件命中密钥形态计入；traces 数据目录跳过；空根零命中', async () => {
    const { scanDeploySecrets } = await import('../../secaudit/deploy-scan')
    const root = mkdtempSync(join(tmpdir(), 'secaudit-deploy-'))
    const prev = process.env.SECAUDIT_DEPLOY_ROOT
    try {
      writeFileSync(join(root, 'config.json'), JSON.stringify({ api: { key: 'sk-proj-abcdefghijklmnopqrst1234' } }))
      mkdirSync(join(root, 'traces'))
      writeFileSync(join(root, 'traces', 's1.jsonl'), 'sk-proj-zyxwvutsrqponmlkjihg4321\n')
      mkdirSync(join(root, 'logs'))
      writeFileSync(join(root, 'logs', 'run.log'), 'plain line without any credential\n')

      process.env.SECAUDIT_DEPLOY_ROOT = root
      const hit = scanDeploySecrets()
      expect(hit.count).toBe(1) // 只算 config.json；traces 跳过
      expect(hit.summary).toContain('openai-style-key')

      process.env.SECAUDIT_DEPLOY_ROOT = join(root, 'logs')
      const clean = scanDeploySecrets()
      expect(clean.count).toBe(0)
    } finally {
      if (prev === undefined) delete process.env.SECAUDIT_DEPLOY_ROOT
      else process.env.SECAUDIT_DEPLOY_ROOT = prev
      rmSync(root, { recursive: true, force: true })
    }
  })
})
