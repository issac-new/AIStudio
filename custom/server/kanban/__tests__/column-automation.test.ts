// 列级 automation 编排守门（routa §七#1，矩阵 §3.6 P0）：配置/时机匹配/autoAdvance + 执行半环。
// R3 加固：名册原型链/空条目（P-A(a)）、共享派单单例（P-A(b)）、X1 归属闸（P-C(b)）、
// 多步合并话术（P-D(a)）、outcome 全收集与错误分类（P-D(c)）、step 词表校验（P-D(d)）、
// autoAdvance 话术（P-D(e)）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadColumnAutomations, matchColumnTransition, resetColumnAutomationsCacheForTests,
  type ColumnAutomation,
} from '../column-automation'
import { MentionDispatchService, type MentionOutcome, type DispatchEnginePort } from '../../zcode/mention-dispatch'
import {
  dispatchColumnTransition, ColumnDispatchConfigError, type ColumnDispatchResult,
} from '../column-dispatch'

// 控制器错误分类（P-D(c)）用可控派单替身；impl 未设时转发真实现（单测不受影响）。
const dispatchStub = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }))
vi.mock('../column-dispatch', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../column-dispatch')>()
  return {
    ...orig,
    dispatchColumnTransition: (...args: unknown[]) =>
      dispatchStub.impl
        ? dispatchStub.impl()
        : (orig.dispatchColumnTransition as (...a: unknown[]) => unknown)(...args),
  }
})

// 控制器接线（X1 闸 / 共享单例）依赖投影 runtime 与引擎桥——zcode-engine-controller.test.ts 同款替身。
const runtimeMock = vi.hoisted(() => {
  const state = { agentCalls: 0, sessions: 0, texts: [] as string[], online: true }
  const runtime = {
    async withAgent(fn: (agent: unknown) => Promise<unknown>) {
      state.agentCalls += 1
      return fn({
        createSession: async () => {
          state.sessions += 1
          return { session: { sessionId: `sess-${state.sessions}` } }
        },
        sendConversationCommandV4: async (p: { envelope: Record<string, unknown> }) => {
          state.texts.push(String((p.envelope.payload as { text: string }).text))
          return { status: 'accepted' }
        },
      })
    },
  }
  return { state, runtime }
})
vi.mock('../../zcode/projection-runtime', () => ({ getZcodeProjectionRuntime: () => runtimeMock.runtime }))
vi.mock('../../zcode/engine-bridge', () => ({ probeZCodeEngine: () => Promise.resolve(runtimeMock.state.online) }))

import { columnAutomationRoutes } from '../column-automation-controller'
import { zcodeEngineRoutes, getMentionDispatch, resetMentionDispatchForTests } from '../../zcode/engine-controller'
import { setWorkspaceAccessDepsForTests } from '../../zcode/workspace-access'

type Handler = (ctx: Record<string, unknown>) => Promise<void>
type Routed = { stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }> }

/** 从 @koa/router 的 layer 栈取裸 handler（不经 HTTP，直接喂 fake ctx）。 */
function handlerFor(router: unknown, method: string, path: string): Handler {
  const layers = (router as Routed).stack
  const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(body: Record<string, unknown>, state: Record<string, unknown> = {}): Record<string, unknown> {
  return { request: { body }, query: {}, state, status: 200, body: undefined }
}

function fakeEngine(): DispatchEnginePort & { sessions: number; texts: string[] } {
  const engine = {
    sessions: 0,
    texts: [] as string[],
    async probe() { return true },
    async createSession() { engine.sessions += 1; return { session: { sessionId: `sess-${engine.sessions}` } } },
    async sendCommand(p: { workspacePath: string; envelope: Record<string, unknown> }) {
      engine.texts.push(String((p.envelope.payload as { text: string }).text))
      return { status: 'accepted' }
    },
  } as never
  return engine
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'columns-'))
  process.env.HERMES_COLUMNS_FILE = join(dir, 'columns.yaml')
  resetColumnAutomationsCacheForTests()
  runtimeMock.state.agentCalls = 0
  runtimeMock.state.sessions = 0
  runtimeMock.state.texts = []
  runtimeMock.state.online = true
  resetMentionDispatchForTests()
})
afterEach(() => {
  delete process.env.HERMES_COLUMNS_FILE
  resetColumnAutomationsCacheForTests()
  resetMentionDispatchForTests()
  dispatchStub.impl = null
  rmSync(dir, { recursive: true, force: true })
})

