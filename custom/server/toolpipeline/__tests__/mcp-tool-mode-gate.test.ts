// P2 MCP 工具暴露模式守门（注入态锚点）+ defer 语义单测（纯读源文件断言 +
// 归一行为——normalize 是模块私有，经 provider 行为面守门在源锚点层锁定）。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const mcpSrc = readFileSync(resolve(overlayRoot, '..', 'upstream', 'hermes-studio', 'packages', 'ekko-agent', 'src', 'tools', 'mcp.ts'), 'utf8')
const cfgSrc = readFileSync(resolve(overlayRoot, '..', 'upstream', 'hermes-studio', 'packages', 'ekko-agent', 'src', 'config.ts'), 'utf8')

describe('P2 tool_mode 配置面（注入态守门）', () => {
  it('config.ts：EkkoMcpServerConfig.tool_mode 三值字段在档', () => {
    expect(cfgSrc).toContain("tool_mode?: 'direct' | 'proxy' | 'defer'")
  })

  it('mcp.ts：tool_mode 归一（非法值回落 direct——保守不误伤）', () => {
    expect(mcpSrc).toContain("rawMode === 'proxy' || rawMode === 'defer' ? rawMode : 'direct'")
  })
})

describe('P2 defer 模式语义（源结构锚点）', () => {
  it('defer 分支在 listTools 调用之前（装配期零连接零枚举——Pi 语义核心）', () => {
    const deferIdx = mcpSrc.indexOf('server.toolMode === \'defer\'')
    const listIdx = mcpSrc.indexOf('await session.listTools(timeoutMs)')
    expect(deferIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeGreaterThan(deferIdx, 'defer 分支必须先于任何 listTools 调用出现')
  })

  it('search/call 双元工具定义在档（查询过滤+limit 上限+免 schema 直调）', () => {
    expect(mcpSrc).toContain('_search')
    expect(mcpSrc).toContain('_call')
    expect(mcpSrc).toContain('Math.min(Math.floor(input.limit), 100)')
    expect(mcpSrc).toContain('isRecord(input.arguments) ? input.arguments : {}')
  })

  it('proxy 模式：强制收拢复用既有 McpProxyTool（不另造轮子）', () => {
    expect(mcpSrc).toContain("server.toolMode === 'proxy' ||")
    expect(mcpSrc).toContain('class McpProxyTool')
  })

  it('目录缓存 TTL 在档（60s——search 不逐次重连枚举）', () => {
    expect(mcpSrc).toContain('catalogTtlMs = 60_000')
  })
})
