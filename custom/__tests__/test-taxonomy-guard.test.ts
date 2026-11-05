// 守门:测试三分类完整性——每个 .test.ts 必须命中 config/test-classes.json 的规则。
// 新增测试目录不登记 = 默认 behavior 掩盖新面；本测试让「未登记」直接红。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 B4）
import { describe, expect, it } from 'vitest'
import { buildManifest, classifyFile, loadConfig } from '../../scripts/test-classify.mjs'

const config = loadConfig(process.cwd())

describe('classifyFile', () => {
  it('仓级治理守门 → pin', () => {
    expect(classifyFile('custom/__tests__/docs-ssot-guard.test.ts', '', config)).toBe('pin')
  })
  it('读源码的域内测试 → pin（启发式）', () => {
    expect(classifyFile('custom/client/ide/__tests__/x.test.ts', "const s = readFileSync('a.ts')", config)).toBe('pin')
  })
  it('读 fixture 的域内测试 → behavior（不误伤）', () => {
    expect(classifyFile('custom/server/x/__tests__/y.test.ts', "readFileSync('fixtures/a.json')", config)).toBe('behavior')
  })
  it('contract 文件名 → contract', () => {
    expect(classifyFile('custom/server/x/__tests__/api-contract.test.ts', '', config)).toBe('contract')
  })
  it('未登记目录 → null（必须红）', () => {
    expect(classifyFile('custom/newarea/__tests__/x.test.ts', '', config)).toBeNull()
  })
})

describe('buildManifest', () => {
  it('全部测试文件都有分类，计数与总数一致', () => {
    const manifest = buildManifest(process.cwd())
    expect(manifest.unclassified).toEqual([])
    expect(manifest.total).toBeGreaterThan(1000)
    expect(manifest.counts.behavior + manifest.counts.contract + manifest.counts.pin).toBe(manifest.total)
    expect(manifest.counts.pin).toBeGreaterThan(0)
    expect(manifest.counts.behavior).toBeGreaterThan(0)
  })
})
