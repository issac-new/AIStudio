// 推演并入轮徽标守门（2026-10-21）：看板卡 source=sim 显示「推演」徽标；
// 日常卡不显示（不误标）。写口守卫在 SwarmKanbanView（此处只验呈现面）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => 'me' }))
vi.mock('@/custom/ia2/composables/useAgentActivity', () => ({
  useAgentActivity: () => ({ activity: {} }),
  agentActivityOf: () => null,
}))
vi.mock('@/custom/ia2/composables/useTaskProgress', () => ({
  useTaskProgress: () => ({ progressMap: {} }),
  taskProgressOf: () => null,
  phaseProgressText: () => '',
}))
vi.mock('@/custom/ia2/i18n-bgwork', () => ({ pickBgworkMessages: () => null }))

import KanbanTaskCard from '../components/KanbanTaskCard.vue'

function baseTask(extra: Record<string, unknown> = {}) {
  return {
    id: 't_x', title: '卡', assignee: 'me', status: 'todo', priority: 1,
    body: null, created_by: null, created_at: 0, started_at: null, completed_at: null,
    workspace_kind: 'git', workspace_path: null, tenant: null, project_id: null,
    result: null, skills: null, ...extra,
  }
}

describe('KanbanTaskCard 推演徽标', () => {
  beforeEach(() => { localStorage.clear() })

  it('source=sim：渲染推演徽标与只读提示', () => {
    const w = mount(KanbanTaskCard, { props: { task: baseTask({ source: 'sim', runId: 'run22' }) } })
    const badge = w.find('[data-testid="kanban-card-sim-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('推演')
    expect(badge.attributes('title')).toContain('只读')
  })

  it('日常卡（无 source）：不渲染推演徽标', () => {
    const w = mount(KanbanTaskCard, { props: { task: baseTask() } })
    expect(w.find('[data-testid="kanban-card-sim-badge"]').exists()).toBe(false)
  })
})
