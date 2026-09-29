// overlay/custom/client/governance/__tests__/registry-md.test.ts
// P7/P8 双向一致守门：真实 app-registry/org 片段 解析→改行→序列化 回环保真。
import { describe, it, expect } from 'vitest'
import { parseFirstTable, setCellAlign } from '../utils/registry-md'

const APP_MD = `# 应用资产登记表（app-registry）

| 应用 | 负责人 | 专属看板 | 技术栈 | SLA 级 | 状态 | 门禁骨架 |
|---|---|---|---|---|---|---|
| csw-pay-core | chen | chen-pay-core | node/axios | Gold | 在役 | vitest ✓ |

- 初始化约定：新应用必须建脚手架。`

describe('registry-md（P7/P8 双向一致）', () => {
  it('解析首表：7 列表头+1 行；前置与表后段保留', () => {
    const { table, preamble, after } = parseFirstTable(APP_MD)
    expect(table.header).toHaveLength(7)
    expect(table.rows[0][0]).toBe('csw-pay-core')
    expect(preamble.join('\n')).toContain('app-registry')
    expect(after.join('\n')).toContain('初始化约定')
  })

  it('改行序列化回环：结构保真（P7 保存即 md 双向一致）', () => {
    const { table, preamble, after } = parseFirstTable(APP_MD)
    table.rows[0][1] = 'zhang'
    table.rows.push(['csw-new', 'zhang', 'zhang-board', 'node', 'Silver', '在役', 'vitest ✓'])
    const out = table.serialize(preamble, after)
    const re = parseFirstTable(out)
    expect(re.table.rows).toHaveLength(2)
    expect(re.table.rows[0][1]).toBe('zhang')
    expect(out).toContain('初始化约定')
  })

  it('setCellAlign 补齐/截断列', () => {
    expect(setCellAlign([['a']], 3)[0]).toEqual(['a', '', ''])
  })
})
