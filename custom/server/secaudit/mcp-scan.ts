// overlay/mcpcatalog 域：MCP 注册面安全扫描（2026-10-21 AGT 调研轮三）。
//
// 并行会话（AGT 吸收轮 D）的 mcp-drift 管「配置变了没人知道」；本件管
// 「配置本身就危险」——对 ~/.hermes/profiles/*/config.yaml 的 mcp_servers
// （command/args/env/url）做形态级检查：下载即执行、env 值内嵌密钥、
// 远程外联面、仿名（typosquat）。只读只报，不阻断不处置（执法属策略引擎职权）。
// 敏感纪律：embedded-secret 只落键名与形态类别，绝不回显值。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface McpServerFact {
  profile: string
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled?: boolean
}

export type ScanSeverity = 'high' | 'medium' | 'low'
export type ScanKind = 'dangerous-command' | 'embedded-secret' | 'remote-url' | 'typosquat' | 'suspicious-path'

export interface McpSecurityFinding {
  severity: ScanSeverity
  kind: ScanKind
  server: string
  profiles: string[]
  profileCount: number
  /** 人话详情；不含密钥原值与完整 args。 */
  detail: string
}

export interface McpSecurityReport {
  profilesScanned: number
  serversScanned: number
  uniqueServers: number
  findings: McpSecurityFinding[]
  summary: Record<ScanSeverity, number>
  problems: string[]
  meta: { boundary: string }
}

// ── 形态规则（确定性，不做语义判读）──

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/curl[^|]{0,200}\|\s*(?:ba|z|da)?sh\b/, 'curl 下载直接进 shell'],
  [/wget[^|]{0,200}\|\s*(?:ba|z|da)?sh\b/, 'wget 下载直接进 shell'],
  [/\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+\//i, '递归删除根路径'],
  [/base64\s+(-d|--decode)[^|]{0,400}\|\s*(?:ba|z|da)?sh\b/, 'base64 解码直接进 shell'],
  [/\bnc\s+[^|]{0,80}-e\b/, 'netcat 反弹执行形态'],
  [/python\d?\s+-c\s+["']?import\s+socket/, 'python 内联 socket（反向连接形态）'],
]

const SECRET_SHAPES: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9]{16,}/, 'API key（sk- 前缀）'],
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub PAT'],
  [/AKIA[0-9A-Z]{16}/, 'AWS AccessKey'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '私钥文件体'],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}/, 'JWT'],
]

const LOOPBACK_RE = /^(?:localhost|127\.0\.0\.1|::1|\[::1\]|.*\.local)$/i

/** 内置常见连接器名（与 enforce-gate MCP_READ_CONNECTORS 同源子集 + 本机自管前缀）。 */
const BUILTIN_KNOWN_NAMES = new Set([
  'ekko-studio-api', 'ekko-studio-browser', 'ekko-studio-desktop', 'ekko-studio',
  'github', 'gitlab', 'notion', 'confluence', 'slack', 'figma', 'linear',
  'postgres', 'sqlite', 'filesystem', 'puppeteer', 'playwright', 'memory',
  'brave-search', 'tavily', 'exa', 'perplexity', 'wikipedia', 'arxiv',
  'semantica', 'algolia', 'googledrive', 'googledocs', 'dropbox', 'airtable',
])

function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b || !a || !b) return false
  if (a.length === b.length) {
    let diff = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && ++diff > 1) return false
    }
    return diff === 1
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = false
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue }
    if (skipped) return false
    skipped = true
    j++
  }
  return true
}

function commandLineOf(f: McpServerFact): string {
  return [f.command ?? '', ...(f.args ?? [])].join(' ').slice(0, 2000)
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.hostname
  } catch {
    return null
  }
}

