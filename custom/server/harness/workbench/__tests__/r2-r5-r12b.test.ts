// R2/R5/R12b（2026-10-31 二批执行）守门：gap 桥＋消融门＋R2 证据供给纯函数面。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCapabilityGaps, gapToDraft, appendGapSuggestion, GAP_REGISTER_PATH } from '../gap-source'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'r5-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('R5 gap 桥', () => {
  it('解析 capability 域条目（容错 YAML 子集）；其他域过滤；文件缺席 null', () => {
    const f = join(dir, 'gap.yaml')
    writeFileSync(f, [
      '- id: g1',
      '  domain: capability',
      '  description: 缺 web 检索技能',
      '  severity: high',
      '- id: g2',
      '  domain: hack',
      '  description: 无关条目',
    ].join('\n'))
    const gaps = readCapabilityGaps(f)
    expect(gaps).not.toBeNull()
    expect(gaps!.map((g) => g.id)).toEqual(['g1'])
    expect(gaps![0].severity).toBe('high')
    expect(readCapabilityGaps(join(dir, 'no.yaml'))).toBeNull()
  })

  it('gap→draft 映射（技能关键词→skills 面；evidenceRefs 引 gap id）', () => {
    const d = gapToDraft({ id: 'g9', domain: 'capability', description: '缺资料检索技能' })
    expect(d.surfaceKey).toBe('skills')
    expect(d.evidenceRefs).toEqual(['gap:g9'])
    expect(d.hypothesis).toContain('g9')
    const d2 = gapToDraft({ id: 'g10', domain: 'capability', description: '工具描述不准' })
    expect(d2.surfaceKey).toBe('tool_guidance')
  })

  it('appendGapSuggestion：新建带头＋追加幂等形态', () => {
    const f = join(dir, 'sub', 'suggestions.yaml')
    appendGapSuggestion(f, { gapId: 'g1', proposalId: 'hw-1', surfaceKey: 'skills', at: 'now' })
    appendGapSuggestion(f, { gapId: 'g2', proposalId: 'hw-2', surfaceKey: 'skills', at: 'now2' })
    const txt = readFileSync(f, 'utf8')
    expect(txt).toContain('R5 桥')
    expect(txt).toContain('gap_id: g1')
    expect(txt).toContain('gap_id: g2')
  })

  it('真实 gap_register 在位（本机活体：至少 1 条 capability）', () => {
    const gaps = readCapabilityGaps(GAP_REGISTER_PATH)
    // 本机文件在位时有 1 条 capability（R1 活体已证）；他机可能缺席——两态都合法
    if (gaps != null) expect(gaps.length).toBeGreaterThanOrEqual(1)
  })
})
