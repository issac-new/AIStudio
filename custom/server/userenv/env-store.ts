// custom/server/userenv/env-store.ts
// profile 环境变量存储面（N01，specs/2026-11-04-agentteams-ledger-items.md）。
//
// 读写 ~/.hermes/profiles/<name>/.env（家目录解析走 lib/paths hermesHome；测试用
// HERMES_HOME 指向 tmpdir，绝不写真实 home）。形态=KEY=VALUE 行文件：
//   - 读：容忍整行注释（# 开头）/空行/成对单双引号值（剥壳回显）/export 前缀；
//     行内 # 属于值的一部分（不解析行内注释，保读写往返稳定）；条目按键排序回显。
//   - 写：整文件原子替换（lib/fs-store atomicWriteText：同目录 tmp+rename，0600）＋
//     备份 .env.bak-<ISO 时间戳>（保留最近 BACKUP_KEEP 份，超出清理）；
//     同键同值（语义等价）幂等跳写——不落盘、不备份、不审计，原注释得以保留。
//
// 敏感判定（spec D2）：key 含 KEY/TOKEN/SECRET/PASSWORD/PASS/credential
// （不区分大小写）→ 回显掩码 ***len=N***，非敏感原值回显。编辑面拿不到敏感原值，
// 整表保存时未改动的敏感行把掩码串原样回传——本存储将其解析为「保持现值」
// （掩码串是保留字面量，见 resolveSubmittedValue）。
//
// 审计：auditUserenvChange 追加 ~/.hermes-web-ui/userenv-audit.jsonl，只落键名
// 不落值（仓规第 6 条：审计不落敏感原值）；best-effort 不抛（照 runmanifest 写法）。
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { appendJsonl, atomicWriteText } from '../lib/fs-store'
import { hermesHome, underWebUi } from '../lib/paths'

/** profile 名白名单：字符集受限＋拒 `.`/`..`（`.` 映射当前目录、`..` 逃逸父目录，路径逃逸红线；绝对路径含 `/` 天然被字符集拒绝） */
const PROFILE_NAME_RE = /^[A-Za-z0-9_.-]+$/
/** .env 键名形态：字母/下划线开头，后随字母数字下划线 */
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
/** 敏感键判定（不区分大小写；子串命中即敏感——宁滥勿漏，如 MONKEY 也命中 KEY） */
const SENSITIVE_KEY_RE = /KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL/i
/** 备份保留份数 */
const BACKUP_KEEP = 5

export interface EnvEntryInput {
  key: string
  value: string
}

export interface EnvEntryView {
  key: string
  /** 敏感=***len=N***；非敏感=原值 */
  valueMasked: string
  valueLength: number
  sensitive: boolean
}

export interface ProfileEnvView {
  entries: EnvEntryView[]
  /** .env 文件不存在（profile 目录在但文件未建） */
  missing: boolean
}

export interface WriteProfileEnvOptions {
  /** 操作者（审计行 actor；缺省 anonymous） */
  actor?: string
  /** 敏感值变更显式确认位（spec N01：未确认=409 由控制器映射） */
  confirmSensitive?: boolean
  /** 时间戳注入口（测试用，控制备份文件名排序） */
  now?: number
}

export interface WriteProfileEnvResult {
  /** false=同键同值幂等跳写（未落盘） */
  written: boolean
  /** 本次实际变更（新增/删除/改值）的键名，按字典序 */
  changedKeys: string[]
  /** 本次写入前产生的备份文件名（无既有 .env 或幂等跳写时缺省） */
  backup?: string
  /** 写后（或幂等时=现态）的脱敏视图 */
  entries: EnvEntryView[]
}

/** 条目校验失败（键名形态/重复键/值含换行）→ 控制器 422 */
export class EnvValidationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super('环境变量条目校验失败')
    this.problems = problems
  }
}

/** 敏感键值变更未带确认位 → 控制器 409（problems=键名清单） */
export class SensitiveUnconfirmedError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super('敏感键值变更须显式确认')
    this.problems = problems
  }
}

export function isValidProfileName(name: string): boolean {
  return PROFILE_NAME_RE.test(name) && name !== '.' && name !== '..'
}

export function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key)
}

export function maskEnvValue(value: string): string {
  return `***len=${value.length}***`
}

/** profiles 根目录（测试经 HERMES_HOME 重定向） */
export function profilesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(hermesHome(env), 'profiles')
}

function profileDirOf(name: string, env: NodeJS.ProcessEnv): string {
  return join(profilesRoot(env), name)
}

