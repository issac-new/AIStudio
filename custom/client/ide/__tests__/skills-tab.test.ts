// 技能入口 UI 守门（zcode §七 #3：IdeMcpPane 技能 tab + skills-ledger 接线）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) =>
  k === 'ide.skills.summary' ? `${p?.n} skills · ${p?.e} enabled` : k }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ success: vi.fn() }) }))
vi.mock('@/api/hermes/mcp', () => ({
  fetchMcpServers: vi.fn(async () => ({ servers: [], total_tools: 0 })),
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ activeSessionId: null, sendMessage: vi.fn() }) }))
vi.mock('../utils/hermes-skills', () => ({
  fetchHermesSkills: vi.fn(async () => ({
    rows: [
      { name: 'quality-gate', kind: 'skill', source: 'user', enabled: true, description: 'qa · 交付门禁' },
      { name: 'retro', kind: 'skill', source: 'project', enabled: false, description: '复盘' },
    ],
    categories: 2,
  })),
}))

import IdeMcpPane from '../views/IdeMcpPane.vue'
import { fetchHermesSkills } from '../utils/hermes-skills'

describe('IdeMcpPane 技能 tab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('默认 MCP 视图；切技能 tab 出清单+汇总（ledger 投影）', async () => {
    const w = mount(IdeMcpPane, { global: { stubs: { teleport: true } } } as never)
    await flushPromises()
    expect(w.find('[data-testid="ide-mcp-tab-mcp"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-skills-list"]').exists()).toBe(false)
    await w.find('[data-testid="ide-mcp-tab-skills"]').trigger('click')
    expect(w.find('[data-testid="ide-skills-list"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-skills-summary"]').text()).toBe('2 skills · 1 enabled')
    expect(w.find('[data-testid="ide-skill-quality-gate"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-skill-retro"]').exists()).toBe(true)
    expect(fetchHermesSkills).toHaveBeenCalled()
  })
})
