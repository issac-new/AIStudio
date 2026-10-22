// overlay/custom/client/ia2/__tests__/side-nav-badges.test.ts
// 侧栏待办徽标守门（2026-10-22 用户需求轮）：计数纯函数 + 徽标口径接线面。
// countByStatuses 是阶段③④/看板受阻三个徽标的共同计数核，改口径这里当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countByStatuses, stageTaskCount, blockedTaskCount } from '../badge-count'
import { stageBoardStatuses } from '../stage-task-filter'

describe('countByStatuses 计数核', () => {
  const tasks = [
    { status: 'triage' }, { status: 'triage' }, { status: 'todo' },
    { status: 'running' }, { status: 'blocked' }, { status: 'blocked' },
    { status: 'review' }, { status: 'done' }, { status: 'archived' },
  ]
  it('阶段③口径：triage/todo/scheduled/ready 命中 3', () => {
    expect(countByStatuses(tasks, stageBoardStatuses(3))).toBe(3)
  })
  it('阶段④口径：running/blocked/review 命中 4', () => {
    expect(countByStatuses(tasks, stageBoardStatuses(4))).toBe(4)
  })
  it('看板受阻口径：blocked 命中 2', () => {
    expect(countByStatuses(tasks, ['blocked'])).toBe(2)
  })
  it('空映射（阶段①②⑤⑥）恒为 0——不造数字', () => {
    for (const stage of [1, 2, 5, 6]) expect(countByStatuses(tasks, stageBoardStatuses(stage))).toBe(0)
  })
  it('空任务表与未知状态均不计入', () => {
    expect(countByStatuses([], ['blocked'])).toBe(0)
    expect(countByStatuses([{ status: 'weird' } as { status: string }], ['blocked'])).toBe(0)
  })
  it('便捷口径函数与 countByStatuses 同源（stageTaskCount/blockedTaskCount）', () => {
    expect(stageTaskCount(tasks, 3)).toBe(3)
    expect(stageTaskCount(tasks, 4)).toBe(4)
    expect(blockedTaskCount(tasks)).toBe(2)
  })
})

describe('徽标口径接线面（源一致性）', () => {
  it('useSideNavBadges 只给有真实待办语义的 key 出数', () => {
    const src = readFileSync(resolve(__dirname, '../composables/useSideNavBadges.ts'), 'utf8')
    const badges = src.match(/badges = computed<Record<string, number>>\(\(\) => \(\{([\s\S]*?)\}\)\)/)?.[1] ?? ''
    for (const key of ['journey:', 'workbench:', 'board:', 'inbox:', 'stage3:', 'stage4:']) {
      expect(badges, `徽标 map 须含 ${key}`).toContain(key)
    }
    // 反面守门：检索/阶段①②⑤⑥/专题不进徽标 map（无待办概念不造数）
    for (const absent of ['search', 'stage1', 'stage2', 'stage5', 'stage6', 'ontology', 'eval', 'skillgov', 'bpa']) {
      expect(badges, `无待办语义的 ${absent} 不得入徽标 map`).not.toContain(absent)
    }
  })
  it('IaSideNav 徽标经 useSideNavBadges 汇聚（内联口径不得回流）', () => {
    const src = readFileSync(resolve(__dirname, '../components/IaSideNav.vue'), 'utf8')
    expect(src).toContain('useSideNavBadges')
    expect(src, '审批徽标不得再内联 decisionRows').not.toContain("item.key === 'inbox' && decisionRows")
  })
  it('IaSideNavItem 徽标与状态点共存（阶段③④数字与当前阶段点同显）', () => {
    const src = readFileSync(resolve(__dirname, '../components/IaSideNavItem.vue'), 'utf8')
    const badgeIdx = src.indexOf('v-if="badge !== \'\'"')
    const statusIdx = src.indexOf('<span v-if="status" class="isn-item__status"')
    const metaIdx = src.indexOf('v-if="badge === \'\' && !status"')
    expect(badgeIdx).toBeGreaterThan(-1)
    expect(statusIdx).toBeGreaterThan(badgeIdx)
    expect(metaIdx).toBeGreaterThan(statusIdx)
    expect(src, '>99 封顶防撑爆行槽').toContain("99+")
  })
})