const write = (yaml: string) => writeFileSync(join(dir, 'columns.yaml'), yaml, 'utf8')

const TABLE: Record<string, ColumnAutomation> = {
  todo: { timing: 'entry', autoAdvanceOnSuccess: true, steps: [{ id: 's1', role: 'general-engineer', specialist: 'refiner', provider: 'zcode' }] },
  done: { timing: 'exit', autoAdvanceOnSuccess: false, steps: [{ id: 's2', role: 'ops', specialist: 'reporter', provider: 'zcode' }] },
  review: { timing: 'both', autoAdvanceOnSuccess: false, steps: [{ id: 's3', role: 'qa', specialist: 'guard', provider: 'zcode' }] },
  quiet: { timing: 'entry', autoAdvanceOnSuccess: false, steps: [] },
}

describe('COLUMN_TRANSITION 匹配器（entry|exit|both 时机）', () => {
  it('entry/exit/both 三时机各自触发；空步骤列不触发', () => {
    // 进入 todo（entry 时机匹配进入方向）→ todo 触发；离开 todo 不触发。
    const t1 = matchColumnTransition('in_progress', 'todo', TABLE)
    expect(t1.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['todo:entry'])
    // todo→done：todo=entry 时机不匹配离开、done=exit 时机不匹配进入 → 双空（时机语义）。
    expect(matchColumnTransition('todo', 'done', TABLE)).toEqual([])
    // done→review：done=exit（离开触发）+ review=entry（进入触发）= both 双发。
    const t2 = matchColumnTransition('done', 'review', TABLE)
    expect(t2.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['done:exit', 'review:entry'])
    // 离开 review（review=both）→ review:exit。
    const t3 = matchColumnTransition('review', 'quiet', TABLE)
    expect(t3.map((x) => `${x.column}:${x.matchedTiming}`)).toEqual(['review:exit'])
    // 空步骤列 quiet entry 不触发。
  })

  it('autoAdvanceOnSuccess 意图透传；首列进入只匹配 entry；to 缺席纯离场不触发', () => {
    const t = matchColumnTransition(null, 'todo', TABLE)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ column: 'todo', matchedTiming: 'entry', autoAdvanceOnSuccess: true })
    expect(matchColumnTransition('quiet', null, TABLE)).toEqual([])
    // to=null（卡片离开看板的纯离场）：不触发任何编排（含 from 侧 exit），语义有意如此。
    expect(matchColumnTransition('done', null, TABLE)).toEqual([])
  })

  it('原型链误配修复（P-A(a)）：列名命中 Object.prototype 成员不抛不误配', () => {
    // 撤修复（裸 table[column]）：'constructor' 命中 Object 构造函数 → cfg.steps.length 抛 TypeError。
    expect(matchColumnTransition('toString', 'constructor', TABLE)).toEqual([])
    expect(matchColumnTransition('constructor', 'todo', TABLE).map((t) => t.column)).toEqual(['todo'])
  })

  it('配置加载+坏文件回空 fail-soft；空条目跳过不牵连整表（P-A(a)）', () => {
    write('columns:\n  todo:\n    timing: entry\n    autoAdvanceOnSuccess: true\n    steps:\n      - { id: a, role: r, specialist: s, provider: zcode }\n  bad: "not-a-map"\n  empty:\n')
    const table = loadColumnAutomations()
    expect(table.todo.steps).toHaveLength(1)
    // 坏条目（标量/空条目 null）跳过不进表——原先 null 条目抛 TypeError 整表静默清空。
    expect(table.bad).toBeUndefined()
    expect(table.empty).toBeUndefined()
    write('{{broken')
    resetColumnAutomationsCacheForTests()
    expect(Object.keys(loadColumnAutomations())).toHaveLength(0)
  })
})

