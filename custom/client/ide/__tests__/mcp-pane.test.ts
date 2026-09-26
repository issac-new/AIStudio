// overlay/custom/client/ide/__tests__/mcp-pane.test.ts
// 对话式 MCP 配置守门（M3，kimi /mcp-config 范式移植）：
// 提示词资产纪律 / IdeMcpPane 状态投影与动作 / 侧板页签接线。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({
  useMessage: () => msgs,
  NDropdown: { name: 'NDropdown', template: '<div><slot /></div>' },
}))

const chatState: { activeSessionId: string | null; sendMessage: ReturnType<typeof vi.fn> } = {
  activeSessionId: 's1',
  sendMessage: vi.fn(async () => {}),
}
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => chatState,
}))

const mcpState: { servers: Array<Record<string, unknown>>; totalTools: number; error: Error | null } = {
  servers: [],
  totalTools: 0,
  error: null,
}
vi.mock('@/api/hermes/mcp', () => ({
  fetchMcpServers: vi.fn(async () => {
    if (mcpState.error) throw mcpState.error
    return { ok: true, servers: mcpState.servers, total_tools: mcpState.totalTools }
  }),
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  createRouter: () => { throw new Error('router should not be created in pane tests') },
}))
vi.mock('../utils/hermes-skills', () => ({
  fetchHermesSkills: vi.fn(async () => ({ rows: [], categories: 0 })),
}))

import { buildMcpConfigPrompt } from '../utils/mcpConfigPrompt'
import IdeMcpPane from '../views/IdeMcpPane.vue'

describe('提示词资产（kimi mcp-config.md 对应物）', () => {
  it('注入底座身份，且四条编辑纪律在文内', () => {
    const prompt = buildMcpConfigPrompt({ agentId: 'zcode' })
    expect(prompt).toContain('[mcp-config 对话式配置]')
    expect(prompt).toContain('底座：zcode')
    // 解析失败即停（kimi：broken JSON aborts）
    expect(prompt).toContain('解析失败')
    expect(prompt).toContain('停止')
    // 密钥走环境变量（kimi：secrets never inlined）
    expect(prompt).toContain('环境变量')
    // stdio 信任复述（kimi：launch targets displayed before consenting）
    expect(prompt).toContain('命令行')
    // 会话基线生效（kimi：per-session baseline → /new）
    expect(prompt).toContain('新会话')
    // 工作台 MCP 不走文件直改（我方裁剪：REST 管理页引导）
    expect(prompt).toContain('/hermes/mcp')
  })

  it('底座名进默认目标行，空底座回落 zcode', () => {
    expect(buildMcpConfigPrompt({ agentId: 'dsh' })).toContain('~/.dsh/')
    expect(buildMcpConfigPrompt({ agentId: '' })).toContain('底座：zcode')
  })
})

describe('IdeMcpPane（/mcp 状态面板移植）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    chatState.activeSessionId = 's1'
    mcpState.error = null
    mcpState.servers = [
      {
        name: 'github',
        transport: 'http',
        connected: true,
        tools: 4,
        error: null,
      },
      {
        name: 'fs',
        transport: 'stdio',
        connected: false,
        tools: 1,
        error: 'spawn failed',
      },
    ]
    mcpState.totalTools = 5
  })

  async function mountPane() {
    const w = mount(IdeMcpPane)
    await flushPromises()
    return w
  }

  it('汇总行 + 每服务器行：连接点/传输/工具数，失败行带错误', async () => {
    const w = await mountPane()
    expect(w.find('[data-testid="ide-mcp-summary"]').text()).toContain('1/2')
    const github = w.find('[data-testid="ide-mcp-server-github"]')
    expect(github.exists()).toBe(true)
    expect(github.find('.ide-mcp__dot').classes()).toContain('is-on')
    const fs = w.find('[data-testid="ide-mcp-server-fs"]')
    expect(fs.find('.ide-mcp__dot').classes()).toContain('is-off')
    expect(fs.find('.ide-mcp__server-error').text()).toContain('spawn failed')
  })

  it('对话式配置：向当前会话注入引导提示词；无会话则按钮禁用', async () => {
    const w = await mountPane()
    await w.find('[data-testid="ide-mcp-config-chat"]').trigger('click')
    expect(chatState.sendMessage).toHaveBeenCalledTimes(1)
    const sent = chatState.sendMessage.mock.calls[0][0] as string
    expect(sent).toContain('[mcp-config 对话式配置]')
    expect(msgs.success).toHaveBeenCalled()

    chatState.activeSessionId = null
    const w2 = await mountPane()
    expect(w2.find('[data-testid="ide-mcp-config-chat"]').attributes('disabled')).toBeDefined()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('管理页跳转 / 加载失败 / 空态', async () => {
    const w = await mountPane()
    await w.find('[data-testid="ide-mcp-manage"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/hermes/mcp')

    mcpState.error = new Error('boom')
    const w2 = await mountPane()
    expect(w2.find('[data-testid="ide-mcp-load-error"]').text()).toContain('boom')

    mcpState.error = null
    mcpState.servers = []
    const w3 = await mountPane()
    expect(w3.find('[data-testid="ide-mcp-empty"]').exists()).toBe(true)
    expect(w3.find('[data-testid="ide-mcp-summary"]').exists()).toBe(false)
  })
})
