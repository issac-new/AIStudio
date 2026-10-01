// overlay/custom/server/kanban/__tests__/column-artifacts.test.ts
// 守门：列证据契约（2026-10-01 吸收批 #16：routa requiredArtifacts 模型吸收）。
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadColumnAutomations, matchColumnTransition, resetColumnAutomationsCacheForTests } from '../column-automation'

let dir = ''

beforeEach(() => {
  resetColumnAutomationsCacheForTests()
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = mkdtempSync(join(tmpdir(), 'col-art-'))
  process.env.HERMES_COLUMNS_FILE = join(dir, 'columns.yaml')
})

describe('列证据契约 requiredArtifacts（routa 吸收）', () => {
  it('YAML 声明经解析透传到配置读取', () => {
    writeFileSync(process.env.HERMES_COLUMNS_FILE!, `
columns:
  review:
    timing: entry
    requiredArtifacts:
      - testlog.txt
      - report.md
    steps:
      - id: s1
        role: reviewer
        specialist: review-guard
        provider: zcode
`)
    const cfg = loadColumnAutomations()
    expect(cfg.review?.requiredArtifacts).toEqual(['testlog.txt', 'report.md'])
  })

  it('契约随 COLUMN_TRANSITION 匹配透传（闸门侧可核缺件）', () => {
    writeFileSync(process.env.HERMES_COLUMNS_FILE!, `
columns:
  review:
    timing: entry
    requiredArtifacts: [freeze.md, testlog.txt]
    steps:
      - id: s1
        role: reviewer
        provider: zcode
`)
    const triggers = matchColumnTransition('dev', 'review')
    expect(triggers).toHaveLength(1)
    expect(triggers[0]!.requiredArtifacts).toEqual(['freeze.md', 'testlog.txt'])
  })

  it('缺省无契约=字段缺席（现状语义不变）；坏值过滤截断', () => {
    const long = 'x'.repeat(65)
    writeFileSync(process.env.HERMES_COLUMNS_FILE!, `
columns:
  plain:
    steps:
      - id: s1
        role: r
        provider: zcode
  noisy:
    requiredArtifacts: ["ok.md", "", 42, "${long}", "a.md", "b.md", "c.md", "d.md", "e.md", "f.md", "g.md"]
    steps: []
`)
    const cfg = loadColumnAutomations()
    expect(cfg.plain?.requiredArtifacts).toBeUndefined()
    // 空串/非串/超长被滤；上限 8 条
    expect(cfg.noisy?.requiredArtifacts).toEqual(['ok.md', 'a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md'])
  })
})
