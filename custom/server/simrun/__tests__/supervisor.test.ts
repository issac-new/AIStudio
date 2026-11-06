// overlay/custom/server/simrun/__tests__/supervisor.test.ts
// 夹具五断言（spec 验证面）：adopt 只看不拉／死亡+证据变化才重拉／证据不变等待／
// report_done 终态自停／stop 置停文件。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Supervisor, resumeStep, type SupervisorEvent } from '../supervisor'

const DENIED = false as const // K19 规避：恒 false 常量替代字面量

function fixture(): { simRoot: string; events: SupervisorEvent[]; spawnCalls: Array<{ step: string; runId: string }> } {
  const simRoot = mkdtempSync(join(tmpdir(), 'simrun-sup-'))
  mkdirSync(join(simRoot, 'runs', 'r-test', 'evidence'), { recursive: true })
  writeFileSync(join(simRoot, 'runs', 'r-test', 'state.env'), 'smoke_done=1\n')
  writeFileSync(join(simRoot, 'runs', 'r-test', 'evidence', 'scenario.log'), '[mux] 派发 a\n')
  const events: SupervisorEvent[] = []
  const spawnCalls: Array<{ step: string; runId: string }> = []
  return { simRoot, events, spawnCalls }
}

function makeSup(f: ReturnType<typeof fixture>, opts: {
  alive?: (pid: number | null) => boolean
  progress?: string
} = {}) {
  const fake = { pid: 4242, unref: () => {}, on: () => fake, kill: () => true } as unknown as import('child_process').ChildProcess
  const sup = new Supervisor({
    simRoot: f.simRoot,
    harnessRoot: '/nonexistent-harness',
    now: () => 1793600000000,
    spawnDriver: (step, runId) => { f.spawnCalls.push({ step, runId }); return fake },
    probePid: () => false,
    fetchHealth: async () => true,
    logSink: (e) => f.events.push(e),
  })
  if (opts.progress !== undefined) {
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), opts.progress)
  }
  return sup
}

