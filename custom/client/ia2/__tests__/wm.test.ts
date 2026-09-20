// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/wm.test.ts
// 窗口管理守门（2026-09-18 统一导航 /goal 追加；2026-09-20 v12.3 收窄）：
// - popout 工具：standalone query 合并/剥离、web 降级 window.open、
//   合并回流 storage 事件（含无效信号容错）
// - wm store（最小化任务栏）已随 v12.3 窗控改栏控退役——max=1 最小化
//   链路删除，仅剩独立窗口 popout 链路在此守门
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  withStandaloneQuery,
  stripStandaloneQuery,
  openPanelWindow,
  listenMergeBack,
  requestMergeBack,
  MERGE_BACK_KEY,
} from '../wm/popout'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.open = vi.fn()
})

describe('popout 工具 — standalone query 处理', () => {
  it('无 query 路径追加 standalone=1', () => {
    expect(withStandaloneQuery('/app/ops')).toBe('/app/ops?standalone=1')
  })

  it('既有 query 保留并追加（tab 不丢）', () => {
    expect(withStandaloneQuery('/app/ops?tab=runs')).toBe('/app/ops?tab=runs&standalone=1')
  })

  it('剥离 standalone 时保留其余 query', () => {
    expect(stripStandaloneQuery('/app/ops?tab=runs&standalone=1')).toBe('/app/ops?tab=runs')
  })

  it('非 / 开头路径原样返回（防御）', () => {
    expect(withStandaloneQuery('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
})

describe('popout 工具 — 弹出与回流', () => {
  it('web 降级：desktopBridge 缺席时 window.open 承载 standalone 路由', async () => {
    await openPanelWindow({ path: '/app/ops?tab=runs' })
    expect(window.open).toHaveBeenCalledTimes(1)
    const [url, target, features] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('#/app/ops?tab=runs&standalone=1')
    expect(target).toBe('_blank')
    expect(features).toContain('width=1100')
    expect(features).toContain('height=720')
  })

  it('合并回流：storage 事件携带路径触发处理器，取消后不再触发', () => {
    const handler = vi.fn()
    const off = listenMergeBack(handler)
    localStorage.setItem(MERGE_BACK_KEY, JSON.stringify({ path: '/app/ops?tab=runs', at: 1 }))
    window.dispatchEvent(new StorageEvent('storage', {
      key: MERGE_BACK_KEY,
      newValue: JSON.stringify({ path: '/app/ops?tab=runs', at: 1 }),
    }))
    expect(handler).toHaveBeenCalledWith('/app/ops?tab=runs')
    off()
    window.dispatchEvent(new StorageEvent('storage', {
      key: MERGE_BACK_KEY,
      newValue: JSON.stringify({ path: '/app/eng', at: 2 }),
    }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('回流容错：非本 key / 畸形 JSON / 非 / 开头路径一律忽略', () => {
    const handler = vi.fn()
    const off = listenMergeBack(handler)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other:key', newValue: 'x' }))
    window.dispatchEvent(new StorageEvent('storage', { key: MERGE_BACK_KEY, newValue: '{bad' }))
    window.dispatchEvent(new StorageEvent('storage', {
      key: MERGE_BACK_KEY,
      newValue: JSON.stringify({ path: 'javascript:alert(1)' }),
    }))
    expect(handler).not.toHaveBeenCalled()
    off()
  })

  it('requestMergeBack：写剥离 standalone 的信号并自关窗口', () => {
    const close = vi.fn()
    vi.spyOn(window, 'close').mockImplementation(close)
    requestMergeBack('/app/ops?tab=runs&standalone=1')
    expect(JSON.parse(localStorage.getItem(MERGE_BACK_KEY) ?? '{}').path).toBe('/app/ops?tab=runs')
    expect(close).toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
