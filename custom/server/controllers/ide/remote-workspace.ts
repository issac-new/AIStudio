// overlay/custom/server/controllers/ide/remote-workspace.ts
// IDE 远程工作区诊断（G6）：只读 status/list，复用 Hermes FileProvider
// （local | docker | ssh | singularity）。纯依赖注入，便于单测；HTTP 接线在
// native-routes.ts（既有原生中间件，免新增 patch）。
//
// 安全：SSH 只返回"是否配置"的布尔，不回传 host/user/key 路径/口令；list 上限 200；
// 探针与列目录都带超时；错误只回结构化 code，不抛栈。

export interface RemoteTerminalConfig {
  backend: string
  docker_image?: string
  docker_container_name?: string
  cwd?: string
  singularity_image?: string
}

export interface RemoteFileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
}

export interface RemoteProvider {
  type?: string
  listDir(dirPath: string): Promise<RemoteFileEntry[]>
  stat?(filePath: string): Promise<{ isDir: boolean }>
}

export interface RemoteDeps {
  getTerminalConfig(profile?: string): RemoteTerminalConfig
  createProvider(profile?: string): Promise<RemoteProvider>
  /** profile 的本地 home（用于 local 探针与 .env 读取） */
  profileHome(profile?: string): string
  env?: NodeJS.ProcessEnv
  readEnvKeys?(home: string): Set<string>
  now?: () => number
  timeoutMs?: number
}

export interface RemoteStatus {
  ok: boolean
  profile: string | null
  backend: string
  cwd: string | null
  docker: { image: boolean; container: boolean }
  ssh: { host: boolean; user: boolean; key: boolean; port: number | null }
  probe: { ok: boolean; ms: number; code?: string; detail?: string; path?: string }
}

const DEFAULT_TIMEOUT_MS = 8_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('probe timeout'), { code: 'backend_timeout' })), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
  })
}

function envKeysOf(home: string): Set<string> {
  try {
    // 惰性 require：仅 HTTP 运行时用；单测注入 readEnvKeys 时不加载 fs
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync, existsSync } = require('fs') as typeof import('fs')
    const { join } = require('path') as typeof import('path')
    const p = join(home, '.env')
    if (!existsSync(p)) return new Set<string>()
    const keys = new Set<string>()
    for (const line of String(readFileSync(p, 'utf8')).split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i > 0) keys.add(t.slice(0, i).trim())
    }
    return keys
  } catch { return new Set<string>() }
}

function probeTarget(cfg: RemoteTerminalConfig, home: string): string {
  if (cfg.cwd && cfg.cwd.startsWith('/')) return cfg.cwd
  if (cfg.cwd && /^[a-zA-Z]:[\\/]/.test(cfg.cwd)) return cfg.cwd
  return cfg.backend === 'local' ? home : '/'
}

export async function remoteStatus(deps: RemoteDeps, profile?: string): Promise<RemoteStatus> {
  const cfg = deps.getTerminalConfig(profile)
  const home = deps.profileHome(profile)
  const keys = (deps.readEnvKeys ?? envKeysOf)(home)
  const started = (deps.now ?? Date.now)()
  const path = probeTarget(cfg, home)
  let probe: RemoteStatus['probe'] = { ok: false, ms: 0, path }
  try {
    const provider = await withTimeout(deps.createProvider(profile), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    await withTimeout(provider.listDir(path), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    probe = { ok: true, ms: (deps.now ?? Date.now)() - started, path }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    probe = {
      ok: false,
      ms: (deps.now ?? Date.now)() - started,
      path,
      code: String(err?.code ?? 'backend_error'),
      detail: String(err?.message ?? e).slice(0, 200),
    }
  }
  const port = Number.parseInt(String((deps.env ?? process.env).TERMINAL_SSH_PORT ?? ''), 10)
  return {
    ok: probe.ok,
    profile: profile ?? null,
    backend: String(cfg.backend || 'local'),
    cwd: cfg.cwd?.trim() || null,
    docker: { image: Boolean(cfg.docker_image), container: Boolean(cfg.docker_container_name) },
    ssh: {
      host: keys.has('TERMINAL_SSH_HOST'),
      user: keys.has('TERMINAL_SSH_USER'),
      key: keys.has('TERMINAL_SSH_KEY'),
      port: Number.isFinite(port) && port > 0 ? port : null,
    },
    probe,
  }
}

export interface RemoteListResult {
  ok: boolean
  backend: string
  path: string
  entries: RemoteFileEntry[]
  truncated: boolean
  code?: string
  detail?: string
}

export const REMOTE_LIST_LIMIT = 200

export async function remoteList(
  deps: RemoteDeps,
  input: { profile?: string; path?: string | null },
): Promise<RemoteListResult> {
  const cfg = deps.getTerminalConfig(input.profile)
  const home = deps.profileHome(input.profile)
  const path = (input.path && input.path.trim()) || probeTarget(cfg, home)
  try {
    const provider = await withTimeout(deps.createProvider(input.profile), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const all = await withTimeout(provider.listDir(path), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const entries = all
      .slice(0, REMOTE_LIST_LIMIT)
      .map((e) => ({ name: e.name, path: e.path, isDir: e.isDir, size: e.size }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        const ci = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        if (ci !== 0) return ci
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      })
    return { ok: true, backend: String(cfg.backend || 'local'), path, entries, truncated: all.length > REMOTE_LIST_LIMIT }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return {
      ok: false,
      backend: String(cfg.backend || 'local'),
      path,
      entries: [],
      truncated: false,
      code: String(err?.code ?? 'backend_error'),
      detail: String(err?.message ?? e).slice(0, 200),
    }
  }
}
