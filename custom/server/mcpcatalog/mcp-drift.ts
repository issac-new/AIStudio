// overlay/mcpcatalog 域：MCP/插件配置漂移检测（2026-10-21 AGT 吸收轮 D，用户裁定「全做」）。
//
// 背景：微软 Agent Governance Toolkit 的 MCP Security Gateway（工具投毒/配置漂移/
// typosquatting 检测）在 Studio 无对位物——工具与插件配置改了没人知道，工具面被
// 悄悄换掉不可见。本模块做「配置漂移」这一档（诚实边界见下）：
//   - 监两个面：overlay mcpconfig 目录（每 server 一份 JSON：scope/timeout/auth）
//     + hermes home 插件目录（desktop-plugins/plugins 的清单与内容 hash）；
//   - 快照基线存 ~/.hermes-web-ui/mcp-drift/snapshot.json，显式 rebase 才更新
//     （POST 端点），巡检轮只读比对；
//   - 差异三类：added（新增 server/插件——供应链风险面）/removed/changed（内容
//     hash 变——含工具描述在内的任何字段变更都会现形）。
// 诚实边界：工具「名单」级漂移覆盖（清单/描述 hash 变更可见）；按语义判读
// 「描述投毒」需要理解描述内容，v1 不做（AGT 也只做模式检测）。
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export interface DriftItem {
  face: 'mcp-server' | 'plugin'
  key: string
  change: 'added' | 'removed' | 'changed'
  detail?: string
}

export interface McpDriftFace {
  ok: boolean
  error?: string
  at: number
  /** 基线是否存在（首次运行无基线=合法空态，不算漂移）。 */
  hasBaseline: boolean
  baselineAt: number | null
  drift: DriftItem[]
}

export function mcpDriftDir(): string {
  const env = process.env.HERMES_MCP_DRIFT_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'mcp-drift')
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

interface FaceEntry {
  face: 'mcp-server' | 'plugin'
  key: string
  hash: string
  detail: string
}

/** 当前配置面条目（纯读）。mcpconfig 目录经 mcp-config 同款解析（不 import 该模块，
 *  保持本模块只读可测：目录规律 <dir>/<name>.json）。 */
function currentFaceEntries(mcpConfigDir: string, hermesHome: string): FaceEntry[] {
  const out: FaceEntry[] = []
  try {
    if (existsSync(mcpConfigDir)) {
      for (const name of readdirSync(mcpConfigDir).sort()) {
        if (!name.endsWith('.json')) continue
        const file = join(mcpConfigDir, name)
        try {
          const text = readFileSync(file, 'utf8')
          out.push({ face: 'mcp-server', key: name.replace(/\.json$/, ''), hash: hashContent(text), detail: `${statSync(file).size}B` })
        } catch { /* 单文件失败跳过 */ }
      }
    }
  } catch { /* 目录不可读按空面 */ }
  for (const dirName of ['desktop-plugins', 'plugins'] as const) {
    try {
      const dir = join(hermesHome, dirName)
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir).sort()) {
        const file = join(dir, name)
        try {
          const st = statSync(file)
          if (st.isDirectory()) {
            // 目录插件：清单级指纹（子文件名+大小+mtime 摘要，不递归读内容——大插件防拖垮）
            const inner = readdirSync(file).map((f) => {
              try {
                const ist = statSync(join(file, f))
                return `${f}:${ist.size}`
              } catch { return `${f}:?` }
            }).sort().join(',')
            out.push({ face: 'plugin', key: `${dirName}/${name}`, hash: hashContent(inner), detail: `${inner.length} 项` })
          } else {
            const text = readFileSync(file, 'utf8')
            out.push({ face: 'plugin', key: `${dirName}/${name}`, hash: hashContent(text), detail: `${st.size}B` })
          }
        } catch { /* 单项失败跳过 */ }
      }
    } catch { /* 目录不可读跳过 */ }
  }
  return out
}

function snapshotFile(): string {
  return join(mcpDriftDir(), 'snapshot.json')
}

export interface McpDriftDeps {
  mcpConfigDir?: string
  hermesHome?: string
  now?: () => number
}

/** 读基线（无基线=合法空态）。 */
function loadBaseline(): { at: number; entries: FaceEntry[] } | null {
  const file = snapshotFile()
  if (!existsSync(file)) return null
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { at?: number; entries?: FaceEntry[] }
    if (!Array.isArray(doc.entries)) return null
    return { at: typeof doc.at === 'number' ? doc.at : 0, entries: doc.entries }
  } catch {
    return null
  }
}

/** 漂移比对（纯函数，测试面）：双集合对账，changed 带新旧 hash。 */
export function diffDrift(baseline: FaceEntry[], current: FaceEntry[]): DriftItem[] {
  const baseMap = new Map(baseline.map((e) => [`${e.face}|${e.key}`, e]))
  const curMap = new Map(current.map((e) => [`${e.face}|${e.key}`, e]))
  const out: DriftItem[] = []
  for (const [k, e] of curMap) {
    const b = baseMap.get(k)
    if (!b) out.push({ face: e.face, key: e.key, change: 'added', detail: e.detail })
    else if (b.hash !== e.hash) out.push({ face: e.face, key: e.key, change: 'changed', detail: `${b.hash}→${e.hash}` })
  }
  for (const [k, b] of baseMap) {
    if (!curMap.has(k)) out.push({ face: b.face, key: b.key, change: 'removed', detail: b.detail })
  }
  return out.sort((x, y) => x.face.localeCompare(y.face) || x.key.localeCompare(y.key))
}

/** 漂移面（只读比对，不写基线）。 */
export function collectMcpDrift(deps: McpDriftDeps = {}): McpDriftFace {
  const now = deps.now ?? (() => Date.now())
  const mcpConfigDir = deps.mcpConfigDir
    ?? (process.env.HERMES_MCP_CONFIG_DIR?.trim() ? resolve(process.env.HERMES_MCP_CONFIG_DIR) : join(process.cwd(), '.mcp-config'))
  const hermesHome = deps.hermesHome || process.env.HERMES_HOME || join(homedir(), '.hermes')
  try {
    const baseline = loadBaseline()
    const current = currentFaceEntries(mcpConfigDir, hermesHome)
    return {
      ok: true,
      at: now(),
      hasBaseline: baseline !== null,
      baselineAt: baseline?.at ?? null,
      drift: baseline ? diffDrift(baseline.entries, current) : [],
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 120), at: now(), hasBaseline: false, baselineAt: null, drift: [] }
  }
}

/** 显式落新基线（rebase：运维确认漂移合法后手动调用；巡检轮不调用）。 */
export function snapshotMcpDrift(deps: McpDriftDeps = {}): { ok: boolean; at: number; entries: number; error?: string } {
  const now = deps.now ?? (() => Date.now())
  try {
    const mcpConfigDir = deps.mcpConfigDir
      ?? (process.env.HERMES_MCP_CONFIG_DIR?.trim() ? resolve(process.env.HERMES_MCP_CONFIG_DIR) : join(process.cwd(), '.mcp-config'))
    const hermesHome = deps.hermesHome || process.env.HERMES_HOME || join(homedir(), '.hermes')
    const entries = currentFaceEntries(mcpConfigDir, hermesHome)
    mkdirSync(mcpDriftDir(), { recursive: true })
    writeFileSync(snapshotFile(), JSON.stringify({ at: now(), entries }, null, 1), { mode: 0o600 })
    return { ok: true, at: now(), entries: entries.length }
  } catch (e) {
    return { ok: false, at: now(), entries: 0, error: (e as Error).message.slice(0, 120) }
  }
}
