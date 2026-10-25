import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { AgentTool, AgentToolContentPart, AgentToolContext, AgentToolProvider, AgentToolResult } from './types'

interface StdioMcpServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
  supportsParallelToolCalls: boolean
  toolMode: McpToolMode
  requestTimeoutMs?: number
}

interface StreamableHttpMcpServerConfig {
  type: 'streamable_http'
  url: string
  headers: Record<string, string>
  supportsParallelToolCalls: boolean
  toolMode: McpToolMode
  requestTimeoutMs?: number
}

type McpServerConfig = StdioMcpServerConfig | StreamableHttpMcpServerConfig
type McpClientTransport = StdioClientTransport | StreamableHTTPClientTransport

// HERMES_CUSTOM[mcp-tool-mode] P2（2026-10-04 九源轮）：工具暴露模式。
//   direct = 现行为（每工具一个模型可见定义）；
//   proxy  = 强制单代理工具（复用既有 McpProxyTool 收拢——全部 schema 仍入参
//            anyOf，省条目数不省描述预算）；
//   defer  = Pi 延迟加载语义：装配时不连接不枚举（零首请求阻塞），注册
//            `mcp__<server>_search`（按需列名+描述）与 `mcp__<server>_call`
//            （免 schema 直调）两元工具——工具说明也是上下文，按需分配。
export type McpToolMode = 'direct' | 'proxy' | 'defer'

const DEFAULT_MCP_TIMEOUT_MS = 30_000
const MODEL_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const MCP_PROXY_PREFIX = 'mcp__'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeServerType(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (
    normalized === 'http'
    || normalized === 'streamable-http'
    || normalized === 'streamablehttp'
  ) {
    return 'streamable_http'
  }
  return normalized
}

function normalizeServerConfig(value: unknown): McpServerConfig | null {
  if (!isRecord(value) || value.enabled === false) return null
  const supportsParallelToolCalls = value.supports_parallel_tool_calls === true
  const rawMode = typeof value.tool_mode === 'string' ? value.tool_mode.trim().toLowerCase() : ''
  const toolMode: McpToolMode = rawMode === 'proxy' || rawMode === 'defer' ? rawMode : 'direct'
  const requestTimeoutMs = typeof value.requestTimeoutMs === 'number'
    && Number.isInteger(value.requestTimeoutMs) && value.requestTimeoutMs > 0 ? value.requestTimeoutMs : undefined
  const configuredType = normalizeServerType(value.type)
  const command = typeof value.command === 'string' ? value.command.trim() : ''
  const rawUrl = typeof value.url === 'string' ? value.url.trim() : ''
  const isHttp = configuredType === 'streamable_http' || (!configuredType && !command && !!rawUrl)

  if (isHttp) {
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return {
        type: 'streamable_http',
        url: url.toString(),
        headers: normalizeStringRecord(value.headers),
        supportsParallelToolCalls,
        toolMode,
        requestTimeoutMs,
      }
    } catch {
      return null
    }
  }

  if (configuredType && configuredType !== 'stdio') return null
  if (!command) return null
  return {
    type: 'stdio',
    command,
    args: Array.isArray(value.args) ? value.args.map(arg => String(arg)) : [],
    env: normalizeProcessEnv(value.env),
    supportsParallelToolCalls,
    toolMode,
    requestTimeoutMs,
  }
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function normalizeProcessEnv(value: unknown): Record<string, string> {
  const normalized = Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  for (const [key, item] of Object.entries(normalizeStringRecord(value))) normalized[key] = item
  return normalized
}

function responseContentToText(result: any): string {
  const content = Array.isArray(result?.content) ? result.content : []
  const text = content
    .map((item: any) => {
      if (item?.type === 'text') return String(item.text ?? '')
      if (item?.type === 'image') return `[Image: ${String(item.mimeType || 'image/png')}]`
      return JSON.stringify(item)
    })
    .filter(Boolean)
    .join('\n')
  return text || JSON.stringify(result ?? {})
}

function responseContentParts(result: any): AgentToolContentPart[] | undefined {
  if (!Array.isArray(result?.content)) return undefined
  const parts: AgentToolContentPart[] = []
  for (const item of result.content) {
    if (item?.type === 'text') parts.push({ type: 'text', text: String(item.text ?? '') })
    if (item?.type === 'image' && typeof item.data === 'string' && /^image\/(?:png|jpeg|webp|gif)$/i.test(String(item.mimeType || ''))) {
      parts.push({ type: 'image', data: item.data, mimeType: String(item.mimeType).toLowerCase() })
    }
  }
  return parts.some(part => part.type === 'image') ? parts : undefined
}

