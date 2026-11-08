// 组件库测试（PluginRSI 吸收轮）：晋级入库、幂等、版本递增、latestOnly、坏档隔离、概览。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { componentIdentityOf, listComponents, librarySummary, readLibrary, recordComponent, versionsOf } from '../component-library'
import type { Proposal, Variant } from '../types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'complib-'))
  process.env.HARNESS2_COMPONENT_LIBRARY = join(dir, 'components.json')
})
afterEach(() => {
  delete process.env.HARNESS2_COMPONENT_LIBRARY
  rmSync(dir, { recursive: true, force: true })
})

const variant = (id: string, digest: string, patch: Partial<Variant> = {}): Variant => ({
  id,
  label: `候选${id}`,
  content: `content-${id}`,
  digest,
  diffSummary: { added: 1, removed: 0, unchanged: 0 },
  ...patch,
} as Variant)

const proposal = (patch: Partial<Proposal> = {}): Proposal => ({
  id: 'hw-001',
  title: 't',
  hypothesis: 'h',
  surfaceKey: 'memory',
  targetPath: 'memories/dedupe.md',
  risk: 'medium',
  mode: 'sequential',
  domain: 'general',
  status: 'promoted',
  budgetCapUsd: 5,
  evidenceRefs: [],
  experienceIds: [],
  baselineRunId: null,
  baseline: null,
  base: null,
  variants: [],
  probes: [],
  approval: null,
  composition: null,
  promotion: null,
  rollback: null,
  createdBy: 'op',
  createdAt: 'now',
  updatedAt: 'now',
  ...patch,
} as unknown as Proposal)

const ev = (patch: Record<string, unknown> = {}) => ({
  proposalId: 'hw-001',
  variantId: 'v1',
  passAt1: 0.8,
  delta: 0.12,
  ...patch,
})

describe('组件身份', () => {
  it('kind=面 key，name=目标文件 basename；无目标文件回退候选标签', () => {
    expect(componentIdentityOf(proposal(), variant('v1', 'd1'))).toEqual({ kind: 'memory', name: 'dedupe.md' })
    const noTarget = proposal({ targetPath: null })
    expect(componentIdentityOf(noTarget, variant('v1', 'd1')).name).toBe('候选v1')
  })
})

describe('入库', () => {
  it('晋级入库：条目字段齐备、版本 1', () => {
    const r = recordComponent(proposal(), variant('v1', 'd1'), ev())
    expect(r.recorded).toBe(true)
    expect(r.entry?.id).toBe('memory:dedupe.md@d1')
    expect(r.entry?.version).toBe(1)
    expect(r.entry?.evidence.passAt1).toBe(0.8)
    expect(readLibrary().entries).toHaveLength(1)
  })

  it('幂等：同 digest 同面不重复入库', () => {
    recordComponent(proposal(), variant('v1', 'd1'), ev())
    const again = recordComponent(proposal(), variant('v1', 'd1'), ev())
    expect(again.recorded).toBe(false)
    expect(again.reason).toBe('duplicate')
    expect(readLibrary().entries).toHaveLength(1)
  })

  it('同 (kind,name) 不同 digest → 版本递增，旧版本保留（好零件不被覆盖）', () => {
    recordComponent(proposal(), variant('v1', 'd1'), ev())
    recordComponent(proposal(), variant('v2', 'd2'), ev({ variantId: 'v2' }))
    const entries = readLibrary().entries
    expect(entries).toHaveLength(2)
    expect(entries[1].version).toBe(2)
    expect(versionsOf(readLibrary(), 'memory', 'dedupe.md')).toBe(2)
  })

  it('空内容且无文件 → 不入库（不造空条目）', () => {
    const empty = variant('v1', 'd1', { content: '   ' })
    const r = recordComponent(proposal(), empty, ev())
    expect(r.recorded).toBe(false)
    expect(r.reason).toBe('no_content')
  })

  it('树候选：content 置空、files 原样保存', () => {
    const tree = variant('v1', 'd1', { content: '', files: [{ path: 'a.yaml', content: 'x' }, { path: 'a.py', content: 'y' }] })
    recordComponent(proposal(), tree, ev())
    const e = readLibrary().entries[0]
    expect(e.content).toBe('')
    expect(e.files).toHaveLength(2)
  })

  it('坏档隔离：损坏文件改名 .corrupt-* 后按空库继续', () => {
    writeFileSync(process.env.HARNESS2_COMPONENT_LIBRARY!, '{oops')
    expect(readLibrary().entries).toHaveLength(0)
    expect(readLibrary().entries).toHaveLength(0) // 二次读仍空（隔离后不再报错）
  })
})

describe('查询与概览', () => {
  it('latestOnly 每个组件只留最新版本；kind 过滤生效', () => {
    recordComponent(proposal(), variant('v1', 'd1'), ev())
    recordComponent(proposal(), variant('v2', 'd2'), ev({ variantId: 'v2' }))
    recordComponent(proposal({ surfaceKey: 'skills', targetPath: 'skills/s/SKILL.md' }), variant('v3', 'd3'), ev())
    expect(listComponents({ latestOnly: true })).toHaveLength(2)
    expect(listComponents({ kind: 'skills' })).toHaveLength(1)
  })

  it('概览：按类目计组件数与版本数；总数正确', () => {
    recordComponent(proposal(), variant('v1', 'd1'), ev())
    recordComponent(proposal(), variant('v2', 'd2'), ev({ variantId: 'v2' }))
    recordComponent(proposal({ surfaceKey: 'skills', targetPath: 'skills/s/SKILL.md' }), variant('v3', 'd3'), ev())
    const s = librarySummary()
    expect(s.total).toBe(3)
    const memory = s.byKind.find((k) => k.kind === 'memory')!
    expect(memory.components).toBe(1)
    expect(memory.versions).toBe(2)
    expect(s.names.find((n) => n.name === 'dedupe.md')?.latestVersion).toBe(2)
  })
})

describe('provenance 与跨模型复测（EvoTeam 吸收）', () => {
  it('入库带 provenance；跨模型判定三态（同模型 false / 异模型 true / 缺值 null）', async () => {
    const { crossModelRetestNeeded } = await import('../../../lib/provenance')
    recordComponent(proposal(), variant('v1', 'd1'), ev(), {
      provenance: { model: 'model-a', executor: 'host-1', at: '2026-11-08T00:00:00Z' },
    })
    const entry = readLibrary().entries[0]
    expect(entry.provenance?.model).toBe('model-a')
    expect(entry.provenance?.executor).toBe('host-1')
    expect(crossModelRetestNeeded(entry.provenance, 'model-a')).toBe(false)
    expect(crossModelRetestNeeded(entry.provenance, 'model-b')).toBe(true)
    expect(crossModelRetestNeeded(entry.provenance, '')).toBeNull()
    expect(crossModelRetestNeeded(undefined, 'model-b')).toBeNull()
  })
})
