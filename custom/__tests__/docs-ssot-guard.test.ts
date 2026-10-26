// 附录 A 是 specs 根目录唯一的文件级索引：只扫直接 Markdown，不递归 archive/assets。
// 文档自身声明的日期不决定取舍；设计/规格/决策档入 A.1，导航/正本/汇编等入角色表。
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SPECS_DIR = resolve(ROOT, 'docs/superpowers/specs')
const APPENDIX_PATH = resolve(SPECS_DIR, '2026-10-21-swarmstudio-appendix-a-spec-index.md')

type TableRow = {
  cells: string[]
  line: number
}

type ParsedAppendix = {
  a1Rows: TableRow[]
  roleRows: TableRow[]
  roleHeadingCount: number
  statedA1Count: number
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    throw new Error(`Markdown 表格行必须以 | 起止：${line}`)
  }
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
}

function parseFileTable(lines: string[], lineOffset: number): TableRow[] {
  const headerIndex = lines.findIndex((line) => {
    if (!line.trim().startsWith('|')) return false
    return splitTableRow(line)[0] === '文件名'
  })
  if (headerIndex < 0) throw new Error('缺少表头首列为「文件名」的 Markdown 表格')

  const headers = splitTableRow(lines[headerIndex])
  if (headers.length !== 3) throw new Error(`文件索引表必须为 3 列，实际为 ${headers.length} 列`)
  const delimiter = lines[headerIndex + 1]?.trim() ?? ''
  if (!/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(delimiter)) {
    throw new Error(`第 ${lineOffset + headerIndex + 1} 行缺少合法 Markdown 表格分隔行`)
  }

  const rows: TableRow[] = []
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim().startsWith('|')) break
    const cells = splitTableRow(line)
    if (cells.length !== headers.length) {
      throw new Error(
        `第 ${lineOffset + index} 行列数错误：表头 ${headers.length} 列，数据行 ${cells.length} 列`,
      )
    }
    if (cells.some((cell) => cell.length === 0)) {
      throw new Error(`第 ${lineOffset + index} 行存在空白单元格`)
    }
    rows.push({ cells, line: lineOffset + index })
  }
  return rows
}

function parseAppendix(markdown: string): ParsedAppendix {
  const lines = markdown.split('\n')
  const a1Heading = lines.findIndex((line) => /^## A\.1\s/.test(line))
  const a2Heading = lines.findIndex((line) => /^## A\.2\s/.test(line))
  if (a1Heading < 0 || a2Heading < 0 || a1Heading >= a2Heading) {
    throw new Error('附录 A 必须按顺序包含 A.1 与 A.2 二级标题')
  }

  const roleHeadings = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => index > a1Heading && index < a2Heading && /^### 角色\/排除/.test(line))
  const roleHeadingCount = roleHeadings.length
  const a1End = roleHeadingCount > 0 ? roleHeadings[0].index : a2Heading
  const a1Rows = parseFileTable(lines.slice(a1Heading + 1, a1End), a1Heading + 2)
  const roleRows = roleHeadingCount === 1
    ? parseFileTable(lines.slice(roleHeadings[0].index + 1, a2Heading), roleHeadings[0].index + 2)
    : []

  const title = lines.find((line) => line.startsWith('# ')) ?? ''
  const countMatch = /^# 附录 A：.*（(\d+) 份[^）]*）/.exec(title)
  return {
    a1Rows,
    roleRows,
    roleHeadingCount,
    statedA1Count: countMatch ? Number(countMatch[1]) : Number.NaN,
  }
}

function directRootMarkdownStems(): string[] {
  return readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -'.md'.length))
    .sort()
}

function duplicateStems(stems: string[]): string[] {
  const counts = new Map<string, number>()
  for (const stem of stems) counts.set(stem, (counts.get(stem) ?? 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([stem]) => stem).sort()
}

describe('specs 文档单一事实源守门', () => {
  it('解析器拒绝列数损坏的角色表，坏表不能静默通过', () => {
    const malformed = `# 附录 A：测试索引（1 份文档）
## A.1 逐份索引
| 文件名 | 主旨 | 结论要点 |
|---|---|---|
| 2026-01-01-design | 设计 | 保留 |
### 角色/排除（非 spec 文档）
| 文件名 | 角色/排除 | 说明 |
|---|---|---|
| 2026-01-01-navigation | 导航 |
## A.2 历史快照
`
    expect(() => parseAppendix(malformed)).toThrow(/列数错误：表头 3 列，数据行 2 列/)
  })

  it('附录包含且只包含一个 A.1 内的角色/排除表', () => {
    const parsed = parseAppendix(readFileSync(APPENDIX_PATH, 'utf8'))
    expect(parsed.roleHeadingCount).toBe(1)
  })

  it('A.1 与角色表不重叠，其并集精确等于 specs 直接根 Markdown 集合', () => {
    const parsed = parseAppendix(readFileSync(APPENDIX_PATH, 'utf8'))
    const rootStems = directRootMarkdownStems()
    const rootSet = new Set(rootStems)
    const a1Stems = parsed.a1Rows.map((row) => row.cells[0])
    const roleStems = parsed.roleRows.map((row) => row.cells[0])
    const a1Set = new Set(a1Stems)
    const roleSet = new Set(roleStems)
    const indexedStems = [...a1Stems, ...roleStems]
    const indexedSet = new Set(indexedStems)

    const actual = {
      missing: rootStems.filter((stem) => !indexedSet.has(stem)),
      ghosts: [...indexedSet].filter((stem) => !rootSet.has(stem)).sort(),
      duplicates: duplicateStems(indexedStems),
      overlap: [...a1Set].filter((stem) => roleSet.has(stem)).sort(),
    }
    expect(actual, 'A.1 与角色表必须无重复、无幽灵、无重叠，并覆盖每个直接根 Markdown 恰好一次').toEqual({
      missing: [],
      ghosts: [],
      duplicates: [],
      overlap: [],
    })
  })

  it('标题声明的 A.1 数量等于 A.1 实际数据行数', () => {
    const parsed = parseAppendix(readFileSync(APPENDIX_PATH, 'utf8'))
    expect(Number.isInteger(parsed.statedA1Count), '标题必须以「（N 份…）」声明 A.1 行数').toBe(true)
    expect(parsed.statedA1Count).toBe(parsed.a1Rows.length)
  })
})
