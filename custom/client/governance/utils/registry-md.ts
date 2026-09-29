// overlay/custom/client/governance/utils/registry-md.ts
// P6-P8 注册表 markdown ↔ 结构化行 双向转换（单一事实源=中央仓 md；UI 与 md 双向一致守门在此）。
export interface MdTable {
  header: string[]
  rows: string[][]
  /** 序列化回原文（保留前置说明与表后章节） */
  serialize(preamble: string[], after: string[]): string
}

/** 解析 markdown 中第一张表（P7 应用资产表 / P8 org 编制表 / P6 roster 表共用）。 */
export function parseFirstTable(md: string): { table: MdTable; preamble: string[]; after: string[] } {
  const lines = md.split('\n')
  let ti = -1
  for (let i = 0; i + 1 < lines.length; i++) {
    if (/^\|/.test(lines[i]) && /^\|[\s:|-]+\|$/.test(lines[i + 1])) { ti = i; break }
  }
  if (ti < 0) return {
    table: { header: [], rows: [], serialize: (p, a) => [...p, ...a].join('\n') },
    preamble: lines, after: [],
  }
  const header = splitRow(lines[ti])
  let j = ti + 2
  const rows: string[][] = []
  while (j < lines.length && /^\|/.test(lines[j])) { rows.push(splitRow(lines[j])); j++ }
  const preamble = lines.slice(0, ti)
  const after = lines.slice(j)
  const table: MdTable = {
    header, rows,
    serialize: (p, a) => [...p, `| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`,
      ...rows.map(r => `| ${r.join(' | ')} |`), ...a].join('\n'),
  }
  return { table, preamble, after }
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
}

export function setCellAlign(rows: string[][], cols: number): string[][] {
  return rows.map(r => { const c = [...r]; while (c.length < cols) c.push(''); return c.slice(0, cols) })
}
