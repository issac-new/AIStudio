// overlay/custom/client/ia2/__tests__/run-display.test.ts
// 运行标识产品化（2026-10-19 走查批）：目录名不直接进界面，只显示可读日期。
import { describe, expect, it } from 'vitest'
import { runDisplayName, runShortLabel } from '../run-display'

describe('run-display — 运行标识产品化', () => {
  it('标准目录名 → 年月日运行', () => {
    expect(runDisplayName('20261017-v8-run21')).toBe('2026 年 10 月 17 日运行')
    expect(runShortLabel('20261017-v8-run21')).toBe('10/17 运行')
  })

  it('去掉前导零（月/日不显示 01）', () => {
    expect(runDisplayName('20260105-v8-run3')).toBe('2026 年 1 月 5 日运行')
    expect(runShortLabel('20260105-v8-run3')).toBe('1/5 运行')
  })

  it('导演 run → 域名称，不把长机读 ID 放首屏', () => {
    expect(runDisplayName('run-sim-director-abc-1')).toBe('导演运行')
    expect(runShortLabel('run-sim-director-abc-1')).toBe('导演运行')
  })

  it('非日期形态原样透出（不编造日期）', () => {
    expect(runDisplayName('cli-run')).toBe('cli-run')
    expect(runShortLabel('cli-run')).toBe('cli-run')
    expect(runDisplayName('')).toBe('')
  })
})
