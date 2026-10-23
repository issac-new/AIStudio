// @vitest-environment jsdom
// 最近轨迹守门（2026-10-23「常用 · 最近」批）：
//   纯逻辑核=recent-trail.ts（入栈去重/置顶/截断、持久化编解码容错、标题解析
//   回落链、相对时间分段）；组件接线面=IaSideNav（常用组「最近」项、开关面板、
//   点击面板外关闭、行点击回跳、清空生效、?tab= 记录粒度、跨挂载持久化、
//   写入容错）。mock 范式同 side-nav.test.ts（pinia 缺位环境打桩依赖聚合）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

const progressState = vi.hoisted(() => ({
  stage: {} as Record<number, string>,
}))
vi.mock('../composables/useDailyStageProgress', async () => {
  const { ref } = await import('vue')
  const run = ref('run21')
  return {
    useDailyStageProgress: () => ({
      run,
      state: ref(null),
      loading: ref(false),
      error: ref(''),
      load: vi.fn(),
      merged: ref({}),
      stageState: (no: number) => progressState.stage[no] ?? 'pending',
      stepState: () => 'pending',
    }),
  }
})

vi.mock('../composables/useDecisionRows', async () => {
  const { ref } = await import('vue')
  return {
    useDecisionRows: () => ({ decisionRows: ref([{ id: 'd1' }, { id: 'd2' }]) }),
  }
})

vi.mock('../composables/useSideNavBadges', async () => {
  const { ref } = await import('vue')
  return { useSideNavBadges: () => ({ badges: ref({}) }) }
})

import {
  RECENT_TRAIL_LIMIT,
  RECENT_TRAIL_STORAGE_KEY,
  formatRecentTime,
  parseRecentTrail,
  pushRecent,
  recentTitle,
  type RecentEntry,
} from '../recent-trail'
import IaSideNav from '../components/IaSideNav.vue'

// ── 纯逻辑核 ────────────────────────────────────────────────────────────────

describe('pushRecent 入栈核', () => {
  const e = (fullPath: string, ts: number): RecentEntry =>
    ({ fullPath, routeName: 'ia2.x', title: fullPath, ts })

  it('新条目置顶，原顺序后移', () => {
    const out = pushRecent([e('/a', 100), e('/b', 50)], e('/c', 200))
    expect(out.map(x => x.fullPath)).toEqual(['/c', '/a', '/b'])
  })
  it('栈顶同 fullPath 仅刷新 ts，不重复入栈', () => {
    const out = pushRecent([e('/a', 100), e('/b', 50)], e('/a', 200))
    expect(out.length).toBe(2)
    expect(out[0].fullPath).toBe('/a')
    expect(out[0].ts).toBe(200)
    expect(out[1].fullPath).toBe('/b')
  })
  it('已有条目再次访问移到栈顶并更新 ts', () => {
    const out = pushRecent([e('/a', 100), e('/b', 50), e('/c', 10)], e('/c', 300))
    expect(out.map(x => x.fullPath)).toEqual(['/c', '/a', '/b'])
    expect(out[0].ts).toBe(300)
  })
  it('上限 20 截断，丢最旧', () => {
    const entries = Array.from({ length: RECENT_TRAIL_LIMIT }, (_, i) => e(`/p${i}`, i))
    const out = pushRecent(entries, e('/new', 99))
    expect(out.length).toBe(RECENT_TRAIL_LIMIT)
    expect(out[0].fullPath).toBe('/new')
    expect(out.some(x => x.fullPath === '/p19')).toBe(false)
    expect(out.some(x => x.fullPath === '/p0')).toBe(true)
  })
  it('不改入参数组（返回新数组）', () => {
    const src = [e('/a', 1)]
    pushRecent(src, e('/b', 2))
    expect(src.length).toBe(1)
  })
})

