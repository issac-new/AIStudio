// MCP 安全扫描面板守门：徽标计数、发现表、空态「通过」、失败态如实（不编造）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { fetchMcpSecurityScan } from '@/custom/governance/api/mcpSecurity'

vi.mock('@/custom/governance/api/mcpSecurity', () => ({
  fetchMcpSecurityScan: vi.fn(),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountComp() {
  const mod = await import('@/custom/governance/components/McpSecuritySection.vue')
  return mount(mod.default, { global: { plugins: [i18n] } })
}

const fixture = {
  ok: true,
  profilesScanned: 3,
  serversScanned: 12,
  uniqueServers: 6,
  findings: [
    {
      severity: 'high' as const,
      kind: 'embedded-secret' as const,
      server: 'sketchy-runner',
      profiles: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      profileCount: 7,
      detail: 'env 键「GITHUB_PAT」的值形似 GitHub token——密钥应只引用环境变量名',
    },
    {
      severity: 'medium' as const,
      kind: 'remote-url' as const,
      server: 'remote-thing',
      profiles: ['a'],
      profileCount: 1,
      detail: '远程 MCP 端点 mcp.example.dev（数据外联面）',
    },
  ],
  summary: { high: 1, medium: 1, low: 0 },
  problems: [],
  meta: { boundary: '形态级只读扫描……' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('McpSecuritySection', () => {
  it('渲染徽标计数 + 发现表（级别/问题/Server/Profile 汇总/详情）+ 边界注记', async () => {
    vi.mocked(fetchMcpSecurityScan).mockResolvedValue(fixture as never)
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="mcp-sec-count-high"]').text()).toContain('1')
    const table = w.find('[data-testid="mcp-sec-table"]').text()
    expect(table).toContain('env 内嵌密钥')
    expect(table).toContain('sketchy-runner')
    expect(table).toContain('GITHUB_PAT')
    expect(table).toContain('等 7')
    expect(w.text()).toContain('形态级只读扫描')
  })

  it('空结果如实「通过」，不编造发现', async () => {
    vi.mocked(fetchMcpSecurityScan).mockResolvedValue({
      ...fixture, findings: [], summary: { high: 0, medium: 0, low: 0 },
    } as never)
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="mcp-sec-table"]').text()).toContain('未发现风险形态')
    expect(w.findAll('[data-testid^="mcp-sec-row-"]')).toHaveLength(0)
  })

  it('API 失败显示错误（面板自管失败态）', async () => {
    vi.mocked(fetchMcpSecurityScan).mockRejectedValue(new Error('boom'))
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="mcp-sec-error"]').text()).toContain('boom')
  })
})