describe('执行半环（COLUMN_TRANSITION→派单，routa §七#2）', () => {
  it('多步合并进单 run 按序执行（P-D(a)）：文本列全步序，期望保持 queued/coalesced', async () => {
    write('columns:\n  review:\n    timing: entry\n    autoAdvanceOnSuccess: true\n    steps:\n      - { id: qa, role: qa, specialist: guard, provider: zcode }\n      - { id: approve, role: code-reviewer, specialist: guard, provider: zcode }\n')
    resetColumnAutomationsCacheForTests()
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    const result = await dispatchColumnTransition(svc, { from: null, to: 'review', workspacePath: '/w' })
    expect(result.triggers).toHaveLength(1)
    // 单 pending 槽语义：同 provider 两步——第一步 queued、第二步并入同一 run（coalesced），
    // 合并后的 run 内按文本列出的步骤序执行；跨 run 串行依赖 run 完成信号（未接）。
    expect(result.outcomes.map((o) => o.reason)).toEqual(['queued', 'coalesced'])
    // P-D(a)①：派单文本把多步按序显式列出并注明「按序执行」
    expect(engine.texts[0]).toContain('共 2 步，按序执行')
    expect(engine.texts[0]).toContain('1. qa（qa / guard）')
    expect(engine.texts[0]).toContain('2. approve（code-reviewer / guard）')
    expect(engine.texts[1]).toContain('本次派发第 2 步：approve')
    // P-D(e)：autoAdvanceOnSuccess 不再承诺「自动进列」
    expect(engine.texts[0]).toContain('完成后由人工/编排推进列')
    expect(engine.texts[0]).not.toContain('成功后自动进列')
  })

  it('outcome 全量收集（P-D(c)）：派单返回多条不再 destructure 丢弃', async () => {
    write('columns:\n  todo:\n    timing: entry\n    steps:\n      - { id: refine, role: general-engineer, specialist: refiner, provider: zcode }\n')
    resetColumnAutomationsCacheForTests()
    const mk = (reason: string): MentionOutcome => ({
      type: 'mention.outcome', workspaceId: '/w', target: 'zcode', mentionKind: 'agent', reason: reason as MentionOutcome['reason'], at: 1,
    })
    const fake = {
      dispatch: async () => [mk('queued'), mk('coalesced'), mk('target_unavailable')],
    } as unknown as MentionDispatchService
    const result: ColumnDispatchResult = await dispatchColumnTransition(fake, { from: null, to: 'todo', workspacePath: '/w' })
    // 撤修复（const [outcome] = ...）→ 只剩 1 条，多余 outcome 被丢。
    expect(result.outcomes).toHaveLength(3)
  })

  it('step 配置非法（P-D(d)）：拼文本前拦截抛配置错误，引擎零调用', async () => {
    // role 含空格/感叹号（mention/指令注入面）：provider/role/长度/字符集校验不过不得拼文本。
    write('columns:\n  todo:\n    timing: entry\n    steps:\n      - { id: refine, role: "bad role!", specialist: s, provider: zcode }\n')
    resetColumnAutomationsCacheForTests()
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    await expect(dispatchColumnTransition(svc, { from: null, to: 'todo', workspacePath: '/w' }))
      .rejects.toThrow(ColumnDispatchConfigError)
    expect(engine.sessions).toBe(0)
    expect(engine.texts).toHaveLength(0)
  })

  it('provider 注入面（P-D(d)）：非词表 provider 拼不出额外 mention', async () => {
    write('columns:\n  todo:\n    timing: entry\n    steps:\n      - { id: refine, role: general-engineer, specialist: s, provider: "zcode @ghost" }\n')
    resetColumnAutomationsCacheForTests()
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'c' })
    await expect(dispatchColumnTransition(svc, { from: null, to: 'todo', workspacePath: '/w' }))
      .rejects.toThrow(ColumnDispatchConfigError)
    expect(engine.texts).toHaveLength(0) // 拦在拼文本前，@ghost 不进任何派单
  })
})

