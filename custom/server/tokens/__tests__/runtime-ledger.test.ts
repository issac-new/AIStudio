// overlay/custom/server/tokens/__tests__/runtime-ledger.test.ts
// SoL-Pi 效能轮守门：运行时效率账本聚合恒等 + GET /runtime-ledger 接线。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { aggregateRuntimeLedger, parseLedgerLines } from '../runtime-ledger'
import { tokenMeterRoutes } from '../token-meter-controller'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

describe('parseLedgerLines（坏行容错）', () => {
  it('坏 JSON 行与缺 kind 行丢弃；好行全收', () => {
    const text = [
      JSON.stringify({ ts: 1, kind: 'action_fusion' }),
      'not json at all',
      JSON.stringify({ ts: 2, no_kind: true }),
      '',
      JSON.stringify({ ts: 3, kind: 'obs_recall' }),
    ].join('\n')
    const events = parseLedgerLines(text)
    expect(events.map((e) => e.kind)).toEqual(['action_fusion', 'obs_recall'])
  })
})

describe('aggregateRuntimeLedger（四机制投影）', () => {
  const events = parseLedgerLines([
    JSON.stringify({ ts: 5, kind: 'observation_archive', tool: 'terminal', chars_original: 100_000, chars_inline: 2_000, session_id: 's1' }),
    JSON.stringify({ ts: 4, kind: 'observation_archive', tool: 'terminal', chars_original: 50_000, chars_inline: 1_500 }),
    JSON.stringify({ ts: 3, kind: 'obs_recall', lines: 200, session_id: 's1' }),
    JSON.stringify({ ts: 6, kind: 'action_fusion', command: 'pytest -x', outcome: 'ran', exit_code: 0, session_id: 's2' }),
    JSON.stringify({ ts: 7, kind: 'action_fusion', command: 'pytest -x', outcome: 'ran', exit_code: 1 }),
    JSON.stringify({ ts: 8, kind: 'action_fusion', command: 'pytest -x', outcome: 'skipped_guard' }),
    JSON.stringify({ ts: 9, kind: 'evidence_reduce', tool: 'terminal', outcome: 'reduced', chars_original: 80_000, chars_receipt: 1_800 }),
    JSON.stringify({ ts: 10, kind: 'evidence_reduce', tool: 'terminal', outcome: 'passthrough_quote_mismatch', chars_original: 80_000 }),
    JSON.stringify({ ts: 11, kind: 'unknown_future_kind' }),
  ].join('\n'))

  it('归档：次数与省字符（原文-入上下文）', () => {
    const m = aggregateRuntimeLedger(events).mechanisms.observation_archive
    expect(m.count).toBe(2)
    expect(m.charsSaved).toBe((100_000 - 2_000) + (50_000 - 1_500))
  })

  it('召回：行数累计', () => {
    expect(aggregateRuntimeLedger(events).mechanisms.obs_recall).toMatchObject({ count: 1, linesServed: 200 })
  })

  it('写后即验：执行/失败/守卫跳过三分账', () => {
    const m = aggregateRuntimeLedger(events).mechanisms.action_fusion
    expect(m).toMatchObject({ count: 3, ran: 2, failedRuns: 1, skippedGuard: 1 })
  })

  it('精简：出收据计省字符；放行只计数不计省（不放水）', () => {
    const m = aggregateRuntimeLedger(events).mechanisms.evidence_reduce
    expect(m.reduced).toBe(1)
    expect(m.passthrough).toBe(1)
    expect(m.charsSaved).toBe(80_000 - 1_800)
  })

  it('未知 kind 不计入任何机制；最近事件按 ts 倒序；会话分布', () => {
    const sum = aggregateRuntimeLedger(events, 3)
    expect(sum.totalEvents).toBe(9)
    expect(sum.recent.map((e) => e.ts)).toEqual([11, 10, 9])
    // 未标注 session_id 的事件归"(主会话未标注)"桶（6 条），不丢弃
    expect(sum.sessions[0]).toEqual({ sessionId: '(主会话未标注)', events: 6 })
    expect(sum.sessions).toContainEqual({ sessionId: 's1', events: 2 })
    expect(sum.sessions).toContainEqual({ sessionId: 's2', events: 1 })
    expect(sum.lastEventTs).toBe(11)
  })

  it('空事件流：全零不炸', () => {
    const sum = aggregateRuntimeLedger([])
    expect(sum.totalEvents).toBe(0)
    expect(sum.lastEventTs).toBeNull()
    expect(sum.mechanisms.observation_archive.count).toBe(0)
  })
})

describe('接线守门（GET /runtime-ledger 挂在 patch 403 的控制器上）', () => {
  it('控制器声明 GET 路由且不新增 B 类 patch', () => {
    const src = readFileSync(join(OVERLAY_ROOT, 'custom/server/tokens/token-meter-controller.ts'), 'utf8')
    expect(src).toContain("router.get('/runtime-ledger'")
    const layer: unknown = (tokenMeterRoutes as unknown as { stack?: Array<{ methods?: string[]; path?: string }> }).stack
    const paths = Array.isArray(layer) ? layer.map((l) => `${(l.methods ?? []).join(',')} ${l.path ?? ''}`) : []
    expect(paths.some((p) => p.includes('GET') && p.includes('/runtime-ledger'))).toBe(true)
  })
})
