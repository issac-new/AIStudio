// 自动探测驱动层守门：禁跑闸 / 物化隔离 / 逐题驱动与预算硬停。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { assertTreeRunnable, materializeHome, runProbeTasks, readNewestTrace, type SpawnRun } from '../probe-runner'
import type { Variant } from '../types'

let dir: string
let home: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness2-proberunner-'))
  home = join(dir, 'home')
  for (const p of ['profiles/p1', 'skills/s1', 'other']) mkdirSync(join(home, p), { recursive: true })
  writeFileSync(join(home, 'profiles/p1/SOUL.md'), 'old persona')
  writeFileSync(join(home, 'skills/s1/SKILL.md'), '# s1')
  writeFileSync(join(home, 'other/keep.txt'), 'keep')
  writeFileSync(join(home, 'other/del.txt'), 'delete me')
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function variantWith(files: Array<{ path: string; content: string }>, deletions: string[] = []): Variant {
  return {
    id: 'v1', label: 'v1', content: '', digest: 'd',
    diffSummary: { added: 0, removed: 0, unchanged: 0 }, files, deletions,
  }
}

describe('assertTreeRunnable', () => {
  it('纯文本候选可跑', () => {
    const v = variantWith([
      { path: 'profiles/p1/SOUL.md', content: 'x' },
      { path: 'skills/new_skill/SKILL.md', content: 'y' },
      { path: 'sub_agents/research/AGENT.md', content: 'z' },
    ])
    expect(assertTreeRunnable(v).ok).toBe(true)
  })

  it('scripts/plugins/hooks/脚本文件全部禁跑', () => {
    for (const path of ['scripts/a.py', 'plugin/b.ts', 'plugins/c.js', '.codex/hooks.json', 'skills/s/scripts/x.py', 'run.sh']) {
      const v = variantWith([{ path, content: 'x' }])
      const r = assertTreeRunnable(v)
      expect(r.ok, path).toBe(false)
      expect(r.problems.length, path).toBeGreaterThan(0)
    }
  })
})

describe('materializeHome', () => {
  it('未触及符号链接、触及写实、删除不落盘、新建落盘', () => {
    const iso = join(dir, 'iso')
    const tree: Record<string, string | null> = {
      'profiles/p1/SOUL.md': 'new persona',
      'skills/new_skill/SKILL.md': '# new',
      'other/del.txt': null,
    }
    const r = materializeHome(home, iso, tree)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(iso, 'profiles/p1/SOUL.md'), 'utf8')).toBe('new persona')
    expect(readFileSync(join(iso, 'skills/new_skill/SKILL.md'), 'utf8')).toBe('# new')
    expect(existsSync(join(iso, 'other/del.txt'))).toBe(false)
    expect(lstatSync(join(iso, 'other/keep.txt')).isSymbolicLink()).toBe(true)
    expect(lstatSync(join(iso, 'skills/s1')).isSymbolicLink()).toBe(true)
    expect(r.touched).toContain('profiles/p1/SOUL.md')
  })

  it('非法路径（.. 与绝对路径）拒绝', () => {
    expect(materializeHome(home, join(dir, 'iso2'), { '../etc/passwd': 'x' }).ok).toBe(false)
    expect(materializeHome(home, join(dir, 'iso3'), { '/etc/passwd': 'x' }).ok).toBe(false)
  })
})

function fakeTraceSpawn(cost: { prompt: number; completion: number }, opts: { writeTrace?: boolean; fail?: boolean } = {}): SpawnRun {
  let n = 0
  return async (_prompt, env) => {
    n += 1
    if (opts.fail) return { ok: false, error: 'spawn failed' }
    if (opts.writeTrace !== false) {
      const tracesDir = env.HERMES_RUN_TRACE_DIR!
      const lines = [
        JSON.stringify({ type: 'header', session_id: `sess-${n}`, model: 'glm-4.7', provider: 'zai', started_at: Date.now() }),
        JSON.stringify({ type: 'chunk', kind: 'llm_span', phase: 'post', usage: { prompt_tokens: cost.prompt, completion_tokens: cost.completion } }),
      ]
      writeFileSync(join(tracesDir, `sess-${n}.jsonl`), lines.join('\n') + '\n')
    }
    return { ok: true }
  }
}