describe('parseRecentTrail 持久化容错', () => {
  const e = (fullPath: string, ts: number): RecentEntry =>
    ({ fullPath, routeName: 'ia2.x', title: fullPath, ts })

  it('null / 空串 → []', () => {
    expect(parseRecentTrail(null)).toEqual([])
    expect(parseRecentTrail('')).toEqual([])
  })
  it('脏 JSON / 非数组 → 整体丢弃', () => {
    expect(parseRecentTrail('{oops')).toEqual([])
    expect(parseRecentTrail('{"a":1}')).toEqual([])
    expect(parseRecentTrail('42')).toEqual([])
  })
  it('非对象元素与字段类型不全的元素剔除', () => {
    const raw = JSON.stringify([
      'not-an-object',
      null,
      e('/ok', 1),
      { fullPath: '/no-ts', routeName: 'ia2.x', title: 't' },
      { fullPath: 123, routeName: 'ia2.x', title: 't', ts: 1 },
      { fullPath: '/no-title', routeName: 'ia2.x', ts: 1 },
      { fullPath: '/bad-ts', routeName: 'ia2.x', title: 't', ts: 'yesterday' },
    ])
    expect(parseRecentTrail(raw)).toEqual([e('/ok', 1)])
  })
  it('合法数组完整解析；超上限截断', () => {
    const many = Array.from({ length: 25 }, (_, i) => e(`/p${i}`, i))
    const out = parseRecentTrail(JSON.stringify(many))
    expect(out.length).toBe(RECENT_TRAIL_LIMIT)
    expect(out[0].fullPath).toBe('/p0')
    expect(out.some(x => x.fullPath === '/p24')).toBe(false)
  })
})

describe('recentTitle 标题解析回落链（全部引用单一事实源，不复制文案）', () => {
  const r = (name: unknown, fullPath: string, query?: Record<string, unknown>) =>
    ({ fullPath, path: fullPath, name, query })

  it('推演六签自 SIM_NAVS 同源（zh/en）', () => {
    expect(recentTitle(r('ia2.sim', '/app/sim'), 'zh')).toBe('导演台')
    expect(recentTitle(r('ia2.sim', '/app/sim'), 'en')).toBe('Director')
    expect(recentTitle(r('ia2.simSettings', '/app/sim/settings'), 'zh')).toBe('推演设置')
  })
  it('常用五入口自 COMMON_NAVS；工作台兄弟路由归「工作台」', () => {
    expect(recentTitle(r('ia2.journey', '/app'), 'zh')).toBe('流程总览')
    expect(recentTitle(r('ia2.board', '/app/board'), 'zh')).toBe('看板')
    expect(recentTitle(r('ia2.collabChat', '/app/collab/chat/x'), 'zh')).toBe('工作台')
    expect(recentTitle(r('ia2.dash', '/app/dash'), 'en')).toBe('Workbench')
  })
  it('阶段页：阶段短名；?tab= 命中页签元数据拼「阶段 · 页签」，未知/缺失不拼', () => {
    expect(recentTitle(r('ia2.stage3', '/app/stage/design'), 'zh')).toBe('分析设计')
    expect(recentTitle(r('ia2.stage3', '/app/stage/design', { tab: 'tasks' }), 'zh')).toBe('分析设计 · 任务分解')
    expect(recentTitle(r('ia2.stage4', '/app/stage/build', { tab: 'board' }), 'zh')).toBe('开发 · 看板')
    expect(recentTitle(r('ia2.stage3', '/app/stage/design', { tab: 'nope' }), 'zh')).toBe('分析设计')
    expect(recentTitle(r('ia2.stage3', '/app/stage/design', { tab: ['g2'] }), 'zh')).toBe('分析设计 · 质量门 G2')
    expect(recentTitle(r('ia2.stage1', '/app/stage/setup', { tab: 'assets' }), 'en')).toBe('Setup · Environment & assets')
  })
  it('专题岛屿自 ISLAND_NAVS；全部未命中回落路由名，再回落 fullPath', () => {
    expect(recentTitle(r('ia2.bpa', '/app/bpa'), 'zh')).toBe('流程架构')
    expect(recentTitle(r('ide.shell', '/app/ide'), 'zh')).toBe('IDE')
    expect(recentTitle(r('ia2.unknown', '/app/wherever'), 'zh')).toBe('ia2.unknown')
    expect(recentTitle(r(undefined, '/app/nowhere'), 'zh')).toBe('/app/nowhere')
  })
})

