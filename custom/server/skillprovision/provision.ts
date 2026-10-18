// overlay/skillprovision：主机供给与回滚（只增不改）。
//
// 安全边界：只写 <hostRoot>/profiles/<profile>/skills；目标已存在一律跳过；复制
// 走临时目录 + rename；源必须是 host 全局库中同名的 SKILL.md 目录；同名多源且
// 内容不同判 ambiguous 跳过。每个 profile 写 .skill-provisioning.json 台账；
// 回滚只删“台账在册且当前哈希等于安装哈希”的目录，用户改过的跳过。
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { buildReport, defaultHostRoot } from './reconcile'
import { indexSkills, scanSkillRoot } from './scan'
import type {
  ApplyAction, ApplyProfileResult, ApplyResult, RollbackProfileResult, RollbackResult, SkillEntry,
} from './types'

const LEDGER = '.skill-provisioning.json'
const SAFE_PROFILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SAFE_SKILL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
// _shared 是共享 profile 的 git 仓（团队规则/协议），供给与回滚一律不写。
const EXCLUDED_PROFILES = new Set(['_shared'])
const HASH_SKIP = new Set([LEDGER, '.DS_Store', 'Thumbs.db'])
const MAX_HASH_FILES = 5000

interface LedgerEntry { source: string; installedHash: string; at: number }
interface Ledger { version: 1; entries: Record<string, LedgerEntry> }

export interface ApplyOptions {
  hostRoot?: string
  simRoot?: string
  manifestPath?: string
  profiles?: string[]
  dryRun?: boolean
  confirm?: boolean
}

function assertProfile(name: string): void {
  // _shared 是合法的共享 profile 目录；它由 EXCLUDED_PROFILES 单独拦截写入。
  if (name === '_shared') return
  if (!SAFE_PROFILE.test(name)) throw new Error(`profile 名不合法：${name}`)
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function walkFiles(dir: string, acc: string[], depth: number): void {
  if (acc.length >= MAX_HASH_FILES || depth > 8) return
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue
    if (HASH_SKIP.has(e.name) || e.name === 'node_modules') continue
    const full = join(dir, e.name)
    let isDir = e.isDirectory()
    if (e.isSymbolicLink()) {
      try { isDir = statSync(full).isDirectory() } catch { continue }
    }
    if (isDir) walkFiles(full, acc, depth + 1)
    else if (e.isFile() || e.isSymbolicLink()) acc.push(full)
  }
}

/** 目录内容哈希（相对路径 + 文件字节，排序后拼接）；读失败计入占位符。 */
export function hashDir(dir: string): string {
  const files: string[] = []
  walkFiles(dir, files, 0)
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    const rel = relative(dir, file)
    hash.update(rel)
    hash.update('\0')
    try { hash.update(readFileSync(file)) } catch { hash.update(`ERR:${rel}`) }
    hash.update('\0')
  }
  return hash.digest('hex')
}

function readLedger(profileSkills: string): Ledger {
  const path = join(profileSkills, LEDGER)
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Ledger>
    if (raw.version !== 1 || !raw.entries || typeof raw.entries !== 'object') return { version: 1, entries: {} }
    const entries: Record<string, LedgerEntry> = {}
    for (const [name, v] of Object.entries(raw.entries)) {
      if (!SAFE_SKILL.test(name) || !v || typeof v !== 'object') continue
      const e = v as Partial<LedgerEntry>
      if (typeof e.installedHash !== 'string' || typeof e.source !== 'string') continue
      entries[name] = { source: e.source, installedHash: e.installedHash, at: typeof e.at === 'number' ? e.at : 0 }
    }
    return { version: 1, entries }
  } catch {
    return { version: 1, entries: {} }
  }
}