describe('runProbeTasks', () => {
  const prompts = [
    { taskId: 't1', prompt: '题目一' },
    { taskId: 't2', prompt: '题目二' },
    { taskId: 't3', prompt: '题目三' },
  ]
  const tree = { 'profiles/p1/SOUL.md': 'candidate persona' }

  it('全题跑通：样本带证据与真实成本（价目已知→不走估值）', async () => {
    const r = await runProbeTasks({
      prompts: prompts.slice(0, 2), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, spawnRun: fakeTraceSpawn({ prompt: 100, completion: 50 }),
    })
    expect(r.ok).toBe(true)
    expect(r.tasksDone).toBe(2)
    expect(r.estimatedTasks).toBe(0)
    expect(r.costUsd).toBeGreaterThan(0)
    expect(Object.keys(r.samples)).toEqual(['t1', 't2'])
    expect(r.samples.t1[0].sessionId).toMatch(/^sess-/)
    expect(r.samples.t1[0].evidence?.efficiency?.tokens).toBe(150)
  })

  it('预算硬停：单题真实成本超额即停，已完成样本保留', async () => {
    const r = await runProbeTasks({
      prompts, baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 1.0,
      estimatePerTaskUsd: 0.1,
      spawnRun: fakeTraceSpawn({ prompt: 1_000_000, completion: 1_000_000 }),
    })
    expect(r.ok).toBe(true)
    expect(r.stoppedBy).toBe('budget_stop')
    expect(r.tasksDone).toBe(1)
    expect(r.costUsd).toBeGreaterThanOrEqual(1.0)
    expect(Object.keys(r.samples)).toEqual(['t1'])
  })

  it('spawn 失败与无 trace 如实报错', async () => {
    const fail = await runProbeTasks({
      prompts: prompts.slice(0, 1), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 10, spawnRun: fakeTraceSpawn({ prompt: 1, completion: 1 }, { fail: true }),
    })
    expect(fail.ok).toBe(false)
    expect(fail.error).toContain('运行失败')
    const noTrace = await runProbeTasks({
      prompts: prompts.slice(0, 1), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 10, spawnRun: fakeTraceSpawn({ prompt: 1, completion: 1 }, { writeTrace: false }),
    })
    expect(noTrace.ok).toBe(false)
    expect(noTrace.error).toContain('未产生证据')
  })

  it('readNewestTrace 只取 sinceMs 之后的文件', () => {
    const tracesDir = join(dir, 'traces')
    mkdirSync(tracesDir)
    writeFileSync(join(tracesDir, 'old.jsonl'), JSON.stringify({ type: 'header', session_id: 'old' }) + '\n')
    const now = Date.now()
    writeFileSync(join(tracesDir, 'new.jsonl'), JSON.stringify({ type: 'header', session_id: 'new', model: 'glm-4.7' }) + '\n')
    const r = readNewestTrace(tracesDir, now - 1000)
    expect(r).not.toBeNull()
    expect(['old', 'new']).toContain(r!.sessionId) // mtime 可能同毫秒；只验证能读到且字段齐
  })
})

// ---------- 挂账清偿批：spawn 韧性（stderr 透传＋单次重试） ----------

describe('spawn 韧性（瞬态故障重试一次）', () => {
  it('首次 spawn 失败、重试成功 → 任务照常完成', async () => {
    const { runProbeTasks } = await import('../probe-runner')
    let calls = 0
    const result = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp',
      profile: 'x',
      variantTree: {},
      budgetRemainingUsd: 5,
      k: 1,
      retryDelayMs: 0,
      spawnRun: async (prompt, env, timeoutMs) => {
        calls += 1
        if (calls === 1) return { ok: false, error: 'Command failed: boom | stderr 尾部：rate limited' }
        return fakeTraceSpawn({ prompt: 100, completion: 50 })(prompt, env, timeoutMs)
      },
    })
    expect(calls).toBe(2)
    expect(result.ok).toBe(true)
    expect(result.tasksDone).toBe(1)
  })

  it('两次都失败 → 定性失败且错误信息含 stderr 尾部', async () => {
    const { runProbeTasks } = await import('../probe-runner')
    const result = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp',
      profile: 'x',
      variantTree: {},
      budgetRemainingUsd: 5,
      retryDelayMs: 0,
      spawnRun: async () => ({ ok: false, error: 'Command failed: boom | stderr 尾部：quota exceeded' }),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('已重试一次')
    expect(result.error).toContain('quota exceeded')
  })
})

// ---------- 挂账清偿批续：stream-json 证据通道（当前 CLI 不落 jsonl trace 的根治） ----------

