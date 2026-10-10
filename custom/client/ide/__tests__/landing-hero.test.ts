// overlay/custom/client/ide/__tests__/landing-hero.test.ts
// 守门：裸落地引导空态（run13 步18 错帧修复配套产品面）。
// ① 判定纯函数 shouldShowLandingHero（IdeShell 组合与测试同源）
// ② IdeLandingHero 渲染与交互（速选/进入/空板文案）
// ③ patch 588（agents/status 轮询 403 静默降级，与 587 服务端 availability 方案互补）注册与内容守卫
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { shouldShowLandingHero } from '../utils/landingHero'
import IdeLandingHero from '../components/IdeLandingHero.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k }) }))

const PATCH_FILE = resolve(__dirname, '../../../../patches/588-client-agent-status-forbidden-silent.patch')
const SERIES = resolve(__dirname, '../../../../patches/series')

describe('shouldShowLandingHero 判定（纯函数）', () => {
  const base = { activeTaskId: null, queryTask: null, querySession: null, engaged: false }
  it('裸落地（无任何上下文）→ 显示', () => {
    expect(shouldShowLandingHero(base)).toBe(true)
  })
  it('深链 ?task / ?session / 已激活任务 → 不显示', () => {
    expect(shouldShowLandingHero({ ...base, queryTask: 'DEV-PAYCORE-S' })).toBe(false)
    expect(shouldShowLandingHero({ ...base, querySession: 's_1' })).toBe(false)
    expect(shouldShowLandingHero({ ...base, activeTaskId: 't_1' })).toBe(false)
  })
  it('空串 query 视为无上下文；engage 后本次访问不再打扰', () => {
    expect(shouldShowLandingHero({ ...base, queryTask: '' })).toBe(true)
    expect(shouldShowLandingHero({ ...base, engaged: true })).toBe(false)
  })
})

describe('IdeLandingHero 渲染与交互', () => {
  const tasks = [
    { id: 'DEV-PAYCORE-S', title: 'csw-pay-core 状态机+幂等', status: '进行中' },
    { id: 'T-05', title: 'run13 终判核验', status: '阻塞' },
  ]

  it('渲染最近任务速选；点击任务 emit pick', async () => {
    const w = mount(IdeLandingHero, { props: { tasks } })
    const btn = w.find('[data-testid="ide-landing-task-DEV-PAYCORE-S"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('csw-pay-core 状态机+幂等')
    await btn.trigger('click')
    expect(w.emitted('pick')?.[0]).toEqual(['DEV-PAYCORE-S'])
  })

  it('空板显示空态引导文案；进入按钮 emit enter', async () => {
    const w = mount(IdeLandingHero, { props: { tasks: [] } })
    expect(w.find('[data-testid="ide-landing-enter"]').exists()).toBe(true)
    expect(w.text()).toContain('暂无任务')
    await w.find('[data-testid="ide-landing-enter"]').trigger('click')
    expect(w.emitted('enter')).toHaveLength(1)
  })
})

describe('patch 588 agents/status 轮询 403 静默降级', () => {
  it('patch 文件存在且注册于 series', () => {
    expect(existsSync(PATCH_FILE)).toBe(true)
    expect(readFileSync(SERIES, 'utf8')).toContain('588-client-agent-status-forbidden-silent.patch')
  })

  it('patch 内容守卫：两个状态端点都豁免全局 forbidden 弹窗', () => {
    const patch = readFileSync(PATCH_FILE, 'utf8')
    expect(patch).toContain("path.startsWith('/api/agents/status')")
    expect(patch).toContain("path.startsWith('/api/agents/availability')")
    // 只豁免弹窗，不清会话不清登录态（与 401/禁用用户的处理区分）
    expect(patch).not.toContain('clearAuthSessionState')
  })
})
