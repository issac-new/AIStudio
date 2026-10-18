// overlay/skillprovision：技能根扫描（只认 SKILL.md）。
//
// 纪律：数技能必须数 SKILL.md，不能数顶层目录——`apple/`、`web/` 这类分类目录
// 只有一个 DESCRIPTION.md，2026-10-18 调研首轮就是把它当技能数出了 18–22/账号
// 的错误结论。符号链接按真实目录去重防环；单根有界（5000 目录 / 深度 8）；
// 读失败 fail-soft，不抛。
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { SkillEntry, SkillRootScan } from './types'

const MAX_DIRS = 5000
const MAX_DEPTH = 8
const SKIP_DIRS = new Set(['node_modules', '.git', '.archive', '.hub', '.locks', '.trash'])

/** 扫描一个技能根（全局库或某个 profile 的 skills 目录）。 */
export function scanSkillRoot(rootInput: string): SkillRootScan {
  const root = resolve(rootInput)
  if (!existsSync(root)) {
    return { root, available: false, note: '根目录不存在', skills: [], ambiguous: [] }
  }
  const skills: SkillEntry[] = []
  const visited = new Set<string>()
  let dirs = 0
  const stack: Array<{ dir: string; depth: number; viaLink: boolean }> = [{ dir: root, depth: 0, viaLink: false }]

  while (stack.length > 0) {
    if (dirs >= MAX_DIRS) break
    const cur = stack.pop()!
    if (cur.depth > MAX_DEPTH) continue
    let real: string
    try { real = realpathSync(cur.dir) } catch { continue }
    if (visited.has(real)) continue
    visited.add(real)
    dirs += 1

    let entries
    try { entries = readdirSync(cur.dir, { withFileTypes: true }) } catch { continue }
    const hasSkill = entries.some((e) => e.name === 'SKILL.md' && (e.isFile() || e.isSymbolicLink()))
    if (hasSkill) {
      // 技能目录不再下钻：支持目录（references/scripts）不是独立技能。
      skills.push({ name: basename(cur.dir), dir: cur.dir, realDir: real, viaLink: cur.viaLink })
      continue
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      const full = join(cur.dir, e.name)
      let isDir = e.isDirectory()
      if (e.isSymbolicLink()) {
        try { isDir = statSync(full).isDirectory() } catch { continue }
      }
      if (isDir) stack.push({ dir: full, depth: cur.depth + 1, viaLink: cur.viaLink || e.isSymbolicLink() })
    }
  }

  const byName = new Map<string, Set<string>>()
  for (const s of skills) {
    const set = byName.get(s.name) ?? new Set<string>()
    set.add(s.realDir)
    byName.set(s.name, set)
  }
  const ambiguous = [...byName.entries()].filter(([, dirsOfName]) => dirsOfName.size > 1).map(([name]) => name)
  const note = dirs >= MAX_DIRS ? `扫描达到 ${MAX_DIRS} 目录上限，结果可能不完整` : undefined
  return { root, available: true, note, skills, ambiguous }
}

/** 列 profile 名（跳过点目录/隐藏目录）。 */
export function listProfiles(profilesRoot: string): string[] {
  if (!existsSync(profilesRoot)) return []
  try {
    return readdirSync(profilesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/** 扫描某个 profile 的 skills 目录。 */
export function scanProfileSkills(profilesRoot: string, profile: string): SkillRootScan {
  return scanSkillRoot(join(profilesRoot, profile, 'skills'))
}

/** 技能名 → 条目列表（同名多目录保留全部，供歧义判定）。 */
export function indexSkills(scan: SkillRootScan): Map<string, SkillEntry[]> {
  const out = new Map<string, SkillEntry[]>()
  for (const s of scan.skills) {
    const list = out.get(s.name) ?? []
    list.push(s)
    out.set(s.name, list)
  }
  return out
}

/** 技能名列表（去重排序）。 */
export function skillNames(scan: SkillRootScan): string[] {
  return [...new Set(scan.skills.map((s) => s.name))].sort()
}