function envFileOf(name: string, env: NodeJS.ProcessEnv): string {
  return join(profileDirOf(name, env), '.env')
}

/** profile 目录是否存在（GET/PUT 的 404 探测口） */
export function profileExists(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isValidProfileName(name)) return false
  try {
    return statSync(profileDirOf(name, env)).isDirectory()
  } catch {
    return false
  }
}

/** 剥成对引号（单/双）；不成对或长度不足原样返回（保读写往返稳定） */
function unquote(v: string): string {
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1)
  }
  return v
}

/** 解析 .env 文本：容忍注释/空行/引号值/export 前缀；无 = 或空键的畸形行跳过 */
export function parseEnvText(text: string): EnvEntryInput[] {
  const out: EnvEntryInput[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const body = line.startsWith('export ') ? line.slice('export '.length) : line
    const eq = body.indexOf('=')
    if (eq <= 0) continue
    const key = body.slice(0, eq).trim()
    if (!key) continue
    out.push({ key, value: unquote(body.slice(eq + 1).trim()) })
  }
  return out
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/** 序列化：按键排序的 KEY=VALUE 行＋末尾换行；值含首尾空白时包双引号保往返；空表=空文件 */
export function serializeEnvEntries(entries: readonly EnvEntryInput[]): string {
  const lines = [...entries].sort(byKey).map((e) => {
    const quoted = e.value !== e.value.trim()
    return `${e.key}=${quoted ? `"${e.value}"` : e.value}`
  })
  return lines.length ? `${lines.join('\n')}\n` : ''
}

function viewOf(entries: readonly EnvEntryInput[]): EnvEntryView[] {
  return [...entries].sort(byKey).map((e) => ({
    key: e.key,
    valueMasked: isSensitiveEnvKey(e.key) ? maskEnvValue(e.value) : e.value,
    valueLength: e.value.length,
    sensitive: isSensitiveEnvKey(e.key),
  }))
}

/** 读 profile .env 为脱敏视图（文件不存在=空表+missing；同键多行取后者，照 dotenv 惯例） */
export function readProfileEnv(name: string, env: NodeJS.ProcessEnv = process.env): ProfileEnvView {
  if (!isValidProfileName(name)) throw new EnvValidationError([`非法 profile 名：${name}`])
  const file = envFileOf(name, env)
  if (!existsSync(file)) return { entries: [], missing: true }
  const map = new Map<string, string>()
  for (const e of parseEnvText(readFileSync(file, 'utf8'))) map.set(e.key, e.value)
  return { entries: viewOf([...map].map(([key, value]) => ({ key, value }))), missing: false }
}

function validateEntries(entries: readonly EnvEntryInput[]): void {
  const problems: string[] = []
  const seen = new Set<string>()
  entries.forEach((e, i) => {
    if (typeof e?.key !== 'string' || !ENV_KEY_RE.test(e.key)) {
      problems.push(`第 ${i + 1} 项键名非法（须匹配 ${ENV_KEY_RE.source}）：${String(e?.key)}`)
    } else if (seen.has(e.key)) {
      problems.push(`重复键：${e.key}`)
    } else {
      seen.add(e.key)
    }
    if (typeof e?.value !== 'string' || /[\r\n]/.test(e.value)) {
      problems.push(`键 ${String(e?.key)} 的值须为不含换行的字符串`)
    }
  })
  if (problems.length) throw new EnvValidationError(problems)
}

/** 掩码串回传=保持现值：编辑面只知道掩码，未改动的敏感行原样回传不得覆盖真值。
 *  掩码字面量因此成为保留值——真要把敏感值改成该字面量需先删后建（边界在头注声明）。 */
const MASK_SUBMIT_RE = /^\*\*\*len=\d+\*\*\*$/

function resolveSubmittedValue(key: string, submitted: string, current: string | undefined): string | undefined {
  // 掩码是保留字面量：客户端回传掩码绝不写入。
  // 与现值掩码吻合 → 保持现值（幂等）；现值不存在或长度对不上（客户端态过期）→ 无操作丢弃。
  if (MASK_SUBMIT_RE.test(submitted)) {
    return current !== undefined && maskEnvValue(current) === submitted ? current : undefined
  }
  return submitted
}

function computeChangedKeys(current: ReadonlyMap<string, string>, next: readonly EnvEntryInput[]): string[] {
  const nextMap = new Map(next.map((e) => [e.key, e.value]))
  const changed: string[] = []
  for (const key of new Set([...current.keys(), ...nextMap.keys()])) {
    if (current.get(key) !== nextMap.get(key)) changed.push(key)
  }
  return changed.sort()
}

/** 备份文件名时间戳：ISO 8601 全量（: 与 . 换 -，跨平台安全；毫秒位防同秒互覆） */
function backupStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-')
}

