/**
 * IDE 编程工具启动 + zcode CLI 会话兼容展示（2026-10-19 用户需求批）。
 *
 * 两个数据面：
 *   GET  /api/ide/devtools             常用编程工具可用性探测（白名单）
 *   POST /api/ide/devtools/launch      启动白名单工具（可选 cwd）
 *   GET  /api/ide/zcode-cli/sessions   zcode CLI 会话库只读列表（~/.zcode/cli/db）
 *
 * 安全边界（红线）：
 *   - 工具一律白名单（TOOL_DEFS），客户端只传 key 与可选 cwd；不接收命令字符串。
 *   - cwd 必须是已存在目录；最终命令全部服务端拼装。
 *   - zcode CLI 库只读打开（node:sqlite readOnly），缺席=空列表+说明，不造数据。
 *
 * 实现走 native-routes 同款「原生 koa 中间件」模式（非 GET 路由在 ts-node
 * FILES 编译时序下 koa-router 注册会 404——见 native-routes.ts 头注）；本模块
 * 依赖全部可注入（deps），HTTP 层与纯函数层分离供单测。
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from 'koa'

// ── 白名单与纯函数层（测试锚点）──────────────────────────────────────────────

export type ToolKey =
  | 'zcode' | 'deepseek-harness' | 'vscode' | 'iterm' | 'warp' | 'terminal' | 'idea'
  | 'powershell' | 'cmd' | 'terminal-zcode'

export interface ToolDef {
  key: ToolKey
  /** macOS 应用名（open -a）；无 = 非应用型或仅 Windows */
  app?: string
  labelZh: string
  labelEn: string
  platforms: Array<'darwin' | 'win32'>
  /** darwin 探测：/Applications/<app>.app 是否存在（Terminal 走系统目录） */
  darwinProbe?: (exists: (p: string) => boolean) => boolean
}

export const TOOL_DEFS: readonly ToolDef[] = [
  { key: 'zcode', app: 'ZCode', labelZh: 'zcode', labelEn: 'zcode', platforms: ['darwin', 'win32'] },
  { key: 'deepseek-harness', app: 'DeepSeek Harness', labelZh: 'DeepSeek Harness', labelEn: 'DeepSeek Harness', platforms: ['darwin'] },
  { key: 'vscode', app: 'Visual Studio Code', labelZh: 'VS Code', labelEn: 'VS Code', platforms: ['darwin', 'win32'] },
  { key: 'iterm', app: 'iTerm', labelZh: 'iTerm', labelEn: 'iTerm', platforms: ['darwin'] },
  { key: 'warp', app: 'Warp', labelZh: 'Warp', labelEn: 'Warp', platforms: ['darwin'] },
  { key: 'terminal', labelZh: '终端', labelEn: 'Terminal', platforms: ['darwin', 'win32'], darwinProbe: exists => exists('/System/Applications/Utilities/Terminal.app') },
  { key: 'idea', app: 'IntelliJ IDEA', labelZh: 'IDEA', labelEn: 'IDEA', platforms: ['darwin', 'win32'] },
  { key: 'powershell', labelZh: 'PowerShell', labelEn: 'PowerShell', platforms: ['win32'] },
  { key: 'cmd', labelZh: '命令提示符', labelEn: 'Command Prompt', platforms: ['win32'] },
]

/** darwin 应用可用性：优先自定义 probe（Terminal 在系统目录），否则 /Applications。 */
export function toolAvailableOnDarwin(def: ToolDef, exists: (p: string) => boolean): boolean {
  if (def.darwinProbe) return def.darwinProbe(exists)
  return def.app ? exists(join('/Applications', `${def.app}.app`)) : false
}

/** AppleScript 字符串转义（do script "<cmd>"）：反斜杠与双引号。 */
export function applescriptEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export interface LaunchPlan { file: string; args: string[] }

/** 受管 fork 源码树的 zcode CLI（npm run zcode:ensure 的构建产物）。
 *  ZCode.app 内置的 Resources/glm/zcode.cjs 离开 app 的 Electron 进程无法解析
 *  @zcode/tui（实测 Cannot find package），不能用于终端直启。 */
export const ZCODE_CLI_DIST = resolve(
  __dirname, '../../../..', '../upstream/zcode/apps/zcode-cli/packages/cli/dist/zcode.cjs',
)

