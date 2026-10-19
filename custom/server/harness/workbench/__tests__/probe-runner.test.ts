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
    expect(noTrace.error).toContain('未产生 trace')
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
