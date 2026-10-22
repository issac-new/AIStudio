// overlay/trust 域：工作区完整性栅栏（对应文章 CSWI，content-signed workspace integrity）。
//
// 做法与文章一致：
//   1. 审计阶段开始前采集一次清单，准入时再采集一次；
//   2. 小文件算完整 sha256，超过阈值的文件退化为大小+修改时间；
//   3. 两次清单有任何新增/修改/删除即判 violated；
//   4. 审计者在报告里自报的 clean 没有最终效力，框架观察值优先覆盖。
//
// 覆盖边界如实声明：清单有文件数上限与目录排除规则，达到上限时 truncated=true，
// 不声称覆盖完整工作区。清单只返回相对路径、大小与摘要，不返回文件内容。
import { createHash, randomBytes } from 'crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { delimiter, basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { canonicalJson } from '../auditchain/forward-chain'
import type { IntegrityChange, IntegrityEntry, IntegrityManifest, IntegrityReport, IntegrityState } from './types'

const DEFAULT_MAX_FILES = 20_000
const DEFAULT_MAX_DEPTH = 24
const DEFAULT_BIG_FILE_BYTES = 1024 * 1024

/** 依赖目录、版本库元数据与工具缓存：由安装过程生成，不承载任务完成事实。 */
const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.nuxt',
  '.cache', '.qgate', '.claude', '.idea', '.turbo', 'coverage',
])

export interface ManifestOptions {
  /** 超过该字节数的文件不再计算全文哈希。 */
  bigFileBytes?: number
  maxFiles?: number
  maxDepth?: number
  /** 额外排除的绝对路径（如 trust 自身的存储目录）。 */
  excludePaths?: string[]
}

export class IntegrityError extends Error {
  code: 'root_missing' | 'root_not_directory' | 'root_not_allowed'
  constructor(code: IntegrityError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex')
}

/** 允许扫描的工作区根：HERMES_TRUST_ROOTS（冒号分隔）优先，否则家目录与系统临时目录。 */
export function allowedWorkspaceRoots(): string[] {
  const env = process.env.HERMES_TRUST_ROOTS?.trim()
  const raw = env ? env.split(delimiter).map((s) => s.trim()).filter(Boolean) : [homedir(), tmpdir()]
  // 两侧都取真实路径，避免 /tmp → /private/tmp 这类符号链接造成误判。
  return raw.map((p) => {
    const abs = resolve(p)
    try {
      return realpathSync(abs)
    } catch {
      return abs
    }
  })
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 真实路径归一：目录已存在时取 realpath；不存在时取父目录的 realpath 再拼回名字。
 * macOS 的 /var → /private/var 会让"排除目录"与遍历得到的绝对路径对不上。
 */
function realOrResolved(p: string): string {
  const abs = resolve(p)
  try {
    return realpathSync(abs)
  } catch {
    try {
      return join(realpathSync(dirname(abs)), basename(abs))
    } catch {
      return abs
    }
  }
}

/** 解析并校验工作区根；越界直接拒绝，不静默换成别的目录。 */
export function assertWorkspaceRoot(root: string): string {
  const trimmed = String(root ?? '').trim()
  if (!trimmed) throw new IntegrityError('root_missing', '工作区根目录不能为空')
  if (!isAbsolute(trimmed)) throw new IntegrityError('root_not_allowed', '工作区根目录必须是绝对路径')
  const abs = resolve(trimmed)
  if (!existsSync(abs)) throw new IntegrityError('root_missing', '工作区根目录不存在')
  let real: string
  try {
    real = realpathSync(abs)
  } catch {
    real = abs
  }
  if (!lstatSync(real).isDirectory()) throw new IntegrityError('root_not_directory', '工作区根目录不是目录')
  const allowed = allowedWorkspaceRoots()
  if (!allowed.some((a) => isInside(a, real))) {
    throw new IntegrityError('root_not_allowed', '工作区根目录不在允许范围内')
  }
  return real
}

function digestOf(entries: readonly IntegrityEntry[]): string {
  // 摘要只包含"内容身份"：小文件用 sha256，大文件用大小+修改时间，符号链接用目标。
  // 刻意不包含普通小文件的 mtime——只 touch 不改内容不应判违规。
  const rows = entries.map((e) => {
    if (e.mode === 'symlink') return { path: e.path, mode: e.mode, linkTarget: e.linkTarget ?? '' }
    if (e.mode === 'size_mtime' || e.unreadable) return { path: e.path, mode: e.mode, size: e.size, mtimeMs: e.mtimeMs ?? 0 }
    return { path: e.path, mode: e.mode, size: e.size, sha256: e.sha256 ?? '' }
  })
  return sha256(canonicalJson(rows))
}

export function manifestDigest(entries: readonly IntegrityEntry[]): string {
  return digestOf(entries)
}

/**
 * 采集一份工作区清单。同步实现，避免扫描期间目录继续变化造成同一份清单自相矛盾；
 * 文件按路径排序，保证同一工作区两次采集的摘要可比。
 */
export function buildManifest(root: string, options: ManifestOptions = {}): IntegrityManifest {
  const realRoot = assertWorkspaceRoot(root)
  const bigFileBytes = options.bigFileBytes ?? DEFAULT_BIG_FILE_BYTES
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const excludePaths = (options.excludePaths ?? []).map(realOrResolved)
  const entries: IntegrityEntry[] = []
  const excludedDirs: Record<string, number> = {}
  let truncated = false
  let totalBytes = 0

  const add = (entry: IntegrityEntry): void => {
    if (entries.length >= maxFiles) {
      truncated = true
      return
    }
    entries.push(entry)
  }

  const walk = (dir: string, depth: number): void => {
    if (truncated || depth > maxDepth) return
    let names: string[]
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (truncated) return
      const abs = join(dir, name)
      if (excludePaths.some((p) => abs === p || isInside(p, abs))) continue
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      const relPath = relative(realRoot, abs).split(sep).join('/')
      if (st.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRS.has(name)) {
          excludedDirs[name] = (excludedDirs[name] ?? 0) + 1
          continue
        }
        walk(abs, depth + 1)
        continue
      }
      if (st.isSymbolicLink()) {
        let target = ''
        try {
          target = readlinkSync(abs)
        } catch {
          // 读不到目标时保留空串，条目仍在清单里，删除/重建仍会被发现。
        }
        add({ path: relPath, size: 0, mode: 'symlink', linkTarget: target })
        continue
      }
      totalBytes += st.size
      if (st.size > bigFileBytes) {
        add({ path: relPath, size: st.size, mode: 'size_mtime', mtimeMs: st.mtimeMs })
        continue
      }
      try {
        const buf = readFileSync(abs)
        add({ path: relPath, size: st.size, mode: 'sha256', sha256: sha256(buf) })
      } catch {
        add({ path: relPath, size: st.size, mode: 'size_mtime', mtimeMs: st.mtimeMs, unreadable: true })
      }
    }
  }