/** 返回可执行的 zcode CLI 路径：fork 构建产物优先，缺席时回落 PATH 的 zcode。 */
export function resolveZcodeCli(exists: (p: string) => boolean = existsSync): string | null {
  return exists(ZCODE_CLI_DIST) ? ZCODE_CLI_DIST : null
}

/**
 * 组装启动命令（纯函数；cwd 由调用方先行校验）。
 * 返回 null = 平台不支持或工具不在白名单。
 */
/** 仅启动型伪工具（不出现在可用性列表，但可安全启动）。 */
const LAUNCH_ONLY_TOOLS = new Set<ToolKey>(['terminal-zcode'])

export function buildLaunchPlan(
  tool: ToolKey,
  cwd: string | null,
  platform: NodeJS.Platform,
  deps: { exists?: (p: string) => boolean } = {},
): LaunchPlan | null {
  const def = TOOL_DEFS.find(d => d.key === tool)
  const known = !!def || LAUNCH_ONLY_TOOLS.has(tool)
  if (!known) return null
  if (platform !== 'darwin' && platform !== 'win32') return null
  if (def && !def.platforms.includes(platform)) return null

  if (platform === 'darwin') {
    switch (tool) {
      case 'vscode':
        // open -a "Visual Studio Code" [folder] —— 传目录即打开该工作区
        return { file: 'open', args: ['-a', 'Visual Studio Code', ...(cwd ? [cwd] : [])] }
      case 'terminal-zcode': {
        // Terminal 里执行 cd <cwd> && (node <fork CLI> | zcode)——不要求 PATH 安装
        const dir = cwd ?? homedir()
        const cli = resolveZcodeCli(deps.exists ?? existsSync)
        const command = cli ? `node ${shellQuote(cli)}` : 'zcode'
        const script = `cd ${shellQuote(dir)} && ${command}`
        return { file: 'osascript', args: ['-e', `tell application "Terminal" to do script "${applescriptEscape(script)}"`] }
      }
      default: {
        const app = def?.app
        if (!app) return null
        return { file: 'open', args: ['-a', app] }
      }
    }
  }

  // win32
  switch (tool) {
    case 'powershell': return { file: 'cmd', args: ['/c', 'start', 'powershell'] }
    case 'cmd': return { file: 'cmd', args: ['/c', 'start', 'cmd'] }
    case 'vscode': return { file: 'cmd', args: ['/c', 'start', '', 'code'] }
    case 'idea': return { file: 'cmd', args: ['/c', 'start', '', 'idea'] }
    case 'zcode': return { file: 'cmd', args: ['/c', 'start', '', 'zcode'] }
    case 'terminal':
    case 'terminal-zcode': {
      const dir = cwd ?? homedir()
      return { file: 'cmd', args: ['/c', 'start', 'cmd', '/k', `cd /d ${dir} && zcode`] }
    }
    default: return null
  }
}