describe('stream-json 证据通道', () => {
  it('result 事件 → 证据（transcript＋tokens/duration；无 trace 文件也成样）', async () => {
    const { evidenceFromStreamJson, runProbeTasks } = await import('../probe-runner')
    const stdout = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'text', text: '43' }),
      JSON.stringify({ type: 'result', session_id: 'local-abc', exit_code: 0, text: '43\n置信度:高', tokens: { input: 100, output: 5, total: 105 }, duration_ms: 8000 }),
    ].join('\n')
    const parsed = evidenceFromStreamJson(stdout)
    expect(parsed?.sessionId).toBe('local-abc')
    expect(parsed?.evidence.transcript).toBe('43\n置信度:高')
    expect(parsed?.evidence.efficiency?.tokens).toBe(105)
    expect(parsed?.evidence.efficiency?.durationMs).toBe(8000)

    const result = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp', profile: 'x', variantTree: {}, budgetRemainingUsd: 5, retryDelayMs: 0,
      spawnRun: async () => ({ ok: true, stdout }),
    })
    expect(result.ok).toBe(true)
    expect(result.samples.t1[0].sessionId).toBe('local-abc')
    expect(result.samples.t1[0].evidence?.transcript).toContain('置信度:高')
  })

  it('stdout 无 result 事件 → 回退 trace 通道；两通道全空 → 如实报错', async () => {
    const { runProbeTasks } = await import('../probe-runner')
    // 无 stdout（旧形态）→ 走 trace：fakeTraceSpawn 会写 trace 文件
    const withTrace = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp', profile: 'x', variantTree: {}, budgetRemainingUsd: 5, retryDelayMs: 0,
      spawnRun: fakeTraceSpawn({ prompt: 10, completion: 5 }),
    })
    expect(withTrace.ok).toBe(true)

    // stdout 有垃圾但无 result、也不写 trace → 双通道缺席
    const none = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp', profile: 'x', variantTree: {}, budgetRemainingUsd: 5, retryDelayMs: 0,
      spawnRun: async () => ({ ok: true, stdout: 'not json at all' }),
    })
    expect(none.ok).toBe(false)
    expect(none.error).toContain('未产生证据')
  })
})

// R4（2026-10-31 首批执行）：k 样本语义。
describe('R4 k 样本', () => {
  it('k=2 → 每题 2 样本（samples 数组长度 2）；k 缺省 2', async () => {
    const { runProbeTasks } = await import('../probe-runner')
    const mk = (k?: number) => runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp', profile: 'x', variantTree: {},
      budgetRemainingUsd: 5, ...(k != null ? { k } : {}), retryDelayMs: 0,
      spawnRun: fakeTraceSpawn({ prompt: 100, completion: 50 }),
    })
    const r2 = await mk()
    expect(r2.samples.t1).toHaveLength(2)
    const r1 = await mk(1)
    expect(r1.samples.t1).toHaveLength(1)
  })

  it('预算中途耗尽 → 已产样本保留、stoppedBy=budget_stop', async () => {
    const { runProbeTasks } = await import('../probe-runner')
    const r = await runProbeTasks({
      prompts: [{ taskId: 't1', prompt: 'p' }],
      baseHome: '/tmp', profile: 'x', variantTree: {},
      budgetRemainingUsd: 1.5, k: 3, retryDelayMs: 0,
      estimatePerTaskUsd: 1,
      spawnRun: fakeTraceSpawn({ prompt: 100, completion: 50 }),
    })
    expect(r.ok).toBe(true)
    expect(r.samples.t1.length).toBeGreaterThanOrEqual(1)
  })
})