/** 清理旧备份只留最近 BACKUP_KEEP 份（按名排序=时间序；单文件失败不阻断） */
function pruneBackups(dir: string): void {
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.startsWith('.env.bak-')).sort()
  } catch {
    return
  }
  for (const old of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
    try { unlinkSync(join(dir, old)) } catch { /* 清理失败不阻断写入 */ }
  }
}

/**
 * 整表写入 profile .env：校验 → 掩码解析 → 敏感变更确认闸 → 幂等跳写判定 →
 * 备份 → 原子替换 → 审计。同键同值（语义等价）不落盘。
 */
export function writeProfileEnv(
  name: string,
  entries: readonly EnvEntryInput[],
  opts: WriteProfileEnvOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): WriteProfileEnvResult {
  if (!isValidProfileName(name)) throw new EnvValidationError([`非法 profile 名：${name}`])
  const dir = profileDirOf(name, env)
  if (!profileExists(name, env)) {
    // 控制器已 404 预探测；此处兜底拒绝隐式创建 profile 目录（防误写新档）
    throw new EnvValidationError([`profile 目录不存在：${name}`])
  }
  validateEntries(entries)

  const file = envFileOf(name, env)
  const currentMap = new Map<string, string>()
  if (existsSync(file)) {
    for (const e of parseEnvText(readFileSync(file, 'utf8'))) currentMap.set(e.key, e.value)
  }

  // 未改动的敏感行掩码回传 → 保持现值；当前不存在的键回传掩码 → 无操作丢弃
  // （掩码是保留字面量：不可能据此造出一个值为掩码的新键，也不该触发确认位）
  const resolved = entries
    .map((e) => ({
      key: e.key,
      value: isSensitiveEnvKey(e.key)
        ? resolveSubmittedValue(e.key, e.value, currentMap.get(e.key))
        : e.value,
    }))
    // 类型谓词收窄：不加 is 守卫时 TS 保持 string|undefined，下游四处（确认闸/幂等跳写/
    // 序列化/回显）全部报 TS2345——本域从未被 ts-node 服务端装载编译过，挂载补丁 743 首次暴露
    .filter((e): e is EnvEntryInput => e.value !== undefined)

  // 敏感值变更确认闸：新增敏感键或改值都算变更（与现值相同不算）；删除不在 entries 内不触发
  const unconfirmed = resolved
    .filter((e) => isSensitiveEnvKey(e.key) && currentMap.get(e.key) !== e.value)
    .map((e) => e.key)
  if (unconfirmed.length > 0 && !opts.confirmSensitive) {
    throw new SensitiveUnconfirmedError(unconfirmed)
  }

  const changedKeys = computeChangedKeys(currentMap, resolved)
  if (changedKeys.length === 0) {
    // 同键同值幂等跳写：格式差异（注释/引号写法/行序）不构成变更，原文件原样保留
    return { written: false, changedKeys: [], entries: viewOf(resolved) }
  }

  const now = opts.now ?? Date.now()
  let backup: string | undefined
  if (existsSync(file)) {
    backup = `.env.bak-${backupStamp(now)}`
    copyFileSync(file, join(dir, backup))
    pruneBackups(dir)
  }
  atomicWriteText(file, serializeEnvEntries(resolved), { mode: 0o600 })
  auditUserenvChange({ profile: name, changedKeys, actor: opts.actor ?? 'anonymous', at: now })
  return { written: true, changedKeys, ...(backup ? { backup } : {}), entries: viewOf(resolved) }
}

export interface UserenvAuditEvent {
  profile: string
  changedKeys: string[]
  actor: string
  at: number | string
}

/** 审计行追加（best-effort 不抛，照 runmanifest 写法）；只落键名不落值 */
export function auditUserenvChange(event: UserenvAuditEvent): void {
  try {
    appendJsonl(underWebUi('userenv-audit.jsonl'), {
      profile: event.profile,
      changedKeys: event.changedKeys,
      actor: event.actor,
      at: typeof event.at === 'number' ? new Date(event.at).toISOString() : event.at,
    })
  } catch { /* 审计失败不阻断写主流程（fail-soft） */ }
}