/** shell 单引号包裹（路径含空格安全；内部单引号转义）。 */
function shellQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`
}

/** cwd 校验：必须是已存在目录（null=不带 cwd，合法）。 */
export function validateCwd(cwd: string | null, deps: { stat: (p: string) => { isDirectory: boolean } | null }): boolean {
  if (!cwd) return true
  const st = deps.stat(resolve(cwd))
  return !!st && st.isDirectory
}

// ── zcode CLI 会话（只读 sqlite）────────────────────────────────────────────

export interface CliSessionRow {
  id: string
  title: string
  directory: string
  timeUpdated: number
  timeCreated: number
}

/** 原始行整形（SQL 已过滤 archived/subagent；本层补标题缺省）。 */
export function shapeCliSessions(raw: Array<{ id: string; title: string | null; directory: string | null; time_updated: number; time_created: number }>): CliSessionRow[] {
  return raw.map(r => ({
    id: String(r.id),
    title: (r.title ?? '').trim() || '（未命名会话）',
    directory: r.directory ?? '',
    timeUpdated: Number(r.time_updated) || 0,
    timeCreated: Number(r.time_created) || 0,
  }))
}

export interface DevtoolsDeps {
  platform?: NodeJS.Platform
  dbPath?: () => string
  exists?: (p: string) => boolean
  stat?: (p: string) => { isDirectory: boolean } | null
  exec?: (file: string, args: string[]) => void
  openSqlite?: (path: string) => {
    prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] }
    close: () => void
  }
}

function defaultDbPath(): string {
  return process.env.ZCODE_CLI_DB?.trim() || join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite')
}

/** GET /api/ide/zcode-cli/sessions 处理（deps 注入测试）。 */
export function handleCliSessions(ctx: Context, deps: DevtoolsDeps = {}): void {
  const openSqlite = deps.openSqlite ?? ((path: string) => {
    // 局部 require：node:sqlite 实验特性，缺失环境（旧 node）如实降级
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    return new DatabaseSync(path, { readOnly: true })
  })
  const limitRaw = Number(ctx.query.limit ?? 20)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 100) : 20
  const dbPath = (deps.dbPath ?? defaultDbPath)()
  const exists = deps.exists ?? existsSync
  if (!exists(dbPath)) {
    ctx.body = { sessions: [], note: '未找到 zcode CLI 会话库（本机没有 zcode CLI 使用记录）' }
    return
  }
  let db: ReturnType<NonNullable<DevtoolsDeps['openSqlite']>> | null = null
  try {
    const opened = openSqlite(dbPath)
    db = opened
    const raw = opened.prepare(
      `select id, title, directory, time_updated, time_created from session
       where time_archived is null and id not like 'sess\\_subagent%' escape '\\'
       order by time_updated desc limit ?`,
    ).all(limit) as Array<{ id: string; title: string | null; directory: string | null; time_updated: number; time_created: number }>
    ctx.body = { sessions: shapeCliSessions(raw) }
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

/** GET /api/ide/devtools 处理：白名单 + 平台可用性。 */
export function handleDevtoolsList(ctx: Context, deps: DevtoolsDeps = {}): void {
  const platform = deps.platform ?? process.platform
  const exists = deps.exists ?? existsSync
  const tools = TOOL_DEFS
    .filter(d => d.platforms.includes(platform as 'darwin' | 'win32'))
    .map(d => ({
      key: d.key,
      labelZh: d.labelZh,
      labelEn: d.labelEn,
      available: platform === 'darwin' ? toolAvailableOnDarwin(d, exists) : true, // win32 内置项恒可用；PATH 型（code/idea）启动失败如实报错
    }))
  ctx.body = { platform, tools }
}

/** POST /api/ide/devtools/launch 处理。 */
export function handleDevtoolsLaunch(ctx: Context, deps: DevtoolsDeps & { readBody?: () => Promise<unknown> } = {}): void {
  void (async () => {
    const body = (await (deps.readBody ?? (async () => (ctx.request as unknown as { body?: unknown }).body)())) as { tool?: unknown; cwd?: unknown }
    const tool = String(body?.tool ?? '') as ToolKey
    const cwdRaw = typeof body?.cwd === 'string' && body.cwd.trim() ? body.cwd.trim() : null
    const platform = deps.platform ?? process.platform
    const exists = deps.exists ?? existsSync
    const stat = deps.stat ?? ((p: string) => { try { const s = statSync(p); return { isDirectory: s.isDirectory() } } catch { return null } })

    if (!TOOL_DEFS.some(d => d.key === tool) && !LAUNCH_ONLY_TOOLS.has(tool)) { ctx.status = 400; ctx.body = { error: '未知工具（仅白名单）' }; return }
    if (!validateCwd(cwdRaw, { stat })) { ctx.status = 400; ctx.body = { error: 'cwd 不是有效目录' }; return }
    const plan = buildLaunchPlan(tool, cwdRaw, platform, { exists })
    if (!plan) { ctx.status = 400; ctx.body = { error: '该工具在当前平台不可用' }; return }

    const exec = deps.exec ?? ((file: string, args: string[]) => {
      execFile(file, args, { timeout: 10_000 }, (err) => { if (err) console.warn('[devtools] launch warn:', (err as Error).message) })
    })
    try {
      exec(plan.file, plan.args)
      ctx.body = { ok: true, tool }
    } catch (e) {
      ctx.status = 500
      ctx.body = { error: `启动失败：${(e as Error).message}` }
    }
  })()
}
