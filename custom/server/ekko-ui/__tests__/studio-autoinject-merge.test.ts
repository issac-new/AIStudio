// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/studio-autoinject-merge.test.ts
// 守门：托管 MCP 合并不得因前面的服务被用户禁用而早退（interaction 必须能补进）。
import { describe, expect, it } from 'vitest'
import { mergeManagedMcpServers } from '../../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/mcp/studio-autoinject'

const MANAGED = { HERMES_WEB_UI_MANAGED_MCP: '1' }

function managed(name: string, enabled = true) {
  return {
    command: '/usr/local/bin/node',
    args: ['/tmp/ekko-studio-mcp.mjs', name],
    env: { ...MANAGED },
    enabled,
  }
}

describe('mergeManagedMcpServers', () => {
  it('前三个服务被用户禁用时仍补齐缺失的 interaction', () => {
    const cfg = {
      mcp_servers: {
        'ekko-studio-api': managed('api', false),
        'ekko-studio-browser': managed('browser', false),
        'ekko-studio-use': managed('use', false),
      },
    }
    const merged = mergeManagedMcpServers(cfg, 'pay-orchestrator', '/tmp/ekko-studio-mcp.mjs')
    expect(merged.cfg.mcp_servers['ekko-studio-interaction']).toMatchObject({ enabled: true })
    expect(merged.cfg.mcp_servers['ekko-studio-api'].enabled).toBe(false)
    expect(merged.changed).toBe(true)
    expect(merged.injected).toBe(true)
    expect(merged.hadManagedExisting).toBe(true)
    expect(merged.skipped).toHaveLength(3)
  })

  it('空配置补齐全部四个托管服务', () => {
    const merged = mergeManagedMcpServers({}, 'default', '/tmp/ekko-studio-mcp.mjs')
    expect(Object.keys(merged.cfg.mcp_servers).sort()).toEqual([
      'ekko-studio-api', 'ekko-studio-browser', 'ekko-studio-interaction', 'ekko-studio-use',
    ])
    expect(merged.injected).toBe(true)
    expect(merged.hadManagedExisting).toBe(false)
  })

  it('用户自管的同名服务不覆盖，但其余缺失服务仍补齐', () => {
    const custom = {
      mcp_servers: {
        'ekko-studio-interaction': { command: 'my-custom-server', args: [], env: {}, enabled: true },
      },
    }
    const merged = mergeManagedMcpServers(custom, 'default', '/tmp/ekko-studio-mcp.mjs')
    expect(merged.cfg.mcp_servers['ekko-studio-interaction'].command).toBe('my-custom-server')
    expect(merged.cfg.mcp_servers['ekko-studio-api']).toBeTruthy()
    expect(merged.skipped.some(reason => reason.includes('ekko-studio-interaction'))).toBe(true)
  })

  it('全部服务已存在且禁用时不变更，只记跳过原因', () => {
    const cfg = {
      mcp_servers: {
        'ekko-studio-api': managed('api', false),
        'ekko-studio-browser': managed('browser', false),
        'ekko-studio-use': managed('use', false),
        'ekko-studio-interaction': managed('plan', false),
      },
    }
    const merged = mergeManagedMcpServers(cfg, 'default', '/tmp/ekko-studio-mcp.mjs')
    expect(merged.changed).toBe(false)
    expect(merged.skipped).toHaveLength(4)
  })

  it('旧名 ekko-studio-plan 迁移为 interaction', () => {
    const cfg = { mcp_servers: { 'ekko-studio-plan': managed('plan') } }
    const merged = mergeManagedMcpServers(cfg, 'default', '/tmp/ekko-studio-mcp.mjs')
    expect(merged.cfg.mcp_servers['ekko-studio-interaction']).toBeTruthy()
    expect(merged.cfg.mcp_servers['ekko-studio-plan']).toBeUndefined()
    expect(merged.changed).toBe(true)
  })
})
