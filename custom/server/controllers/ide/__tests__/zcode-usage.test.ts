// overlay/custom/server/controllers/ide/__tests__/zcode-usage.test.ts
// 本机 zcode 用量账本守门（2026-10-21 dsh-context 数据面吸收轮）：
//   纯函数：days/limit/offset 钳制、token 整形（推理封顶）、缓存命中率、计费口径
//   HTTP 面：summary 聚合（KPI/byDay/byModel/byAgent/bySource）、sessions join 整形
//            （子代理标记/标题缺省）、rounds 轮内模型分解、tools 时间线、库缺席空态
// 数据夹具=内存 sqlite（node:sqlite），列集与真实库一致。
import { beforeEach, describe, expect, it } from 'vitest'
import type { Context } from 'koa'
import {
  billedOf, cacheHitRateOf, clampDays, clampLimit, clampOffset, handleUsageRounds, handleUsageSessions,
  handleUsageSummary, handleUsageTools, shapeTokenSums, type SqliteDb, type ZcodeUsageDeps,
  type UsageSessionRow, type UsageSummary, type UsageRoundRow, type UsageToolRow,
} from '../zcode-usage'

// 固定时基：2026-10-21T12:00:00Z（正午 UTC，日期桶对 ±11 时区稳定）
const NOW = Date.UTC(2026, 9, 21, 12)
const DAY = 86_400_000
const T_RECENT = NOW - DAY      // 7 天窗内
const T_OLD = NOW - 10 * DAY    // 7 天窗外、30 天窗内

