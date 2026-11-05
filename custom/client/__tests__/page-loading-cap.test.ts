// @vitest-environment jsdom
// overlay/custom/client/__tests__/page-loading-cap.test.ts
// Win 回归 N04 守门（patch 752）：PageLoading 统一最长遮挡上限。
//   1) pending 持续超上限（默认 10s）→ overlay 消隐、内容放行；
//   2) cap 放行不是终态：pending 复真会重新遮挡（cappedHide 每段加载独立复位）；
//   3) VITE_PAGE_LOADING_MAX_MS=0 → 不设限；
//   4) initialOnly 下 cap 不置 initialLoadComplete——数据晚到时真实的「首显完成」
//      仍由渲染收口路径落，cap 不吞后续加载的遮挡能力。
// 源码级注释：vendor PageLoading.vue（a/ b/ 前缀=packages/client，patch 752）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readVendor = (rel: string): string =>
  readFileSync(resolve(__dirname, '../../../vendor/hermes-studio/packages/client/src', rel), 'utf8')

async function freshPageLoading() {
  vi.resetModules()
  const mod = await import('@/components/common/PageLoading.vue')
  return mod.default
}

async function mountOverlay(PageLoading: any, props: Record<string, unknown> = {}) {
  return mount(PageLoading, {
    props: { show: true, ...props },
    slots: { default: () => h('div', { class: 'pl-body' }, '内容') },
  })
}

const overlayOf = (w: any) => w.find('.page-loading-overlay')
const contentHidden = (w: any) => w.find('.page-loading-content').classes().includes('page-loading-content--hidden')

describe('PageLoading 统一遮挡上限（patch 752 / Win N04）', () => {
  beforeEach(() => {
    // 只伪造 setTimeout/clearTimeout：组件其余路径用 performance.now（真实走时，
    // 虚拟推进下 arm 时 elapsed≈0 → 延迟即全量上限，判定不受影响）；伪造 performance
    // 会污染 vitest 自身计时（实测单用例虚报 13s 墙钟）。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('源码锚：上限常量与 cap 逻辑在 vendor 组件内（防补丁漂移）', () => {
    const src = readVendor('components/common/PageLoading.vue')
    expect(src).toContain('PAGE_LOADING_MAX_MS')
    expect(src).toContain('VITE_PAGE_LOADING_MAX_MS')
    expect(src).toContain('cappedHide')
    expect(src).toContain('armCap()')
  })

  it('pending 超 10s 上限 → overlay 消隐、内容放行', async () => {
    const PageLoading = await freshPageLoading()
    const w = await mountOverlay(PageLoading)
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
    expect(contentHidden(w)).toBe(true)
    vi.advanceTimersByTime(10_000)
    await nextTick()
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
    expect(contentHidden(w)).toBe(false)
  })

  it('cap 放行后 pending 复真 → 重新遮挡（每段加载独立计）', async () => {
    const PageLoading = await freshPageLoading()
    const w = await mountOverlay(PageLoading)
    await nextTick()
    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
    // 数据短暂落地又发起下一轮加载：hide 收口路径因 sequence 递增被取消，重新遮挡
    await w.setProps({ show: false })
    await nextTick()
    await w.setProps({ show: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
    expect(contentHidden(w)).toBe(true)
  })

  it('VITE_PAGE_LOADING_MAX_MS=0 → 不设限（60s 仍遮挡）', async () => {
    vi.stubEnv('VITE_PAGE_LOADING_MAX_MS', '0')
    const PageLoading = await freshPageLoading()
    const w = await mountOverlay(PageLoading)
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
    expect(contentHidden(w)).toBe(true)
  })

  it('initialOnly：cap 不置首显完成——cap 放行后 pending 快速复真仍重新遮挡', async () => {
    const PageLoading = await freshPageLoading()
    const w = await mountOverlay(PageLoading, { initialOnly: true })
    await nextTick()
    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(overlayOf(w).exists()).toBe(false)
    // 若 cap 误置 initialLoadComplete，pending computed 恒 false → 不可能重新遮挡
    await w.setProps({ show: false })
    await nextTick()
    await w.setProps({ show: true })
    await nextTick()
    expect(overlayOf(w).exists()).toBe(true)
  })
})
