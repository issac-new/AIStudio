// custom/server/services/hermes/kanban-layout.ts
// 看板库「布局解析」单一事实源（2026-11-19 流程解耦批二）。
//
// 边界：本模块只管「给定 hermes home 之后的库布局语义」——主库三态、分板双布局、
// 板名推导。家目录解析（HERMES_HOME 等 env 候选政策）仍归 lib/paths.ts 的 hermesHome；
// 各域的显式 pin env（ORCHESTRATOR_KANBAN_DBS / HERMES_KANBAN_DB / SIM 根）是域策略，
// 不并进来。
//
// 为什么需要：批一调研实锤 9+ 份路径实现漂移——枚举类只认新布局（旧布局部署下
// governance/mind/ontology 集体读空而 delivery 能读到）、单板类口径不一、
// boardNameOf 在 kanban-bridge 与 project-tasks 逐字重复。收敛后新增字面量由
// custom/__tests__/kanban-layout-ratchet.test.ts 拦截（允许清单只减不增）。
//
// 布局正本：kernel kanban_db.py 的落库布局——default 板 DB 在 <root>/kanban.db（或
// <root>/kanban/kanban.db 旧根级），其它板在 <root>/kanban/boards/<slug>/kanban.db
// （旧布局 <root>/boards/<slug>/kanban.db）。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 主库（default 板）路径：现行根级 → 旧 kanban/ 根级，两态探测。 */
export function mainDbOf(home: string): string | null {
  const p1 = join(home, 'kanban.db')
  if (existsSync(p1)) return p1
  const p2 = join(home, 'kanban', 'kanban.db')
  return existsSync(p2) ? p2 : null
}

/** 主库首选候选（不做在位探测）：桥/投影类消费方需要「即使尚未落库也拿得到路径」。 */
export function mainDbCandidateOf(home: string): string {
  return join(home, 'kanban.db')
}

/** 命名板首选候选（不做在位探测）：同上，供 slug→路径反查类消费方。 */
export function boardDbCandidateOf(slug: string, home: string): string {
  const s = slug.trim()
  if (!s || s === 'default') return mainDbCandidateOf(home)
  return join(home, 'kanban', 'boards', s, 'kanban.db')
}

/** 分板目录（存在的才进表）：新布局在前，旧布局兜底；两者并存时都返回（迁移中间态）。 */
export function boardsDirsOf(home: string): string[] {
  return [join(home, 'kanban', 'boards'), join(home, 'boards')].filter(p => existsSync(p))
}

/**
 * 单板库路径。default 板三态（W4 走查实锤口径：根级主库 → boards/default → 旧根级）；
 * 命名板双布局。不存在返回 null，调用方 fail-soft。
 */
export function boardDbPathOf(slug: string, home: string): string | null {
  const s = slug.trim()
  if (!s) return null
  const candidates = s === 'default'
    ? [join(home, 'kanban.db'), join(home, 'kanban', 'boards', 'default', 'kanban.db'), join(home, 'kanban', 'kanban.db')]
    : [join(home, 'kanban', 'boards', s, 'kanban.db'), join(home, 'boards', s, 'kanban.db')]
  return candidates.find(p => existsSync(p)) ?? null
}

export interface BoardDbEntry { slug: string; dbPath: string }

/**
 * 命名板枚举（不含 default 主库）：双布局全枚举、按 dbPath 去重（同板两布局并存只取先见）。
 * skipUnderscored=true 跳过 `_` 前缀目录（project-tasks/clusterinspector 既有口径：
 * 特殊/归档目录不入业务枚举）；缺省不跳（governance/mind 枚举原口径）。
 */
export function namedBoardDbsOf(home: string, opts?: { skipUnderscored?: boolean }): BoardDbEntry[] {
  const out: BoardDbEntry[] = []
  const seen = new Set<string>()
  for (const dir of boardsDirsOf(home)) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue // 读目录失败如实跳过该布局
    }
    for (const name of names) {
      if (opts?.skipUnderscored && name.startsWith('_')) continue
      const dbPath = join(dir, name, 'kanban.db')
      if (!existsSync(dbPath) || seen.has(dbPath)) continue
      seen.add(dbPath)
      out.push({ slug: name, dbPath })
    }
  }
  return out
}

/** 全部板库：default 主库（在位才进表）＋命名板；去重稳定序。 */
export function allBoardDbsOf(home: string, opts?: { skipUnderscored?: boolean }): BoardDbEntry[] {
  const main = mainDbOf(home)
  const named = namedBoardDbsOf(home, opts)
  const seen = new Set(named.map(e => e.dbPath))
  const out: BoardDbEntry[] = []
  if (main && !seen.has(main)) out.push({ slug: 'default', dbPath: main })
  out.push(...named.filter(e => e.dbPath !== main))
  return out
}

/**
 * 路径 → 板名：含 `boards/<slug>` 段才认板名，否则 default——临时目录里的裸
 * kanban.db 是测试库，不是新板（kanban-bridge 原注释口径，双胞胎收口）。
 */
export function boardSlugOf(dbPath: string): string {
  const parts = dbPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const file = parts[parts.length - 1] ?? 'kanban.db'
  if (file === 'kanban.db') {
    const boardsIdx = parts.lastIndexOf('boards')
    const slug = boardsIdx >= 0 ? parts[boardsIdx + 1] : ''
    if (slug && slug !== 'kanban.db') return slug
    return 'default'
  }
  return file.replace(/\.db$/, '')
}

/** 是否像一个看板 home（kanban-home 探测序等价收一）：任一主库态或分板目录在位。 */
export function isKanbanHome(p: string): boolean {
  try {
    return mainDbOf(p) !== null || boardsDirsOf(p).length > 0
  } catch {
    return false
  }
}
