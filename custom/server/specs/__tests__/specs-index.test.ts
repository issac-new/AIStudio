// P2（JoyAI 闭环吸收轮）守门：specs 只读索引——清单解析（日期/标题）、mtime 缓存、
// 关键词检索与全文提及扫描、fail-soft（目录缺席空结果、单文件坏不连坐）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listSpecDocs, searchSpecs, specMentionsTerm, resetSpecsIndexForTests } from '../specs-index'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'specs-index-'))
  process.env.SPECS_DIR = dir
  resetSpecsIndexForTests()
  writeFileSync(join(dir, '2026-01-02-beta-design.md'), '# Beta 设计\n正文提到支付收银台。', 'utf8')
  writeFileSync(join(dir, '2026-01-01-alpha.md'), '# Alpha 分析\n这里写了 Payment 通道。', 'utf8')
  writeFileSync(join(dir, 'no-date-notes.md'), '无标题文档，提到支付。', 'utf8')
})

afterEach(() => {
  delete process.env.SPECS_DIR
  resetSpecsIndexForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('listSpecDocs（清单解析）', () => {
  it('只收 .md；标题取首个 # 行，缺席回落文件名；日期取文件名前缀', () => {
    const docs = listSpecDocs()
    expect(docs.map((d) => d.file)).toEqual(['no-date-notes.md', '2026-01-02-beta-design.md', '2026-01-01-alpha.md'])
    const beta = docs.find((d) => d.file === '2026-01-02-beta-design.md')!
    expect(beta.title).toBe('Beta 设计')
    expect(beta.date).toBe('2026-01-02')
    const noDate = docs.find((d) => d.file === 'no-date-notes.md')!
    expect(noDate.title).toBe('no-date-notes')
    expect(noDate.date).toBeNull()
  })
  it('目录缺席 → 空清单（fail-soft）', () => {
    process.env.SPECS_DIR = join(dir, 'ghost')
    resetSpecsIndexForTests()
    expect(listSpecDocs()).toEqual([])
  })
})

describe('searchSpecs（关键词检索）', () => {
  it('中文关键词命中正文；大小写不敏感；按文件名倒序', () => {
    const hits = searchSpecs(['支付'])
    expect(hits.map((h) => h.file)).toEqual(['no-date-notes.md', '2026-01-02-beta-design.md'])
    expect(hits[1].matchedLine).toContain('支付收银台')
  })
  it('英文大小写不敏感；短词（<2 字符）不参与；limit 生效', () => {
    expect(searchSpecs(['payment']).map((h) => h.file)).toEqual(['2026-01-01-alpha.md'])
    expect(searchSpecs(['a'])).toEqual([])
    expect(searchSpecs(['支付'], 1).length).toBe(1)
  })
})

describe('specMentionsTerm（全文提及扫描，P3 消费）', () => {
  it('术语在正文出现即命中（供术语→关联文档）；<2 字符不参与', () => {
    const hits = specMentionsTerm('支付')
    expect(hits.length).toBe(2)
    expect(specMentionsTerm('支')).toEqual([])
    expect(specMentionsTerm('不存在词')).toEqual([])
  })
})
