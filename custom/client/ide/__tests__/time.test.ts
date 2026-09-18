// overlay/custom/client/ide/__tests__/time.test.ts
// 相对时间与 workspace 显示名的纯函数守门（秒/毫秒自适应、跨年日期、空值）。
import { describe, it, expect } from 'vitest'
import { formatRelativeTime, workspaceLabel } from '../utils/time'

const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

const NOW = new Date('2026-09-18T12:00:00').getTime()

describe('formatRelativeTime', () => {
  it('秒级时间戳自动转毫秒；<60s 显示刚刚', () => {
    const secTs = Math.floor(NOW / 1000) - 30
    expect(formatRelativeTime(t, secTs, NOW)).toBe('ide.task.justNow')
  })

  it('分钟/小时/天分级（{count} 插值）', () => {
    expect(formatRelativeTime(t, NOW - 5 * 60_000, NOW)).toBe('ide.task.minutesAgo:{"count":5}')
    expect(formatRelativeTime(t, NOW - 3 * 3_600_000, NOW)).toBe('ide.task.hoursAgo:{"count":3}')
    expect(formatRelativeTime(t, NOW - 2 * 86_400_000, NOW)).toBe('ide.task.daysAgo:{"count":2}')
  })

  it('≥7 天给 MM-DD；跨年带年份', () => {
    expect(formatRelativeTime(t, new Date('2026-09-01').getTime(), NOW)).toBe('09-01')
    expect(formatRelativeTime(t, new Date('2025-12-31').getTime(), NOW)).toBe('2025-12-31')
  })

  it('未来时间与空值兜底', () => {
    expect(formatRelativeTime(t, NOW + 60_000, NOW)).toBe('ide.task.justNow')
    expect(formatRelativeTime(t, 0, NOW)).toBe('')
  })
})

describe('workspaceLabel', () => {
  it('取路径末段；空值回退默认分组；尾斜杠忽略', () => {
    expect(workspaceLabel(t, '/Volumes/lab/ncwk')).toBe('ncwk')
    expect(workspaceLabel(t, '/home/user/proj/')).toBe('proj')
    expect(workspaceLabel(t, null)).toBe('ide.task.defaultGroup')
    expect(workspaceLabel(t, '   ')).toBe('ide.task.defaultGroup')
    expect(workspaceLabel(t, '/根目录项目')).toBe('根目录项目')
  })
})
