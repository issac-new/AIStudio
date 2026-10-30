// 四层上下文读取计量守门（2026-10-30 HelixHarness 吸收轮）：
// 分层最长前缀 / 坏行容错 / 窗口过滤 / 分桶与 TopN / 账本缺席 fail-soft。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYERS,
  buildContextReads,
  classifyPath,
  collectContextReads,
  parseReads,
  type ContextReadRow,
} from '../context-reads'
import { collectObsSignals } from '../collect'

let dir: string
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ctx-reads-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('分层判定', () => {
  it('最长前缀胜出：窄前缀不被宽前缀吃掉', () => {
    expect(classifyPath('custom/server/knowledge/board-graph.ts')).toBe('knowledge')
    expect(classifyPath('custom/qgate/plugin/hooks/hooks.json')).toBe('hooks')
    expect(classifyPath('custom/server/eval/runner.ts')).toBe('harness')
    expect(classifyPath('docs/superpowers/specs/2026-10-30-x.md')).toBe('specs')
    expect(classifyPath('AGENTS.md')).toBe('harness')
    expect(classifyPath('.swarm-yuan/hooks/pre-commit')).toBe('hooks')
    expect(classifyPath('skills/swarm-yuan/references/workflow.md')).toBe('knowledge')
  })

  it('未命中与仓外路径归 other（不猜）', () => {
    expect(classifyPath('README.md')).toBe('other')
    expect(classifyPath('../outside/file.ts')).toBe('other')
    expect(classifyPath('/abs/path.ts')).toBe('other')
  })

  it('自定义分层表可覆盖默认', () => {
    const cfg = { layers: { ...DEFAULT_LAYERS.layers, specs: ['docs/specs/'] } }
    expect(classifyPath('docs/specs/a.md', cfg)).toBe('specs')
    // 默认表里的 docs/superpowers/specs/ 已被替换 → 归 harness? 不，未命中即 other
    expect(classifyPath('docs/superpowers/specs/a.md', cfg)).toBe('other')
  })
})

describe('JSONL 解析与聚合', () => {
  const row = (ts: string, path: string): ContextReadRow => ({ ts, path, layer: classifyPath(path) })

  it('坏行跳过并计数，不炸聚合', () => {
    const text = [
      '{"ts":"2026-10-30T10:00:00Z","path":"AGENTS.md"}',
      'not-json',
      '{"ts":"","path":"x"}',
      '{"ts":"2026-10-30T10:00:00Z"}',
      '',
    ].join('\n')
    const { rows, skipped } = parseReads(text)
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(3)
  })

  it('窗口过滤 + 按日分桶 + 四层小计 + TopN', () => {
    const rows = [
      row('2026-10-30T10:00:00Z', 'AGENTS.md'),
      row('2026-10-30T11:00:00Z', 'AGENTS.md'),
      row('2026-10-30T11:30:00Z', 'docs/superpowers/specs/a.md'),
      row('2026-10-29T09:00:00Z', 'custom/server/knowledge/k.ts'),
      row('2026-09-01T09:00:00Z', 'AGENTS.md'), // 窗口外
    ]
    const r = buildContextReads(rows, { days: 7, now: NOW })
    expect(r.available).toBe(true)
    expect(r.total).toBe(4)
    expect(r.byLayer.harness).toBe(2)
    expect(r.byLayer.specs).toBe(1)
    expect(r.byLayer.knowledge).toBe(1)
    expect(r.byDay.map((d) => d.day)).toEqual(['2026-10-29', '2026-10-30'])
    expect(r.topPaths[0]).toEqual({ path: 'AGENTS.md', layer: 'harness', count: 2 })
  })

  it('空窗口如实 available:false 并记 notes（不造数）', () => {
    const r = buildContextReads([], { days: 7, now: NOW })
    expect(r.available).toBe(false)
    expect(r.total).toBe(0)
    expect(r.notes.join('')).toContain('窗口内无读取事件')
  })
})

describe('IO 适配 fail-soft', () => {
  it('账本缺席 → available:false 且带说明', () => {
    const r = collectContextReads(7, { file: join(dir, 'missing.jsonl'), config: join(dir, 'none.json'), now: NOW })
    expect(r.available).toBe(false)
    expect(r.notes.join('')).toContain('读取账本缺席')
  })

  it('正常账本 → 聚合可用；坏行计数入 notes', () => {
    const file = join(dir, 'reads.jsonl')
    writeFileSync(
      file,
      [
        JSON.stringify({ ts: '2026-10-30T10:00:00Z', tool: 'Read', path: 'docs/superpowers/specs/a.md', layer: 'specs' }),
        'broken',
      ].join('\n'),
      'utf8',
    )
    const r = collectContextReads(7, { file, config: join(dir, 'none.json'), now: NOW })
    expect(r.available).toBe(true)
    expect(r.total).toBe(1)
    expect(r.byLayer.specs).toBe(1)
    expect(r.notes.join('')).toContain('坏数据')
  })

  it('collectObsSignals 把 contextReads 一并返回（端点接线契约）', () => {
    const reads = join(dir, 'reads.jsonl')
    writeFileSync(
      reads,
      JSON.stringify({ ts: '2026-10-30T10:00:00Z', tool: 'Read', path: 'AGENTS.md', layer: 'harness' }),
      'utf8',
    )
    const traceDir = join(dir, 'traces')
    mkdirSync(traceDir, { recursive: true })
    const result = collectObsSignals(7, { dir: traceDir, now: NOW, contextReadsFile: reads })
    expect(result.contextReads.available).toBe(true)
    expect(result.contextReads.byLayer.harness).toBe(1)
  })
})
