// overlay/skillprovision：skill-catalog.md 只读解析。
//
// 这份文档是人读的“适用 profile”声明，不是机器契约；本模块按 Markdown 表格做
// 有界解析并明确标注启发式匹配。它只用于对账列，不作为供给期望源——供给只认
// skill-provisioning.json。分组行（如 `docx / pdf / xlsx`）按 `/` 拆成多项。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CatalogLoad, CatalogRow } from './types'

const MAX_ROWS = 500
const INACTIVE = /retired|已退役|archived|退役/i

export function defaultCatalogPath(hostRoot: string): string {
  return join(hostRoot, 'profiles', '_shared', '06-observability', 'skill-catalog.md')
}

function cellsOf(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
}

export function parseCatalog(path: string): CatalogLoad {
  if (!existsSync(path)) return { available: false, path, note: '目录文档不存在', rows: [] }
  let text: string
  try { text = readFileSync(path, 'utf8') } catch (e) {
    return { available: false, path, note: `读取失败：${(e as Error).message}`, rows: [] }
  }
  const rows: CatalogRow[] = []
  let badRows = 0
  for (const [i, line] of text.split('\n').entries()) {
    if (!line.trim().startsWith('|')) continue
    if (rows.length >= MAX_ROWS) break
    const cells = cellsOf(line)
    if (cells.length < 4 || isSeparator(cells)) continue
    const head = cells[0].toLowerCase()
    if (head === 'skill' || head === '技能') continue
    const status = cells[3]
    if (INACTIVE.test(status)) continue
    const appliesTo = cells[2]
    if (!appliesTo || !cells[0]) { badRows += 1; continue }
    for (const name of cells[0].split('/').map((s) => s.trim()).filter(Boolean)) {
      rows.push({ skill: name, appliesTo, status, line: i + 1 })
    }
  }
  return {
    available: true,
    path,
    note: badRows > 0 ? `跳过缺列行 ${badRows} 行；适用 profile 为启发式匹配` : '适用 profile 为启发式匹配',
    rows,
  }
}

/**
 * 启发式判断 catalog 行是否适用于某 profile。
 * 规则：含“所有/全部/通用”=全部；否则按 `/、,，空白` 切词，profile 全名或
 * profile 的连字符分段命中即算适用（例：`orchestrator` 命中 `aiteam-orchestrator`）。
 */
export function catalogAppliesTo(appliesTo: string, profile: string): boolean {
  if (/所有|全部|通用/.test(appliesTo)) return true
  const tokens = appliesTo.split(/[/、,，\s]+/).map((s) => s.trim()).filter(Boolean)
  const parts = profile.split('-')
  return tokens.some((t) => t === '*' || t === profile || parts.includes(t))
}
