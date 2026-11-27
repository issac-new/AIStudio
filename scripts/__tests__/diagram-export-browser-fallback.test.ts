// 导图导出的浏览器回退链（2026-11-27）：bundled chromium → 系统 Chrome → 系统 Edge。
import { describe, it, expect, vi } from 'vitest'
import { launchBrowser } from '../diagram-export-png.mjs'

describe('导图导出的浏览器回退链', () => {
  it('自带浏览器可用：只用它，不带 channel', async () => {
    const browser = { close: async () => {} }
    const chromium = { launch: vi.fn().mockResolvedValue(browser) }
    expect(await launchBrowser(chromium as never, () => {})).toBe(browser)
    expect(chromium.launch.mock.calls).toEqual([[undefined]])
  })

  it('自带浏览器失败 → 回退系统 Chrome', async () => {
    const browser = {}
    const chromium = { launch: vi.fn().mockRejectedValueOnce(new Error('no bundled executable')).mockResolvedValue(browser) }
    expect(await launchBrowser(chromium as never, () => {})).toBe(browser)
    expect(chromium.launch.mock.calls).toEqual([[undefined], [{ channel: 'chrome' }]])
  })

  it('自带浏览器与系统 Chrome 都失败 → 回退系统 Edge', async () => {
    const browser = {}
    const chromium = { launch: vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue(browser) }
    expect(await launchBrowser(chromium as never, () => {})).toBe(browser)
    expect(chromium.launch.mock.calls).toEqual([[undefined], [{ channel: 'chrome' }], [{ channel: 'msedge' }]])
  })

  it('三级都失败：抛错并带安装指引，不直接退出进程；每级失败只记一行原因（只取首行）', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('不应退出进程') }) as never)
    const lines: string[] = []
    const chromium = {
      launch: vi.fn()
        .mockRejectedValueOnce(new Error('bundled down\n    at frame'))
        .mockRejectedValueOnce(new Error('chrome down\n    at frame'))
        .mockRejectedValueOnce(new Error('edge down\n    at frame')),
    }
    await expect(launchBrowser(chromium as never, (l: string) => lines.push(l))).rejects.toThrow('npx playwright install chromium')
    expect(lines).toHaveLength(3)
    expect(lines.join(' ')).not.toContain('at frame')
    expect(lines[2]).toContain('没有可回退的浏览器')
    expect(exit).not.toHaveBeenCalled()
    exit.mockRestore()
  })
})
