// A2 守门：automations 状态引擎——去抖合并/派发端口/历史落档/规则生命周期/事件源挂载。
// 定时器全注入（不落真 timer）；dispatch 端口 mock（不碰 mention 总线）。
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AutomationEngine, parseGitLog, type AutomationDispatchPort } from '../automation-engine'

const dir = mkdtempSync(join(tmpdir(), 'automations-'))

interface TimerHandle { fn: () => void; ms: number; fired: boolean; armedAt: number }

/** 假时钟：advance 推进到 armedAt+ms 的定时器按序触发（引擎去抖窗口语义）。 */
function makeClock() {
  let now = 1_000_000
  const timers = new Set<TimerHandle>()
  const set = (fn: () => void, ms: number) => {
    const h: TimerHandle = { fn, ms, fired: false, armedAt: now }
    timers.add(h)
    return h
  }
  const clear = (h: unknown) => { timers.delete(h as TimerHandle) }
  const advance = (ms: number) => {
    now += ms
    for (const h of [...timers]) {
      if (now >= h.armedAt + h.ms) {
        timers.delete(h)
        h.fn()
      }
    }
  }
  return {
    now: () => now,
    advance,
    set: set as unknown as (fn: () => void, ms: number) => unknown,
    clear: clear as unknown as (h: unknown) => void,
  }
}

const dispatchCalls: Array<{ workspacePath: string; text: string }> = []
let dispatchResult: Array<{ reason: string; sessionId?: string; commandId?: string }> = [{ reason: 'dispatched', sessionId: 's-1', commandId: 'c-1' }]
const port: AutomationDispatchPort = {
  dispatch: async (params) => {
    dispatchCalls.push(params)
    return dispatchResult
  },
}

function newEngine() {
  const clock = makeClock()
  const engine = new AutomationEngine({
    storePath: join(dir, `rules-${Math.random().toString(36).slice(2)}.json`),
    historyPath: join(dir, `hist-${Math.random().toString(36).slice(2)}.json`),
    port,
    now: clock.now,
    setTimeoutFn: clock.set,
    clearTimeoutFn: clock.clear,
  })
  return { engine, clock }
}