  walk(realRoot, 0)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    id: sha256(`${realRoot}|${Date.now()}|${randomBytes(6).toString('hex')}`).slice(0, 24),
    root: realRoot,
    generatedAt: Date.now(),
    fileCount: entries.length,
    totalBytes,
    digest: digestOf(entries),
    truncated,
    excludedDirs,
    entries,
  }
}

/** 两份清单的差异。只比较路径与内容身份，不比较采集时间。 */
export function diffManifests(before: IntegrityManifest, after: IntegrityManifest): IntegrityChange[] {
  const changes: IntegrityChange[] = []
  const beforeMap = new Map(before.entries.map((e) => [e.path, e]))
  const afterMap = new Map(after.entries.map((e) => [e.path, e]))
  for (const [path, b] of beforeMap) {
    const a = afterMap.get(path)
    if (!a) changes.push({ path, kind: 'removed' })
    else if (!sameEntry(b, a)) changes.push({ path, kind: 'modified' })
  }
  for (const path of afterMap.keys()) {
    if (!beforeMap.has(path)) changes.push({ path, kind: 'added' })
  }
  changes.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
  return changes
}

function sameEntry(a: IntegrityEntry, b: IntegrityEntry): boolean {
  if (a.mode !== b.mode) return false
  if (a.mode === 'symlink') return a.linkTarget === b.linkTarget
  if (a.mode === 'size_mtime') return a.size === b.size && (a.mtimeMs ?? 0) === (b.mtimeMs ?? 0)
  return a.size === b.size && a.sha256 === b.sha256
}

/**
 * 由完整基线清单、当前清单与审计者自报值生成完整性结论。
 * 框架观察值优先：自报 clean 但差异非空时 state=violated 且 overridden=true。
 */
export function reportIntegrity(
  before: IntegrityManifest | null,
  current: IntegrityManifest | null,
  selfReported?: IntegrityState,
): IntegrityReport {
  if (!before || !current) {
    return {
      state: 'unknown',
      baselineManifestId: before?.id ?? null,
      baselineDigest: before?.digest ?? null,
      currentManifestId: current?.id ?? null,
      currentDigest: current?.digest ?? null,
      changes: [],
      changeTotal: 0,
      checkedAt: Date.now(),
      truncated: current?.truncated ?? false,
      selfReported,
      overridden: false,
    }
  }
  const changes = diffManifests(before, current)
  const state: IntegrityState = changes.length === 0 ? 'clean' : 'violated'
  return {
    state,
    baselineManifestId: before.id,
    baselineDigest: before.digest,
    currentManifestId: current.id,
    currentDigest: current.digest,
    changes: changes.slice(0, 200),
    changeTotal: changes.length,
    checkedAt: Date.now(),
    truncated: current.truncated,
    selfReported,
    overridden: selfReported === 'clean' && state === 'violated',
  }
}
