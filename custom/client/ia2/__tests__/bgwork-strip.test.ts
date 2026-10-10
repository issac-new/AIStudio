// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/bgwork-strip.test.ts
// 后台工作条根治轮守门（2026-10-10）：单行纪律（nowrap 禁 wrap 撑高）+ agent
// 自适应限量（+N chip 悬浮全量名单、点击跳看板）+ 运行态长 chip 单行省略。
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/custom/ia2/composables/useAgentActivity', () => ({
  useAgentActivity: () => ({
    activity: ref<Record<string, { lastActiveAt: number }>>({}),
    activeProfiles: ref(['fanfan', 'chen', 'hu', 'lin', 'xiao', 'qi']),
    releaseAgentActivity: () => {},
  }),
}))
vi.mock('@/custom/ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import BackgroundWorkStrip from '../components/BackgroundWorkStrip.vue'

function stubLayout(offsets: number, client: number): () => void {
  const off = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const cli = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => offsets })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client })
  return () => {
    if (off) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', off)
    if (cli) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cli)
  }
}

describe('BackgroundWorkStrip — 单行纪律+自适应限量（2026-10-10 根治轮）', () => {
  it('量不到宽度（jsdom 缺省）→ agent chip 全显示、无 +N', async () => {
    const w = mount(BackgroundWorkStrip)
    await new Promise(r => setTimeout(r, 0))
    // 无 run 数据（auth-fetch mock 未兑现）→ 条仍因活跃 agent 显示
    expect(w.find('[data-testid="bgwork-strip"]').exists()).toBe(true)
    expect(w.findAll('.bgwork-strip > .bchip--agent')).toHaveLength(6)
    expect(w.find('[data-testid="bgwork-more"]').exists()).toBe(false)
    w.unmount()
  })

  it('放不下 → agent 前缀切片 + 「+N」（悬浮全量名单）', async () => {
    // 每 chip 100、容器 300：live=100 + reserved 预算后仅容 1 个 agent chip
    const restore = stubLayout(100, 300)
    try {
      const w = mount(BackgroundWorkStrip)
      await new Promise(r => setTimeout(r, 0))
      const more = w.find('[data-testid="bgwork-more"]')
      expect(more.exists()).toBe(true)
      expect(more.text()).toBe('+5')
      expect(more.attributes('title')).toContain('chen')
      w.unmount()
    } finally { restore() }
  })

  it('守门：单行纪律与省略号锚（根治轮回归防线）', () => {
    const vue = readFileSync(resolve(__dirname, '../components/BackgroundWorkStrip.vue'), 'utf8')
    const style = vue.slice(vue.indexOf('<style'))
    expect(style).toContain('flex-wrap: nowrap')
    expect(style).toContain('text-overflow: ellipsis')
    expect(style).toContain('max-width: 46%')
    // 测量行存在且脱流
    expect(style).toContain('.bgwork__measure')
    expect(style).toContain('position: absolute')
  })
})
