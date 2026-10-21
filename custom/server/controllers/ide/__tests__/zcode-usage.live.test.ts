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
  handleUsageRounds, handleUsageSessions, handleUsageSummary, handleUsageTools,
  type UsageRoundRow, type UsageSessionRow, type UsageSummary, type UsageToolRow,
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
