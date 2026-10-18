// overlay/custom/server/cua/policy.ts
// Cua（电脑操作）会话级闸门——完整回路的服务端单一事实源。
//
// 语义（fail-closed 默认）：
//   未显式开启的会话 → spawn zcode 时注入 ZCODE_CUA_DISABLE=1 ——
//   zcode 侧 captureComputerUseRuntimeFromEnvironment 返回 undefined（overlay
//   zcode-patch 004 语义），CUA 运行时不可用，技能引导会如实报 unavailable。
//   显式开启的会话 → 不注入（插件链自 seed：官方 computer-use 插件 + node_repl
//   宿主 + 003 活体 Node 后端，scoped ZCODE_STORAGE_DIR/ZCODE_DATA_BASE_DIR 下
//   实测 plugins list 自动落 cache）。
//
// 存储：overlay runtime/ide-cua.json（与引擎模型目录同区，零 hermes 配置共享）；
// 写入原子（tmp+rename）。IDE_CUA_POLICY_FILE 覆盖路径供测试注入。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/** fail-closed 哨兵 env：zcode-cua 侧识别并整体禁用运行时 */
export const CUA_DISABLE_ENV = 'ZCODE_CUA_DISABLE' as const

interface CuaBrokerSection { socket: string; authority: string; startedAt: number }

interface CuaPolicyFile {
  version: 1
  sessions: Record<string, boolean>
  broker?: CuaBrokerSection | null
}

function policyPath(): string {
  const root = process.env.IDE_CUA_POLICY_FILE?.trim()
  if (root) return root
  // custom/server/cua → overlay 根上三级；运行时资产归 runtime/（engine-models 先例）
  return join(__dirname, '..', '..', '..', 'runtime', 'ide-cua.json')
}

function emptyPolicy(): CuaPolicyFile {
  return { version: 1, sessions: {} }
}

export function readPolicy(): CuaPolicyFile {
  try {
    const path = policyPath()
    if (!existsSync(path)) return emptyPolicy()
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CuaPolicyFile>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.sessions !== 'object') return emptyPolicy()
    const sessions: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed.sessions ?? {})) {
      if (typeof k === 'string' && k.trim() && v === true) sessions[k] = true
    }
    const b = parsed.broker
    const broker = b && typeof b === 'object' && typeof b.socket === 'string' && typeof b.authority === 'string'
      ? { socket: b.socket, authority: b.authority, startedAt: Number(b.startedAt) || 0 }
      : null
    return { version: 1, sessions, broker }
  } catch {
    return emptyPolicy()
  }
}

export function setBrokerTransport(t: { socket: string; authority: string } | null): void {
  const policy = readPolicy()
  policy.broker = t ? { socket: t.socket, authority: t.authority, startedAt: Date.now() } : null
  try { writePolicy(policy) } catch { /* 写失败保持旧值；spawn 侧 fail-closed 兜底 */ }
}

export function brokerTransport(): CuaBrokerSection | null {
  return readPolicy().broker ?? null
}

function writePolicy(policy: CuaPolicyFile): void {
  const path = policyPath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.ide-cua.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(policy, null, 2))
  renameSync(tmp, path)
}

/** 会话是否显式开启 CUA（默认 false = fail-closed） */
export function isSessionCuaEnabled(sessionId: string | null | undefined): boolean {
  if (!sessionId || typeof sessionId !== 'string') return false
  return readPolicy().sessions[sessionId] === true
}

/** 开/关一个会话的 CUA；返回写入后的生效值 */
export function setSessionCua(sessionId: string, enabled: boolean): boolean {
  const id = String(sessionId || '').trim()
  if (!id) return false
  const policy = readPolicy()
  if (enabled) policy.sessions[id] = true
  else delete policy.sessions[id]
  try {
    writePolicy(policy)
  } catch {
    // 写失败按 fail-closed 处理：读回判定
  }
  return isSessionCuaEnabled(id)
}

/**
 * spawn zcode 时合并进 run.launch.env 的 CUA 闸门。
 * 会话未开启 → { ZCODE_CUA_DISABLE: '1' }；开启 → {}（不覆盖任何宿主 env）。
 */
export function cuaEnvForSession(sessionId: string | null | undefined): Record<string, string> {
  if (!isSessionCuaEnabled(sessionId)) return { [CUA_DISABLE_ENV]: '1' }
  // 开启：注入自有 broker 凭据对（runtimeEnv 成对捕获约定）；无凭据=fail-closed
  const t = brokerTransport()
  if (!t?.socket || !t.authority) return { [CUA_DISABLE_ENV]: '1' }
  return {
    ZCODE_CUA_PERMISSION_BROKER_SOCKET: t.socket,
    ZCODE_CUA_PLUGIN_AUTHORITY: t.authority,
  }
}

/** CUA 能力可用性探测：官方 computer-use 插件缓存是否已 seed（zcode 数据基） */
export function cuaAvailability(dataBaseDir?: string | null): { available: boolean; seededAt: string | null } {
  const home = process.env.ZCODE_DATA_BASE_DIR?.trim()
    || (typeof dataBaseDir === 'string' && dataBaseDir.trim() ? dataBaseDir.trim() : null)
  const bases = home ? [join(home, 'cli')] : [join(process.env.HOME ?? '~', '.zcode', 'cli')]
  for (const base of bases) {
    const cache = join(base, 'plugins', 'cache', 'zcode-plugins-official', 'computer-use')
    if (!existsSync(cache)) continue
    try {
      const { readdirSync } = require('fs') as typeof import('fs')
      const versions = readdirSync(cache).filter((v) => /^[\d.]+$/.test(v)).sort()
      if (versions.length) return { available: true, seededAt: versions[versions.length - 1] }
    } catch { /* 读取失败视为不可用 */ }
  }
  return { available: false, seededAt: null }
}
