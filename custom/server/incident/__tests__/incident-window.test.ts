import { describe, it, expect } from 'vitest'
import { runWindowFromSessionId } from '../incident-sources'
// A7（2026-10-16 run20 复盘）：事故报告 17 要素聚合窗口跨天修复守门。
// 修的四件：①state.env 真窗优先（run_started_at→now+2h 缓冲）②无 state 回落 48h
// 保守窗（旧实现单日窗切掉跨天轮首尾——run20 42.5h 轮 17 要素 15 absent 根因之一）
// ③主库 total=0 也走 profile 聚合回退（旧判据 !messages 恒 false）④content NULL
// 兜底（工具消息 content 列为 NULL 崩 slice）。实修：run20 要素 collected 12→3 项
// 未采（15→14 absent，message_history/effective_autonomy 转 collected）。
// 边界（未修，如实挂账）：trace span 落盘与推演身份册供给属 hermes 侧数据面
// （SIM 树无 traces/、15 AI 员工身份未在 SIM 侧注册），依赖 hermes 侧 telemetry。
describe('A7 窗口', () => {
  it('跨天轮次：state.env 真窗优先', () => {
    const w = runWindowFromSessionId('20261015-v8-run20', { stateEnvPath: '/Users/cuishi/lab/ncwk-sim-mux/runs/20261015-v8-run20/state.env', nowSec: 1792172511 })
    expect(w).not.toBeNull()
    expect(w!.sinceSec).toBe(1791969313)  // run20 真起点（跨天，非当天 00:00）
    expect(w!.untilSec).toBeGreaterThan(1792172511)
  })
  it('回落：无 state 时 48h 保守窗（覆盖跨天）', () => {
    const w = runWindowFromSessionId('20261015-v8-run20', { stateEnvPath: '/nonexistent/state.env', nowSec: 1792172511 })
    expect(w!.untilSec - w!.sinceSec).toBe(48 * 3600)
  })
})
