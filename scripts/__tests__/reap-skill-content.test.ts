// REAP 内容完整性守门：26 个场景包、声明口径 102 条提示词。
// 代码块共 105 个：reap-00 的安装连接说明不计入提示词，reap-prompts 索引与
// reap-wildcard 通配模板也不计入；三个辅助块与 102 条场景提示词分开统计。
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../team/skills/devops/rea-reverse-engineering/references/reap')
const AUXILIARY_BLOCKS = new Set(['reap-00-install-and-verify', 'reap-prompts', 'reap-wildcard'])

describe('REAP 26 包与 102 条提示词', () => {
  const packs = readdirSync(ROOT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()
  const rows = packs.map(name => {
    const source = readFileSync(resolve(ROOT, name, 'SKILL.md'), 'utf8')
    return {
      name,
      source,
      declared: Number(source.match(/\((\d+) ready-to-paste prompts?\)/)?.[1] ?? 0),
      blocks: (source.match(/^```text$/gm) ?? []).length,
    }
  })

  it('26 个场景包均有 frontmatter 与 name', () => {
    expect(packs).toHaveLength(26)
    for (const row of rows) {
      expect(row.source.startsWith('---\nname:'), row.name).toBe(true)
    }
  })

  it('声明总数=102，代码块=105，三个辅助块单列', () => {
    expect(rows.reduce((n, row) => n + row.declared, 0)).toBe(102)
    expect(rows.reduce((n, row) => n + row.blocks, 0)).toBe(105)
    for (const row of rows) {
      if (!AUXILIARY_BLOCKS.has(row.name)) expect(row.blocks, row.name).toBe(row.declared)
    }
    expect(rows.find(r => r.name === 'reap-prompts')?.blocks).toBe(1)
    expect(rows.find(r => r.name === 'reap-wildcard')?.blocks).toBe(1)
  })
})