function responseDataWithoutImagePayloads(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(responseDataWithoutImagePayloads)
  if (!isRecord(value)) return value
  if (value.type === 'image' && typeof value.data === 'string') {
    return {
      ...value,
      data: `[image payload forwarded separately: ${String(value.mimeType || 'image/png')}]`,
    }
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, responseDataWithoutImagePayloads(child)]))
}

class McpClientSession {
  private disposed = false
  private client: Client | null = null
  private transport: McpClientTransport | null = null
  private initialized: Promise<void> | null = null

  constructor(readonly fingerprint: string, private readonly server: McpServerConfig) {}

  async listTools(timeoutMs: number): Promise<any[]> {
    const client = await this.ensureConnected(timeoutMs)
    const result = await client.listTools(undefined, { timeout: timeoutMs, cacheMode: 'refresh' })
    return result.tools
  }

  async callTool(name: string, input: Record<string, unknown>, timeoutMs: number): Promise<AgentToolResult> {
    try {
      const client = await this.ensureConnected(timeoutMs)
      const result = await client.callTool({ name, arguments: input }, { timeout: this.server.requestTimeoutMs ?? timeoutMs })
      const content = responseContentToText(result)
      return {
        ok: result.isError !== true,
        content,
        contentParts: responseContentParts(result),
        data: responseDataWithoutImagePayloads(result),
        error: result.isError === true ? content : undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, content: message, error: message }
    }
  }

  dispose(): void {
    this.disposed = true
    const client = this.client
    const transport = this.transport
    this.client = null
    this.transport = null
    this.initialized = null
    if (!client) return
    void (async () => {
      try {
        if (transport instanceof StreamableHTTPClientTransport) await transport.terminateSession()
      } catch {
        // Session termination is optional and some servers return 405.
      } finally {
        await client.close().catch(() => undefined)
      }
    })()
  }

  private async ensureConnected(timeoutMs: number): Promise<Client> {
    if (this.disposed) throw new Error('MCP connection scope has ended')
    if (!this.client) {
      const client = new Client({ name: 'ekko-agent', version: '0.1.0' })
      const transport = this.server.type === 'streamable_http'
        ? new StreamableHTTPClientTransport(new URL(this.server.url), {
            requestInit: Object.keys(this.server.headers).length
              ? { headers: this.server.headers }
              : undefined,
          })
        : new StdioClientTransport({
            command: this.server.command,
            args: this.server.args,
            env: this.server.env,
            stderr: 'ignore',
          })
      this.client = client
      this.transport = transport
      this.initialized = client.connect(transport, { timeout: timeoutMs }).catch(async error => {
        if (this.client === client) {
          this.client = null
          this.transport = null
          this.initialized = null
        }
        await client.close().catch(() => undefined)
        throw error
      })
    }
    await this.initialized
    if (this.disposed) throw new Error('MCP connection scope has ended')
    return this.client!
  }
}

class McpTool implements AgentTool {
  readonly definition: AgentTool['definition']
  readonly concurrency: AgentTool['concurrency']

  constructor(
    serverName: string,
    private readonly remoteName: string,
    tool: any,
    private readonly session: McpClientSession,
    supportsParallelToolCalls: boolean,
  ) {
    this.concurrency = supportsParallelToolCalls ? 'parallel' : 'serial'
    this.definition = {
      name: String(tool.name || remoteName),
      description: String(tool.description || `MCP tool ${remoteName} from ${serverName}`),
      parameters: isRecord(tool.inputSchema) ? tool.inputSchema : { type: 'object', properties: {} },
    }
  }

  async execute(input: Record<string, unknown>, context: AgentToolContext = {}): Promise<AgentToolResult> {
    return await this.session.callTool(this.remoteName, input, context.timeoutMs || DEFAULT_MCP_TIMEOUT_MS)
  }
}

class McpProxyTool implements AgentTool {
  readonly definition: AgentTool['definition']
  readonly concurrency: AgentTool['concurrency']
  private readonly remoteTools: Map<string, any>