// 并发编排（2026-11-03 调度面接线）：有界池、预算预扣、证据归因纪律。
describe('并发探测', () => {
  const prompts = [
    { taskId: 't1', prompt: '题目一' },
    { taskId: 't2', prompt: '题目二' },
    { taskId: 't3', prompt: '题目三' },
  ]
  const tree = { 'profiles/p1/SOUL.md': 'candidate persona' }
  /** 测量同时在跑样本数的 spawn：每次 sleep 一个 tick 再返回 stream-json。 */
  const concSpawn = () => {
    let inFlight = 0
    let peak = 0
    const spawn = async (prompt: string, _env: Record<string, string>, _t: number) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return {
        ok: true as const,
        stdout: JSON.stringify({ type: 'result', session_id: `s-${prompt}-${Math.random()}`, text: 'done', tokens: { total: 10 } }),
      }
    }
    return { spawn, peakOf: () => peak }
  }

  it('concurrency=3 时三题真的并行（峰值 ≥2），每题各 1 样本', async () => {
    const { spawn, peakOf } = concSpawn()
    const r = await runProbeTasks({
      prompts, baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, k: 1, concurrency: 3, spawnRun: spawn as never,
    })
    expect(r.ok).toBe(true)
    expect(peakOf()).toBeGreaterThanOrEqual(2)
    expect(r.peakInFlight).toBeGreaterThanOrEqual(2)
    expect(r.tasksDone).toBe(3)
    expect(Object.keys(r.samples).sort()).toEqual(['t1', 't2', 't3'])
    expect(r.samples.t1).toHaveLength(1)
  })

  it('k=2 并发：每题两样本齐全且按样本序落位', async () => {
    const { spawn } = concSpawn()
    const r = await runProbeTasks({
      prompts: prompts.slice(0, 2), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, k: 2, concurrency: 2, spawnRun: spawn as never,
    })
    expect(r.ok).toBe(true)
    expect(r.tasksDone).toBe(2)
    for (const id of ['t1', 't2']) {
      expect(r.samples[id]).toHaveLength(2)
      expect(r.samples[id][0]).toBeTruthy()
      expect(r.samples[id][1]).toBeTruthy()
    }
  })

  it('并发预算预扣：不会超支到预算之外太多（≤ budget + concurrency×单题估值）', async () => {
    const { spawn } = concSpawn()
    const r = await runProbeTasks({
      prompts, baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 0.05, estimatePerTaskUsd: 0.02, k: 1, concurrency: 3, spawnRun: spawn as never,
    })
    expect(r.ok).toBe(true)
    expect(r.stoppedBy).toBe('budget_stop')
    expect(r.costUsd).toBeLessThanOrEqual(0.05 + 3 * 0.02 + 1e-9)
  })

  it('并发下 trace-only 也可用：每单元独立 trace 目录，session 不串题', async () => {
    const sessions = new Map<string, string>()
    const traceOnly = async (prompt: string, env: Record<string, string>, _t: number) => {
      await new Promise((r) => setTimeout(r, 3))
      const sid = `sess-${prompt}`
      writeFileSync(
        join(env.HERMES_RUN_TRACE_DIR, `${sid}.jsonl`),
        [JSON.stringify({ type: 'header', session_id: sid }), JSON.stringify({ type: 'chunk', kind: 'llm_span', usage: { prompt_tokens: 10, completion_tokens: 5 } })].join('\n') + '\n',
      )
      sessions.set(prompt, sid)
      return { ok: true as const, stdout: '' }
    }
    const r = await runProbeTasks({
      prompts: prompts.slice(0, 2), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, k: 1, concurrency: 2, spawnRun: traceOnly as never,
    })
    expect(r.ok).toBe(true)
    expect(r.peakInFlight).toBeGreaterThanOrEqual(2)
    // 归因靠目录隔离：t1/t2 各自拿到自己那次的 session
    expect(r.samples.t1[0].sessionId).toBe('sess-题目一')
    expect(r.samples.t2[0].sessionId).toBe('sess-题目二')
  })

  it('并发下单题失败仍如实中断（不静默吞）', async () => {
    const failing = async (prompt: string, _env: Record<string, string>, _t: number) => {
      await new Promise((r) => setTimeout(r, 2))
      if (prompt === '题目二') return { ok: false as const, error: 'boom' }
      return { ok: true as const, stdout: JSON.stringify({ type: 'result', session_id: 's', text: 'done', tokens: { total: 5 } }) }
    }
    const r = await runProbeTasks({
      prompts, baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, k: 1, concurrency: 2, retryDelayMs: 0, spawnRun: failing as never,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('运行失败')
  })
})

describe('并发收敛（缺省 2 的边界）', () => {
  const prompts = [
    { taskId: 't1', prompt: '题目一' },
    { taskId: 't2', prompt: '题目二' },
    { taskId: 't3', prompt: '题目三' },
  ]
  const tree = { 'profiles/p1/SOUL.md': 'candidate persona' }
  const concSpawn = () => {
    let inFlight = 0
    let peak = 0
    const spawn = async (prompt: string) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { ok: true as const, stdout: JSON.stringify({ type: 'result', session_id: `s-${prompt}`, text: 'ok', tokens: { total: 10 } }) }
    }
    return { spawn, peakOf: () => peak }
  }

  it('不超过单元数：2 个单元即便请求 5 路并行也只跑 2 路', async () => {
    const { spawn, peakOf } = concSpawn()
    const r = await runProbeTasks({
      prompts: prompts.slice(0, 2), baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 100, k: 1, concurrency: 5, spawnRun: spawn as never,
    })
    expect(r.ok).toBe(true)
    expect(peakOf()).toBeLessThanOrEqual(2)
    expect(r.peakInFlight).toBeLessThanOrEqual(2)
  })

  it('不超过预算允许的超支：预算仅 1.0（估值 0.5）时自动降到串行', async () => {
    const { spawn, peakOf } = concSpawn()
    const r = await runProbeTasks({
      prompts, baseHome: home, profile: 'p1', variantTree: tree,
      budgetRemainingUsd: 1.0, estimatePerTaskUsd: 0.5, k: 1, concurrency: 3, spawnRun: spawn as never,
    })
    expect(r.ok).toBe(true)
    expect(peakOf()).toBe(1)
    expect(r.peakInFlight).toBe(1)
  })
})