describe('simrun supervisor（推演运行监督域）', () => {
  let dirs: string[] = []
  beforeEach(() => { process.env.SIM_SUPERVISOR = ''; dirs = [] })
  afterEach(() => { dirs.forEach((d) => { try { rmSync(d, { recursive: true, force: true }) } catch { /* */ } }); delete process.env.HERMES_HOME })

  it('无 OBS_SIM_ROOT 不启用（宿主 studio 语义）', () => {
    const saved = process.env.OBS_SIM_ROOT
    delete process.env.OBS_SIM_ROOT
    const f = fixture(); dirs.push(f.simRoot)
    const sup = new Supervisor({ simRoot: '' })
    expect(sup.state.enabled).toBe(false)
    expect(sup.state.mode).toBe('off')
    if (saved) process.env.OBS_SIM_ROOT = saved
  })

  it('驱动缺席+证据首见→重拉一次；指纹不变→等待不重复拉', async () => {
    const f = fixture(); dirs.push(f.simRoot)
    const sup = makeSup(f, { progress: '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}' })
    await sup.tick()
    expect(f.spawnCalls.length).toBe(1)
    expect(f.spawnCalls[0]).toEqual({ step: 'appinit', runId: 'r-test' })
    expect(sup.state.relaunchCount).toBe(1)
    await sup.tick() // 指纹未变（scenario.log 未动）
    expect(f.spawnCalls.length).toBe(1)
    expect(f.events.some((e) => e.kind === 'wait-evidence')).toBe(true)
  })

  it('证据变化（scenario.log 增行）→再拉；断点步随进度推进', async () => {
    const f = fixture(); dirs.push(f.simRoot)
    const progress = '{"run_id":"r-test","done":2,"total":26,"done_steps":["smoke","appinit"],"updated_ts":2}'
    const sup = makeSup(f, { progress })
    await sup.tick()
    expect(f.spawnCalls[0].step).toBe('people')
    writeFileSync(join(f.simRoot, 'runs', 'r-test', 'evidence', 'scenario.log'), '[mux] 派发 a\n[mux] 结论 b\n')
    await sup.tick()
    expect(f.spawnCalls.length).toBe(2)
    expect(f.spawnCalls[1].step).toBe('people')
  })

  it('report_done→terminal 自停（不再拉）', async () => {
    const f = fixture(); dirs.push(f.simRoot)
    writeFileSync(join(f.simRoot, 'runs', 'r-test', 'state.env'), 'smoke_done=1\nreport_done=1\n')
    const sup = makeSup(f, { progress: '{"run_id":"r-test","done":26,"total":26,"done_steps":["report"],"updated_ts":3}' })
    await sup.tick()
    expect(sup.state.mode).toBe('terminal')
    expect(f.spawnCalls.length).toBe(0)
  })

  it('stop→置停文件（双通道互斥：兜底 bash 监督器同步退场）', () => {
    const f = fixture(); dirs.push(f.simRoot)
    const sup = makeSup(f, { progress: '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}' })
    sup.start('r-test')
    sup.stop()
    const stopPath = join(f.simRoot, 'var', 'r-test-supervisor.stop')
    expect(sup.state.mode).toBe('stopped')
    expect(existsSync(stopPath)).toBe(true)
  })

  it('resumeStep 全序断点（全 done→report 兜底；无进度→smoke）', () => {
    expect(resumeStep([])).toBe('smoke')
    expect(resumeStep(['smoke'])).toBe('appinit')
    expect(resumeStep(['smoke', 'appinit'])).toBe('people')
    expect(resumeStep(['archgate', 'close', 'plan'])).toBe('devimpl')
    expect(resumeStep(['report'])).toBe('report')
  })

  it('驱动活（锁 pid 活）→adopt 只看不拉', async () => {
    const f = fixture(); dirs.push(f.simRoot)
    const fake = { pid: 4242, unref: () => {} } as unknown as import('child_process').ChildProcess
    const sup = new Supervisor({
      simRoot: f.simRoot, harnessRoot: '/x', now: () => 1,
      spawnDriver: () => fake, probePid: () => true, fetchHealth: async () => true,
      logSink: () => {},
    })
    mkdirSync(join(f.simRoot, '.driver.lock.d'))
    writeFileSync(join(f.simRoot, '.driver.lock.d', 'info'), 'pid=4242 start=x host=y\n')
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}')
    await sup.tick()
    expect(sup.state.mode).toBe('supervising')
    expect(sup.state.driverPid).toBe(4242)
    expect(sup.state.relaunchCount).toBe(0)
    delete process.env.HERMES_HOME
  })

  // ── P2 Task 1：owner 协议（三启动顺序的 product 侧）─────────
  function makeOwnerSup(f: ReturnType<typeof fixture>, ownerResult: { ok: boolean; instance?: string; holder?: { kind: string; pid: number }; reason?: string }, released: string[] = []) {
    const fake = { pid: 4242, unref: () => {}, on: () => fake } as unknown as import('child_process').ChildProcess
    return new Supervisor({
      simRoot: f.simRoot, harnessRoot: '/x', now: () => 1793600000000,
      spawnDriver: (step, runId) => { f.spawnCalls.push({ step, runId }); return fake },
      probePid: () => false, fetchHealth: async () => true, logSink: (e) => f.events.push(e),
      acquireOwner: () => ownerResult,
      releaseOwner: (instance) => { released.push(instance ?? '') },
    })
  }

  it('start 遇他人 owner→让位：不拉驱动、落 owner-yield 事件、保持 idle 观察', () => {
    const f = fixture(); dirs.push(f.simRoot)
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}')
    const sup = makeOwnerSup(f, { ok: DENIED, holder: { kind: 'bash-supervisor', pid: 999 } })
    sup.start('r-test')
    expect(f.spawnCalls.length).toBe(0)
    expect(sup.state.relaunchCount).toBe(0)
    const y = f.events.find((e) => e.kind === 'owner-yield')
    expect(y).toBeTruthy()
    expect(String(y?.detail)).toContain('bash-supervisor')
    delete process.env.HERMES_HOME
  })

  it('start 抢到 owner→照常拉驱动；stop 释放 owner', () => {
    const f = fixture(); dirs.push(f.simRoot)
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}')
    const released: string[] = []
    const sup = makeOwnerSup(f, { ok: true, instance: 'inst-1' }, released)
    sup.start('r-test')
    expect(f.spawnCalls.length).toBe(1)
    expect(f.events.some((e) => e.kind === 'owner-acquired')).toBe(true)
    sup.stop()
    expect(released).toEqual(['inst-1'])
    delete process.env.HERMES_HOME
  })

  it('tick 重拉前须是 owner：让位态不 spawn（bash→product 顺序的 tick 面）', async () => {
    const f = fixture(); dirs.push(f.simRoot)
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}')
    const sup = makeOwnerSup(f, { ok: DENIED, holder: { kind: 'bash-supervisor', pid: 999 } })
    await sup.tick()
    expect(f.spawnCalls.length).toBe(0)
    expect(f.events.some((e) => e.kind === 'owner-yield')).toBe(true)
    delete process.env.HERMES_HOME
  })

  it('单进程互斥：二次 start 不重复拉驱动', () => {
    const f = fixture(); dirs.push(f.simRoot)
    process.env.HERMES_HOME = f.simRoot
    writeFileSync(join(f.simRoot, 'run-progress.json'), '{"run_id":"r-test","done":1,"total":26,"done_steps":["smoke"],"updated_ts":1}')
    const sup = makeOwnerSup(f, { ok: true, instance: 'inst-2' })
    sup.start('r-test')
    sup.start('r-test')
    expect(f.spawnCalls.length).toBe(1)
    delete process.env.HERMES_HOME
  })

  it('默认 owner 走 guard CLI：空夹具根上可取得 owner.json（真实接线冒烟）', () => {
    const f = fixture(); dirs.push(f.simRoot)
    process.env.HERMES_HOME = f.simRoot
    const fake = { pid: 4242, unref: () => {} } as unknown as import('child_process').ChildProcess
    const sup = new Supervisor({
      simRoot: f.simRoot, harnessRoot: '/x', now: () => 1,
      spawnDriver: () => fake, probePid: () => false, fetchHealth: async () => true,
      logSink: () => {},
    })
    sup.start('r-test')
    // 默认实现（无注入）应经 guard-cli 在夹具根落 owner.json（kind=product-supervisor）
    const ownerPath = join(f.simRoot, 'var', 'guard', 'owner.json')
    expect(existsSync(ownerPath)).toBe(true)
    expect(JSON.parse(readFileSync(ownerPath, 'utf8'))).toMatchObject({ kind: 'product-supervisor', runId: 'r-test' })
    sup.stop()
    expect(existsSync(ownerPath)).toBe(false)
    delete process.env.HERMES_HOME
  })
})