  constructor(
    proxyName: string,
    serverName: string,
    tools: any[],
    private readonly session: McpClientSession,
    supportsParallelToolCalls: boolean,
  ) {
    this.concurrency = supportsParallelToolCalls ? 'parallel' : 'serial'
    this.remoteTools = new Map(tools.map(tool => [String(tool.name), tool]))
    this.definition = {
      name: proxyName,
      description: [
        `Call a tool from the ${serverName} MCP server.`,
        'Pass the exact remote MCP tool name in "tool"; it will be preserved unchanged.',
        ...tools.map(tool => `${String(tool.name)}: ${String(tool.description || 'No description provided.')}`),
      ].join(' '),
      parameters: {
        type: 'object',
        anyOf: tools.map(tool => ({
          type: 'object',
          title: String(tool.name),
          description: String(tool.description || `Call ${String(tool.name)}.`),
          properties: {
            tool: {
              type: 'string',
              enum: [String(tool.name)],
              description: 'Exact remote MCP tool name.',
            },
            arguments: isRecord(tool.inputSchema)
              ? tool.inputSchema
              : { type: 'object', properties: {} },
          },
          required: ['tool', 'arguments'],
          additionalProperties: false,
        })),
      },
    }
  }

  async execute(input: Record<string, unknown>, context: AgentToolContext = {}): Promise<AgentToolResult> {
    const remoteName = typeof input.tool === 'string' ? input.tool : ''
    if (!this.remoteTools.has(remoteName)) {
      const error = `Unknown remote MCP tool: ${remoteName || '(missing)'}`
      return { ok: false, content: error, error }
    }
    const remoteInput = isRecord(input.arguments) ? input.arguments : {}
    return await this.session.callTool(remoteName, remoteInput, context.timeoutMs || DEFAULT_MCP_TIMEOUT_MS)
  }
}

// HERMES_CUSTOM[mcp-tool-mode] P2：defer 双元工具（search 按需列示 / call 免 schema 直调）。
class McpDeferToolset {
  private catalogCache: { at: number; tools: any[] } | null = null
  private readonly catalogTtlMs = 60_000

  constructor(
    private readonly safeName: string,
    private readonly serverName: string,
    private readonly session: McpClientSession,
  ) {}

  private async catalog(timeoutMs: number): Promise<any[]> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < this.catalogTtlMs) return this.catalogCache.tools
    const tools = await this.session.listTools(timeoutMs)
    this.catalogCache = { at: Date.now(), tools }
    return tools
  }

  async search(input: Record<string, unknown>, timeoutMs: number): Promise<AgentToolResult> {
    const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : ''
    const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(Math.floor(input.limit), 100) : 50
    try {
      const tools = await this.catalog(timeoutMs)
      const matched = tools
        .filter(tool => {
          const name = String(tool.name || '')
          const desc = String(tool.description || '')
          return !query || name.toLowerCase().includes(query) || desc.toLowerCase().includes(query)
        })
        .slice(0, limit)
      const lines = matched.map(tool => `${String(tool.name)}: ${String(tool.description || 'No description provided.')}`)
      const content = [
        `MCP server "${this.serverName}" exposes ${tools.length} tool(s); ${matched.length} shown.`,
        ...lines,
        matched.length === 0 ? 'No match — try a shorter query or omit it to list all.' : '',
      ].filter(Boolean).join('\n')
      return { ok: true, content }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, content: message, error: message }
    }
  }

  async call(input: Record<string, unknown>, timeoutMs: number): Promise<AgentToolResult> {
    const remoteName = typeof input.tool === 'string' ? input.tool : ''
    if (!remoteName) {
      return { ok: false, content: 'Missing remote tool name ("tool").', error: 'Missing remote tool name' }
    }
    const args = isRecord(input.arguments) ? input.arguments : {}
    return await this.session.callTool(remoteName, args, timeoutMs)
  }

  tools(supportsParallelToolCalls: boolean): AgentTool[] {
    const concurrency: AgentTool['concurrency'] = supportsParallelToolCalls ? 'parallel' : 'serial'
    const searchTool: AgentTool = {
      concurrency,
      definition: {
        name: `${this.safeName}_search`,
        description: `Discover tools on the ${this.serverName} MCP server (names + descriptions, optional query filter). Call this before ${this.safeName}_call when unsure of the tool name.`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Case-insensitive substring filter on name/description; omit to list all.' },
            limit: { type: 'number', description: 'Max entries to return (default 50, cap 100).' },
          },
        },
      },
      execute: async (input: Record<string, unknown>, context: AgentToolContext = {}) =>
        await this.search(input, context.timeoutMs || DEFAULT_MCP_TIMEOUT_MS),
    }
    const callTool: AgentTool = {
      concurrency,
      definition: {
        name: `${this.safeName}_call`,
        description: `Call a tool on the ${this.serverName} MCP server by exact name; arguments are forwarded as-is.`,
        parameters: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Exact remote MCP tool name (see ' + `${this.safeName}_search` + ').' },
            arguments: { type: 'object', description: 'Arguments object forwarded unchanged to the remote tool.' },
          },
          required: ['tool'],
        },
      },
      execute: async (input: Record<string, unknown>, context: AgentToolContext = {}) =>
        await this.call(input, context.timeoutMs || DEFAULT_MCP_TIMEOUT_MS),
    }
    return [searchTool, callTool]
  }
}