function makeFixture(): SqliteDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(':memory:') as unknown as SqliteDb
  const raw = db as unknown as { exec: (sql: string) => void; prepare: (sql: string) => { run: (...p: unknown[]) => unknown } }
  raw.exec(`
    create table session (id text primary key, parent_id text, directory text, title text,
      task_type text, time_created integer, time_updated integer);
    create table turn_usage (session_id text, turn_id text, status text, started_at integer,
      first_token_at integer, completed_at integer, duration_ms integer, time_to_first_token_ms integer,
      model_request_count integer, tool_call_count integer, tool_error_count integer,
      input_tokens integer, output_tokens integer, reasoning_tokens integer,
      cache_creation_input_tokens integer, cache_read_input_tokens integer,
      error_type text, error_code text, primary key(session_id, turn_id));
    create table model_usage (id integer primary key, turn_id text, session_id text,
      agent text, query_source text, provider_id text, model_id text, status text,
      started_at integer, input_tokens integer, output_tokens integer, reasoning_tokens integer,
      cache_creation_input_tokens integer, cache_read_input_tokens integer);
    create table tool_usage (id integer primary key, session_id text, turn_id text, tool_name text,
      status text, started_at integer, completed_at integer, duration_ms integer,
      read_only integer, destructive integer, approval_status text, output_bytes integer, error_type text);
  `)
  const ins = (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...p)
  ins('insert into session values (?,?,?,?,?,?,?)', 's1', null, '/w/a', '主线任务', 'interactive', T_RECENT - 3600_000, T_RECENT)
  ins('insert into session values (?,?,?,?,?,?,?)', 'sess_subagent_x', 's1', '/w/a', '子代理检索', 'subagent_child', T_RECENT - 1800_000, T_RECENT)
  ins('insert into session values (?,?,?,?,?,?,?)', 's_old', null, '/w/old', '   ', 'interactive', T_OLD - 3600_000, T_OLD)
  // 轮：s1 两轮（t2 更新且为 error 轮）；子代理一轮；旧会话一轮
  ins('insert into turn_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    's1', 't1', 'completed', T_RECENT - 5000, T_RECENT - 4800, T_RECENT - 1000, 4000, 200, 3, 2, 0, 3000, 300, 40, 0, 6000, null, null)
  ins('insert into turn_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    's1', 't2', 'error', T_RECENT - 500, null, T_RECENT - 400, 100, null, 1, 0, 0, 0, 0, 0, 0, 0, 'provider_error', 'E502')
  ins('insert into turn_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    'sess_subagent_x', 't3', 'completed', T_RECENT - 3000, null, T_RECENT - 2000, 1000, 500, 1, 0, 0, 500, 50, 10, 0, 100, null, null)
  ins('insert into turn_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    's_old', 't4', 'completed', T_OLD, null, T_OLD + 1000, 1000, 100, 1, 0, 0, 100, 10, 0, 0, 0, null, null)
  // 模型调用：t1 三次（GLM×2 + deepseek×1，全 main_turn）；t2 一次 error（deepseek）；
  // 子代理一次（订阅 provider）；旧会话一次
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    1, 't1', 's1', 'zcode-agent', 'main_turn', 'bigmodel-api', 'GLM-5.3', 'completed', T_RECENT - 4800, 1000, 100, 40, 0, 3000)
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    2, 't1', 's1', 'zcode-agent', 'main_turn', 'bigmodel-api', 'GLM-5.3', 'completed', T_RECENT - 4700, 1000, 100, 0, 0, 3000)
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    3, 't1', 's1', 'zcode-agent', 'main_turn', 'deepseek', 'deepseek-flash', 'completed', T_RECENT - 4600, 1000, 100, 0, 0, 0)
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    4, 't2', 's1', 'zcode-agent', 'main_turn', 'deepseek', 'deepseek-flash', 'error', T_RECENT - 450, 0, 0, 0, 0, 0)
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    5, 't3', 'sess_subagent_x', 'zcode-general-purpose', 'subagent', 'account:bigmodel-individual-coding-plan', 'GLM-5.3', 'completed', T_RECENT - 2900, 500, 50, 10, 0, 100)
  ins('insert into model_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    6, 't4', 's_old', 'zcode-agent', 'main_turn', 'bigmodel-api', 'GLM-5.3', 'completed', T_OLD, 100, 10, 0, 0, 0)
  // 工具：s1 三次（Bash/Edit/错误各一）；旧会话一次
  ins('insert into tool_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    1, 's1', 't1', 'Bash', 'completed', T_RECENT - 4700, T_RECENT - 4600, 100, 0, 0, 'allowed', 1024, null)
  ins('insert into tool_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    2, 's1', 't1', 'Edit', 'completed', T_RECENT - 4650, T_RECENT - 4600, 50, 1, 0, 'allowed', 512, null)
  ins('insert into tool_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    3, 's1', 't2', 'WebSearch', 'error', T_RECENT - 440, T_RECENT - 430, 10, 1, 0, 'allowed', 0, 'timeout')
  ins('insert into tool_usage values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    4, 's_old', 't4', 'Read', 'completed', T_OLD, T_OLD + 100, 100, 1, 0, 'allowed', 64, null)
  return db
}

function makeCtx(query: Record<string, unknown> = {}): Context {
  return { query, status: 200, body: undefined } as unknown as Context
}

function makeDeps(db: SqliteDb | null): ZcodeUsageDeps {
  return {
    exists: () => db != null,
    now: () => NOW,
    openSqlite: () => { if (!db) throw new Error('no db'); return db },
  }
}

let db: SqliteDb
beforeEach(() => { db = makeFixture() })

describe('纯函数：钳制与口径', () => {
  it('days ∈ {0,7,30}，其余归 30；limit 1..max；offset 非负', () => {
    expect(clampDays('7')).toBe(7)
    expect(clampDays('0')).toBe(0)
    expect(clampDays('99')).toBe(30)
    expect(clampDays(undefined)).toBe(30)
    expect(clampLimit('500', 30, 100)).toBe(100)
    expect(clampLimit(undefined, 30, 100)).toBe(30)
    expect(clampLimit('-3', 30, 100)).toBe(1)
    expect(clampOffset('-5')).toBe(0)
    expect(clampOffset('20')).toBe(20)
  })

  it('token 整形：reasoning 封顶到 output（防脏数据虚高）；计费=四项和', () => {
    const s = shapeTokenSums({ input_tokens: 100, output_tokens: 50, reasoning_tokens: 80, cache_creation_input_tokens: 10, cache_read_input_tokens: 200 })
    expect(s.reasoningTokens).toBe(50)
    expect(billedOf(s)).toBe(360)
  })

  it('缓存命中率：分母 0 = null', () => {
    expect(cacheHitRateOf(3000, 2000, 0)).toBeCloseTo(0.6)
    expect(cacheHitRateOf(0, 0, 0)).toBeNull()
  })
})

describe('GET /summary — 聚合', () => {
  it('7 天窗：KPI/byModel/byAgent/bySource/byDay 只含窗内行', () => {
    const ctx = makeCtx({ days: '7' })
    handleUsageSummary(ctx, makeDeps(db))
    const body = ctx.body as UsageSummary
    expect(body.days).toBe(7)
    expect(body.kpi.sessions).toBe(2)            // s1 + 子代理（s_old 在窗外）
    expect(body.kpi.turns).toBe(3)
    expect(body.kpi.modelCalls).toBe(5)          // t1×3 + t2×1 + t3×1
    expect(body.kpi.modelErrors).toBe(1)
    expect(body.kpi.toolCalls).toBe(3)
    expect(body.kpi.toolErrors).toBe(1)
    expect(body.kpi.turnErrors).toBe(1)
    expect(body.kpi.inputTokens).toBe(3500)      // 1000+1000+1000+0+500
    expect(body.kpi.outputTokens).toBe(350)      // 100+100+100+0+50
    expect(body.kpi.cacheReadTokens).toBe(6100)  // 3000+3000+0+0+100
    expect(body.kpi.billedTokens).toBe(9950)
    expect(body.kpi.cacheHitRate).toBeCloseTo(6100 / 9600)
    expect(body.kpi.activeMs).toBe(5000)         // t1 4000 + t3 1000（error 轮不计活跃）

    expect(body.byModel[0]).toMatchObject({ provider: 'bigmodel-api', model: 'GLM-5.3', calls: 2 })
    expect(body.byModel.map(m => m.model)).toContain('deepseek-flash')
    expect(body.byAgent).toEqual([
      { agent: 'zcode-agent', calls: 4, billedTokens: 9300 },
      { agent: 'zcode-general-purpose', calls: 1, billedTokens: 650 },
    ])
    expect(body.bySource).toEqual([
      { source: 'main_turn', calls: 4, billedTokens: 9300 },
      { source: 'subagent', calls: 1, billedTokens: 650 },
    ])
    expect(body.byDay).toHaveLength(1)           // 同一天（NOW-1d 正午 UTC）
    expect(body.byDay[0].modelCalls).toBe(5)
  })

  it('0=全部：含旧会话', () => {
    const ctx = makeCtx({ days: '0' })
    handleUsageSummary(ctx, makeDeps(db))
    const body = ctx.body as UsageSummary
    expect(body.fromMs).toBeNull()
    expect(body.kpi.sessions).toBe(3)
    expect(body.kpi.modelCalls).toBe(6)
    expect(body.byDay).toHaveLength(2)
  })

  it('库缺席：零值空态 + 说明，不造数据', () => {
    const ctx = makeCtx({})
    handleUsageSummary(ctx, makeDeps(null))
    const body = ctx.body as UsageSummary
    expect(body.kpi.modelCalls).toBe(0)
    expect(body.kpi.cacheHitRate).toBeNull()
    expect(body.note).toContain('未找到')
  })
})

describe('GET /sessions — 逐会话行', () => {
  it('join 元数据 + 用量聚合 + 子代理标记 + 标题缺省 + 按最近活跃倒序', () => {
    const ctx = makeCtx({})
    handleUsageSessions(ctx, makeDeps(db))
    const rows = (ctx.body as { sessions: UsageSessionRow[] }).sessions
    expect(rows.map(r => r.id)).toEqual(['s1', 'sess_subagent_x', 's_old'])
    const s1 = rows[0]
    expect(s1.title).toBe('主线任务')
    expect(s1.isSubagent).toBe(false)
    expect(s1.turns).toBe(2)
    expect(s1.modelCalls).toBe(4)
    expect(s1.toolCalls).toBe(3)
    expect(s1.turnErrors).toBe(1)
    expect(s1.billedTokens).toBe(9300)
    const sub = rows[1]
    expect(sub.isSubagent).toBe(true)
    expect(sub.parentId).toBe('s1')
    expect(sub.taskType).toBe('subagent_child')
    expect(rows[2].title).toBe('（未命名会话）')  // 空白标题占位
  })
})

describe('GET /sessions/:id/rounds — 逐轮账单', () => {
  it('轮倒序 + 轮内按模型分解 + TTFT 透传', () => {
    const ctx = makeCtx({})
    handleUsageRounds(ctx, 's1', makeDeps(db))
    const rounds = (ctx.body as { rounds: UsageRoundRow[] }).rounds
    expect(rounds.map(r => r.turnId)).toEqual(['t2', 't1'])
    const t2 = rounds[0]
    expect(t2.status).toBe('error')
    expect(t2.errorCode).toBe('E502')
    expect(t2.ttftMs).toBeNull()
    const t1 = rounds[1]
    expect(t1.status).toBe('completed')
    expect(t1.ttftMs).toBe(200)
    expect(t1.modelRequestCount).toBe(3)
    expect(t1.models).toEqual([
      { provider: 'bigmodel-api', model: 'GLM-5.3', calls: 2, inputTokens: 2000, outputTokens: 200, reasoningTokens: 40, cacheWriteTokens: 0, cacheReadTokens: 6000, billedTokens: 8200 },
      { provider: 'deepseek', model: 'deepseek-flash', calls: 1, inputTokens: 1000, outputTokens: 100, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, billedTokens: 1100 },
    ])
  })

  it('无轮会话：空数组（不报错）', () => {
    const ctx = makeCtx({})
    handleUsageRounds(ctx, 'nope', makeDeps(db))
    expect((ctx.body as { rounds: UsageRoundRow[] }).rounds).toEqual([])
  })
})

describe('GET /sessions/:id/tools — 工具时间线', () => {
  it('倒序 + 标记布尔化 + 错误透传', () => {
    const ctx = makeCtx({})
    handleUsageTools(ctx, 's1', makeDeps(db))
    const tools = (ctx.body as { tools: UsageToolRow[] }).tools
    expect(tools.map(t => t.toolName)).toEqual(['WebSearch', 'Edit', 'Bash'])
    expect(tools[0].status).toBe('error')
    expect(tools[0].errorType).toBe('timeout')
    expect(tools[1].readOnly).toBe(true)
    expect(tools[2].readOnly).toBe(false)
    expect(tools[2].outputBytes).toBe(1024)
  })
})
