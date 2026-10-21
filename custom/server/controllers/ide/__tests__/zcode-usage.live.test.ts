// 本机 zcode 用量库真机探针（2026-10-21 dsh-context 数据面吸收轮）：对真实
// ~/.zcode/cli/db/db.sqlite 断言四个端点的聚合非空、TTFT 有真值、缓存命中率
// 在 0-1 区间——真实工具链先行（spec 验证节）。无库环境（CI）自动 skip；
// ZCODE_CLI_DB 可指夹具库复跑。
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'koa'
import {
  handleUsageContext, handleUsageRounds, handleUsageSessions, handleUsageSummary, handleUsageTools,
  type UsageContext, type UsageRoundRow, type UsageSessionRow, type UsageSummary, type UsageToolRow,
} from '../zcode-usage'

const dbPath = process.env.ZCODE_CLI_DB?.trim() || join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite')

function ctx(): Context {
  return { query: {}, status: 200, body: undefined } as unknown as Context
}

describe.skipIf(!existsSync(dbPath))('zcode-usage 真库探针', () => {
  it('summary(30)：KPI 非空、byModel 覆盖多模型、缓存命中率合法', () => {
    const c = ctx()
    handleUsageSummary(c)
    const body = c.body as UsageSummary
    expect(body.kpi.modelCalls).toBeGreaterThan(0)
    expect(body.kpi.sessions).toBeGreaterThan(0)
    expect(body.byModel.length).toBeGreaterThan(1)
    if (body.kpi.cacheHitRate != null) {
      expect(body.kpi.cacheHitRate).toBeGreaterThanOrEqual(0)
      expect(body.kpi.cacheHitRate).toBeLessThanOrEqual(1)
    }
    expect(body.byDay.length).toBeGreaterThan(0)
    expect(body.bySource.map(s => s.source)).toContain('main_turn')
  }, 60_000)

  it('sessions：首行字段齐全且可作 rounds/tools 的输入', () => {
    const c = ctx()
    handleUsageSessions(c)
    const rows = (c.body as { sessions: UsageSessionRow[] }).sessions
    expect(rows.length).toBeGreaterThan(0)
    const s = rows[0]
    expect(s.turns).toBeGreaterThan(0)
    expect(s.billedTokens).toBeGreaterThan(0)
  }, 60_000)

  it('rounds/tools：真会话有轮有 TTFT 真值、工具有时间线', () => {
    const cs = ctx()
    handleUsageSessions(cs)
    const first = (cs.body as { sessions: UsageSessionRow[] }).sessions[0]
    const cr = ctx()
    handleUsageRounds(cr, first.id)
    const rounds = (cr.body as { rounds: UsageRoundRow[] }).rounds
    expect(rounds.length).toBeGreaterThan(0)
    expect(rounds.some(r => r.ttftMs != null && r.ttftMs > 0)).toBe(true)
    const ct = ctx()
    handleUsageTools(ct, first.id)
    const tools = (ct.body as { tools: UsageToolRow[] }).tools
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.some(t => t.readOnly)).toBe(true)
  }, 60_000)
})

describe.skipIf(!existsSync(dbPath))('zcode-context 真库探针（Phase 2）', () => {
  it('context：requests 精确值非空/构成六类折叠/压缩事件可数', () => {
    const cs = ctx()
    handleUsageSessions(cs)
    const first = (cs.body as { sessions: UsageSessionRow[] }).sessions[0]
    const c = ctx()
    handleUsageContext(c, first.id)
    const body = c.body as UsageContext
    expect(body.requests.length).toBeGreaterThan(0)
    expect(body.requests[0].promptTokens).toBeGreaterThan(0)
    const keys = body.est.categories.map(x => x.key)
    expect(keys).toEqual(expect.arrayContaining(['user-text', 'assistant-text', 'reasoning', 'tool']))
    expect(body.est.estTotalTokens).toBeGreaterThan(0)
    expect(body.largest.length).toBeGreaterThan(0)
    expect(body.largest[0].preview.length).toBeLessThanOrEqual(120)
    // 压缩事件可为 0，但字段形状必须稳定
    body.compactions.forEach(cp => {
      expect(typeof cp.at).toBe('number')
      expect(typeof cp.trigger).toBe('string')
    })
  }, 120_000)
})
