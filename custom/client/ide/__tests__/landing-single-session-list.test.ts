// overlay/custom/client/ide/__tests__/landing-single-session-list.test.ts
// 守门（产品一致性 Task 11 · 中央唯一会话列表）：
// ① 判定纯函数 shouldShowLandingHero（IdeShell 组合与测试同源）
// ② IdeLandingHero 渲染与交互（速选/进入/空板文案——「尚未选择」语义，不把
//    没有选中写成没有数据）
// ③ 中央不重复 CLI 会话列表：IdeLandingHero 不再内嵌 IdeCliSessions（左侧
//    任务栏已有同屏列表），侧栏 CLI 行动作（账单/终端继续/复制 ID）保留
// ④ patch 588（agents/status 轮询 403 静默降级）注册与内容守卫
// （landing-hero.test.ts 9 例契约等价迁移至此，2026-10-27）
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { shouldShowLandingHero } from '../utils/landingHero'
import IdeLandingHero from '../components/IdeLandingHero.vue'
import { expectLocaleKeys } from '../../__tests__/helpers/locale-tree'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k }) }))

const PATCH_FILE = resolve(__dirname, '../../../../patches/588-client-agent-status-forbidden-silent.patch')
const SERIES = resolve(__dirname, '../../../../patches/series')
const HERO_SRC = resolve(__dirname, '../components/IdeLandingHero.vue')
const SIDEBAR_SRC = resolve(__dirname, '../views/IdeTaskSidebar.vue')
const CLI_SRC = resolve(__dirname, '../components/IdeCliSessions.vue')

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
  it('左栏已选会话（activeSessionId 非空）→ 不再用引导页占住中栏', () => {
    expect(shouldShowLandingHero({ ...base, hasActiveSession: true })).toBe(false)
    expect(shouldShowLandingHero({ ...base, hasActiveSession: false })).toBe(true)
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

  it('空板显示「尚未选择」空态引导；进入按钮 emit enter', async () => {
    const w = mount(IdeLandingHero, { props: { tasks: [] } })
    expect(w.find('[data-testid="ide-landing-enter"]').exists()).toBe(true)
    // 「尚未选择任务或会话」语义：没有选中 ≠ 没有数据（设计契约）
    expect(w.text()).toContain('尚未选择任务或会话')
    expect(w.text()).toContain('从看板选一张卡')
    expect(w.text()).not.toContain('暂无任务')
    await w.find('[data-testid="ide-landing-enter"]').trigger('click')
    expect(w.emitted('enter')).toHaveLength(1)
  })

  it('空板给「从看板选一张任务」出口，emit board（2026-10-19 P1-4）', async () => {
    const w = mount(IdeLandingHero, { props: { tasks: [] } })
    const board = w.find('[data-testid="ide-landing-board"]')
    expect(board.exists()).toBe(true)
    await board.trigger('click')
    expect(w.emitted('board')).toHaveLength(1)
    // 有最近任务时不显示该出口（速选已覆盖）
    const withTasks = mount(IdeLandingHero, { props: { tasks } })
    expect(withTasks.find('[data-testid="ide-landing-board"]').exists()).toBe(false)
  })
})

describe('中央唯一 CLI 会话列表（Task 11 去重）', () => {
  it('IdeLandingHero 不内嵌 CLI 会话列表（左侧任务栏已有同屏列表）', () => {
    const w = mount(IdeLandingHero, { props: { tasks: [] } })
    expect(w.find('[data-testid="ide-cli-sessions"]').exists()).toBe(false)
    const src = readFileSync(HERO_SRC, 'utf8')
    expect(src).not.toContain("from './IdeCliSessions.vue'")
    expect(src).not.toContain('<IdeCliSessions')
  })

  it('侧栏 CLI 会话能力保留：混排行 + 账单/终端继续/复制 ID 三动作', () => {
    const sidebar = readFileSync(SIDEBAR_SRC, 'utf8')
    expect(sidebar).toContain("from '../components/IdeCliSessions.vue'")
    expect(sidebar).toMatch(/<IdeCliSessions[^>]*:boxed="false"/)
    const cli = readFileSync(CLI_SRC, 'utf8')
    expect(cli).toContain('ide-cli-bill-')
    expect(cli).toContain('ide-cli-resume-')
    expect(cli).toContain('ide-cli-copy-')
  })

  it('landing 文案键 zh/en 成对（ide.landing 五键）', () => {
    expectLocaleKeys('ide.landing', ['title', 'sub', 'empty', 'board', 'enter'])
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
