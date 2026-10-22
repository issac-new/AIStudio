// 2026-10-22 交通灯轮：左侧导航阶段状态点红黄绿语义守门。
// 判定正身=useDailyStageProgress.dailyStageState（纯函数）；
// 呈现正身=IaSideNavItem 状态点 tone/glyph + ia2.scss --ia-warn token。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// store 静默拉 @/api/client → router → location（node 环境炸）；
// 纯函数判定不依赖 store，按 side-nav.test.ts 先例整模块桩掉（vi.mock 提升生效）。
vi.mock('../store/workspace', () => ({
  useWorkspaceStore: () => ({ tasks: [], refreshAllBoards: async () => {} }),
}))
import { dailyStageState } from '../composables/useDailyStageProgress'

const tasksOf = (...statuses: string[]) => statuses.map(status => ({ status }))

describe('dailyStageState 交通灯判定', () => {
  it('④桶内有 blocked → 红（优先于黄）', () => {
    expect(dailyStageState(tasksOf('running', 'blocked'), 4)).toBe('blocked')
  })

  it('④桶只有 running → 黄（进行中）', () => {
    expect(dailyStageState(tasksOf('running'), 4)).toBe('current')
  })

  it('blocked 不点亮非所属阶段（①组织配置不由任务推导）', () => {
    expect(dailyStageState(tasksOf('blocked'), 1)).toBe('current')
    // blocked 落④桶：②自身桶空且后续（④）有活 → 按既有规则记 done，不显红
    expect(dailyStageState(tasksOf('blocked'), 2)).toBe('done')
    expect(dailyStageState(tasksOf('blocked'), 4)).toBe('blocked')
  })

  it('本阶段桶空且后续阶段有活 → 绿（已完成）', () => {
    expect(dailyStageState(tasksOf('running'), 3)).toBe('done')
  })

  it('前后全空 → 灰（未开始）；①除外', () => {
    expect(dailyStageState([], 3)).toBe('pending')
    expect(dailyStageState([], 1)).toBe('current')
  })
})

describe('交通灯呈现单一源（源码锚定）', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8')

  it('状态点呈现：done=绿文本、current/blocked=实心灯胆（二轮去棕）', () => {
    const src = read('../components/IaSideNavItem.vue')
    expect(src).toContain('.isn-item__status--done { color: var(--ia-fresh); }')
    expect(src).toContain('.isn-item__status--current { background: var(--ia-warn-lamp);')
    expect(src).toContain('.isn-item__status--blocked { background: var(--ia-fail-lamp);')
    expect(src).toContain('border-radius: 50%;')
  })

  it('--ia-warn token 双主题齐备', () => {
    const scss = read('../styles/ia2.scss')
    expect(scss).toContain('--ia-warn-lamp: #eab308;')
    expect(scss).toContain('--ia-fail-lamp: #e03131;')
    expect(scss).not.toContain('--ia-warn:') // 二轮去棕：文本型黄 token 已退役
  })

  it('可访问说明含阻塞态（中文「有阻塞」）', () => {
    const src = read('../components/IaSideNav.vue')
    expect(src).toContain("'有阻塞'")
    expect(src).toContain("'blocked'")
  })
})
