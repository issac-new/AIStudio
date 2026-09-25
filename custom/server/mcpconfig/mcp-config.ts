// overlay/mcpconfig 域：MCP 服务配置管理（kimi §四 P0-2 /mcp-config 余项吸收，矩阵 §3.3 P1）。
//
// kimi 语义（/mcp-config 余项）：
// - **scope 三选一**：project|global|session——工具作用域（project=仓库共享/
//   global=个人全会话/session=本次会话专用）；
// - **超时指引**：per-server timeoutMs（kimi 超时指引+cqder Q15/codex X8 同物合并）；
// - **needs-auth action 闭环**：server 标 needs-auth 状态 + authAction（授权动作
//   指引文本），授权后状态→authorized（一次闭环）；驳回→dismissed（不再提示）。
// 存储：每 server 一份 JSON（幂等 name），HERMES_MCP_CONFIG_DIR 降级同款。
// 衔接：hermes mcp-manager（运行面）读本域配置；IdeMcpPane（旧账已核在）消费展示。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export const MCP_SCOPES = ['project', 'global', 'session'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export type McpAuthState = 'authorized' | 'needs-auth' | 'dismissed'

export interface McpServerConfig {
  name: string
  scope: McpScope
  timeoutMs: number
  authState: McpAuthState
  /** needs-auth 状态的动作指引（kimi action 提示闭环）。 */
  authAction?: string
  updatedAt: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 600_000

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.mcp-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function mcpConfigDir(): string {
  const env = process.env.HERMES_MCP_CONFIG_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.mcp-config')
  return join(homedir(), '.hermes-web-ui', 'mcp-config')
}

export function isMcpScope(v: unknown): v is McpScope {
  return typeof v === 'string' && (MCP_SCOPES as readonly string[]).includes(v)
}

function cfgFile(name: string): string {
  return join(mcpConfigDir(), `${name.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadServer(name: string): McpServerConfig | null {
  try {
    const raw = JSON.parse(readFileSync(cfgFile(name), 'utf8'))
    if (raw && raw.name === name) return raw as McpServerConfig
  } catch { /* 坏/无文件 fail-soft */ }
  return null
}

function save(cfg: McpServerConfig): void {
  mkdirSync(mcpConfigDir(), { recursive: true })
  writeFileSync(cfgFile(cfg.name), JSON.stringify(cfg, null, 2))
}

/** upsert 配置（幂等 name；timeout 归一 [1,600000]——kimi 超时指引带界）。 */
export function upsertServer(input: Omit<McpServerConfig, 'updatedAt' | 'authState'> & { authState?: McpAuthState }): McpServerConfig {
  const existing = loadServer(input.name)
  const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0
    ? Math.min(input.timeoutMs, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS
  const cfg: McpServerConfig = {
    name: input.name,
    scope: input.scope,
    timeoutMs,
    authState: input.authState ?? existing?.authState ?? 'authorized',
    authAction: input.authAction ?? existing?.authAction,
    updatedAt: Date.now(),
  }
  save(cfg)
  return cfg
}

/** needs-auth 闭环：授权（一次闭环）/驳回（不再提示）。 */
export function closeAuthLoop(name: string, outcome: 'authorize' | 'dismiss'): McpServerConfig | { error: string } {
  const cfg = loadServer(name)
  if (!cfg) return { error: 'server 配置不存在' }
  cfg.authState = outcome === 'authorize' ? 'authorized' : 'dismissed'
  cfg.updatedAt = Date.now()
  save(cfg)
  return cfg
}

/** needs-auth 待办列表（IdeMcpPane action 提示面）。 */
export function listNeedsAuth(): McpServerConfig[] {
  const out: McpServerConfig[] = []
  try {
    if (!existsSync(mcpConfigDir())) return out
    const { readdirSync } = require('fs') as typeof import('fs')
    for (const f of readdirSync(mcpConfigDir())) {
      if (!f.endsWith('.json')) continue
      const cfg = loadServer(f.slice(0, -5))
      if (cfg && cfg.authState === 'needs-auth') out.push(cfg)
    }
  } catch { /* 目录缺席跳过 */ }
  return out.sort((a, b) => a.updatedAt - b.updatedAt)
}