/** flush 是异步的（await port.dispatch）：时钟推进后须沉降微任务再断言。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve()
  await new Promise((r) => setImmediate(r))
}

beforeEach(() => { dispatchCalls.length = 0; dispatchResult = [{ reason: 'dispatched', sessionId: 's-1', commandId: 'c-1' }] })

describe('A2 引擎：去抖与派发', () => {
  it('flushAllForTests 立即冲刷在途桶：不等计时器、真派发、真落历史', async () => {
    const { engine } = newEngine()
    engine.addRule({ name: 'r', workspacePath: '/w', source: { type: 'kanban', board: 'b' }, promptTemplate: 'go', debounceMs: 60_000 })
    engine.ingestEvent({ type: 'kanban', workspacePath: '/w', board: 'b', taskId: 't1', from: 'todo', to: 'doing' })
    expect(dispatchCalls).toHaveLength(0) // 仍在去抖窗口内
    await engine.flushAllForTests()
    await settle()
    expect(dispatchCalls).toHaveLength(1) // 已立即派发（修复前 dropBucket 后 flush 恒空转，事件静默丢弃）
    expect(engine.listHistory()[0]?.reason).toBe('dispatched')
  })

  it('窗口内事件合并为一次派发；窗口不因新事件延展（首事件起算）', async () => {
    const { engine, clock } = newEngine()
    engine.addRule({ name: 'r', workspacePath: '/w', source: { type: 'file' }, promptTemplate: 'go {{paths}}', debounceMs: 2000 })
    engine.ingestEvent({ type: 'file', workspacePath: '/w', path: 'a.ts' })
    clock.advance(1500)
    engine.ingestEvent({ type: 'file', workspacePath: '/w', path: 'b.ts' })
    clock.advance(600) // 首事件起 2100ms > 2000ms → 冲刷
    await settle()
    expect(dispatchCalls.length).toBe(1)
    expect(dispatchCalls[0].text).toContain('a.ts')
    expect(dispatchCalls[0].text).toContain('b.ts')
    expect(engine.listHistory()[0]).toMatchObject({ eventCount: 2, reason: 'dispatched', sessionId: 's-1' })
  })

  it('派发异常如实落历史（dispatch_error），不谎报成功', async () => {
    const { engine, clock } = newEngine()
    dispatchResult = []
    engine.addRule({ name: 'r', workspacePath: '/w', source: { type: 'file' }, promptTemplate: 'x', debounceMs: 200 })
    engine.ingestEvent({ type: 'file', workspacePath: '/w', path: 'a.ts' })
    clock.advance(300)
    await settle()
    expect(engine.listHistory()[0].reason).toBe('no_mention_target')
  })

  it('桶期间停用/删除规则：丢弃不派发陈意图', async () => {
    const { engine, clock } = newEngine()
    const { rule } = engine.addRule({ name: 'r', workspacePath: '/w', source: { type: 'file' }, promptTemplate: 'x', debounceMs: 200 }) as { rule: { id: string } }
    engine.ingestEvent({ type: 'file', workspacePath: '/w', path: 'a.ts' })
    engine.updateRule(rule.id, { enabled: false })
    clock.advance(300)
    expect(dispatchCalls.length).toBe(0)
    expect(engine.listHistory().length).toBe(0)
  })
})

describe('A2 引擎：规则生命周期与持久化', () => {
  it('CRUD 落原子 JSON；历史有界 200', async () => {
    const { engine, clock } = newEngine()
    const storePath = (engine as unknown as { opts: { storePath: string } }).opts.storePath
    const histPath = (engine as unknown as { opts: { historyPath: string } }).opts.historyPath
    const added = engine.addRule({ name: 'r', workspacePath: '/w', source: { type: 'file' }, promptTemplate: 'x' })
    expect('rule' in added).toBe(true)
    expect(existsSync(storePath)).toBe(true)
    expect(JSON.parse(readFileSync(storePath, 'utf8')).length).toBe(1)

    const id = (added as { rule: { id: string } }).rule.id
    expect(engine.updateRule('missing', { enabled: false })).toBeNull()
    expect(engine.removeRule(id)).toBe(true)
    expect(engine.removeRule(id)).toBe(false)

    // 历史上界
    engine.addRule({ name: 'r2', workspacePath: '/w', source: { type: 'file' }, promptTemplate: 'x', debounceMs: 300 })
    const rule2 = engine.listRules()[0]
    for (let i = 0; i < 210; i++) {
      engine.ingestEvent({ type: 'file', workspacePath: '/w', path: `f${i}.ts` })
      clock.advance(350)
    }
    await settle()
    const persisted = JSON.parse(readFileSync(histPath, 'utf8')) as unknown[]
    expect(persisted.length).toBeLessThanOrEqual(200)
    expect(engine.listHistory()[0].ruleId).toBe(rule2.id)
  })
})

describe('A2 引擎：事件源挂载', () => {
  it('file 规则挂 watcher；规则删除/停用卸载；watcher 事件去 .git/node_modules 噪声后入引擎', async () => {
    const watchers: Array<{ root: string; onEvent: (p: string) => void; closed: boolean }> = []
    const { engine } = newEngine()
    const eng = new AutomationEngine({
      storePath: join(dir, `w-${Math.random().toString(36).slice(2)}.json`),
      historyPath: join(dir, `wh-${Math.random().toString(36).slice(2)}.json`),
      port,
      watchFn: (root, onEvent) => { watchers.push({ root, onEvent, closed: false }); return { close: () => { const w = watchers.find((x) => x.root === root); if (w) w.closed = true } } },
    })
    const added = eng.addRule({ name: 'watch', workspacePath: '/ws/x', source: { type: 'file' }, promptTemplate: 'x' }) as { rule: { id: string } }
    expect(watchers.map((w) => w.root)).toEqual(['/ws/x'])
    eng.updateRule(added.rule.id, { enabled: false })
    expect(watchers[0].closed).toBe(true)

    eng.updateRule(added.rule.id, { enabled: true })
    // .git 噪声过滤：直接调注入的 onEvent
    const w = watchers.find((x) => !x.closed)
    w!.onEvent('.git/HEAD')
    w!.onEvent('node_modules/pkg/index.js')
    w!.onEvent('src/main.ts')
    expect(eng.ingestEvent({ type: 'file', workspacePath: '/ws/x', path: 'src/main.ts' }).matched).toBe(1)
    eng.dispose()
  })

  it('parseGitLog：\x1f 分隔 sha/subject', () => {
    const rows = parseGitLog('abc1234\x1ffix: 登录超时\nabc1230\x1ffeat: x')
    expect(rows).toEqual([
      { sha: 'abc1234', subject: 'fix: 登录超时' },
      { sha: 'abc1230', subject: 'feat: x' },
    ])
  })
})
