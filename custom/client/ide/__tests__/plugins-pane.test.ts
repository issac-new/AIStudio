// G7 插件目录挂载守门：三源聚合、搜索过滤、技能启停、MCP 重载/测试、zcode 只读。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
const { requestMock, fetchSkillsMock, toggleSkillMock, fetchMcpMock, reloadMock, testMock } = vi.hoisted(() => ({
  requestMock: vi.fn(), fetchSkillsMock: vi.fn(), toggleSkillMock: vi.fn(),
  fetchMcpMock: vi.fn(), reloadMock: vi.fn(), testMock: vi.fn(),
}))
vi.mock('@/api/client', () => ({ request: requestMock }))
vi.mock('@/api/hermes/skills', () => ({ fetchSkills: fetchSkillsMock, toggleSkill: toggleSkillMock }))
vi.mock('@/api/hermes/mcp', () => ({ fetchMcpServers: fetchMcpMock, mcpReload: reloadMock, mcpServerTest: testMock }))

import IdePluginsPane from '../views/IdePluginsPane.vue'

describe('IdePluginsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchSkillsMock.mockResolvedValue({
      categories: [{ name: 'quality', description: '', skills: [
        { name: 'retro', description: '复盘', enabled: true },
        { name: 'qa', description: '质量门', enabled: false },
      ] }],
      archived: [],
    })
    fetchMcpMock.mockResolvedValue({ servers: [
      { name: 'semantica', transport: 'stdio', connected: true, tools: 15, tools_registered: 15, tool_names: [], tool_names_registered: [], tool_details: [], raw_config: {} },
    ], total_tools: 15, ok: true })
    requestMock.mockResolvedValue({ plugins: [{ name: 'docx', version: '1.2.0', root: '/z', path: '/z/docx' }] })
    toggleSkillMock.mockResolvedValue(undefined)
    reloadMock.mockResolvedValue({ ok: true })
    testMock.mockResolvedValue({ ok: true, tools: ['a', 'b'] })
  })

  it('三源聚合计数与内容', async () => {
    const w = mount(IdePluginsPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-plugins-skills"]').text()).toContain('retro')
    expect(w.find('[data-testid="ide-plugins-skills"]').text()).toContain('quality')
    expect(w.find('[data-testid="ide-plugins-mcp"]').text()).toContain('semantica')
    expect(w.find('[data-testid="ide-plugins-mcp"]').text()).toContain('15')
    expect(w.find('[data-testid="ide-plugins-zcode"]').text()).toContain('docx')
    expect(w.find('[data-testid="ide-plugins-zcode"]').text()).toContain('1.2.0')
    expect(w.find('[data-testid="ide-plugins-zcode"]').text()).toContain('只读')
  })

  it('搜索过滤跨三源；tab 计数更新', async () => {
    const w = mount(IdePluginsPane)
    await flushPromises()
    await w.find('[data-testid="ide-plugins-search"]').setValue('sem')
    expect(w.find('[data-testid="ide-plugins-skills"]').text()).not.toContain('retro')
    expect(w.find('[data-testid="ide-plugins-mcp"]').text()).toContain('semantica')
    expect(w.find('[data-testid="ide-plugins-zcode"]').text()).not.toContain('docx')
  })

  it('技能启停调用既有 API 并重载', async () => {
    const w = mount(IdePluginsPane)
    await flushPromises()
    const before = fetchSkillsMock.mock.calls.length
    await w.find('[data-testid="ide-plugins-skill-toggle-retro"]').trigger('click')
    await flushPromises()
    expect(toggleSkillMock).toHaveBeenCalledWith('retro', false)
    expect(fetchSkillsMock.mock.calls.length).toBeGreaterThan(before)
  })

  it('MCP 重载/测试走既有 API，结果就地显示', async () => {
    const w = mount(IdePluginsPane)
    await flushPromises()
    const row = w.find('[data-testid="ide-plugins-mcp"]')
    const buttons = row.findAll('.ide-plugins__btn')
    await buttons[0].trigger('click')
    await flushPromises()
    expect(reloadMock).toHaveBeenCalledWith('semantica')
    await buttons[1].trigger('click')
    await flushPromises()
    expect(testMock).toHaveBeenCalledWith('semantica')
    expect(row.text()).toContain('2 工具')
  })

  it('加载失败显示错误而非空目录', async () => {
    fetchSkillsMock.mockRejectedValue(new Error('boom'))
    const w = mount(IdePluginsPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-plugins-error"]').text()).toContain('boom')
  })
})