describe('formatRecentTime 相对时间分段', () => {
  // 2026-10-23 12:00（本地时区构造，纯函数只做差值与日历日比较，不受时区影响）
  const now = new Date(2026, 9, 23, 12, 0).getTime()

  it('<1 分钟（含时钟偏移的未来值）→ 刚刚', () => {
    expect(formatRecentTime(now - 30_000, now, 'zh')).toBe('刚刚')
    expect(formatRecentTime(now + 5_000, now, 'zh')).toBe('刚刚')
  })
  it('分钟段与小时段', () => {
    expect(formatRecentTime(now - 3 * 60_000, now, 'zh')).toBe('3 分钟前')
    expect(formatRecentTime(now - 5 * 3_600_000, now, 'zh')).toBe('5 小时前')
  })
  it('超过 24h 落在昨天（日历日）→ 昨天 HH:MM', () => {
    const ts = new Date(2026, 9, 22, 8, 5).getTime() // 10/22 08:05，约 28 小时前
    expect(formatRecentTime(ts, now, 'zh')).toBe('昨天 08:05')
    expect(formatRecentTime(ts, now, 'en')).toBe('Yesterday 08:05')
  })
  it('更早 → M/D HH:MM；跨年带年份', () => {
    const nowLateNight = new Date(2026, 9, 23, 0, 30).getTime()
    const ts = new Date(2026, 9, 21, 22, 0).getTime() // 距 00:30 约 26.5h，前天
    expect(formatRecentTime(ts, nowLateNight, 'zh')).toBe('10/21 22:00')
    const oldYear = new Date(2025, 11, 30, 9, 0).getTime()
    expect(formatRecentTime(oldYear, now, 'zh')).toBe('2025/12/30 09:00')
  })
  it('en 分段文案', () => {
    expect(formatRecentTime(now - 45_000, now, 'en')).toBe('just now')
    expect(formatRecentTime(now - 7 * 60_000, now, 'en')).toBe('7 min ago')
  })
})

// ── 组件接线面 ──────────────────────────────────────────────────────────────