function modelSafeToolName(name: string): boolean {
  return MODEL_TOOL_NAME_PATTERN.test(name)
}

function proxyToolName(serverName: string, usedNames: Set<string>): string {
  const readable = serverName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'server'
  const base = `${MCP_PROXY_PREFIX}${readable}`.slice(0, 64)
  if (!usedNames.has(base)) return base
  const hash = stableNameHash(serverName)
  for (let attempt = 1; ; attempt += 1) {
    const suffix = `_${hash}${attempt === 1 ? '' : `_${attempt}`}`
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`
    if (!usedNames.has(candidate)) return candidate
  }
}

function stableNameHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createMcpToolProvider(): AgentToolProvider {
  const sharedSessions = new Map<string, McpClientSession>()
  const scopedSessions = new WeakMap<AbortSignal, Map<string, McpClientSession>>()
  return {
    id: 'mcp',
    async listTools(context?: AgentToolContext): Promise<AgentTool[]> {
      const scope = context?.mcpSessionSignal
      scope?.throwIfAborted()
      let sessions = scope ? scopedSessions.get(scope) : sharedSessions
      if (!sessions) {
        sessions = new Map()
        scopedSessions.set(scope!, sessions)
        const owned = sessions
        scope!.addEventListener('abort', () => {
          for (const session of owned.values()) session.dispose()
          owned.clear()
        }, { once: true })
      }
      const timeoutMs = context?.timeoutMs || DEFAULT_MCP_TIMEOUT_MS
      const tools: AgentTool[] = []
      const usedNames = new Set<string>()
      const configuredServerNames = new Set<string>()

      for (const [serverName, rawConfig] of Object.entries(context?.mcpServers || {})) {
        scope?.throwIfAborted()
        const server = normalizeServerConfig(rawConfig)
        if (!server) continue
        configuredServerNames.add(serverName)
        const fingerprint = JSON.stringify(server)
        let session = sessions.get(serverName)
        if (!session || session.fingerprint !== fingerprint) {
          session?.dispose()
          session = new McpClientSession(fingerprint, server)
          sessions.set(serverName, session)
        }

        // HERMES_CUSTOM[mcp-tool-mode] P2：defer 模式——装配期不连接不枚举
        //（零首请求阻塞、零描述预算），注册 search/call 双元工具按需取用。
        if (server.toolMode === 'defer') {
          const safe = `${MCP_PROXY_PREFIX}${serverName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'server'}`
          const toolset = new McpDeferToolset(safe.slice(0, 58), serverName, session)
          for (const tool of toolset.tools(server.supportsParallelToolCalls)) {
            const name = tool.definition.name
            if (!usedNames.has(name)) {
              usedNames.add(name)
              tools.push(tool)
            }
          }
          continue
        }

        try {
          const remoteTools = (await session.listTools(timeoutMs))
            .filter(tool => !!tool?.name)
          scope?.throwIfAborted()
          // P2 proxy 模式：强制单代理收拢（config 显式要求）
          const requiresProxy = server.toolMode === 'proxy' || remoteTools.some(tool => {
            const name = String(tool.name)
            return !modelSafeToolName(name) || usedNames.has(name)
          })

          if (requiresProxy && remoteTools.length) {
            const proxyName = proxyToolName(serverName, usedNames)
            usedNames.add(proxyName)
            tools.push(new McpProxyTool(
              proxyName,
              serverName,
              remoteTools,
              session,
              server.supportsParallelToolCalls,
            ))
            continue
          }

          for (const tool of remoteTools) {
            usedNames.add(String(tool.name))
            tools.push(new McpTool(
              serverName,
              String(tool.name),
              tool,
              session,
              server.supportsParallelToolCalls,
            ))
          }
        } catch {
          scope?.throwIfAborted()
          // A broken MCP server should not prevent the rest of the agent run.
        }
      }

      for (const [serverName, session] of sessions) {
        if (configuredServerNames.has(serverName)) continue
        session.dispose()
        sessions.delete(serverName)
      }

      return tools
    },
  }
}
