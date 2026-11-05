// 度量派生的新数据源守门（2026-11-05 收口）：技能调用频次与接口数。
// 二者都是「从既有台账派生」，所以测的是口径与缺口态，不是伪造读数。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INTERFACE_SAMPLE, interfaceCount, skillInvocations, skillUsage } from '../derive'

let dir = ''
const before: Record<string, string | undefined> = {}
const KEYS = ['HERMES_TOOL_AUDIT', 'HERMES_HOME'] as const

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'metricderive-'))
  for (const k of KEYS) before[k] = process.env[k]
  process.env.HERMES_TOOL_AUDIT = join(dir, 'tool-audit.jsonl')
  // 隔离看板库：让 kanbanDbFiles 找不到数据（测缺口态而非真机数据）
  process.env.HERMES_HOME = join(dir, 'hermes-empty')
})

afterEach(() => {
  for (const k of KEYS) {
    if (before[k] === undefined) delete process.env[k]
    else process.env[k] = before[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function writeAudit(rows: { tool: string; ok: boolean }[]): void {
  writeFileSync(
    process.env.HERMES_TOOL_AUDIT as string,
    rows.map((r) => JSON.stringify({ ts: 1_760_000_000_000, tool: r.tool, ok: r.ok, dur_ms: 12 })).join('\n') + '\n',
    'utf8',
  )
}

describe('skillInvocations：技能类工具调用频次（真数据，按技能名不可得）', () => {
  it('审计面缺席时 available:false 并说明路径', () => {
    const r = skillInvocations()
    expect(r.available).toBe(false)
    expect(r.perSkill).toBeNull()
    expect(r.perSkillGap).toContain('缺席')
  })

  it('只统计 skill* 工具；失败率按调用数算', () => {
    writeAudit([
      { tool: 'skill_view', ok: true },
      { tool: 'skill_view', ok: true },
      { tool: 'skill_manage', ok: false },
      { tool: 'terminal', ok: false },   // 非技能类，不计入
      { tool: 'read_file', ok: true },
    ])
    const r = skillInvocations()
    expect(r.available).toBe(true)
    expect(r.calls).toBe(3)
    expect(r.failed).toBe(1)
    expect(r.failureRate).toBeCloseTo(0.3333, 3)
    expect(r.byTool.map((t) => t.tool)).toEqual(['skill_view', 'skill_manage'])
  })

  it('perSkill 恒为 null 且给出理由（审计面只记工具名，不记技能名）', () => {
    writeAudit([{ tool: 'skill_view', ok: true }])
    const r = skillInvocations()
    expect(r.perSkill).toBeNull()
    expect(r.perSkillGap).toContain('技能名')
  })

  it('审计面在档但无技能类调用 → available:false 并给两种可能', () => {
    writeAudit([{ tool: 'terminal', ok: true }])
    const r = skillInvocations()
    expect(r.available).toBe(false)
    expect(r.perSkillGap).toContain('未被使用')
  })

  it('坏行跳过不抛异常', () => {
    writeFileSync(process.env.HERMES_TOOL_AUDIT as string, '{not json}\n{"tool":"skill_view","ok":true}\n', 'utf8')
    const r = skillInvocations()
    expect(r.calls).toBe(1)
  })
})

describe('skillUsage：声明覆盖率与调用频次并出', () => {
  it('看板缺席时 coverage 缺口，invocations 仍独立给出', async () => {
    writeAudit([{ tool: 'skill_view', ok: true }])
    const r = await skillUsage()
    expect(r.available).toBe(false)
    expect(r.gap).toContain('看板库')
    expect(r.invocations.available).toBe(true)
    expect(r.invocations.calls).toBe(1)
  })
})

describe('interfaceCount：按 panorama 面数派生', () => {
  it('无已完成任务可取样时 available:false 并说明', async () => {
    const r = await interfaceCount()
    expect(r.available).toBe(false)
    expect(r.sample).toBe(0)
    expect(r.gap).toContain('已完成任务')
  })

  it('取样上限是常量而非魔法数（页签据此显示样本量）', () => {
    expect(INTERFACE_SAMPLE).toBe(3)
  })
})
