// specs 根目录的覆盖义务唯一来源＝gen-doc-indexes 生成的机械索引（设计文档全量索引）；
// 附录 A 自 2026-11-12 冻结为历史档案，只保留结构完整性（无重复/无重叠/无失效路径），
// 不再承担「每新增一份 spec 必须登记」的义务。
// 2026-11-12 守卫测试迁 lint 首批：README 唯一正本指针、附录 A 冻结声明句、
// 附录 A 标题计数互洽三组纯文本断言已迁入 gen-doc-indexes --check（失败即给修复
// 指引，pre-push merge-invariants 同点拦截），本文件只留解析器行为与结构完整性。
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareIndex, machineRegion, parseListLinks } from '../../scripts/maintenance/gen-doc-indexes.mjs'

const ROOT = resolve(__dirname, '../..')
const SPECS_DIR = resolve(ROOT, 'docs/superpowers/specs')
const APPENDIX_PATH = resolve(SPECS_DIR, '2026-10-21-swarmstudio-appendix-a-spec-index.md')
const INDEX_PATH = resolve(ROOT, 'docs/manuals/aistudio-design-document-index.md')

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
  // 单元格内转义管道 \| 是合法 Markdown（2026-11-08 存量红根治：run28-burn-fixes
  // 附录行含「\| tostring」，裸切 | 误判 4 列三测全红）。按未转义管道切、还原转义符。
  return trimmed
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
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
  const delimiterLine = lineOffset + headerIndex + 1
  const delimiterCells = delimiter ? splitTableRow(delimiter) : []
  if (delimiterCells.length !== headers.length) {
    throw new Error(
      `第 ${delimiterLine} 行分隔行列数错误：表头 ${headers.length} 列，分隔行 ${delimiterCells.length} 列`,
    )
  }
  const invalidDelimiterCell = delimiterCells.find((cell) => !/^:?-{3,}:?$/.test(cell))
  if (invalidDelimiterCell !== undefined) {
    throw new Error(`第 ${delimiterLine} 行分隔行单元格不符合 :?-{3,}:?：${invalidDelimiterCell}`)
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

  it('解析器接受单元格内转义管道 \\|（2026-11-08 存量红根治回归锁）', () => {
    const doc = `# 附录 A：测试索引（1 份文档）
## A.1 逐份索引
| 文件名 | 主旨 | 结论要点 |
|---|---|---|
| 2026-11-07-run28-burn-fixes | 烧机两修 | jq 崩归一 (. // "") \\| tostring |
### 角色/排除（非 spec 文档）
| 文件名 | 角色/排除 | 说明 |
|---|---|---|
## A.2 历史快照
`
    const parsed = parseAppendix(doc)
    expect(parsed.a1Rows).toHaveLength(1)
    expect(parsed.a1Rows[0].cells[2]).toContain('(. // "") | tostring')
  })

  it.each([
    { label: '少一列', delimiter: '|---|---|', columns: 2 },
    { label: '多一列', delimiter: '|---|---|---|---|', columns: 4 },
  ])('解析器拒绝分隔行$label（表头 3 列）', ({ delimiter, columns }) => {
    const malformed = `# 附录 A：测试索引（1 份文档）
## A.1 逐份索引
| 文件名 | 主旨 | 结论要点 |
|---|---|---|
| 2026-01-01-design | 设计 | 保留 |
### 角色/排除（非 spec 文档）
| 文件名 | 角色/排除 | 说明 |
${delimiter}
| 2026-01-01-navigation | 导航 | 指向正本 |
## A.2 历史快照
`
    expect(() => parseAppendix(malformed)).toThrow(
      new RegExp(`分隔行列数错误：表头 3 列，分隔行 ${columns} 列`),
    )
  })

  it('附录包含且只包含一个 A.1 内的角色/排除表', () => {
    const parsed = parseAppendix(readFileSync(APPENDIX_PATH, 'utf8'))
    expect(parsed.roleHeadingCount).toBe(1)
  })

  it('机械索引覆盖 specs 直接根 Markdown 集合且头计数一致（覆盖义务唯一来源）', () => {
    const text = readFileSync(INDEX_PATH, 'utf8')
    const specs = readdirSync(SPECS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort()
    const report = compareIndex({ links: parseListLinks(machineRegion(text)), specs, text })
    expect(report.problems, JSON.stringify(report.problems)).toEqual([])
  })

  it('附录 A 冻结：无重复、A.1 与角色表不重叠，且每个路径仍在 specs 根或 archive', () => {
    const parsed = parseAppendix(readFileSync(APPENDIX_PATH, 'utf8'))
    const rootStems = new Set(directRootMarkdownStems())
    const archiveDir = resolve(SPECS_DIR, 'archive')
    const archiveStems = new Set(
      readdirSync(archiveDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name.slice(0, -'.md'.length)),
    )
    const a1Stems = parsed.a1Rows.map((row) => row.cells[0])
    const roleStems = parsed.roleRows.map((row) => row.cells[0])
    expect(duplicateStems([...a1Stems, ...roleStems])).toEqual([])
    expect(a1Stems.filter((stem) => roleStems.includes(stem))).toEqual([])
    const dangling = [...a1Stems, ...roleStems].filter((stem) => !rootStems.has(stem) && !archiveStems.has(stem))
    expect(dangling, '附录 A 冻结后仍须指向存在文件（specs 根或 archive）').toEqual([])
  })
})