function makeRouter(): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/app', name: 'ia2.journey', component: { template: '<div />' } },
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
    { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
    { path: '/app/search', name: 'ia2.search', component: { template: '<div />' } },
    { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
    { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
    { path: '/app/stage/design', name: 'ia2.stage3', component: { template: '<div />' } },
    { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
    { path: '/app/stage/accept', name: 'ia2.stage5', component: { template: '<div />' } },
    { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/sim/settings', name: 'ia2.simSettings', component: { template: '<div />' } },
    { path: '/app/gov/settings', name: 'ia2.govSettings', component: { template: '<div />' } },
    { path: '/app/bpa', name: 'ia2.bpa', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const w = mount(IaSideNav, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

async function openRecent(w: ReturnType<typeof mountAt>['w']): Promise<void> {
  await w.find('[data-testid="ia-side-nav-recent"]').trigger('click')
  await flushPromises()
}

// 面板 2026-10-23 修复起 Teleport 到 body（绕开侧栏滚动容器裁剪）——
// 面板相关断言走 document 查询；侧栏内元素（开关按钮）仍走 wrapper。
const q = (sel: string): Element | null => document.querySelector(sel)
const qa = (sel: string): Element[] => [...document.querySelectorAll(sel)]
const elText = (el: Element | null): string => (el ? el.textContent ?? '' : '')
const clickEl = (el: Element | null): void => { (el as HTMLElement | null)?.click() }

beforeEach(() => {
  localStorage.clear()
  progressState.stage = { 1: 'done', 2: 'done', 3: 'done', 4: 'current', 5: 'pending', 6: 'pending' }
})

describe('IaSideNav 最近轨迹接线', () => {
  it('常用组末位出现「最近」开关项；面板默认不展开；推演模式不出现', async () => {
    const { w } = await mountAt('/app/stage/build')
    const recent = w.find('[data-testid="ia-side-nav-recent"]')
    expect(recent.exists()).toBe(true)
    expect(recent.text()).toContain('最近')
    expect(w.find('[data-testid="recent-panel"]').exists()).toBe(false)
    w.unmount()

    const sim = await mountAt('/app/sim')
    expect(sim.w.find('[data-testid="ia-side-nav-recent"]').exists()).toBe(false)
    sim.w.unmount()
  })

  it('点击开关面板：再点关闭；点击面板外（文档级 mousedown）关闭', async () => {
    const { w } = await mountAt('/app/stage/build')
    await openRecent(w)
    expect(!!q('[data-testid="recent-panel"]')).toBe(true)
    // 再点开关 → 关
    await w.find('[data-testid="ia-side-nav-recent"]').trigger('click')
    expect(!!q('[data-testid="recent-panel"]')).toBe(false)
    // 重开后面板外 mousedown → 关
    await openRecent(w)
    document.dispatchEvent(new MouseEvent('mousedown'))
    await nextTick()
    expect(!!q('[data-testid="recent-panel"]')).toBe(false)
    // 面板内 mousedown 不关（Teleport 后面板在 body 下，判定含面板自身）
    await openRecent(w)
    ;(q('[data-testid="recent-empty"]') as HTMLElement | null)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(!!q('[data-testid="recent-panel"]')).toBe(true)
    w.unmount()
  })

  it('空态：初始落地页不记录，「还没有访问记录」可达；清空按钮禁用', async () => {
    const { w } = await mountAt('/app/stage/build')
    await openRecent(w)
    expect(elText(q('[data-testid="recent-empty"]'))).toContain('还没有访问记录')
    expect(q('[data-testid="recent-clear"]')?.hasAttribute('disabled')).toBe(true)
    w.unmount()
  })

  it('记录粒度=fullPath：?tab= 切换各记一次，同 fullPath 重复访问去重置顶', async () => {
    const { w, router } = await mountAt('/app/stage/design')
    await router.push('/app/stage/design?tab=tasks')
    await flushPromises()
    await router.push('/app/stage/design?tab=g2')
    await flushPromises()
    await openRecent(w)
    expect(qa('[data-testid^="recent-item-"]').length).toBe(2)
    const row0 = elText(q('[data-testid="recent-item-0"]'))
    expect(row0).toContain('分析设计 · 质量门 G2')
    expect(row0).toContain('/app/stage/design?tab=g2')
    expect(elText(q('[data-testid="recent-item-1"]'))).toContain('分析设计 · 任务分解')
    // 回访最早条目 → 移到栈顶，不重复入栈
    await router.push('/app/stage/design?tab=tasks')
    await flushPromises()
    expect(qa('[data-testid^="recent-item-"]').length).toBe(2)
    expect(elText(q('[data-testid="recent-item-0"]'))).toContain('分析设计 · 任务分解')
    w.unmount()
  })

  it('行点击回跳该 fullPath（含 query）并关面板；当前页行只关面板', async () => {
    const { w, router } = await mountAt('/app/stage/build')
    await router.push('/app/board')
    await flushPromises()
    await router.push('/app/stage/build')
    await flushPromises()
    await openRecent(w)
    expect(qa('[data-testid^="recent-item-"]').length).toBe(2)
    // 栈顶=当前页（/app/stage/build）：点击只关面板不导航
    clickEl(q('[data-testid="recent-item-0"]'))
    await flushPromises()
    expect(!!q('[data-testid="recent-panel"]')).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/app/stage/build')
    // 重开点第 2 行（/app/board）：导航并关面板
    await openRecent(w)
    clickEl(q('[data-testid="recent-item-1"]'))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/board')
    expect(!!q('[data-testid="recent-panel"]')).toBe(false)
    w.unmount()
  })

  it('清空生效：栈与 localStorage 一起清', async () => {
    const { w, router } = await mountAt('/app/stage/build')
    await router.push('/app/board')
    await flushPromises()
    await openRecent(w)
    expect(localStorage.getItem(RECENT_TRAIL_STORAGE_KEY)).toContain('/app/board')
    clickEl(q('[data-testid="recent-clear"]'))
    await flushPromises()
    expect(elText(q('[data-testid="recent-empty"]'))).toContain('还没有访问记录')
    expect(localStorage.getItem(RECENT_TRAIL_STORAGE_KEY)).toBeNull()
    w.unmount()
  })

  it('跨挂载持久化：localStorage 重建轨迹；脏数据安全降级为空', async () => {
    const first = await mountAt('/app/stage/build')
    await first.router.push('/app/board')
    await flushPromises()
    first.w.unmount()

    const second = await mountAt('/app/collab')
    await second.router.push('/app/inbox')
    await flushPromises()
    await openRecent(second.w)
    const rows = qa('[data-testid^="recent-item-"]')
    expect(rows.length).toBe(2)
    expect(elText(rows[0])).toContain('审批收件箱')
    expect(elText(rows[1])).toContain('看板')
    second.w.unmount()

    // 脏数据：解析失败按空轨迹起步，首个导航重建合法持久化串
    localStorage.setItem(RECENT_TRAIL_STORAGE_KEY, '{corrupt')
    const third = await mountAt('/app/stage/build')
    await third.router.push('/app/search')
    await flushPromises()
    await openRecent(third.w)
    expect(qa('[data-testid^="recent-item-"]').length).toBe(1)
    expect(JSON.parse(localStorage.getItem(RECENT_TRAIL_STORAGE_KEY) ?? '[]').length).toBe(1)
    third.w.unmount()
  })

  it('写入容错：localStorage.setItem 抛错不炸导航，内存栈照常', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      const { w, router } = await mountAt('/app/stage/build')
      await router.push('/app/board')
      await flushPromises()
      await openRecent(w)
      expect(qa('[data-testid^="recent-item-"]').length).toBe(1)
      w.unmount()
    } finally {
      spy.mockRestore()
    }
  })
})