function writeLedger(profileSkills: string, ledger: Ledger): void {
  mkdirSync(profileSkills, { recursive: true })
  const path = join(profileSkills, LEDGER)
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

function sameContent(a: SkillEntry, b: SkillEntry): boolean {
  try { return hashDir(a.realDir) === hashDir(b.realDir) } catch { return false }
}

/** 源技能目录里若有指向目录外的符号链接，拒绝供给（防把外部文件复制进 profile）。 */
function symlinkEscape(dir: string): string | null {
  let root: string
  try { root = realpathSync(dir) } catch { return dir }
  const stack = [dir]
  let visited = 0
  while (stack.length > 0 && visited < 2000) {
    const cur = stack.pop()!
    visited += 1
    let entries
    try { entries = readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = join(cur, e.name)
      if (e.isSymbolicLink()) {
        let real: string
        try { real = realpathSync(full) } catch { return full }
        const rel = relative(root, real)
        if (rel.startsWith('..') || isAbsolute(rel)) return full
      } else if (e.isDirectory()) {
        stack.push(full)
      }
    }
  }
  return null
}

function pickSource(entries: SkillEntry[] | undefined): { source?: SkillEntry; reason?: string } {
  if (!entries || entries.length === 0) return { reason: 'source_missing' }
  const first = entries[0]
  if (entries.length > 1) {
    for (const e of entries.slice(1)) {
      if (!sameContent(first, e)) return { reason: 'ambiguous' }
    }
  }
  if (symlinkEscape(first.realDir)) return { reason: 'symlink_escape' }
  return { source: first }
}

function copySkillDir(source: string, target: string): void {
  const parent = dirname(target)
  mkdirSync(parent, { recursive: true })
  const tmp = join(parent, `.${target.slice(target.lastIndexOf(sep) + 1)}.tmp-${process.pid}-${Date.now()}`)
  try {
    cpSync(source, tmp, { recursive: true, dereference: true })
    renameSync(tmp, target)
  } catch (e) {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    throw e
  }
}

function emptyApply(dryRun: boolean, reason: string): ApplyResult {
  return {
    ok: false, dryRun, reason, profiles: [],
    summary: { profiles: 0, planned: 0, copied: 0, skipped: 0, failed: 0 },
  }
}

/** 按 manifest 给 host profile 补装缺失技能。dryRun 默认 true。 */
export function applyProvision(options: ApplyOptions = {}): ApplyResult {
  const dryRun = options.dryRun !== false
  if (!dryRun && options.confirm !== true) return emptyApply(false, 'confirm_required')
  const hostRoot = resolve(options.hostRoot ?? defaultHostRoot())
  const report = buildReport({ hostRoot, simRoot: options.simRoot, manifestPath: options.manifestPath })
  if (!report.manifest.exists || report.manifest.source !== 'file' || report.manifest.errors.length > 0) {
    return emptyApply(dryRun, 'manifest_missing')
  }

  const profilesRoot = join(hostRoot, 'profiles')
  const globalIndex = indexSkills(scanSkillRoot(join(hostRoot, 'skills')))
  const wanted = options.profiles ? new Set(options.profiles.map((p) => { assertProfile(p); return p })) : null
  const results: ApplyProfileResult[] = []

  for (const row of report.profiles) {
    if (wanted && !wanted.has(row.profile)) continue
    assertProfile(row.profile)
    if (EXCLUDED_PROFILES.has(row.profile)) {
      results.push({ profile: row.profile, planned: [], copied: [], skipped: [{ skill: '(profile)', reason: 'excluded_shared' }], failed: [] })
      continue
    }
    const profileSkills = join(profilesRoot, row.profile, 'skills')
    if (!inside(profilesRoot, profileSkills)) throw new Error(`profile 路径越界：${row.profile}`)
    const result: ApplyProfileResult = { profile: row.profile, planned: [], copied: [], skipped: [], failed: [] }
    const ledger = readLedger(profileSkills)
    let ledgerChanged = false

    for (const skill of row.missingInHost) {
      if (!SAFE_SKILL.test(skill)) { result.skipped.push({ skill, reason: 'invalid_name' }); continue }
      const picked = pickSource(globalIndex.get(skill))
      if (!picked.source) { result.skipped.push({ skill, reason: picked.reason }); continue }
      const target = join(profileSkills, skill)
      if (!inside(profileSkills, target)) { result.skipped.push({ skill, reason: 'path_escape' }); continue }
      if (existsSync(target)) { result.skipped.push({ skill, reason: 'exists' }); continue }
      const action: ApplyAction = { skill, source: picked.source.realDir }
      if (dryRun) { result.planned.push(action); continue }
      try {
        copySkillDir(picked.source.realDir, target)
        const installedHash = hashDir(target)
        ledger.entries[skill] = { source: picked.source.realDir, installedHash, at: Date.now() }
        ledgerChanged = true
        result.copied.push(action)
      } catch (e) {
        result.failed.push({ skill, reason: (e as Error).message })
      }
    }

    if (ledgerChanged) {
      try { writeLedger(profileSkills, ledger) } catch (e) {
        result.failed.push({ skill: '(ledger)', reason: (e as Error).message })
      }
    }
    results.push(result)
  }

  if (wanted) {
    for (const name of wanted) {
      if (EXCLUDED_PROFILES.has(name)) {
        if (!results.some((r) => r.profile === name)) {
          results.push({ profile: name, planned: [], copied: [], skipped: [{ skill: '(profile)', reason: 'excluded_shared' }], failed: [] })
        }
        continue
      }
      if (!report.profiles.some((r) => r.profile === name)) {
        results.push({ profile: name, planned: [], copied: [], skipped: [], failed: [{ skill: '(profile)', reason: 'profile_not_found' }] })
      }
    }
  }

  const count = (pick: (r: ApplyProfileResult) => unknown[]): number => results.reduce((n, r) => n + pick(r).length, 0)
  return {
    ok: true,
    dryRun,
    profiles: results,
    summary: {
      profiles: results.length,
      planned: count((r) => r.planned),
      copied: count((r) => r.copied),
      skipped: count((r) => r.skipped),
      failed: count((r) => r.failed),
    },
  }
}

/** 按台账回滚未改副本。dryRun 默认 true。 */
export function rollbackProvision(options: ApplyOptions = {}): RollbackResult {
  const dryRun = options.dryRun !== false
  if (!dryRun && options.confirm !== true) {
    return {
      ok: false, dryRun: false, reason: 'confirm_required', profiles: [],
      summary: { profiles: 0, planned: 0, removed: 0, skipped: 0, failed: 0 },
    }
  }
  const hostRoot = resolve(options.hostRoot ?? defaultHostRoot())
  const profilesRoot = join(hostRoot, 'profiles')
  const wanted = options.profiles ? new Set(options.profiles.map((p) => { assertProfile(p); return p })) : null
  const report = buildReport({ hostRoot, simRoot: options.simRoot, manifestPath: options.manifestPath })
  const names = report.profiles.map((r) => r.profile)
  if (wanted) for (const name of wanted) if (!names.includes(name)) names.push(name)

  const results: RollbackProfileResult[] = []
  for (const profile of names) {
    if (wanted && !wanted.has(profile)) continue
    assertProfile(profile)
    if (EXCLUDED_PROFILES.has(profile)) continue
    const profileSkills = join(profilesRoot, profile, 'skills')
    if (!existsSync(profileSkills)) continue
    const ledger = readLedger(profileSkills)
    const result: RollbackProfileResult = { profile, planned: [], removed: [], skipped: [], failed: [] }
    let changed = false
    for (const [skill, entry] of Object.entries(ledger.entries)) {
      const target = join(profileSkills, skill)
      if (!inside(profileSkills, target)) { result.skipped.push({ skill, reason: 'path_escape' }); continue }
      if (!existsSync(target)) { delete ledger.entries[skill]; changed = true; continue }
      const current = hashDir(target)
      if (current !== entry.installedHash) { result.skipped.push({ skill, reason: 'modified' }); continue }
      if (dryRun) { result.planned.push(skill); continue }
      try {
        rmSync(target, { recursive: true, force: true })
        delete ledger.entries[skill]
        changed = true
        result.removed.push(skill)
      } catch (e) {
        result.failed.push({ skill, reason: (e as Error).message })
      }
    }
    if (changed) {
      try { writeLedger(profileSkills, ledger) } catch (e) {
        result.failed.push({ skill: '(ledger)', reason: (e as Error).message })
      }
    }
    results.push(result)
  }

  const count = (pick: (r: RollbackProfileResult) => unknown[]): number => results.reduce((n, r) => n + pick(r).length, 0)
  return {
    ok: true,
    dryRun,
    profiles: results,
    summary: {
      profiles: results.length,
      planned: count((r) => r.planned),
      removed: count((r) => r.removed),
      skipped: count((r) => r.skipped),
      failed: count((r) => r.failed),
    },
  }
}