describe('REST 接线（X1 闸 / 共享派单单例 / 错误分类）', () => {
  const asUser = (role = 'admin') => ({ user: { id: 1, username: 'alice', role } })
  const registeredDeps = {
    listSessions: () => [{ profile: 'default', workspace: '/w/p' }],
    userCanAccessProfile: () => true,
  }

  beforeEach(() => {
    setWorkspaceAccessDepsForTests(registeredDeps)
    write('columns:\n  todo:\n    timing: entry\n    autoAdvanceOnSuccess: false\n    steps:\n      - { id: refine, role: general-engineer, specialist: refiner, provider: zcode }\n')
    resetColumnAutomationsCacheForTests()
  })
  afterEach(() => { setWorkspaceAccessDepsForTests(null) })

  it('X1 归属闸（P-C(b)）：未注册 workspace → 403，引擎零调用', async () => {
    const ctx = fakeCtx({ from: null, to: 'todo', workspacePath: '/w/other' }, asUser())
    await handlerFor(columnAutomationRoutes, 'POST', '/dispatch')(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ ok: false, reason: 'invocation_not_allowed' })
    expect(runtimeMock.state.agentCalls).toBe(0)
  })

  it('共享派单单例（P-A(b)）：/dispatch 跨调用 + /mention 同一 pending 槽，不双跑', async () => {
    const c1 = fakeCtx({ from: null, to: 'todo', workspacePath: '/w/p' }, asUser())
    await handlerFor(columnAutomationRoutes, 'POST', '/dispatch')(c1)
    expect((c1.body as { outcomes: Array<{ reason: string }> }).outcomes[0].reason).toBe('queued')
    // 撤修复（每次 new MentionDispatchService）→ 第二次照旧 queued 双 run，sessions=2。
    const c2 = fakeCtx({ from: null, to: 'todo', workspacePath: '/w/p' }, asUser())
    await handlerFor(columnAutomationRoutes, 'POST', '/dispatch')(c2)
    expect((c2.body as { outcomes: Array<{ reason: string }> }).outcomes[0].reason).toBe('coalesced')
    // 与 /mention REST 同账（同一单例、同一 pending 槽）
    const m = fakeCtx({ workspacePath: '/w/p', text: '@zcode 补充' }, asUser())
    await handlerFor(zcodeEngineRoutes, 'POST', '/mention')(m)
    expect((m.body as { outcomes: Array<{ reason: string }> }).outcomes[0].reason).toBe('coalesced')
    expect(runtimeMock.state.sessions).toBe(1) // 全程只起一个 run
    expect(getMentionDispatch().pendingSnapshot()).toHaveLength(1)
  })

  it('错误分类透传（P-D(c)）：配置错误 400、引擎不可达 503、未预期错误 500 internal_error', async () => {
    const run = async (impl: () => Promise<unknown>) => {
      dispatchStub.impl = impl
      const ctx = fakeCtx({ from: null, to: 'todo', workspacePath: '/w/p' }, asUser())
      await handlerFor(columnAutomationRoutes, 'POST', '/dispatch')(ctx)
      dispatchStub.impl = null
      return ctx
    }
    const cfg = await run(() => Promise.reject(new ColumnDispatchConfigError('step 配置非法')))
    expect(cfg.status).toBe(400)
    expect(cfg.body).toMatchObject({ ok: false, reason: 'target_unavailable' }) // 配置错误≠引擎不可达
    const transport = await run(() => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:3030')))
    expect(transport.status).toBe(503)
    expect(transport.body).toMatchObject({ reason: 'engine_unreachable' })
    const unknown = await run(() => Promise.reject(new TypeError('boom')))
    expect(unknown.status).toBe(500)
    expect(unknown.body).toMatchObject({ reason: 'internal_error' }) // 不再一律谎报 engine_unreachable
  })
})