/** 纯扫描（测试面）：facts → findings（跨 profile 聚合，profiles 展示 ≤5）。 */
export function scanMcpServers(facts: McpServerFact[]): { findings: McpSecurityFinding[]; problems: string[] } {
  const problems: string[] = []
  const nameFreq = new Map<string, number>()
  for (const f of facts) nameFreq.set(f.name, (nameFreq.get(f.name) ?? 0) + 1)

  const agg = new Map<string, McpSecurityFinding & { profilesFull: Set<string> }>()
  const push = (severity: ScanSeverity, kind: ScanKind, server: string, profile: string, detail: string, key: string): void => {
    const mapKey = `${kind}§${server}§${key}`
    let rec = agg.get(mapKey)
    if (!rec) {
      rec = { severity, kind, server, profiles: [], profileCount: 0, detail, profilesFull: new Set() }
      agg.set(mapKey, rec)
    }
    rec.profilesFull.add(profile)
    rec.profileCount = rec.profilesFull.size
    rec.profiles = [...rec.profilesFull].sort().slice(0, 5)
  }

  for (const f of facts) {
    const cmdLine = commandLineOf(f)

    for (const [re, label] of DANGEROUS_PATTERNS) {
      if (re.test(cmdLine)) {
        push('high', 'dangerous-command', f.name, f.profile, `命令面含「${label}」形态`, label)
      }
    }
    for (const [key, value] of Object.entries(f.env ?? {})) {
      if (typeof value !== 'string') continue
      for (const [re, label] of SECRET_SHAPES) {
        if (re.test(value)) {
          push('high', 'embedded-secret', f.name, f.profile, `env 键「${key}」的值形似${label}——密钥应只引用环境变量名，不应内嵌进配置`, `${key}:${label}`)
        }
      }
    }
    if (f.url && /^https?:\/\//i.test(f.url)) {
      const host = hostOf(f.url)
      if (host && !LOOPBACK_RE.test(host)) {
        push('medium', 'remote-url', f.name, f.profile, `远程 MCP 端点 ${host}（数据外联面）`, host)
      }
    }
    if (f.command) {
      const cmd = f.command
      const suspicious = cmd.startsWith('/tmp/') || cmd.startsWith('/var/tmp/') || cmd.includes('/Downloads/')
        || (!cmd.includes('/') && !BUILTIN_KNOWN_NAMES.has(cmd) && !['node', 'npx', 'uvx', 'python', 'python3', 'docker', 'sh', 'bash', 'zsh'].includes(cmd))
      if (suspicious) {
        push('low', 'suspicious-path', f.name, f.profile, `command「${cmd.split('/').pop() ?? cmd}」来自临时/下载目录或为相对路径（来源不明）`, cmd)
      }
    }
  }

  // typosquat：与高频名（≥3 profile 在用）/内置名差 1 字符且自身低频
  for (const [name, freq] of nameFreq) {
    if (freq >= 3 || BUILTIN_KNOWN_NAMES.has(name)) continue
    for (const [known] of nameFreq) {
      if (known === name) continue
      if ((nameFreq.get(known) ?? 0) < 3 && !BUILTIN_KNOWN_NAMES.has(known)) continue
      if (levenshtein1(name, known)) {
        const profiles = facts.filter((x) => x.name === name).map((x) => x.profile)
        for (const p of [...new Set(profiles)].slice(0, 5)) {
          push('medium', 'typosquat', name, p, `疑似仿名：与在用连接器「${known}」仅差 1 个字符`, known)
        }
        break
      }
    }
  }

  const order: Record<ScanSeverity, number> = { high: 0, medium: 1, low: 2 }
  const findings = [...agg.values()]
    .map(({ profilesFull, ...rest }) => { void profilesFull; return rest })
    .sort((a, b) => order[a.severity] - order[b.severity] || a.server.localeCompare(b.server))
  return { findings, problems }
}

// ── 采集（真实数据面：~/.hermes/profiles/*/config.yaml 的 mcp_servers）──

export function profilesDir(): string {
  const env = process.env.HERMES_PROFILES_DIR?.trim()
  if (env) return env
  return join(homedir(), '.hermes', 'profiles')
}

export function collectMcpServerFacts(): { facts: McpServerFact[]; problems: string[]; profilesScanned: number } {
  const facts: McpServerFact[] = []
  const problems: string[] = []
  const dir = profilesDir()
  if (!existsSync(dir)) return { facts, problems: [`profiles 目录不存在：${dir}`], profilesScanned: 0 }
  let profilesScanned = 0
  for (const name of readdirSync(dir).sort()) {
    const cfg = join(dir, name, 'config.yaml')
    if (!existsSync(cfg)) continue
    profilesScanned += 1
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { parse } = require('yaml') as typeof import('yaml')
      const doc = parse(readFileSync(cfg, 'utf8')) as { mcp_servers?: Record<string, Record<string, unknown>> } | null
      const servers = doc?.mcp_servers
      if (!servers || typeof servers !== 'object') continue
      for (const [serverName, raw] of Object.entries(servers)) {
        if (!raw || typeof raw !== 'object') continue
        const envRaw = (raw as { env?: unknown }).env
        const env: Record<string, string> = {}
        if (envRaw && typeof envRaw === 'object' && !Array.isArray(envRaw)) {
          for (const [k, v] of Object.entries(envRaw as Record<string, unknown>)) {
            if (typeof v === 'string') env[k] = v
          }
        }
        facts.push({
          profile: name,
          name: serverName,
          ...(typeof raw.command === 'string' ? { command: raw.command } : {}),
          ...(Array.isArray(raw.args) ? { args: raw.args.filter((a): a is string => typeof a === 'string') } : {}),
          ...(Object.keys(env).length ? { env } : {}),
          ...(typeof raw.url === 'string' ? { url: raw.url } : {}),
          ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
        })
      }
    } catch (e) {
      problems.push(`profile ${name} 解析失败：${(e as Error).message}`)
    }
  }
  return { facts, problems, profilesScanned }
}

export function mcpSecurityReport(): McpSecurityReport {
  const { facts, problems, profilesScanned } = collectMcpServerFacts()
  const scanned = scanMcpServers(facts)
  const summary: Record<ScanSeverity, number> = { high: 0, medium: 0, low: 0 }
  for (const f of scanned.findings) summary[f.severity] += 1
  return {
    profilesScanned,
    serversScanned: facts.length,
    uniqueServers: new Set(facts.map((f) => f.name)).size,
    findings: scanned.findings,
    summary,
    problems: [...problems, ...scanned.problems],
    meta: {
      boundary: '形态级只读扫描（高危命令形态/env 内嵌密钥/远程外联/仿名）；不做语义判读与自动处置——执法属工具策略引擎，漂移检测见 mcp-drift',
    },
  }
}
